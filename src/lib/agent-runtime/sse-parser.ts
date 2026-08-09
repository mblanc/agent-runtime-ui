import { AgentStreamEvent } from "@/types/agent";
import { formatAgentDisplayName, isSubagentNode } from "./event-normalizer";

export async function* parseSseStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<AgentStreamEvent, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;

        const dataStr = trimmed.startsWith("data: ") ? trimmed.slice(6) : trimmed;

        if (dataStr === "[DONE]") {
          yield { event_type: "done" };
          return;
        }

        try {
          const parsed = JSON.parse(dataStr);

          if (parsed.agent_call) {
            yield { event_type: "agent_call", agent_call: parsed.agent_call };
          } else if (parsed.agent_response) {
            yield {
              event_type: "agent_response",
              agent_response: parsed.agent_response,
            };
          } else if (parsed.content?.parts && Array.isArray(parsed.content.parts)) {
            const author =
              (parsed.author as string) ||
              (parsed.content?.author as string) ||
              (parsed.config?.author as string);
            const isSubAgent = isSubagentNode(parsed);

            for (const part of parsed.content.parts) {
              if (part.text) {
                if (part.thought) {
                  yield { event_type: "thought", thought: part.text };
                } else if (isSubAgent) {
                  yield {
                    event_type: "agent_response",
                    agent_response: {
                      agent: author || "sub_agent",
                      displayName: formatAgentDisplayName(author),
                      response: part.text,
                    },
                  };
                } else {
                  yield { event_type: "content", content: part.text, author };
                }
              }
              const fnCall = part.function_call || part.functionCall;
              if (fnCall) {
                const name = String(fnCall.name || "");
                yield {
                  event_type: "tool_call",
                  tool_call: {
                    name,
                    args: fnCall.args,
                  },
                };
              }
              const fnResp = part.function_response || part.functionResponse;
              if (fnResp) {
                const name = String(fnResp.name || "");
                yield {
                  event_type: "tool_result",
                  tool_result: {
                    name,
                    result: (fnResp.response as Record<string, unknown>) || {},
                  },
                };
              }
            }
          } else if (parsed.text) {
            const author =
              (parsed.author as string) ||
              (parsed.config?.author as string) ||
              (parsed.agent as string);
            const isSubAgent = isSubagentNode(parsed);

            if (isSubAgent) {
              yield {
                event_type: "agent_response",
                agent_response: {
                  agent: author || "sub_agent",
                  displayName: formatAgentDisplayName(author),
                  response: parsed.text,
                },
              };
            } else {
              yield { event_type: "content", content: parsed.text, author };
            }
          } else if (parsed.thought) {
            yield { event_type: "thought", thought: parsed.thought };
          } else if (parsed.function_call || parsed.functionCall) {
            const fnCall = parsed.function_call || parsed.functionCall;
            const name = String(fnCall.name || "");
            yield {
              event_type: "tool_call",
              tool_call: { name, args: fnCall.args },
            };
          } else if (parsed.function_response || parsed.functionResponse) {
            const fnResp = parsed.function_response || parsed.functionResponse;
            const name = String(fnResp.name || "");
            yield {
              event_type: "tool_result",
              tool_result: {
                name,
                result: (fnResp.response as Record<string, unknown>) || {},
              },
            };
          } else if (parsed.tool_call) {
            yield { event_type: "tool_call", tool_call: parsed.tool_call };
          } else if (parsed.tool_result) {
            yield { event_type: "tool_result", tool_result: parsed.tool_result };
          } else if (parsed.error_message) {
            yield {
              event_type: "content",
              content: `\n\n*Agent message: ${parsed.error_message}*`,
            };
          }
        } catch {
          yield { event_type: "content", content: dataStr };
        }
      }
    }
  } finally {
    if (typeof reader?.releaseLock === "function") {
      try {
        reader.releaseLock();
      } catch {
        // Ignore
      }
    }
  }

  yield { event_type: "done" };
}
