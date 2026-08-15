import {
  AgentActionsDelta,
  AgentNodeInfo,
  AgentStreamEvent,
  AgentUsageMetadata,
} from "@/types/agent";
import {
  extractSubagentName,
  formatAgentDisplayName,
  isRootWorkflowOutput,
  isSubagentNode,
} from "./event-normalizer";
import { extractGroundingMetadata } from "@/lib/grounding/citation-parser";

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

function extractInvocationId(parsed: Record<string, unknown>): string | undefined {
  const config = parsed.config as Record<string, unknown> | undefined;
  const rawEvent = (parsed.raw_event || parsed.rawEvent) as
    Record<string, unknown> | undefined;

  return (
    (typeof parsed.invocation_id === "string" ? parsed.invocation_id : undefined) ||
    (typeof parsed.invocationId === "string" ? parsed.invocationId : undefined) ||
    (config && typeof config.invocation_id === "string"
      ? config.invocation_id
      : undefined) ||
    (config && typeof config.invocationId === "string"
      ? config.invocationId
      : undefined) ||
    (rawEvent && typeof rawEvent.invocation_id === "string"
      ? rawEvent.invocation_id
      : undefined) ||
    (rawEvent && typeof rawEvent.invocationId === "string"
      ? rawEvent.invocationId
      : undefined) ||
    undefined
  );
}

function extractModelVersion(parsed: Record<string, unknown>): string | undefined {
  const config = parsed.config as Record<string, unknown> | undefined;
  const rawEvent = (parsed.raw_event || parsed.rawEvent) as
    Record<string, unknown> | undefined;

  return (
    (typeof parsed.model_version === "string" ? parsed.model_version : undefined) ||
    (typeof parsed.modelVersion === "string" ? parsed.modelVersion : undefined) ||
    (typeof parsed.model === "string" ? parsed.model : undefined) ||
    (config && typeof config.model_version === "string"
      ? config.model_version
      : undefined) ||
    (config && typeof config.modelVersion === "string"
      ? config.modelVersion
      : undefined) ||
    (rawEvent && typeof rawEvent.model_version === "string"
      ? rawEvent.model_version
      : undefined) ||
    (rawEvent && typeof rawEvent.modelVersion === "string"
      ? rawEvent.modelVersion
      : undefined) ||
    undefined
  );
}

