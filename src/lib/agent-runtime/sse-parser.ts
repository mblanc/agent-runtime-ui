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

function extractPartial(
  parsed: Record<string, unknown>,
  part?: Record<string, unknown>
): boolean | undefined {
  if (part && typeof part.partial === "boolean") {
    return part.partial;
  }
  if (typeof parsed.partial === "boolean") {
    return parsed.partial;
  }
  const config = parsed.config as Record<string, unknown> | undefined;
  if (config && typeof config.partial === "boolean") {
    return config.partial;
  }
  const rawEvent = (parsed.raw_event || parsed.rawEvent) as
    Record<string, unknown> | undefined;
  if (rawEvent && typeof rawEvent.partial === "boolean") {
    return rawEvent.partial;
  }
  return undefined;
}

function extractTurnComplete(parsed: Record<string, unknown>): boolean | undefined {
  if (typeof parsed.turn_complete === "boolean") return parsed.turn_complete;
  if (typeof parsed.turnComplete === "boolean") return parsed.turnComplete;
  const config = parsed.config as Record<string, unknown> | undefined;
  if (config && typeof config.turn_complete === "boolean") return config.turn_complete;
  if (config && typeof config.turnComplete === "boolean") return config.turnComplete;
  const rawEvent = (parsed.raw_event || parsed.rawEvent) as
    Record<string, unknown> | undefined;
  if (rawEvent && typeof rawEvent.turn_complete === "boolean")
    return rawEvent.turn_complete;
  if (rawEvent && typeof rawEvent.turnComplete === "boolean")
    return rawEvent.turnComplete;
  return undefined;
}

function extractInterrupted(parsed: Record<string, unknown>): boolean | undefined {
  if (typeof parsed.interrupted === "boolean") return parsed.interrupted;
  const config = parsed.config as Record<string, unknown> | undefined;
  if (config && typeof config.interrupted === "boolean") return config.interrupted;
  const rawEvent = (parsed.raw_event || parsed.rawEvent) as
    Record<string, unknown> | undefined;
  if (rawEvent && typeof rawEvent.interrupted === "boolean") return rawEvent.interrupted;
  return undefined;
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
      const rootPartial = extractPartial(parsed);
      const turnComplete = extractTurnComplete(parsed);
      const interrupted = extractInterrupted(parsed);

      const withEventMeta = (
        evt: AgentStreamEvent,
        partPartial?: boolean
      ): AgentStreamEvent => {
        const resolvedPartial =
          typeof partPartial === "boolean" ? partPartial : rootPartial;
        return {
          ...evt,
          ...(eventId ? { eventId } : {}),
          ...(typeof resolvedPartial === "boolean" ? { partial: resolvedPartial } : {}),
          ...(typeof turnComplete === "boolean" ? { turn_complete: turnComplete } : {}),
          ...(typeof interrupted === "boolean" ? { interrupted } : {}),
        };
      };

      if (parsed.agent_call) {
        yield withEventMeta({
          event_type: "agent_call",
          agent_call: parsed.agent_call,
        });
      } else if (parsed.agent_response) {
        yield withEventMeta({
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
          const partPartial = extractPartial(parsed, part);
          const isThought =
            part.thought === true ||
            (typeof part.thought === "string" && Boolean(part.thought.trim())) ||
            (part.thought && typeof part.thought === "object");

          const thoughtText =
            typeof part.thought === "string" && part.thought.trim()
              ? part.thought.trim()
              : part.thought &&
                  typeof part.thought === "object" &&
                  typeof (part.thought as Record<string, unknown>).text === "string"
                ? ((part.thought as Record<string, unknown>).text as string).trim()
                : typeof part.text === "string" && isThought
                  ? part.text
                  : "";

          if (isThought && thoughtText) {
            yield withEventMeta(
              {
                event_type: "thought",
                thought: thoughtText,
              },
              partPartial
            );
          } else if (part.text && !isThought) {
            if (isSubAgent) {
              yield withEventMeta(
                {
                  event_type: "agent_response",
                  agent_response: {
                    agent: author || "sub_agent",
                    displayName: formatAgentDisplayName(author),
                    response: part.text,
                  },
                },
                partPartial
              );
            } else {
              yield withEventMeta(
                {
                  event_type: "content",
                  content: part.text,
                  author,
                },
                partPartial
              );
            }
          }

          const fnCall = part.function_call || part.functionCall;
          if (fnCall) {
            yield withEventMeta(
              {
                event_type: "tool_call",
                tool_call: parseToolCall(fnCall),
              },
              partPartial
            );
          }

          const fnResp = part.function_response || part.functionResponse;
          if (fnResp) {
            yield withEventMeta(
              {
                event_type: "tool_result",
                tool_result: parseToolResult(fnResp),
              },
              partPartial
            );
          }
        }
      } else if (parsed.text) {
        const author =
          (parsed.author as string) ||
          (parsed.config?.author as string) ||
          (parsed.agent as string);
        const isSubAgent = isSubagentNode(parsed);

        if (isSubAgent) {
          yield withEventMeta({
            event_type: "agent_response",
            agent_response: {
              agent: author || "sub_agent",
              displayName: formatAgentDisplayName(author),
              response: parsed.text,
            },
          });
        } else {
          yield withEventMeta({
            event_type: "content",
            content: parsed.text,
            author,
          });
        }
      } else if (parsed.thought) {
        const thoughtStr =
          typeof parsed.thought === "string"
            ? parsed.thought
            : typeof (parsed.thought as Record<string, unknown>)?.text === "string"
              ? ((parsed.thought as Record<string, unknown>).text as string)
              : JSON.stringify(parsed.thought);
        yield withEventMeta({
          event_type: "thought",
          thought: thoughtStr,
        });
      } else if (parsed.function_call || parsed.functionCall) {
        yield withEventMeta({
          event_type: "tool_call",
          tool_call: parseToolCall(parsed.function_call || parsed.functionCall),
        });
      } else if (parsed.function_response || parsed.functionResponse) {
        yield withEventMeta({
          event_type: "tool_result",
          tool_result: parseToolResult(
            parsed.function_response || parsed.functionResponse
          ),
        });
      } else if (parsed.tool_call) {
        yield withEventMeta({
          event_type: "tool_call",
          tool_call: parsed.tool_call,
        });
      } else if (parsed.tool_result) {
        yield withEventMeta({
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
        yield withEventMeta({
          event_type: "error",
          error: errStr,
        });
      } else if (turnComplete) {
        yield withEventMeta({
          event_type: "done",
        });
        return;
      }
    } catch {
      yield { event_type: "content", content: dataStr };
    }
  }

  yield { event_type: "done" };
}
