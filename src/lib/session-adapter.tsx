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

interface SessionEventApiItem {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "model" | "system";
  content: string;
  thought?: string;
  createTime: string;
}

function SessionHistoryProvider({ children }: PropsWithChildren) {
  const aui = useAui();
  const auiRef = useRef(aui);
  useEffect(() => {
    auiRef.current = aui;
  });

  const history = useMemo<ThreadHistoryAdapter>(() => {
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
          const res = await fetch(
            getApiUrl(`/api/sessions/${encodeURIComponent(remoteId)}`),
            {
              cache: "no-store",
            }
          );
          if (!res.ok) {
            return { messages: [] };
          }

          const data = await res.json();
          const events: SessionEventApiItem[] = data.events || [];

          const threadMessages: ThreadMessageLike[] = [];
          let accumulatedThoughts: string[] = [];

          for (let i = 0; i < events.length; i++) {
            const e = events[i];
            const content = (e.content || "").trim();
            const thought = (e.thought || "").trim();

            if (thought) {
              accumulatedThoughts.push(thought);
            }

            // User turn
            if (e.role === "user") {
              if (content) {
                threadMessages.push({
                  id: e.id || `msg-${i}`,
                  role: "user",
                  content,
                  createdAt: e.createTime ? new Date(e.createTime) : new Date(),
                });
              }
              // Skip empty user events (e.g. tool return payloads like functionResponse)
              continue;
            }

            // Assistant turn with content
            if (content) {
              const parts: Array<
                { type: "reasoning"; text: string } | { type: "text"; text: string }
              > = [];

              if (accumulatedThoughts.length > 0) {
                parts.push({
                  type: "reasoning",
                  text: accumulatedThoughts.join("\n\n"),
                });
                accumulatedThoughts = [];
              }

              parts.push({ type: "text", text: content });

              threadMessages.push({
                id: e.id || `msg-${i}`,
                role: "assistant",
                content: parts,
                createdAt: e.createTime ? new Date(e.createTime) : new Date(),
              });
            }
          }

          // If there are trailing thoughts without content (e.g. in-flight tool call)
          if (accumulatedThoughts.length > 0) {
            threadMessages.push({
              id: `msg-trailing-reasoning`,
              role: "assistant",
              content: [
                {
                  type: "reasoning",
                  text: accumulatedThoughts.join("\n\n"),
                },
              ],
              createdAt: new Date(),
            });
          }

          return ExportedMessageRepository.fromArray(threadMessages);
        } catch (err) {
          console.error(`Failed to load history for session ${remoteId}:`, err);
          return { messages: [] };
        }
      },
      append: async () => {
        // Appending is handled via /api/chat stream
      },
    };
  }, []);

  return (
    <RuntimeAdapterProvider adapters={{ history }}>{children}</RuntimeAdapterProvider>
  );
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

export function useSessionThreadListAdapter(userId?: string): RemoteThreadListAdapter {
  const unstable_Provider: FC<PropsWithChildren> = useCallback(function Provider({
    children,
  }) {
    return <SessionHistoryProvider>{children}</SessionHistoryProvider>;
  }, []);

  return useMemo<RemoteThreadListAdapter>(() => {
    return {
      list: async () => {
        try {
          const url = userId
            ? getApiUrl(`/api/sessions?userId=${encodeURIComponent(userId)}`)
            : getApiUrl("/api/sessions");
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
            body: JSON.stringify({ title: "New conversation" }),
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
          const res = await fetch(
            getApiUrl(`/api/sessions/${encodeURIComponent(threadId)}`),
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
          await fetch(getApiUrl(`/api/sessions/${encodeURIComponent(remoteId)}`), {
            method: "DELETE",
          });
        } catch (err) {
          console.error(`Error deleting session ${remoteId}:`, err);
        }
      },

      rename: async (remoteId: string, newTitle: string) => {
        try {
          await fetch(getApiUrl(`/api/sessions/${encodeURIComponent(remoteId)}`), {
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
          await fetch(getApiUrl(`/api/sessions/${encodeURIComponent(remoteId)}`), {
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
  }, [unstable_Provider, userId]);
}
