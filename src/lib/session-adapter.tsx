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

interface SessionApiItem {
  id: string;
  name?: string;
  title: string;
  createTime: string;
  updateTime: string;
}

export function useSessionThreadHistoryAdapter(agentId?: string): ThreadHistoryAdapter {
  const aui = useAui();
  const auiRef = useRef(aui);
  const agentIdRef = useRef(agentId);
  agentIdRef.current = agentId;

  useEffect(() => {
    auiRef.current = aui;
  });

  return useMemo<ThreadHistoryAdapter>(() => {
    return {
      load: async () => {
        const state = auiRef.current?.threadListItem?.getState?.();
        const remoteId = state?.remoteId;

        if (
          !remoteId ||
          remoteId.startsWith("__LOCALID_") ||
          remoteId.startsWith("local-")
        ) {
          return { messages: [] };
        }

        try {
          const currentAgentId = agentIdRef.current;
          const query = currentAgentId
            ? `?agentId=${encodeURIComponent(currentAgentId)}`
            : "";
          const res = await fetch(
            getApiUrl(`/api/sessions/${encodeURIComponent(remoteId)}${query}`),
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
          const remoteMessages: ThreadMessageLike[] = data.messages || [];

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
  agentId?: string
): RemoteThreadListAdapter {
  const unstable_Provider: FC<PropsWithChildren> = useCallback(
    function Provider({ children }) {
      const history = useSessionThreadHistoryAdapter(agentId);
      const adapters = useMemo(() => ({ history }), [history]);
      return (
        <RuntimeAdapterProvider adapters={adapters}>{children}</RuntimeAdapterProvider>
      );
    },
    [agentId]
  );

  return useMemo<RemoteThreadListAdapter>(() => {
    return {
      list: async () => {
        try {
          const params = new URLSearchParams();
          if (userId) params.set("userId", userId);
          if (agentId) params.set("agentId", agentId);
          const queryStr = params.toString();
          const url = getApiUrl(queryStr ? `/api/sessions?${queryStr}` : "/api/sessions");

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
          const query = agentId ? `?agentId=${encodeURIComponent(agentId)}` : "";
          const res = await fetch(
            getApiUrl(`/api/sessions/${encodeURIComponent(threadId)}${query}`),
            {
              cache: "no-store",
            }
          );
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
          const query = agentId ? `?agentId=${encodeURIComponent(agentId)}` : "";
          await fetch(
            getApiUrl(`/api/sessions/${encodeURIComponent(remoteId)}${query}`),
            {
              method: "DELETE",
            }
          );
        } catch (err) {
          console.error(`Error deleting session ${remoteId}:`, err);
        }
      },

      rename: async (remoteId: string, newTitle: string) => {
        try {
          const query = agentId ? `?agentId=${encodeURIComponent(agentId)}` : "";
          await fetch(
            getApiUrl(`/api/sessions/${encodeURIComponent(remoteId)}${query}`),
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: newTitle }),
            }
          );
        } catch (err) {
          console.error(`Error renaming session ${remoteId}:`, err);
        }
      },

      archive: async () => {},

      unarchive: async () => {},

      generateTitle: async (remoteId: string, messages: readonly ThreadMessage[]) => {
        console.log(
          "[session-adapter] generateTitle called for remoteId:",
          remoteId,
          "messages count:",
          messages.length
        );
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
          console.log(
            "[session-adapter] PATCHing title for remoteId:",
            remoteId,
            "to:",
            title
          );
          const query = agentId ? `?agentId=${encodeURIComponent(agentId)}` : "";
          await fetch(
            getApiUrl(`/api/sessions/${encodeURIComponent(remoteId)}${query}`),
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title }),
            }
          );
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
  }, [unstable_Provider, userId, agentId]);
}
