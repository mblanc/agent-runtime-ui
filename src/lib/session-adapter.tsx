"use client";

import {
  type FC,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import {
  ExportedMessageRepository,
  type RemoteThreadListAdapter,
  type ThreadHistoryAdapter,
  type ThreadMessage,
  type ThreadMessageLike,
} from "@assistant-ui/core";
import { RuntimeAdapterProvider } from "@assistant-ui/react";
import { createAssistantStream } from "assistant-stream";
import { useAui } from "@assistant-ui/store";
import { withAgentTarget } from "@/lib/api-client";
import { isLocalSessionId } from "@/lib/agent-runtime/event-utils";
import type { AgentTarget } from "@/types/agent";
import { extractA2UIFromContent } from "@/lib/a2ui/a2ui-parser";

interface SessionApiItem {
  id: string;
  name?: string;
  title: string;
  createTime: string;
  updateTime: string;
}

/**
 * Puts the replayed trace where the live stream puts it: `metadata.custom`.
 *
 * The renderer reads one place regardless of which path produced the message,
 * so history replay and streaming cannot drift into rendering differently — the
 * failure mode this whole representation change exists to remove.
 */
function mergeCustomMetadata(
  metadata: { custom?: Record<string, unknown> },
  reasoningTrace: unknown[] | undefined,
  codeExecutionBlocks: unknown[] | undefined,
  artifacts?: unknown[] | undefined,
  a2ui?: unknown | undefined
): Record<string, unknown> {
  const custom = { ...(metadata.custom || {}) };
  if (reasoningTrace) custom.reasoningTrace = reasoningTrace;
  if (codeExecutionBlocks && !custom.codeExecutionBlocks) {
    custom.codeExecutionBlocks = codeExecutionBlocks;
  }
  if (artifacts && !custom.artifacts) {
    custom.artifacts = artifacts;
  }
  if (a2ui && !custom.a2ui) {
    custom.a2ui = a2ui;
  }
  return {
    ...metadata,
    custom,
  };
}

export function formatRemoteMessagesToThreadMessages(
  rawRemoteMessages: Array<Record<string, unknown>>
): ThreadMessageLike[] {
  return rawRemoteMessages.map((m) => {
    if (Array.isArray(m.content)) {
      return m as unknown as ThreadMessageLike;
    }
    const parts: Array<Record<string, unknown>> = [];
    const thoughtStr = typeof m.thought === "string" ? m.thought.trim() : "";
    let contentStr = typeof m.content === "string" ? m.content.trim() : "";

    // The structured trace behind `thought`. This side of the pipe is typed as
    // `Record<string, unknown>` because it is raw JSON off the session API, so
    // the only check worth making is that it is an array — an older backend, or
    // a session persisted before the field existed, simply has none and the
    // renderer falls back to parsing `thoughtStr`.
    const reasoningTrace = Array.isArray(m.reasoningTrace) ? m.reasoningTrace : undefined;
    const codeExecutionBlocks = Array.isArray(m.codeExecutionBlocks)
      ? m.codeExecutionBlocks
      : Array.isArray(m.code_execution_blocks)
        ? (m.code_execution_blocks as unknown[])
        : undefined;
    const artifacts = Array.isArray(m.artifacts) ? m.artifacts : undefined;
    let a2ui =
      m.a2ui ||
      m.a2uiData ||
      m.a2ui_data ||
      (m.metadata as { custom?: { a2ui?: unknown } })?.custom?.a2ui;

    if (
      contentStr &&
      (contentStr.includes("---a2ui_JSON---") ||
        contentStr.includes("```a2ui") ||
        contentStr.includes("```json:a2ui") ||
        contentStr.includes("<!-- a2ui_start -->"))
    ) {
      const extracted = extractA2UIFromContent(contentStr);
      if (extracted.a2ui) {
        a2ui = a2ui || extracted.a2ui;
        contentStr = extracted.cleanText;
      }
    }

    if (thoughtStr) {
      parts.push({ type: "reasoning", text: thoughtStr });
    }

    // Extract tool calls from session message
    const toolCalls =
      Array.isArray(m.toolCalls) && m.toolCalls.length > 0
        ? (m.toolCalls as Array<Record<string, unknown>>)
        : m.toolCall
          ? [m.toolCall as Record<string, unknown>]
          : [];

    const toolResults =
      Array.isArray(m.toolResults) && m.toolResults.length > 0
        ? (m.toolResults as Array<Record<string, unknown>>)
        : m.toolResult
          ? [m.toolResult as Record<string, unknown>]
          : [];

    let hasRequiresAction = false;

    for (let idx = 0; idx < toolCalls.length; idx++) {
      const tc = toolCalls[idx];
      const toolName = String(tc.name || "tool");
      const args = (tc.args as Record<string, unknown>) || {};
      const origFnCall = args.originalFunctionCall as Record<string, unknown> | undefined;
      const toolCallId = String(
        tc.id || tc.toolCallId || origFnCall?.id || `call_${m.id || Date.now()}_${idx}`
      );
      const argsText = JSON.stringify(args, null, 2);

      // Find matching tool result
      const matchingResultObj = toolResults.find(
        (r) => r.name === toolName || r.id === toolCallId
      );
      const result = matchingResultObj ? matchingResultObj.result : tc.result;

      const isConfirmationTool =
        toolName === "adk_request_confirmation" ||
        tc.requires_action === true ||
        tc.requires_confirmation === true ||
        tc.status === "requires-action";

      let status: {
        type: "running" | "complete" | "incomplete" | "requires-action";
        reason?: string;
      };

      if (result !== undefined) {
        status = { type: "complete" };
      } else if (isConfirmationTool) {
        status = { type: "requires-action", reason: "tool-calls" };
        hasRequiresAction = true;
      } else {
        status = { type: "complete" };
      }

      parts.push({
        type: "tool-call",
        toolCallId,
        toolName,
        args,
        argsText,
        result,
        status,
      });
    }

    if (contentStr) {
      parts.push({ type: "text", text: contentStr });
    }

    if (parts.length === 0) {
      parts.push({ type: "text", text: "" });
    }

    return {
      id: (m.id as string) || `msg-${Date.now()}`,
      role: (m.role as "user" | "assistant" | "system") || "assistant",
      createdAt: m.createdAt ? new Date(m.createdAt as string) : new Date(),
      content: parts,
      ...(hasRequiresAction
        ? {
            status: {
              type: "requires-action" as const,
              reason: "tool-calls" as const,
            },
          }
        : {}),
      metadata: mergeCustomMetadata(
        (m.metadata as { custom?: Record<string, unknown> } | undefined) || {
          custom: { ...(m.id ? { eventId: m.id } : {}) },
        },
        reasoningTrace,
        codeExecutionBlocks,
        artifacts,
        a2ui
      ),
    } as unknown as ThreadMessageLike;
  });
}

/**
 * The URL of a single session, addressed at the active agent.
 *
 * `location` matters as much as `agentId`: when the agent id is a bare id (not a
 * full `projects/.../locations/.../reasoningEngines/...` resource path) the server
 * cannot derive the region from it and falls back to GOOGLE_CLOUD_LOCATION, which
 * routes the request to the wrong regional host for agents deployed outside the
 * default region.
 */
function sessionUrl(sessionId: string, target: AgentTarget): string {
  return getApiUrl(
    withAgentTarget(`/api/sessions/${encodeURIComponent(sessionId)}`, target)
  );
}

export function useSessionThreadHistoryAdapter(
  agentId?: string,
  location?: string
): ThreadHistoryAdapter {
  const aui = useAui();
  const auiRef = useRef(aui);
  // Refs (not useMemo deps) because the returned adapter object identity must stay
  // stable — assistant-ui re-subscribes when it changes. Updated on every render so
  // the callbacks always read the currently active agent.
  const agentIdRef = useRef(agentId);
  agentIdRef.current = agentId;
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(() => {
    auiRef.current = aui;
  });

  return useMemo<ThreadHistoryAdapter>(() => {
    return {
      load: async () => {
        const state = auiRef.current?.threadListItem?.getState?.();
        const remoteId = state?.remoteId;

        if (!remoteId || isLocalSessionId(remoteId)) {
          return { messages: [] };
        }

        try {
          const res = await fetch(
            sessionUrl(remoteId, {
              agentId: agentIdRef.current,
              location: locationRef.current,
            }),
            {
              cache: "no-store",
            }
          );
          if (!res.ok) {
            console.warn(
              `[session-adapter] GET /api/sessions/${remoteId} returned ${res.status}`
            );
            return { messages: [] };
          }

          const data = await res.json();
          const rawRemoteMessages: Array<Record<string, unknown>> = data.messages || [];
          const remoteMessages = formatRemoteMessagesToThreadMessages(rawRemoteMessages);

          // If the remote session has 0 messages (e.g. freshly initialized),
          // but the thread is currently generating or has local in-memory messages,
          // preserve the local messages so we don't wipe out the active stream!
          const threadState = auiRef.current?.thread?.getState?.();
          const localMessages = threadState?.messages || [];
          const isRunning = threadState?.isRunning || false;

          if (remoteMessages.length === 0 && (isRunning || localMessages.length > 0)) {
            return ExportedMessageRepository.fromArray(
              localMessages as unknown as ThreadMessageLike[]
            );
          }

          return ExportedMessageRepository.fromArray(remoteMessages);
        } catch (err) {
          console.error(`Failed to load history for session ${remoteId}:`, err);
          const threadState = auiRef.current?.thread?.getState?.();
          const localMessages = threadState?.messages || [];
          return localMessages.length > 0
            ? ExportedMessageRepository.fromArray(
                localMessages as unknown as ThreadMessageLike[]
              )
            : { messages: [] };
        }
      },
      append: async () => {},
    };
  }, []);
}

function getApiUrl(path: string): string {
  if (
    typeof window !== "undefined" &&
    window.location?.origin &&
    window.location.origin !== "null" &&
    !window.location.origin.startsWith("about:")
  ) {
    return `${window.location.origin}${path}`;
  }
  return `http://localhost:3000${path}`;
}

export function useSessionThreadListAdapter(
  userId?: string,
  agentId?: string,
  location?: string
): RemoteThreadListAdapter {
  const unstable_Provider: FC<PropsWithChildren> = useCallback(
    function Provider({ children }) {
      const history = useSessionThreadHistoryAdapter(agentId, location);
      const adapters = useMemo(() => ({ history }), [history]);
      return (
        <RuntimeAdapterProvider adapters={adapters}>{children}</RuntimeAdapterProvider>
      );
    },
    [agentId, location]
  );

  const target: AgentTarget = useMemo(() => ({ agentId, location }), [agentId, location]);

  return useMemo<RemoteThreadListAdapter>(() => {
    return {
      list: async () => {
        try {
          const url = getApiUrl(withAgentTarget("/api/sessions", target, { userId }));

          const res = await fetch(url, {
            cache: "no-store",
            headers: {
              "Cache-Control": "no-cache",
            },
          });
          if (!res.ok) {
            return { threads: [] };
          }
          const data = await res.json();
          const sessions: SessionApiItem[] = data.sessions || [];

          return {
            threads: sessions.map((s) => ({
              status: "regular" as const,
              remoteId: s.id,
              title: s.title || "Untitled chat",
              lastMessageAt: s.updateTime
                ? new Date(s.updateTime)
                : s.createTime
                  ? new Date(s.createTime)
                  : new Date(),
            })),
          };
        } catch (err) {
          console.error("Error listing sessions via adapter:", err);
          return { threads: [] };
        }
      },

      initialize: async (_threadId?: string) => {
        try {
          const res = await fetch(getApiUrl("/api/sessions"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: "New conversation",
              ...(agentId ? { agentId } : {}),
              ...(location ? { location } : {}),
            }),
          });

          if (!res.ok) {
            throw new Error(`Failed to initialize session (${res.status})`);
          }

          const data = await res.json();
          return { remoteId: data.session.id };
        } catch (err) {
          console.error("Error initializing session via adapter:", err);
          const fallbackId = `session-${Date.now()}`;
          return { remoteId: fallbackId };
        }
      },

      fetch: async (threadId: string) => {
        try {
          const res = await fetch(sessionUrl(threadId, target), {
            cache: "no-store",
          });
          if (!res.ok) {
            return {
              status: "regular" as const,
              remoteId: threadId,
              title: `Chat ${threadId.substring(0, 8)}`,
            };
          }
          const data = await res.json();
          const s = data.session;
          return {
            status: "regular" as const,
            remoteId: s.id,
            title: s.title || "Untitled chat",
            lastMessageAt: s.updateTime
              ? new Date(s.updateTime)
              : s.createTime
                ? new Date(s.createTime)
                : new Date(),
          };
        } catch {
          return {
            status: "regular" as const,
            remoteId: threadId,
            title: `Chat ${threadId.substring(0, 8)}`,
          };
        }
      },

      delete: async (remoteId: string) => {
        try {
          await fetch(sessionUrl(remoteId, target), {
            method: "DELETE",
          });
        } catch (err) {
          console.error(`Error deleting session ${remoteId}:`, err);
        }
      },

      rename: async (remoteId: string, newTitle: string) => {
        try {
          await fetch(sessionUrl(remoteId, target), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: newTitle }),
          });
        } catch (err) {
          console.error(`Error renaming session ${remoteId}:`, err);
        }
      },

      archive: async () => {},

      unarchive: async () => {},

      generateTitle: async (remoteId: string, messages: readonly ThreadMessage[]) => {
        const firstUserMsg = messages.find((m) => m.role === "user");
        let title = "New conversation";
        if (firstUserMsg && firstUserMsg.content) {
          for (const p of firstUserMsg.content) {
            if (p.type === "text" && "text" in p && typeof p.text === "string") {
              const clean = p.text.trim();
              if (clean) {
                // Capitalize first letter and truncate
                const capitalized = clean.charAt(0).toUpperCase() + clean.slice(1);
                title =
                  capitalized.length > 40
                    ? `${capitalized.substring(0, 37)}...`
                    : capitalized;
                break;
              }
            }
          }
        }

        // Persist the generated title to backend Session Service
        try {
          await fetch(sessionUrl(remoteId, target), {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title }),
          });
        } catch (err) {
          console.warn(`Could not persist generated title for ${remoteId}:`, err);
        }

        return createAssistantStream((controller) => {
          controller.appendText(title);
          controller.close();
        });
      },

      unstable_Provider,
    };
  }, [unstable_Provider, userId, agentId, location, target]);
}
