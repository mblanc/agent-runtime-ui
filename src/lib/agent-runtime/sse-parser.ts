import {
  AgentActionsDelta,
  AgentNodeInfo,
  AgentStreamEvent,
  AgentUsageMetadata,
  GroundingMetadata,
} from "@/types/agent";
import {
  extractSubagentName,
  formatAgentDisplayName,
  isRootWorkflowOutput,
  isSubagentNode,
} from "./event-normalizer";
import { extractGroundingMetadata } from "@/lib/grounding/citation-parser";
import {
  extractArtifactFromObject,
  extractArtifactFromTool,
  inferMimeType,
  deriveArtifactTitle,
} from "@/lib/artifacts/artifact-extractor";
import { parseCodeExecutionOutput } from "@/lib/code-execution/output-parser";

/**
 * An event exactly as it arrived from Vertex AI: any spelling, any nesting.
 *
 * The distinction from `AgentStreamEvent` is the point of this module. This is
 * what the extractors below consume — untyped by necessity, because the same
 * field arrives as `invocation_id`, `invocationId`, `config.invocation_id` or
 * `raw_event.invocationId` depending on endpoint and API version.
 * `AgentStreamEvent` is what they produce, and it has exactly one spelling.
 */
function formatImageContent(img: string): string {
  if (
    !img ||
    img.startsWith("data:") ||
    img.startsWith("gs://") ||
    img.startsWith("http://") ||
    img.startsWith("https://") ||
    img.startsWith("/")
  ) {
    return img;
  }
  return `data:image/png;base64,${img}`;
}

type RawUpstreamEvent = Record<string, unknown>;

function extractEventId(parsed: RawUpstreamEvent): string | undefined {
  return (
    (typeof parsed.id === "string" ? parsed.id : undefined) ||
    (typeof parsed.event_id === "string" ? parsed.event_id : undefined) ||
    (typeof parsed.eventId === "string" ? parsed.eventId : undefined) ||
    (typeof parsed.invocation_id === "string" ? parsed.invocation_id : undefined) ||
    (typeof parsed.invocationId === "string" ? parsed.invocationId : undefined) ||
    undefined
  );
}

