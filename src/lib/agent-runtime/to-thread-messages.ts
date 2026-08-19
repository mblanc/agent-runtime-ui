import {
  AgentSessionEvent,
  ArtifactStreamPayload,
  ReasoningTraceEntry,
} from "@/types/agent";
import { FormattedSessionThreadMessage } from "./types";
import { extractGroundingMetadata } from "@/lib/grounding/citation-parser";
import { extractArtifactsFromSessionEvent } from "@/lib/artifacts/artifact-extractor";

/**
 * Shapes grouped session events into assistant-ui thread messages.
 */

export function formatSessionEventsToThreadMessages(
  events: AgentSessionEvent[]
): FormattedSessionThreadMessage[] {
  const threadMessages: FormattedSessionThreadMessage[] = [];
  let accumulatedThoughts: string[] = [];
  // Shadows `accumulatedThoughts` entry for entry: an event contributes its
  // thought string and its trace to the same message, so the two must be
  // accumulated and flushed together or the renderer would show one turn's
  // structured trace against another turn's text.
  let accumulatedTrace: ReasoningTraceEntry[] = [];
  // The renderer shows the array *instead of* the string when it has one, so a
  // partial array is worse than none: any thought whose event carried no trace
  // would vanish. The trace is therefore emitted only when it accounts for
  // every thought in the message — an invariant checked here rather than
  // assumed of every future producer.
  let traceCoversEveryThought = true;

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const content = (e.content || "").trim();
    const thought = (e.thought || "").trim();

    const hasToolCalls = Boolean(
      (e.tool_calls && e.tool_calls.length > 0) || e.tool_call
    );
    const hasToolResults = Boolean(
      (e.tool_results && e.tool_results.length > 0) || e.tool_result
    );
    const groundingMetadata =
      e.groundingMetadata || e.grounding_metadata || extractGroundingMetadata(e);

    const modelVersion = e.modelVersion || e.model_version;
    const usageMetadata = e.usageMetadata || e.usage_metadata;
    const avgLogprobs = e.avgLogprobs ?? e.avg_logprobs;
    const nodeInfo = e.nodeInfo || e.node_info;
    const nodePath = e.nodePath || e.node_path || nodeInfo?.path;
    const thoughtSignature = e.thoughtSignature || e.thought_signature;
    const actions = e.actions;
    const finishReason = e.finishReason || e.finish_reason;
    const timestamp = e.timestamp;

    const effectiveThought = thought && thought !== content ? thought : "";

    if (effectiveThought) {
      accumulatedThoughts.push(effectiveThought);
      if (e.reasoningTrace?.length) {
        accumulatedTrace.push(...e.reasoningTrace);
      } else {
        traceCoversEveryThought = false;
      }
    } else if (e.reasoningTrace?.length) {
      accumulatedTrace.push(...e.reasoningTrace);
      accumulatedThoughts.push("Thinking Process");
    }

    if (e.role === "user") {
      if (content) {
        threadMessages.push({
          id: e.id || `msg-${i}`,
          role: "user",
          content,
          createdAt: e.createTime,
          metadata: {
            custom: {
              ...(e.id ? { eventId: e.id } : {}),
              ...(e.invocationId ? { invocationId: e.invocationId } : {}),
              ...(modelVersion ? { modelVersion } : {}),
              ...(usageMetadata ? { usageMetadata } : {}),
              ...(avgLogprobs !== undefined ? { avgLogprobs } : {}),
              ...(nodeInfo ? { nodeInfo } : {}),
              ...(nodePath ? { nodePath } : {}),
              ...(actions ? { actions } : {}),
              ...(timestamp !== undefined ? { timestamp } : {}),
            },
          },
        });
      }
      continue;
    }

    const codeExecutionBlocks = e.codeExecutionBlocks || e.code_execution_blocks;
    const hasCodeExecution = Boolean(
      codeExecutionBlocks && codeExecutionBlocks.length > 0
    );
    const extractedArtifacts = [
      ...extractArtifactsFromSessionEvent(e),
      ...((e.artifacts as unknown as ArtifactStreamPayload[]) || []),
    ];
    const uniqueArtifacts: ArtifactStreamPayload[] = [];
    for (const a of extractedArtifacts) {
      if (!uniqueArtifacts.some((existing) => existing.filename === a.filename)) {
        uniqueArtifacts.push(a);
      }
    }
    const hasArtifacts = uniqueArtifacts.length > 0;

    if (
      content ||
      thought ||
      accumulatedThoughts.length > 0 ||
      hasToolCalls ||
      hasToolResults ||
      hasCodeExecution ||
      hasArtifacts ||
      groundingMetadata
    ) {
      threadMessages.push({
        id: e.id || `msg-${i}`,
        role: "assistant",
        content: content || "",
        createdAt: e.createTime,
        thought:
          accumulatedThoughts.length > 0 ? accumulatedThoughts.join("\n\n") : undefined,
        reasoningTrace:
          traceCoversEveryThought && accumulatedTrace.length > 0
            ? accumulatedTrace
            : undefined,
        subAgents: e.subAgents,
        toolCalls: e.tool_calls,
        toolResults: e.tool_results,
        toolCall: e.tool_call,
        toolResult: e.tool_result,
        ...(hasCodeExecution ? { codeExecutionBlocks } : {}),
        ...(hasArtifacts ? { artifacts: uniqueArtifacts } : {}),
        metadata: {
          custom: {
            ...(e.id ? { eventId: e.id } : {}),
            ...(e.invocationId ? { invocationId: e.invocationId } : {}),
            ...(modelVersion ? { modelVersion } : {}),
            ...(usageMetadata ? { usageMetadata } : {}),
            ...(avgLogprobs !== undefined ? { avgLogprobs } : {}),
            ...(nodeInfo ? { nodeInfo } : {}),
            ...(nodePath ? { nodePath } : {}),
            ...(thoughtSignature ? { thoughtSignature } : {}),
            ...(actions ? { actions } : {}),
            ...(finishReason ? { finishReason } : {}),
            ...(timestamp !== undefined ? { timestamp } : {}),
            ...(groundingMetadata ? { groundingMetadata } : {}),
            ...(hasCodeExecution ? { codeExecutionBlocks } : {}),
            ...(hasArtifacts ? { artifacts: uniqueArtifacts } : {}),
          },
        },
      });
      accumulatedThoughts = [];
      accumulatedTrace = [];
      traceCoversEveryThought = true;
    }
  }

  if (accumulatedThoughts.length > 0) {
    threadMessages.push({
      id: "msg-trailing-reasoning",
      role: "assistant",
      content: "",
      thought: accumulatedThoughts.join("\n\n"),
      ...(traceCoversEveryThought && accumulatedTrace.length > 0
        ? { reasoningTrace: accumulatedTrace }
        : {}),
      createdAt: new Date().toISOString(),
    });
  }

  return threadMessages;
}
