import type { ChatModelRunResult } from "@assistant-ui/react";
import type {
  AgentCodeExecutionBlock,
  AgentMessageInfoMetadata,
  ArtifactStreamPayload,
  GroundingMetadata,
  MemoryRetrievalItem,
  ReasoningTraceEntry,
} from "@/types/agent";

export interface ToolCallYieldItem {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  /**
   * True when the backend supplied the id, as opposed to one we synthesised.
   * Name-based pairing is only permissible between id-less calls and results;
   * a call with a real id must be paired on that id alone.
   */
  hasBackendId?: boolean;
  status?: {
    type: "running" | "complete" | "incomplete" | "requires-action";
    reason?: string;
  };
}

type ToolCallContentPart = Extract<
  NonNullable<ChatModelRunResult["content"]>[number],
  { type: "tool-call" }
>;

/**
 * One yielded snapshot of a message in progress.
 *
 * A single object rather than seven positional parameters, five of them
 * optional and four of them `string | undefined`: transposing two of those was
 * silent, and adding a metadata channel meant editing every call site.
 */
export interface YieldContentFields {
  reasoning: string;
  /**
   * The same trace as `reasoning`, structured. It rides on the message metadata
   * rather than in the `reasoning` content part because that part's only field
   * is `text` — assistant-ui owns its shape. The renderer reads it from there
   * and skips parsing `reasoning` entirely; `reasoning` remains the payload that
   * makes the part (and therefore the panel) exist at all.
   */
  reasoningTrace?: ReasoningTraceEntry[];
  text: string;
  toolCalls?: ToolCallYieldItem[];
  codeExecutionBlocks?: AgentCodeExecutionBlock[];
  eventId?: string;
  retrievedMemories?: MemoryRetrievalItem[];
  groundingMetadata?: GroundingMetadata;
  messageInfo?: AgentMessageInfoMetadata;
  artifacts?: ArtifactStreamPayload[];
  artifactEvent?: ArtifactStreamPayload;
}

export function createYieldContent({
  reasoning,
  reasoningTrace,
  text,
  toolCalls,
  codeExecutionBlocks,
  eventId,
  retrievedMemories,
  groundingMetadata,
  messageInfo,
  artifacts,
  artifactEvent,
}: YieldContentFields): ChatModelRunResult {
  const hasRequiresAction = (toolCalls || []).some(
    (tc) => tc.status?.type === "requires-action" && tc.result === undefined
  );

  return {
    content: [
      ...(reasoning ? [{ type: "reasoning" as const, text: reasoning }] : []),
      ...(toolCalls || []).map((tc) => ({
        type: "tool-call" as const,
        toolCallId: tc.toolCallId,
        toolName: tc.toolName,
        args: tc.args as unknown as ToolCallContentPart["args"],
        argsText: JSON.stringify(tc.args || {}),
        result: tc.result,
        status: tc.status || { type: "complete" as const },
      })),
      ...(text ? [{ type: "text" as const, text }] : []),
    ],
    ...(hasRequiresAction
      ? {
          status: {
            type: "requires-action" as const,
            reason: "tool-calls" as const,
          },
        }
      : {}),
    ...(eventId ||
    (retrievedMemories && retrievedMemories.length > 0) ||
    (reasoningTrace && reasoningTrace.length > 0) ||
    (codeExecutionBlocks && codeExecutionBlocks.length > 0) ||
    (artifacts && artifacts.length > 0) ||
    artifactEvent ||
    groundingMetadata ||
    messageInfo
      ? {
          metadata: {
            custom: {
              ...(eventId ? { eventId } : {}),
              ...(reasoningTrace && reasoningTrace.length > 0 ? { reasoningTrace } : {}),
              ...(codeExecutionBlocks && codeExecutionBlocks.length > 0
                ? { codeExecutionBlocks }
                : {}),
              ...(retrievedMemories && retrievedMemories.length > 0
                ? { retrievedMemories }
                : {}),
              ...(artifacts && artifacts.length > 0 ? { artifacts } : {}),
              ...(artifactEvent ? { artifactEvent } : {}),
              ...(groundingMetadata ? { groundingMetadata } : {}),
              ...(messageInfo?.invocationId
                ? { invocationId: messageInfo.invocationId }
                : {}),
              ...(messageInfo?.modelVersion
                ? { modelVersion: messageInfo.modelVersion }
                : {}),
              ...(messageInfo?.usageMetadata
                ? { usageMetadata: messageInfo.usageMetadata }
                : {}),
              ...(messageInfo?.avgLogprobs !== undefined
                ? { avgLogprobs: messageInfo.avgLogprobs }
                : {}),
              ...(messageInfo?.nodeInfo ? { nodeInfo: messageInfo.nodeInfo } : {}),
              ...(messageInfo?.nodePath ? { nodePath: messageInfo.nodePath } : {}),
              ...(messageInfo?.thoughtSignature
                ? { thoughtSignature: messageInfo.thoughtSignature }
                : {}),
              ...(messageInfo?.actions ? { actions: messageInfo.actions } : {}),
              ...(messageInfo?.finishReason
                ? { finishReason: messageInfo.finishReason }
                : {}),
              ...(messageInfo?.timestamp !== undefined
                ? { timestamp: messageInfo.timestamp }
                : {}),
            },
          },
        }
      : {}),
  };
}
