import { AgentSessionEvent } from "@/types/agent";
import { FormattedSessionThreadMessage } from "./types";
import { extractGroundingMetadata } from "@/lib/grounding/citation-parser";

/**
 * Shapes grouped session events into assistant-ui thread messages.
 */

export function formatSessionEventsToThreadMessages(
  events: AgentSessionEvent[]
): FormattedSessionThreadMessage[] {
  const threadMessages: FormattedSessionThreadMessage[] = [];
  let accumulatedThoughts: string[] = [];

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

    if (thought) {
      accumulatedThoughts.push(thought);
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

    if (
      content ||
      thought ||
      accumulatedThoughts.length > 0 ||
      hasToolCalls ||
      hasToolResults ||
      groundingMetadata
    ) {
      threadMessages.push({
        id: e.id || `msg-${i}`,
        role: "assistant",
        content: content || "",
        createdAt: e.createTime,
        thought:
          accumulatedThoughts.length > 0 ? accumulatedThoughts.join("\n\n") : undefined,
        subAgents: e.subAgents,
        toolCalls: e.tool_calls,
        toolResults: e.tool_results,
        toolCall: e.tool_call,
        toolResult: e.tool_result,
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
          },
        },
      });
      accumulatedThoughts = [];
    }
  }

  if (accumulatedThoughts.length > 0) {
    threadMessages.push({
      id: "msg-trailing-reasoning",
      role: "assistant",
      content: "",
      thought: accumulatedThoughts.join("\n\n"),
      createdAt: new Date().toISOString(),
    });
  }

  return threadMessages;
}