export function extractUsageMetadata(
  parsed: Record<string, unknown>
): AgentUsageMetadata | undefined {
  const config = parsed.config as Record<string, unknown> | undefined;
  const rawEvent = (parsed.raw_event || parsed.rawEvent) as
    Record<string, unknown> | undefined;

  const raw = (parsed.usage_metadata ||
    parsed.usageMetadata ||
    parsed.usage ||
    config?.usage_metadata ||
    config?.usageMetadata ||
    config?.usage ||
    rawEvent?.usage_metadata ||
    rawEvent?.usageMetadata ||
    rawEvent?.usage) as Record<string, unknown> | undefined;

  if (!raw || typeof raw !== "object") return undefined;

  const promptCount =
    typeof raw.prompt_token_count === "number"
      ? raw.prompt_token_count
      : typeof raw.promptTokenCount === "number"
        ? raw.promptTokenCount
        : undefined;

  const candidatesCount =
    typeof raw.candidates_token_count === "number"
      ? raw.candidates_token_count
      : typeof raw.candidatesTokenCount === "number"
        ? raw.candidatesTokenCount
        : undefined;

  const thoughtsCount =
    typeof raw.thoughts_token_count === "number"
      ? raw.thoughts_token_count
      : typeof raw.thoughtsTokenCount === "number"
        ? raw.thoughtsTokenCount
        : undefined;

  let cachedCount =
    typeof raw.cached_content_token_count === "number"
      ? raw.cached_content_token_count
      : typeof raw.cachedContentTokenCount === "number"
        ? raw.cachedContentTokenCount
        : typeof raw.cached_token_count === "number"
          ? raw.cached_token_count
          : typeof raw.cachedTokenCount === "number"
            ? raw.cachedTokenCount
            : undefined;

  const totalCount =
    typeof raw.total_token_count === "number"
      ? raw.total_token_count
      : typeof raw.totalTokenCount === "number"
        ? raw.totalTokenCount
        : undefined;

  const trafficType =
    typeof raw.traffic_type === "string"
      ? raw.traffic_type
      : typeof raw.trafficType === "string"
        ? raw.trafficType
        : undefined;

  const promptDetails = raw.prompt_tokens_details || raw.promptTokensDetails;
  const candidateDetails = raw.candidates_tokens_details || raw.candidatesTokensDetails;
  const cachedDetails = raw.cached_tokens_details || raw.cachedTokensDetails;

  // Fallback: Check prompt_tokens_details for cached tokens if not present top-level
  if (cachedCount === undefined && Array.isArray(promptDetails)) {
    const cachedDetail = (promptDetails as Array<Record<string, unknown>>).find(
      (d) =>
        String(d.modality || "")
          .toUpperCase()
          .includes("CACHE") ||
        String(d.tokenType || "")
          .toUpperCase()
          .includes("CACHE")
    );
    if (cachedDetail) {
      cachedCount =
        typeof cachedDetail.token_count === "number"
          ? cachedDetail.token_count
          : typeof cachedDetail.tokenCount === "number"
            ? cachedDetail.tokenCount
            : undefined;
    }
  }

  return {
    ...(promptCount !== undefined
      ? { prompt_token_count: promptCount, promptTokenCount: promptCount }
      : {}),
    ...(candidatesCount !== undefined
      ? { candidates_token_count: candidatesCount, candidatesTokenCount: candidatesCount }
      : {}),
    ...(thoughtsCount !== undefined
      ? { thoughts_token_count: thoughtsCount, thoughtsTokenCount: thoughtsCount }
      : {}),
    ...(cachedCount !== undefined
      ? {
          cached_content_token_count: cachedCount,
          cachedContentTokenCount: cachedCount,
          cached_token_count: cachedCount,
          cachedTokenCount: cachedCount,
        }
      : {}),
    ...(totalCount !== undefined
      ? { total_token_count: totalCount, totalTokenCount: totalCount }
      : {}),
    ...(trafficType ? { traffic_type: trafficType, trafficType } : {}),
    ...(Array.isArray(promptDetails)
      ? {
          prompt_tokens_details:
            promptDetails as AgentUsageMetadata["prompt_tokens_details"],
          promptTokensDetails:
            promptDetails as AgentUsageMetadata["prompt_tokens_details"],
        }
      : {}),
    ...(Array.isArray(candidateDetails)
      ? {
          candidates_tokens_details:
            candidateDetails as AgentUsageMetadata["candidates_tokens_details"],
          candidatesTokensDetails:
            candidateDetails as AgentUsageMetadata["candidates_tokens_details"],
        }
      : {}),
    ...(Array.isArray(cachedDetails)
      ? {
          cached_tokens_details:
            cachedDetails as AgentUsageMetadata["cached_tokens_details"],
          cachedTokensDetails:
            cachedDetails as AgentUsageMetadata["cached_tokens_details"],
        }
      : {}),
  };
}

function extractAvgLogprobs(parsed: Record<string, unknown>): number | undefined {
  const config = parsed.config as Record<string, unknown> | undefined;
  const rawEvent = (parsed.raw_event || parsed.rawEvent) as
    Record<string, unknown> | undefined;

  if (typeof parsed.avg_logprobs === "number") return parsed.avg_logprobs;
  if (typeof parsed.avgLogprobs === "number") return parsed.avgLogprobs;
  if (config && typeof config.avg_logprobs === "number") return config.avg_logprobs;
  if (config && typeof config.avgLogprobs === "number") return config.avgLogprobs;
  if (rawEvent && typeof rawEvent.avg_logprobs === "number") return rawEvent.avg_logprobs;
  if (rawEvent && typeof rawEvent.avgLogprobs === "number") return rawEvent.avgLogprobs;
  return undefined;
}

function extractNodeInfo(parsed: Record<string, unknown>): AgentNodeInfo | undefined {
  const config = parsed.config as Record<string, unknown> | undefined;
  const rawEvent = (parsed.raw_event || parsed.rawEvent) as
    Record<string, unknown> | undefined;

  const raw = (parsed.node_info ||
    parsed.nodeInfo ||
    config?.node_info ||
    config?.nodeInfo ||
    rawEvent?.node_info ||
    rawEvent?.nodeInfo) as AgentNodeInfo | undefined;

  return raw && typeof raw === "object" ? raw : undefined;
}