function extractInvocationId(parsed: RawUpstreamEvent): string | undefined {
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

function extractModelVersion(parsed: RawUpstreamEvent): string | undefined {
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

function extractUsageMetadata(parsed: RawUpstreamEvent): AgentUsageMetadata | undefined {
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

function extractAvgLogprobs(parsed: RawUpstreamEvent): number | undefined {
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

function extractNodeInfo(parsed: RawUpstreamEvent): AgentNodeInfo | undefined {
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
  parsed: RawUpstreamEvent,
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
  parsed: RawUpstreamEvent,
  part?: RawUpstreamEvent
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

function extractActions(parsed: RawUpstreamEvent): AgentActionsDelta | undefined {
  const config = parsed.config as Record<string, unknown> | undefined;
  const rawEvent = (parsed.raw_event || parsed.rawEvent) as
    Record<string, unknown> | undefined;

  const raw = (parsed.actions ||
    parsed.actions_delta ||
    parsed.actionsDelta ||
    config?.actions ||
    rawEvent?.actions) as AgentActionsDelta | undefined;

  if (raw && typeof raw === "object") return raw;

  // A bare state delta at the root, which the `:query` fallback returns and
  // which some ADK versions emit on the stream. It used to be wrapped into an
  // actions object independently by the chat adapter and by the streaming
  // service; the wrapping belongs with the rest of the spelling knowledge.
  const stateDelta = (parsed.state_delta || parsed.stateDelta) as
    AgentActionsDelta["state_delta"] | undefined;

  return stateDelta && typeof stateDelta === "object"
    ? { state_delta: stateDelta }
    : undefined;
}

function extractFinishReason(parsed: RawUpstreamEvent): string | undefined {
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

function extractTimestamp(parsed: RawUpstreamEvent): number | string | undefined {
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
  parsed: RawUpstreamEvent,
  part?: RawUpstreamEvent
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

function extractTurnComplete(parsed: RawUpstreamEvent): boolean | undefined {
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

function extractInterrupted(parsed: RawUpstreamEvent): boolean | undefined {
  if (typeof parsed.interrupted === "boolean") return parsed.interrupted;
  const config = parsed.config as Record<string, unknown> | undefined;
  if (config && typeof config.interrupted === "boolean") return config.interrupted;
  const rawEvent = (parsed.raw_event || parsed.rawEvent) as
    Record<string, unknown> | undefined;
  if (rawEvent && typeof rawEvent.interrupted === "boolean") return rawEvent.interrupted;
  return undefined;
}

/**
 * Every metadata field an upstream event can carry, in the one spelling that
 * exists downstream. A subset of `AgentStreamEvent`, deliberately: this is
 * what gets attached to whichever payload event the raw chunk produces.
 */
export interface NormalizedEventMetadata {
  eventId?: string;
  invocationId?: string;
  modelVersion?: string;
  usageMetadata?: AgentUsageMetadata;
  avgLogprobs?: number;
  nodeInfo?: AgentNodeInfo;
  nodePath?: string;
  thoughtSignature?: string;
  actions?: AgentActionsDelta;
  finishReason?: string;
  timestamp?: number | string;
  partial?: boolean;
  turnComplete?: boolean;
  interrupted?: boolean;
  groundingMetadata?: GroundingMetadata;
}

/**
 * The single normalisation boundary: raw Vertex spellings in, one spelling out.
 *
 * Every producer of `AgentStreamEvent` goes through this — `parseSseStream`
 * below for `:streamQuery`, and `services/streaming-service.ts` for the
 * `:query` fallback, which used to re-derive `modelVersion`, `invocationId`,
 * `usageMetadata`, `actions` and `state_delta` from its own response shape. A
 * field taught to the extractors above is now understood on both paths at once,
 * which is what stops the two from drifting.
 *
 * Keys whose value is undefined are omitted, so the result can be spread onto
 * an event without introducing explicitly-undefined properties (they would
 * survive `JSON.stringify` as absent, but would defeat `??` chains and show up
 * in `toEqual` assertions).
 */
export function normalizeEventMetadata(
  parsed: RawUpstreamEvent
): NormalizedEventMetadata {
  const nodeInfo = extractNodeInfo(parsed);
  const eventId = extractEventId(parsed);
  const invocationId = extractInvocationId(parsed);
  const modelVersion = extractModelVersion(parsed);
  const usageMetadata = extractUsageMetadata(parsed);
  const avgLogprobs = extractAvgLogprobs(parsed);
  const nodePath = extractNodePath(parsed, nodeInfo);
  const thoughtSignature = extractThoughtSignature(parsed);
  const actions = extractActions(parsed);
  const finishReason = extractFinishReason(parsed);
  const timestamp = extractTimestamp(parsed);
  const partial = extractPartial(parsed);
  const turnComplete = extractTurnComplete(parsed);
  const interrupted = extractInterrupted(parsed);
  const groundingMetadata = extractGroundingMetadata(parsed);

  return {
    ...(eventId ? { eventId } : {}),
    ...(invocationId ? { invocationId } : {}),
    ...(modelVersion ? { modelVersion } : {}),
    ...(usageMetadata ? { usageMetadata } : {}),
    ...(avgLogprobs !== undefined ? { avgLogprobs } : {}),
    ...(nodeInfo ? { nodeInfo } : {}),
    ...(nodePath ? { nodePath } : {}),
    ...(thoughtSignature ? { thoughtSignature } : {}),
    ...(actions ? { actions } : {}),
    ...(finishReason ? { finishReason } : {}),
    ...(timestamp !== undefined ? { timestamp } : {}),
    ...(typeof partial === "boolean" ? { partial } : {}),
    ...(typeof turnComplete === "boolean" ? { turnComplete } : {}),
    ...(typeof interrupted === "boolean" ? { interrupted } : {}),
    ...(groundingMetadata ? { groundingMetadata } : {}),
  };
}

/**
 * Field-wise first-wins merge, for a response that scatters its metadata over
 * several sibling objects — the `:query` fallback returns some of it at the
 * root, some under `output`, some under `response`.
 */
export function mergeEventMetadata(
  ...sources: NormalizedEventMetadata[]
): NormalizedEventMetadata {
  const merged: Record<string, unknown> = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined && merged[key] === undefined) {
        merged[key] = value;
      }
    }
  }
  return merged as NormalizedEventMetadata;
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
      const meta = normalizeEventMetadata(parsed);
      const groundingMetadata = meta.groundingMetadata;
      const turnComplete = meta.turnComplete;

      const withEventMeta = (
        evt: AgentStreamEvent,
        partPartial?: boolean,
        partThoughtSig?: string
      ): AgentStreamEvent => {
        // Part-level values win over the chunk-level ones in `meta`: a single
        // chunk carries several parts, and `partial` and the thought signature
        // are properties of the part, not of the chunk.
        const resolvedPartial =
          typeof partPartial === "boolean" ? partPartial : meta.partial;
        const groundingToAttach = evt.groundingMetadata || groundingMetadata;
        const sigToAttach =
          partThoughtSig || evt.thoughtSignature || meta.thoughtSignature;

        return {
          ...evt,
          ...meta,
          ...(typeof resolvedPartial === "boolean" ? { partial: resolvedPartial } : {}),
          ...(sigToAttach ? { thoughtSignature: sigToAttach } : {}),
          ...(groundingToAttach ? { groundingMetadata: groundingToAttach } : {}),
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
            const parsedTc = parseToolCall(fnCall);
            yield withEventMeta(
              {
                event_type: "tool_call",
                tool_call: parsedTc,
              },
              partPartial,
              partThoughtSig
            );

            if (parsedTc && parsedTc.name && parsedTc.args) {
              const art = extractArtifactFromTool(parsedTc.name, parsedTc.args);
              if (art) {
                yield withEventMeta(
                  {
                    event_type: "artifact_created",
                    artifact: art,
                  },
                  partPartial,
                  partThoughtSig
                );
              }
            }
          }

          const fnResp = part.function_response || part.functionResponse;
          if (fnResp) {
            const parsedTr = parseToolResult(fnResp);
            yield withEventMeta(
              {
                event_type: "tool_result",
                tool_result: parsedTr,
              },
              partPartial,
              partThoughtSig
            );

            if (parsedTr && parsedTr.name && parsedTr.result) {
              const art = extractArtifactFromTool(
                parsedTr.name,
                typeof parsedTr.result === "object" && parsedTr.result !== null
                  ? (parsedTr.result as Record<string, unknown>)
                  : { output: String(parsedTr.result) }
              );
              if (art) {
                yield withEventMeta(
                  {
                    event_type: "artifact_created",
                    artifact: art,
                  },
                  partPartial,
                  partThoughtSig
                );
              }
            }
          }

          const execCode = part.executable_code || part.executableCode;
          if (execCode && typeof execCode === "object") {
            yield withEventMeta(
              {
                event_type: "executable_code",
                executable_code: {
                  language: String(execCode.language || "PYTHON"),
                  code: String(execCode.code || ""),
                },
              },
              partPartial,
              partThoughtSig
            );
          }

          const codeRes = part.code_execution_result || part.codeExecutionResult;
          if (codeRes && typeof codeRes === "object") {
            const rawOutput = String(codeRes.output || "");
            const parsedOut = parseCodeExecutionOutput(rawOutput);
            const explicitImgs = Array.isArray(codeRes.generatedImages)
              ? (codeRes.generatedImages as string[])
              : [];
            const allImages = Array.from(new Set([...explicitImgs, ...parsedOut.images]));

            yield withEventMeta(
              {
                event_type: "code_execution_result",
                code_execution_result: {
                  outcome: String(codeRes.outcome || "OUTCOME_OK"),
                  output: rawOutput,
                  ...(typeof codeRes.durationMs === "number"
                    ? { durationMs: codeRes.durationMs }
                    : {}),
                  ...(allImages.length > 0 ? { generatedImages: allImages } : {}),
                },
              },
              partPartial,
              partThoughtSig
            );

            if (parsedOut.savedArtifacts && parsedOut.savedArtifacts.length > 0) {
              for (let sIdx = 0; sIdx < parsedOut.savedArtifacts.length; sIdx++) {
                const savedFile = parsedOut.savedArtifacts[sIdx];
                const mime = inferMimeType(savedFile);
                const imgData = allImages[sIdx] || allImages[0] || "";
                yield withEventMeta(
                  {
                    event_type: "artifact_created",
                    artifact: {
                      filename: savedFile,
                      title: deriveArtifactTitle(savedFile, "Generated Artifact"),
                      mimeType: mime,
                      version: 0,
                      content: mime.startsWith("image/")
                        ? formatImageContent(imgData)
                        : "",
                      ...(imgData.startsWith("gs://") ? { gcsUri: imgData } : {}),
                      isComplete: true,
                    },
                  },
                  partPartial,
                  partThoughtSig
                );
              }
            } else {
              for (let imgIdx = 0; imgIdx < allImages.length; imgIdx++) {
                const imgData = allImages[imgIdx];
                if (imgData) {
                  const filename = `graph_${imgIdx + 1}.png`;
                  yield withEventMeta(
                    {
                      event_type: "artifact_created",
                      artifact: {
                        filename,
                        title: deriveArtifactTitle(filename, "Generated Plot"),
                        mimeType: "image/png",
                        version: 0,
                        content: formatImageContent(imgData),
                        ...(imgData.startsWith("gs://") ? { gcsUri: imgData } : {}),
                        isComplete: true,
                      },
                    },
                    partPartial,
                    partThoughtSig
                  );
                }
              }
            }
          }

          const inlineData = (part.inline_data || part.inlineData) as
            Record<string, unknown> | undefined;
          if (inlineData && inlineData.data) {
            const mimeType = String(
              inlineData.mime_type || inlineData.mimeType || "image/png"
            );
            const base64Data = String(inlineData.data);
            const content = base64Data.startsWith("data:")
              ? base64Data
              : `data:${mimeType};base64,${base64Data}`;
            yield withEventMeta(
              {
                event_type: "artifact_created",
                artifact: {
                  filename: "generated_plot.png",
                  title: "Generated Plot",
                  mimeType,
                  version: 0,
                  content,
                  isComplete: true,
                },
              },
              partPartial,
              partThoughtSig
            );
          }
        }
      } else if (parsed.executable_code || parsed.executableCode) {
        const execCode = (parsed.executable_code || parsed.executableCode) as Record<
          string,
          unknown
        >;
        yield withEventMeta({
          event_type: "executable_code",
          executable_code: {
            language: String(execCode.language || "PYTHON"),
            code: String(execCode.code || ""),
          },
        });
      } else if (parsed.code_execution_result || parsed.codeExecutionResult) {
        const codeRes = (parsed.code_execution_result ||
          parsed.codeExecutionResult) as Record<string, unknown>;
        const rawOutput = String(codeRes.output || "");
        const parsedOut = parseCodeExecutionOutput(rawOutput);
        const explicitImgs = Array.isArray(codeRes.generatedImages)
          ? (codeRes.generatedImages as string[])
          : [];
        const allImages = Array.from(new Set([...explicitImgs, ...parsedOut.images]));

        yield withEventMeta({
          event_type: "code_execution_result",
          code_execution_result: {
            outcome: String(codeRes.outcome || "OUTCOME_OK"),
            output: rawOutput,
            ...(typeof codeRes.durationMs === "number"
              ? { durationMs: codeRes.durationMs }
              : {}),
            ...(allImages.length > 0 ? { generatedImages: allImages } : {}),
          },
        });

        if (parsedOut.savedArtifacts && parsedOut.savedArtifacts.length > 0) {
          for (let sIdx = 0; sIdx < parsedOut.savedArtifacts.length; sIdx++) {
            const savedFile = parsedOut.savedArtifacts[sIdx];
            const mime = inferMimeType(savedFile);
            const imgData = allImages[sIdx] || allImages[0] || "";
            yield withEventMeta({
              event_type: "artifact_created",
              artifact: {
                filename: savedFile,
                title: deriveArtifactTitle(savedFile, "Generated Artifact"),
                mimeType: mime,
                version: 0,
                content: mime.startsWith("image/") ? formatImageContent(imgData) : "",
                ...(imgData.startsWith("gs://") ? { gcsUri: imgData } : {}),
                isComplete: true,
              },
            });
          }
        } else {
          for (let imgIdx = 0; imgIdx < allImages.length; imgIdx++) {
            const imgData = allImages[imgIdx];
            if (imgData) {
              const filename = `graph_${imgIdx + 1}.png`;
              yield withEventMeta({
                event_type: "artifact_created",
                artifact: {
                  filename,
                  title: deriveArtifactTitle(filename, "Generated Plot"),
                  mimeType: "image/png",
                  version: 0,
                  content: formatImageContent(imgData),
                  ...(imgData.startsWith("gs://") ? { gcsUri: imgData } : {}),
                  isComplete: true,
                },
              });
            }
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
        const parsedTc = parseToolCall(parsed.function_call || parsed.functionCall);
        yield withEventMeta({
          event_type: "tool_call",
          tool_call: parsedTc,
        });
        if (parsedTc && parsedTc.name && parsedTc.args) {
          const art = extractArtifactFromTool(parsedTc.name, parsedTc.args);
          if (art) {
            yield withEventMeta({
              event_type: "artifact_created",
              artifact: art,
            });
          }
        }
      } else if (parsed.function_response || parsed.functionResponse) {
        const parsedTr = parseToolResult(
          parsed.function_response || parsed.functionResponse
        );
        yield withEventMeta({
          event_type: "tool_result",
          tool_result: parsedTr,
        });
        if (parsedTr && parsedTr.name && parsedTr.result) {
          const art = extractArtifactFromTool(
            parsedTr.name,
            typeof parsedTr.result === "object" && parsedTr.result !== null
              ? (parsedTr.result as Record<string, unknown>)
              : { output: String(parsedTr.result) }
          );
          if (art) {
            yield withEventMeta({
              event_type: "artifact_created",
              artifact: art,
            });
          }
        }
      } else if (parsed.tool_call) {
        yield withEventMeta({
          event_type: "tool_call",
          tool_call: parsed.tool_call,
        });
        if (parsed.tool_call.name && parsed.tool_call.args) {
          const art = extractArtifactFromTool(
            parsed.tool_call.name,
            parsed.tool_call.args
          );
          if (art) {
            yield withEventMeta({
              event_type: "artifact_created",
              artifact: art,
            });
          }
        }
      } else if (parsed.tool_result) {
        yield withEventMeta({
          event_type: "tool_result",
          tool_result: parsed.tool_result,
        });
        if (parsed.tool_result.name && parsed.tool_result.result) {
          const art = extractArtifactFromTool(
            parsed.tool_result.name,
            typeof parsed.tool_result.result === "object" &&
              parsed.tool_result.result !== null
              ? (parsed.tool_result.result as Record<string, unknown>)
              : { output: String(parsed.tool_result.result) }
          );
          if (art) {
            yield withEventMeta({
              event_type: "artifact_created",
              artifact: art,
            });
          }
        }
      } else if (
        parsed.event_type === "artifact_created" ||
        parsed.event_type === "artifact_updated"
      ) {
        yield withEventMeta({
          event_type: parsed.event_type,
          artifact: parsed.artifact
            ? (extractArtifactFromObject(parsed.artifact) ?? parsed.artifact)
            : undefined,
        });
      } else if (parsed.artifact) {
        const art = extractArtifactFromObject(parsed.artifact);
        if (art) {
          yield withEventMeta({
            event_type: "artifact_created",
            artifact: art,
          });
        }
      } else if (meta.actions?.artifact || meta.actions?.artifacts) {
        const actionArt = extractArtifactFromObject(meta.actions?.artifact);
        if (actionArt) {
          yield withEventMeta({
            event_type: "artifact_created",
            artifact: actionArt,
          });
        }
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
