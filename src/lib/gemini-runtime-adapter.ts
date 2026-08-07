import {
  type ChatModelAdapter,
  type ChatModelRunOptions,
  type ChatModelRunResult,
  type FeedbackAdapter,
  WebSpeechDictationAdapter,
  WebSpeechSynthesisAdapter,
} from "@assistant-ui/react";
import type { FeedbackType } from "@/types/agent";
import { formatAgentDisplayName } from "@/lib/utils";

export function appendToolResultToReasoning(
  reasoning: string,
  toolName: string,
  resStr: string
): string {
  const header = `:::tool[${toolName}]{status="running"}`;
  const lastIdx = reasoning.lastIndexOf(header);

  if (lastIdx !== -1) {
    const before = reasoning.substring(0, lastIdx);
    const after = reasoning.substring(lastIdx);
    const closeIdx = after.indexOf("\n:::", header.length);
    if (closeIdx !== -1) {
      const blockInside = after
        .substring(0, closeIdx)
        .replace(header, `:::tool[${toolName}]{status="complete"}`);
      const remainder = after.substring(closeIdx);
      return `${before}${blockInside}\n**Result:**\n\`\`\`json\n${resStr}\n\`\`\`${remainder}`;
    }
  }

  return (
    reasoning +
    `\n\n:::tool[${toolName}]{status="complete"}\n**Result:**\n\`\`\`json\n${resStr}\n\`\`\`\n:::`
  );
}

export function appendAgentResponseToReasoning(
  reasoning: string,
  agentName: string,
  responseStr: string,
  displayName?: string
): string {
  const name = displayName || formatAgentDisplayName(agentName);
  const runningHeader = `:::subagent[${name}]{status="running" agent="${agentName}"}`;
  const lastIdx = reasoning.lastIndexOf(runningHeader);

  if (lastIdx !== -1) {
    const before = reasoning.substring(0, lastIdx);
    const after = reasoning.substring(lastIdx);
    const closeIdx = after.indexOf("\n:::", runningHeader.length);
    if (closeIdx !== -1) {
      const blockInside = after
        .substring(0, closeIdx)
        .replace(
          runningHeader,
          `:::subagent[${name}]{status="complete" agent="${agentName}"}`
        );
      const remainder = after.substring(closeIdx);
      return `${before}${blockInside}\n**Response:**\n${responseStr}${remainder}`;
    }
  }

  return (
    reasoning +
    `\n\n:::subagent[${name}]{status="complete" agent="${agentName}"}\n${responseStr}\n:::`
  );
}

function createYieldContent(reasoning: string, text: string): ChatModelRunResult {
  return {
    content: [
      ...(reasoning ? [{ type: "reasoning" as const, text: reasoning }] : []),
      ...(text ? [{ type: "text" as const, text }] : []),
    ],
  };
}