function extractNodePath(
  parsed: Record<string, unknown>,
  nodeInfo?: AgentNodeInfo
): string | undefined {
  if (nodeInfo && typeof nodeInfo.path === "string" && nodeInfo.path) {
    return nodeInfo.path;
  }
  const config = parsed.config as Record<string, unknown> | undefined;
  const rawEvent = (parsed.raw_event || parsed.rawEvent) as
    Record<string, unknown> | undefined;

  return (
    (typeof parsed.node_path === "string" ? parsed.node_path : undefined) ||
    (typeof parsed.nodePath === "string" ? parsed.nodePath : undefined) ||
    (config && typeof config.node_path === "string" ? config.node_path : undefined) ||
    (config && typeof config.nodePath === "string" ? config.nodePath : undefined) ||
    (rawEvent && typeof rawEvent.node_path === "string"
      ? rawEvent.node_path
      : undefined) ||
    (rawEvent && typeof rawEvent.nodePath === "string" ? rawEvent.nodePath : undefined) ||
    undefined
  );
}

function extractThoughtSignature(
  parsed: Record<string, unknown>,
  part?: Record<string, unknown>
): string | undefined {
  if (part) {
    if (typeof part.thought_signature === "string" && part.thought_signature) {
      return part.thought_signature;
    }
    if (typeof part.thoughtSignature === "string" && part.thoughtSignature) {
      return part.thoughtSignature;
    }
  }

  const config = parsed.config as Record<string, unknown> | undefined;
  const rawEvent = (parsed.raw_event || parsed.rawEvent) as
    Record<string, unknown> | undefined;

  return (
    (typeof parsed.thought_signature === "string"
      ? parsed.thought_signature
      : undefined) ||
    (typeof parsed.thoughtSignature === "string" ? parsed.thoughtSignature : undefined) ||
    (config && typeof config.thought_signature === "string"
      ? config.thought_signature
      : undefined) ||
    (config && typeof config.thoughtSignature === "string"
      ? config.thoughtSignature
      : undefined) ||
    (rawEvent && typeof rawEvent.thought_signature === "string"
      ? rawEvent.thought_signature
      : undefined) ||
    (rawEvent && typeof rawEvent.thoughtSignature === "string"
      ? rawEvent.thoughtSignature
      : undefined) ||
    undefined
  );
}

function extractActions(parsed: Record<string, unknown>): AgentActionsDelta | undefined {
  const config = parsed.config as Record<string, unknown> | undefined;
  const rawEvent = (parsed.raw_event || parsed.rawEvent) as
    Record<string, unknown> | undefined;

  const raw = (parsed.actions || config?.actions || rawEvent?.actions) as
    AgentActionsDelta | undefined;

  return raw && typeof raw === "object" ? raw : undefined;
}

function extractFinishReason(parsed: Record<string, unknown>): string | undefined {
  const config = parsed.config as Record<string, unknown> | undefined;
  const rawEvent = (parsed.raw_event || parsed.rawEvent) as
    Record<string, unknown> | undefined;

  return (
    (typeof parsed.finish_reason === "string" ? parsed.finish_reason : undefined) ||
    (typeof parsed.finishReason === "string" ? parsed.finishReason : undefined) ||
    (config && typeof config.finish_reason === "string"
      ? config.finish_reason
      : undefined) ||
    (config && typeof config.finishReason === "string"
      ? config.finishReason
      : undefined) ||
    (rawEvent && typeof rawEvent.finish_reason === "string"
      ? rawEvent.finish_reason
      : undefined) ||
    (rawEvent && typeof rawEvent.finishReason === "string"
      ? rawEvent.finishReason
      : undefined) ||
    undefined
  );
}

