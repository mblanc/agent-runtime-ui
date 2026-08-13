import { AgentStreamEvent } from "@/types/agent";
import { formatAgentDisplayName, isSubagentNode } from "./event-normalizer";

function extractEventId(parsed: Record<string, unknown>): string | undefined {
  return (
    (typeof parsed.id === "string" ? parsed.id : undefined) ||
    (typeof parsed.event_id === "string" ? parsed.event_id : undefined) ||
    (typeof parsed.eventId === "string" ? parsed.eventId : undefined) ||
    (typeof parsed.invocation_id === "string" ? parsed.invocation_id : undefined) ||
    (typeof parsed.invocationId === "string" ? parsed.invocationId : undefined) ||
    undefined
  );
}

function parseToolCall(fnCall: Record<string, unknown>) {
  const name = String(fnCall.name || "");
  const isReqAction =
    name === "adk_request_confirmation" ||
    fnCall.requires_action === true ||
    fnCall.requires_confirmation === true ||
    fnCall.status === "requires-action";

  return {
    name,
    id: (fnCall.id || fnCall.call_id || fnCall.callId) as string | undefined,
    args: (fnCall.args as Record<string, unknown>) || {},
    ...(isReqAction
      ? {
          status: "requires-action" as const,
          requires_action: true,
          requires_confirmation: true,
        }
      : {}),
  };
}

function parseToolResult(fnResp: Record<string, unknown>) {
  const name = String(fnResp.name || "");
  return {
    name,
    id: (fnResp.id || fnResp.call_id || fnResp.callId) as string | undefined,
    result: (fnResp.response as Record<string, unknown>) || {},
  };
}

async function* iterateSseLines(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string, void, unknown> {
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
        if (trimmed && !trimmed.startsWith(":")) {
          yield trimmed;
        }
      }
    }
    if (buffer.trim() && !buffer.trim().startsWith(":")) {
      yield buffer.trim();
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
}

export async function* parseSseStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<AgentStreamEvent, void, unknown> {
  for await (const line of iterateSseLines(body)) {
    const dataStr = line.startsWith("data: ") ? line.slice(6) : line;

    if (dataStr === "[DONE]") {
      yield { event_type: "done" };
      return;
    }

    try {
      const parsed = JSON.parse(dataStr);
      const eventId = extractEventId(parsed);
      const withEventId = (evt: AgentStreamEvent): AgentStreamEvent =>
        eventId ? { ...evt, eventId } : evt;

      if (parsed.agent_call) {
        yield withEventId({
          event_type: "agent_call",
          agent_call: parsed.agent_call,
        });
      } else if (parsed.agent_response) {
        yield withEventId({
          event_type: "agent_response",
          agent_response: parsed.agent_response,
        });
      } else if (parsed.content?.parts && Array.isArray(parsed.content.parts)) {
        const author =
          (parsed.author as string) ||
          (parsed.content?.author as string) ||
          (parsed.config?.author as string);
        const isSubAgent = isSubagentNode(parsed);

        for (const part of parsed.content.parts) {
          if (part.text) {
            if (part.thought) {
              yield withEventId({
                event_type: "thought",
                thought: part.text,
              });
            } else if (isSubAgent) {
              yield withEventId({
                event_type: "agent_response",
                agent_response: {
                  agent: author || "sub_agent",
                  displayName: formatAgentDisplayName(author),
                  response: part.text,
                },
              });
            } else {
              yield withEventId({
                event_type: "content",
                content: part.text,
                author,
              });
            }
          }

          const fnCall = part.function_call || part.functionCall;
          if (fnCall) {
            yield withEventId({
              event_type: "tool_call",
              tool_call: parseToolCall(fnCall),
            });
          }

          const fnResp = part.function_response || part.functionResponse;
          if (fnResp) {
            yield withEventId({
              event_type: "tool_result",
              tool_result: parseToolResult(fnResp),
            });
          }
        }
      } else if (parsed.text) {
        const author =
          (parsed.author as string) ||
          (parsed.config?.author as string) ||
          (parsed.agent as string);
        const isSubAgent = isSubagentNode(parsed);

        if (isSubAgent) {
          yield withEventId({
            event_type: "agent_response",
            agent_response: {
              agent: author || "sub_agent",
              displayName: formatAgentDisplayName(author),
              response: parsed.text,
            },
          });
        } else {
          yield withEventId({
            event_type: "content",
            content: parsed.text,
            author,
          });
        }
      } else if (parsed.thought) {
        yield withEventId({
          event_type: "thought",
          thought: parsed.thought,
        });
      } else if (parsed.function_call || parsed.functionCall) {
        yield withEventId({
          event_type: "tool_call",
          tool_call: parseToolCall(parsed.function_call || parsed.functionCall),
        });
      } else if (parsed.function_response || parsed.functionResponse) {
        yield withEventId({
          event_type: "tool_result",
          tool_result: parseToolResult(
            parsed.function_response || parsed.functionResponse
          ),
        });
      } else if (parsed.tool_call) {
        yield withEventId({
          event_type: "tool_call",
          tool_call: parsed.tool_call,
        });
      } else if (parsed.tool_result) {
        yield withEventId({
          event_type: "tool_result",
          tool_result: parsed.tool_result,
        });
      } else if (parsed.error || parsed.error_message) {
        const errStr =
          typeof parsed.error === "string"
            ? parsed.error
            : typeof parsed.error?.message === "string"
              ? parsed.error.message
              : typeof parsed.error_message === "string"
                ? parsed.error_message
                : JSON.stringify(parsed.error || parsed.error_message);
        yield withEventId({
          event_type: "error",
          error: errStr,
        });
      }
    } catch {
      yield { event_type: "content", content: dataStr };
    }
  }

  yield { event_type: "done" };
}