export function createGeminiChatAdapter(
  getSessionId?: () => string | undefined
): ChatModelAdapter {
  return {
    async *run({
      messages,
      abortSignal,
    }: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult, void, unknown> {
      const formattedMessages = messages.map((m) => {
        let text = "";
        for (const part of m.content) {
          if (part.type === "text") {
            text += part.text;
          }
        }
        return {
          role: m.role as "user" | "assistant" | "system",
          content: text,
        };
      });

      const sessionId = getSessionId?.();

      try {
        console.log("[createGeminiChatAdapter] Starting run for sessionId:", sessionId);
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: formattedMessages,
            ...(sessionId ? { sessionId } : {}),
          }),
          signal: abortSignal,
        });

        if (!response.ok) {
          const err = await response.text();
          console.error("[createGeminiChatAdapter] HTTP error:", response.status, err);
          throw new Error(`Chat request failed (${response.status}): ${err}`);
        }

        if (!response.body) {
          console.error("[createGeminiChatAdapter] Empty response body");
          throw new Error("No response body received");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = "";
        let accumulatedReasoning = "";
        let currentAuthor: string | undefined = undefined;
        let currentAuthorText = "";
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log("[createGeminiChatAdapter] Reader done");
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            const dataStr = trimmed.slice(6);
            if (dataStr === "[DONE]") {
              console.log("[createGeminiChatAdapter] Received [DONE]");
              return;
            }

            try {
              const parsed = JSON.parse(dataStr);
              console.log(
                "[createGeminiChatAdapter] Parsed SSE event:",
                parsed.event_type
              );

              if (parsed.event_type === "thought" && parsed.thought) {
                accumulatedReasoning +=
                  (accumulatedReasoning ? "\n" : "") + parsed.thought;
                yield createYieldContent(accumulatedReasoning, accumulatedText);
              } else if (parsed.event_type === "content" && parsed.content) {
                const author = parsed.author as string | undefined;

                if (
                  author &&
                  currentAuthor &&
                  author !== currentAuthor &&
                  currentAuthorText.trim()
                ) {
                  const name = formatAgentDisplayName(currentAuthor);
                  accumulatedReasoning = appendAgentResponseToReasoning(
                    accumulatedReasoning,
                    currentAuthor,
                    currentAuthorText.trim(),
                    name
                  );
                  currentAuthor = author;
                  currentAuthorText = parsed.content;
                  accumulatedText = parsed.content;
                } else {
                  if (!currentAuthor && author) {
                    currentAuthor = author;
                  }
                  currentAuthorText += parsed.content;
                  accumulatedText += parsed.content;
                }
                yield createYieldContent(accumulatedReasoning, accumulatedText);
              } else if (parsed.event_type === "agent_call" && parsed.agent_call) {
                if (currentAuthor && currentAuthorText.trim()) {
                  const name = formatAgentDisplayName(currentAuthor);
                  accumulatedReasoning = appendAgentResponseToReasoning(
                    accumulatedReasoning,
                    currentAuthor,
                    currentAuthorText.trim(),
                    name
                  );
                  currentAuthor = undefined;
                  currentAuthorText = "";
                  accumulatedText = "";
                }

                const name =
                  parsed.agent_call.displayName || parsed.agent_call.agent || "Sub-Agent";
                const inputStr = parsed.agent_call.input
                  ? `**Task Input:**\n\`\`\`json\n${typeof parsed.agent_call.input === "string" ? parsed.agent_call.input : JSON.stringify(parsed.agent_call.input, null, 2)}\n\`\`\``
                  : "";
                accumulatedReasoning += `\n\n:::subagent[${name}]{status="running" agent="${parsed.agent_call.agent}"}\n${inputStr}\n:::`;
                yield createYieldContent(accumulatedReasoning, accumulatedText);
              } else if (
                parsed.event_type === "agent_response" &&
                parsed.agent_response
              ) {
                if (currentAuthor && currentAuthorText.trim()) {
                  const name = formatAgentDisplayName(currentAuthor);
                  accumulatedReasoning = appendAgentResponseToReasoning(
                    accumulatedReasoning,
                    currentAuthor,
                    currentAuthorText.trim(),
                    name
                  );
                  currentAuthor = undefined;
                  currentAuthorText = "";
                  accumulatedText = "";
                }

                const agent = parsed.agent_response.agent || "sub_agent";
                const name =
                  parsed.agent_response.displayName || formatAgentDisplayName(agent);
                accumulatedReasoning = appendAgentResponseToReasoning(
                  accumulatedReasoning,
                  agent,
                  parsed.agent_response.response,
                  name
                );
                yield createYieldContent(accumulatedReasoning, accumulatedText);
              } else if (parsed.event_type === "tool_call" && parsed.tool_call) {
                if (currentAuthor && currentAuthorText.trim()) {
                  const name = formatAgentDisplayName(currentAuthor);
                  accumulatedReasoning = appendAgentResponseToReasoning(
                    accumulatedReasoning,
                    currentAuthor,
                    currentAuthorText.trim(),
                    name
                  );
                  currentAuthor = undefined;
                  currentAuthorText = "";
                  accumulatedText = "";
                }

                const toolName = parsed.tool_call.name || "agent_tool";
                const argsStr = JSON.stringify(parsed.tool_call.args || {}, null, 2);
                accumulatedReasoning += `\n\n:::tool[${toolName}]{status="running"}\n**Arguments:**\n\`\`\`json\n${argsStr}\n\`\`\`\n:::`;
                yield createYieldContent(accumulatedReasoning, accumulatedText);
              } else if (parsed.event_type === "tool_result" && parsed.tool_result) {
                const toolName = parsed.tool_result.name || "agent_tool";
                const resStr = JSON.stringify(parsed.tool_result.result || {}, null, 2);
                accumulatedReasoning = appendToolResultToReasoning(
                  accumulatedReasoning,
                  toolName,
                  resStr
                );
                yield createYieldContent(accumulatedReasoning, accumulatedText);
              } else if (parsed.event_type === "error" && parsed.error) {
                accumulatedText +=
                  (accumulatedText ? "\n\n" : "") +
                  `⚠️ **Agent Runtime Error:** ${parsed.error}`;
                yield createYieldContent(accumulatedReasoning, accumulatedText);
                return;
              } else if (parsed.event_type === "done") {
                // Finalize any running markers to complete
                accumulatedReasoning = accumulatedReasoning.replaceAll(
                  'status="running"',
                  'status="complete"'
                );
                yield createYieldContent(accumulatedReasoning, accumulatedText);
                return;
              }
            } catch (e: unknown) {
              if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
                throw e;
              }
            }
          }
        }
      } catch (err: unknown) {
        if ((err instanceof Error && err.name === "AbortError") || abortSignal?.aborted) {
          console.log("[createGeminiChatAdapter] Chat stream aborted cleanly by client");
          return;
        }
        console.error("[createGeminiChatAdapter] Run error:", err);
        throw err;
      }
    },
  };
}

export const geminiChatAdapter = createGeminiChatAdapter();

export function createGeminiFeedbackAdapter(
  getSessionId?: () => string | undefined
): FeedbackAdapter {
  return {
    submit: async ({ message, type }) => {
      const feedbackType: FeedbackType =
        type === "positive" ? "THUMBS_UP" : "THUMBS_DOWN";
      const sessionId = getSessionId?.() || "default";

      try {
        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            eventId: message.id,
            feedbackType,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(
            `[createGeminiFeedbackAdapter] Feedback submission failed (${response.status}):`,
            errText
          );
        }
      } catch (err: unknown) {
        console.error(
          "[createGeminiFeedbackAdapter] Network error submitting feedback:",
          err
        );
      }
    },
  };
}

export const geminiFeedbackAdapter = createGeminiFeedbackAdapter();

export function createWebSpeechDictationAdapter(): WebSpeechDictationAdapter | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return new WebSpeechDictationAdapter();
  } catch {
    return undefined;
  }
}

export function createWebSpeechSynthesisAdapter(): WebSpeechSynthesisAdapter | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return new WebSpeechSynthesisAdapter();
  } catch {
    return undefined;
  }
}