function extractTimestamp(parsed: Record<string, unknown>): number | string | undefined {
  const config = parsed.config as Record<string, unknown> | undefined;
  const rawEvent = (parsed.raw_event || parsed.rawEvent) as
    Record<string, unknown> | undefined;

  const raw =
    parsed.timestamp ??
    config?.timestamp ??
    rawEvent?.timestamp ??
    parsed.createTime ??
    parsed.create_time;

  if (typeof raw === "number" || typeof raw === "string") {
    return raw;
  }
  return undefined;
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
      const invocationId = extractInvocationId(parsed);
      const modelVersion = extractModelVersion(parsed);
      const usageMetadata = extractUsageMetadata(parsed);
      const avgLogprobs = extractAvgLogprobs(parsed);
      const nodeInfo = extractNodeInfo(parsed);
      const nodePath = extractNodePath(parsed, nodeInfo);
      const actions = extractActions(parsed);
      const finishReason = extractFinishReason(parsed);
      const timestamp = extractTimestamp(parsed);
      const rootThoughtSig = extractThoughtSignature(parsed);
      const rootPartial = extractPartial(parsed);
      const turnComplete = extractTurnComplete(parsed);
      const interrupted = extractInterrupted(parsed);
      const groundingMetadata = extractGroundingMetadata(parsed);

      const withEventMeta = (
        evt: AgentStreamEvent,
        partPartial?: boolean,
        partThoughtSig?: string
      ): AgentStreamEvent => {
        const resolvedPartial =
          typeof partPartial === "boolean" ? partPartial : rootPartial;
        const metaToAttach =
          evt.groundingMetadata || evt.grounding_metadata || groundingMetadata;
        const sigToAttach =
          partThoughtSig ||
          evt.thoughtSignature ||
          evt.thought_signature ||
          rootThoughtSig;

        return {
          ...evt,
          ...(eventId ? { eventId } : {}),
          ...(invocationId ? { invocationId, invocation_id: invocationId } : {}),
          ...(modelVersion ? { modelVersion, model_version: modelVersion } : {}),
          ...(usageMetadata ? { usageMetadata, usage_metadata: usageMetadata } : {}),
          ...(avgLogprobs !== undefined
            ? { avgLogprobs, avg_logprobs: avgLogprobs }
            : {}),
          ...(nodeInfo ? { nodeInfo, node_info: nodeInfo } : {}),
          ...(nodePath ? { nodePath, node_path: nodePath } : {}),
          ...(sigToAttach
            ? { thoughtSignature: sigToAttach, thought_signature: sigToAttach }
            : {}),
          ...(actions ? { actions } : {}),
          ...(finishReason ? { finishReason, finish_reason: finishReason } : {}),
          ...(timestamp !== undefined ? { timestamp } : {}),
          ...(typeof resolvedPartial === "boolean" ? { partial: resolvedPartial } : {}),
          ...(typeof turnComplete === "boolean" ? { turn_complete: turnComplete } : {}),
          ...(typeof interrupted === "boolean" ? { interrupted } : {}),
          ...(metaToAttach
            ? {
                groundingMetadata: metaToAttach,
                grounding_metadata: metaToAttach,
              }
            : {}),
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
        const isRoot = isRootWorkflowOutput(parsed);
        const isSubAgent = !isRoot && isSubagentNode(parsed);
        const subagentName = isSubAgent ? extractSubagentName(parsed) : undefined;
        const author =
          (parsed.author as string) ||
          (parsed.content?.author as string) ||
          (parsed.config?.author as string) ||
          subagentName;

        for (const part of parsed.content.parts) {
          const partPartial = extractPartial(parsed, part);
          const partThoughtSig = extractThoughtSignature(parsed, part);
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
              partPartial,
              partThoughtSig
            );
          } else if (part.text && !isThought) {
            if (isSubAgent) {
              const targetAgent = subagentName || author || "sub_agent";
              yield withEventMeta(
                {
                  event_type: "agent_response",
                  agent_response: {
                    agent: targetAgent,
                    displayName: formatAgentDisplayName(targetAgent),
                    response: part.text,
                  },
                },
                partPartial,
                partThoughtSig
              );
            } else {
              yield withEventMeta(
                {
                  event_type: "content",
                  content: part.text,
                  author,
                },
                partPartial,
                partThoughtSig
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
              partPartial,
              partThoughtSig
            );
          }

          const fnResp = part.function_response || part.functionResponse;
          if (fnResp) {
            yield withEventMeta(
              {
                event_type: "tool_result",
                tool_result: parseToolResult(fnResp),
              },
              partPartial,
              partThoughtSig
            );
          }
        }
      } else if (parsed.text) {
        const isRoot = isRootWorkflowOutput(parsed);
        const isSubAgent = !isRoot && isSubagentNode(parsed);
        const subagentName = isSubAgent ? extractSubagentName(parsed) : undefined;
        const author =
          (parsed.author as string) ||
          (parsed.config?.author as string) ||
          (parsed.agent as string) ||
          subagentName;

        if (isSubAgent) {
          const targetAgent = subagentName || author || "sub_agent";
          yield withEventMeta({
            event_type: "agent_response",
            agent_response: {
              agent: targetAgent,
              displayName: formatAgentDisplayName(targetAgent),
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
      } else if (groundingMetadata) {
        yield withEventMeta({
          event_type: "thought",
          thought: "Grounding metadata updated.",
          groundingMetadata,
          grounding_metadata: groundingMetadata,
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
