import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
  ThreadMessage,
} from "@assistant-ui/react";
import type {
  AgentActionsDelta,
  AgentMessage,
  AgentMessageInfoMetadata,
  AgentMessagePart,
  AgentNodeInfo,
  AgentUsageMetadata,
  GroundingMetadata,
  MemoryRetrievalItem,
} from "@/types/agent";
import {
  extractGroundingMetadata,
  mergeGroundingMetadata,
} from "@/lib/grounding/citation-parser";

import { formatAgentDisplayName } from "@/lib/utils";
import {
  defaultAttachmentStore,
  type IAttachmentMetadataStore,
} from "../attachments/attachment-store";
import { inferMimeType } from "../attachments/mime-types";

/**
 * Client-side stream tracing, off unless NEXT_PUBLIC_DEBUG_STREAM is "true".
 *
 * These call sites used to log unconditionally: the whole outbound conversation
 * on every turn, and one line per parsed SSE event. That put message content and
 * attachment URIs in the browser console of any shared machine, and ran a
 * pretty-printing JSON.stringify of a growing history on the main thread.
 */
const DEBUG_STREAM = process.env.NEXT_PUBLIC_DEBUG_STREAM === "true";

function debugStream(event: string, detail?: unknown): void {
  if (!DEBUG_STREAM) return;
  if (detail === undefined) {
    console.debug(`[chat-adapter] ${event}`);
  } else {
    console.debug(`[chat-adapter] ${event}`, detail);
  }
}

/**
 * Resolves an attachment reference to a GCS URI and its MIME type.
 *
 * This was implemented three times — once for image parts, once for file parts,
 * once for message attachments — each with its own strategy ladder, and the
 * three had already drifted apart: only the image path honoured a `?gcsUri=`
 * query parameter, only image and file parsed a storage.googleapis.com URL, and
 * the file path fed its *unresolved* input into getByUrl where the image path
 * fed the source URL. Any attachment fix landed in one or two of the three.
 *
 * Strategies are tried in order and the union of what the three used to do:
 *
 *   1. the candidate is already a gs:// URI
 *   2. store lookup by the caller's candidate attachment ids
 *   3. store lookup by URL, then filename, then a loose match
 *   4. a `gcsUri` query parameter on an http(s) candidate
 *   5. a storage.googleapis.com URL parsed into gs://bucket/object
 *
 * @returns `uri` is "" when nothing resolved; callers decide whether that means
 *          an inline part or skipping the attachment entirely.
 */
export function resolveGcsUri(opts: {
  candidate?: string;
  filename?: string;
  mimeTypeHint?: string;
  attachmentIds?: string[];
  store: IAttachmentMetadataStore;
}): { uri: string; mimeType: string } {
  const { candidate = "", filename, mimeTypeHint, attachmentIds = [], store } = opts;

  let contentType: string | undefined;
  let uri = "";

  const take = (meta: { gcsUri?: string; contentType?: string } | undefined): boolean => {
    if (!meta?.gcsUri) return false;
    uri = meta.gcsUri;
    if (meta.contentType) contentType = meta.contentType;
    return true;
  };

  if (candidate.startsWith("gs://")) {
    uri = candidate;
  }

  if (!uri) {
    for (const id of attachmentIds) {
      if (id && take(store.get(id))) break;
    }
  }

  if (!uri) {
    take(
      (candidate ? store.getByUrl?.(candidate) : undefined) ||
        (filename ? store.getByFilename?.(filename) : undefined) ||
        (candidate ? store.findByAny?.(candidate) : undefined) ||
        attachmentIds.reduce<ReturnType<NonNullable<typeof store.findByAny>>>(
          (found, id) => found || (id ? store.findByAny?.(id) : undefined),
          undefined
        )
    );
  }

  if (!uri && candidate.startsWith("http")) {
    try {
      const gcsQuery = new URL(candidate).searchParams.get("gcsUri");
      if (gcsQuery?.startsWith("gs://")) uri = gcsQuery;
    } catch {
      // not a parseable URL; fall through
    }
  }

  if (!uri) {
    const gcsMatch = candidate.match(
      /^https:\/\/storage\.googleapis\.com\/([^/?#]+)\/([^?#]+)/
    );
    if (gcsMatch) uri = `gs://${gcsMatch[1]}/${gcsMatch[2]}`;
  }

  return { uri, mimeType: inferMimeType(filename, contentType || mimeTypeHint) };
}

/**
 * Strips characters that would break out of a `:::directive[name]{attrs}` block.
 *
 * Tool and subagent names originate from the model, so a crafted name is an
 * injection into the rendering DSL: `]` closes the label early, `"` escapes an
 * attribute value, and `:` can start a sibling directive. The blast radius today
 * is garbled UI, but it grows with every directive added, and the cost of
 * closing it is one replace at the single point where names are rendered.
 */
export function sanitizeDirectiveName(name: string): string {
  return (
    name
      .replace(/[[\]{}":]/g, "")
      .replace(/\s+/g, " ")
      .trim() || "tool"
  );
}

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

export function createYieldContent(
  reasoning: string,
  text: string,
  toolCalls?: ToolCallYieldItem[],
  eventId?: string,
  retrievedMemories?: MemoryRetrievalItem[],
  groundingMetadata?: GroundingMetadata,
  messageInfo?: AgentMessageInfoMetadata
): ChatModelRunResult {
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
    groundingMetadata ||
    messageInfo
      ? {
          metadata: {
            custom: {
              ...(eventId ? { eventId } : {}),
              ...(retrievedMemories && retrievedMemories.length > 0
                ? { retrievedMemories }
                : {}),
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

/**
 * Converts assistant-ui thread messages into the Agent Runtime wire format.
 *
 * Lifted verbatim out of `run()`, where it occupied the first ~240 lines of a
 * ~970-line async generator. It touches no streaming state and closed over
 * nothing but its input, so trapping it inside the generator meant it could
 * only be exercised by running a whole streaming turn against a mocked fetch.
 *
 * Handles text, image and file parts, tool calls and results, message
 * attachments, and the trailing user function-response case used by HITL.
 */
export function toAgentMessages(
  sourceMessages: readonly ThreadMessage[]
): AgentMessage[] {
  const formattedMessages: AgentMessage[] = [];

  for (let mIdx = 0; mIdx < sourceMessages.length; mIdx++) {
    const m = sourceMessages[mIdx];
    let text = "";
    const parts: AgentMessagePart[] = [];
    const userFunctionResponseParts: AgentMessagePart[] = [];

    const customMeta = (m.metadata as Record<string, unknown>)?.custom as
      Record<string, unknown> | undefined;
    const toolApproval = customMeta?.toolApproval as
      { id?: string; name?: string; confirmed?: boolean } | undefined;

    for (const part of m.content) {
      if (part.type === "text") {
        const tokenMatch = part.text.match(
          /^\[TOOL_CONFIRMATION_RESPONSE:(.*?):(.*?):(true|false)\]$/
        );
        if (tokenMatch) {
          const [, callId, callName, boolStr] = tokenMatch;
          const isConf = boolStr === "true";
          const respData = {
            id: callId,
            name: callName,
            response: { confirmed: isConf },
          };
          userFunctionResponseParts.push({
            function_response: respData,
            functionResponse: respData,
          });
        } else {
          text += part.text;
          parts.push({ text: part.text });
        }
      } else if (part.type === "image") {
        const imgPart = part as { image?: string; filename?: string };
        const imgUrl = imgPart.image || "";
        const attMatch = m.attachments?.find(
          (a) => a.type === "image" || (imgPart.filename && a.name === imgPart.filename)
        );
        const { uri: resolvedUri, mimeType: resolvedMimeType } = resolveGcsUri({
          candidate: imgUrl,
          filename: imgPart.filename,
          mimeTypeHint: "image/jpeg",
          attachmentIds: attMatch ? [attMatch.id] : [],
          store: defaultAttachmentStore,
        });

        if (resolvedUri) {
          parts.push({
            file_data: {
              file_uri: resolvedUri,
              mime_type: resolvedMimeType,
            },
          });
        } else {
          parts.push({ image: imgUrl });
        }
      } else if (part.type === "file") {
        const filePart = part as {
          data?: string;
          mimeType?: string;
          filename?: string;
        };
        const rawData = filePart.data || "";
        const fileAttMatch = m.attachments?.find(
          (a) =>
            a.type === "document" || (filePart.filename && a.name === filePart.filename)
        );
        const resolvedFile = resolveGcsUri({
          candidate: rawData,
          filename: filePart.filename,
          mimeTypeHint: filePart.mimeType,
          attachmentIds: fileAttMatch ? [fileAttMatch.id] : [],
          store: defaultAttachmentStore,
        });
        // Nothing resolved: keep the original value so it can go out as an
        // inline file part rather than being dropped.
        const gcsUri = resolvedFile.uri || rawData;
        const mimeType = resolvedFile.mimeType;

        if (gcsUri.startsWith("gs://")) {
          parts.push({
            file_data: {
              file_uri: gcsUri,
              mime_type: mimeType,
            },
          });
        } else {
          parts.push({
            file: {
              data: gcsUri,
              mime_type: mimeType,
            },
          });
        }
      } else if (part.type === "tool-call") {
        const tcPart = part as {
          toolName?: string;
          toolCallId?: string;
          args?: Record<string, unknown>;
          result?: unknown;
        };
        const callData = {
          id: tcPart.toolCallId,
          name: tcPart.toolName || "tool",
          args: tcPart.args || {},
        };
        parts.push({
          function_call: callData,
          functionCall: callData,
        });

        if (tcPart.result !== undefined) {
          const respData = {
            id: tcPart.toolCallId,
            name: tcPart.toolName || "tool",
            response:
              typeof tcPart.result === "object" && tcPart.result !== null
                ? (tcPart.result as Record<string, unknown>)
                : { output: tcPart.result },
          };
          const item = {
            function_response: respData,
            functionResponse: respData,
          };
          if (tcPart.toolName === "adk_request_confirmation") {
            userFunctionResponseParts.unshift(item);
          } else {
            userFunctionResponseParts.push(item);
          }
        }
      }
    }

    // Process message attachments if present
    if (m.attachments && Array.isArray(m.attachments)) {
      for (const att of m.attachments) {
        let attGcsUri = "";
        let attMimeType = inferMimeType(att.name, att.contentType || att.file?.type);

        // Prefer a candidate carried by the attachment's own content parts,
        // then fall back to resolving from the attachment id alone.
        let candidate = "";
        if (att.content && Array.isArray(att.content)) {
          for (const cp of att.content) {
            if (cp.type === "image") {
              candidate = (cp as { image?: string }).image || candidate;
            } else if (cp.type === "file") {
              const filePart = cp as { data?: string; mimeType?: string };
              candidate = filePart.data || candidate;
              if (filePart.mimeType)
                attMimeType = inferMimeType(att.name, filePart.mimeType);
            }
          }
        }

        const resolvedAtt = resolveGcsUri({
          candidate,
          filename: att.name,
          mimeTypeHint: attMimeType,
          attachmentIds: [att.id],
          store: defaultAttachmentStore,
        });
        attGcsUri = resolvedAtt.uri;
        attMimeType = resolvedAtt.mimeType;

        if (attGcsUri && attGcsUri.startsWith("gs://")) {
          const alreadyExists = parts.some(
            (p) =>
              p.file_data?.file_uri === attGcsUri ||
              p.fileData?.file_uri === attGcsUri ||
              p.fileData?.fileUri === attGcsUri
          );
          if (!alreadyExists) {
            parts.push({
              file_data: {
                file_uri: attGcsUri,
                mime_type: attMimeType,
              },
            });
          }
        }
      }
    }

    if (toolApproval) {
      const respData = {
        id: toolApproval.id,
        name: toolApproval.name || "adk_request_confirmation",
        response: { confirmed: Boolean(toolApproval.confirmed) },
      };
      userFunctionResponseParts.unshift({
        function_response: respData,
        functionResponse: respData,
      });
    }

    if (m.role === "user") {
      if (userFunctionResponseParts.length > 0) {
        formattedMessages.push({
          role: "user",
          content: text,
          parts: userFunctionResponseParts,
        });
      } else {
        formattedMessages.push({
          role: "user",
          content: text,
          parts: parts.length > 0 ? parts : undefined,
        });
      }
    } else {
      // Skip empty assistant message if it's the last message (placeholder for streaming response)
      const isLastMessage = mIdx === sourceMessages.length - 1;
      if (
        !isLastMessage ||
        text ||
        parts.length > 0 ||
        userFunctionResponseParts.length > 0
      ) {
        formattedMessages.push({
          role: "assistant",
          content: text,
          parts: parts.length > 0 ? parts : undefined,
        });
      }

      // Only append trailing userFunctionResponseParts if this assistant message is the last message in sourceMessages
      if (isLastMessage && userFunctionResponseParts.length > 0) {
        formattedMessages.push({
          role: "user",
          content: "",
          parts: userFunctionResponseParts,
        });
      }
    }
  }

  return formattedMessages;
}

export function createGeminiChatAdapter(
  getSessionId?: () => string | undefined,
  getAgentId?: () => string | undefined,
  getLocation?: () => string | undefined,
  getThreadMessages?: () => readonly ThreadMessage[] | undefined
): ChatModelAdapter {
  return {
    async *run({
      messages,
      abortSignal,
    }: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult, void, unknown> {
      const liveMessages = getThreadMessages?.();
      const sourceMessages =
        liveMessages && liveMessages.length > messages.length ? liveMessages : messages;

      const formattedMessages = toAgentMessages(sourceMessages);

      const sessionId = getSessionId?.();
      const agentId = getAgentId?.();
      const location = getLocation?.();

      // The full outbound conversation used to be pretty-printed here on every
      // turn: message content and GCS attachment URIs into the console of a
      // possibly shared or screen-shared machine, plus a JSON.stringify of a
      // growing history on the main thread. Behind a flag, off by default.
      debugStream("run.start", { sessionId, agentId, location });
      debugStream("run.messages", formattedMessages);

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (agentId) headers["x-reasoning-engine-id"] = agentId;
        if (location) headers["x-location"] = location;

        const response = await fetch("/api/chat", {
          method: "POST",
          headers,
          body: JSON.stringify({
            messages: formattedMessages,
            sessionId,
            reasoningEngineId: agentId,
            location,
            streamingMode: "sse",
            runConfig: {
              streaming_mode: "sse",
            },
          }),
          signal: abortSignal,
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(
            `[createGeminiChatAdapter] API chat returned ${response.status}: ${errText}`
          );
          throw new Error(`Chat API error (${response.status}): ${errText}`);
        }

        if (!response.body) {
          throw new Error("Chat API returned empty response body");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        let accumulatedReasoning = "";

        interface SubagentStreamItem {
          agentName: string;
          displayName: string;
          input?: string;
          response: string;
          status: "running" | "complete";
        }

        // Tool entries hold structured fields rather than a rendered markdown
        // string. The block used to be built once and then edited in place by a
        // RegExp assembled from the model-supplied tool name, which meant a
        // result containing `\n:::` or `status="complete"` could terminate or
        // corrupt its own block. Rendering from data once per yield removes the
        // parse-back entirely, matching how subagent entries already work.
        type ReasoningEntry =
          | { type: "thought"; text: string }
          | { type: "subagent"; agentName: string }
          | {
              type: "tool";
              toolName: string;
              argsJson?: string;
              resultJson?: string;
              status: "running" | "requires-action" | "complete";
            };

        const subagentsMap = new Map<string, SubagentStreamItem>();
        const reasoningEntries: ReasoningEntry[] = [];
        let activeSubagentName: string | null = null;

        let accumulatedText = "";
        let currentTextSegment = "";
        let finalizedTextPrefix = "";

        let latestEventId: string | undefined;
        let latestInvocationId: string | undefined;
        let latestModelVersion: string | undefined;
        let latestUsageMetadata: AgentUsageMetadata | undefined;
        let latestAvgLogprobs: number | undefined;
        let latestNodeInfo: AgentNodeInfo | undefined;
        let latestNodePath: string | undefined;
        let latestThoughtSignature: string | undefined;
        let latestActions: AgentActionsDelta | undefined;
        let latestFinishReason: string | undefined;
        let latestTimestamp: number | string | undefined;
        const toolCallsMap = new Map<string, ToolCallYieldItem>();
        const retrievedMemoriesList: MemoryRetrievalItem[] = [];
        let latestGroundingMetadata: GroundingMetadata | undefined;

        const getMessageInfo = (): AgentMessageInfoMetadata | undefined => {
          if (
            !latestInvocationId &&
            !latestModelVersion &&
            !latestUsageMetadata &&
            latestAvgLogprobs === undefined &&
            !latestNodeInfo &&
            !latestNodePath &&
            !latestThoughtSignature &&
            !latestActions &&
            !latestFinishReason &&
            latestTimestamp === undefined
          ) {
            return undefined;
          }
          return {
            ...(latestInvocationId ? { invocationId: latestInvocationId } : {}),
            ...(latestModelVersion ? { modelVersion: latestModelVersion } : {}),
            ...(latestUsageMetadata ? { usageMetadata: latestUsageMetadata } : {}),
            ...(latestAvgLogprobs !== undefined
              ? { avgLogprobs: latestAvgLogprobs }
              : {}),
            ...(latestNodeInfo ? { nodeInfo: latestNodeInfo } : {}),
            ...(latestNodePath ? { nodePath: latestNodePath } : {}),
            ...(latestThoughtSignature
              ? { thoughtSignature: latestThoughtSignature }
              : {}),
            ...(latestActions ? { actions: latestActions } : {}),
            ...(latestFinishReason ? { finishReason: latestFinishReason } : {}),
            ...(latestTimestamp !== undefined ? { timestamp: latestTimestamp } : {}),
          };
        };

        const formatSubagentMarkdown = (sub: SubagentStreamItem) => {
          let body = "";
          if (sub.input) {
            body += `**Input:**\n\`\`\`json\n${sub.input}\n\`\`\`\n`;
          }
          if (sub.response) {
            if (sub.input) {
              body += `**Response:**\n${sub.response}`;
            } else {
              body += sub.response;
            }
          }
          return `:::subagent[${sanitizeDirectiveName(sub.displayName)}]{status="${sub.status}" agent="${sanitizeDirectiveName(sub.agentName)}"}\n${body.trim()}\n:::`;
        };

        const formatToolMarkdown = (entry: {
          toolName: string;
          argsJson?: string;
          resultJson?: string;
          status: "running" | "requires-action" | "complete";
        }) => {
          let body = "";
          if (entry.argsJson) {
            body += `**Arguments:**\n\`\`\`json\n${entry.argsJson}\n\`\`\`\n`;
          }
          if (entry.resultJson !== undefined) {
            body += `**Result:**\n\`\`\`json\n${entry.resultJson}\n\`\`\`\n`;
          }
          return `:::tool[${sanitizeDirectiveName(entry.toolName)}]{status="${entry.status}"}\n${body.trim()}\n:::`;
        };

        const buildReasoningMarkdown = () => {
          const parts: string[] = [];
          for (const entry of reasoningEntries) {
            if (entry.type === "thought") {
              const trimmed = entry.text.trim();
              if (trimmed) parts.push(trimmed);
            } else if (entry.type === "subagent") {
              const sub = subagentsMap.get(entry.agentName);
              if (sub) {
                parts.push(formatSubagentMarkdown(sub));
              }
            } else if (entry.type === "tool") {
              parts.push(formatToolMarkdown(entry));
            }
          }
          return parts.join("\n\n");
        };

        const finalizeAllSubagents = () => {
          for (const sub of subagentsMap.values()) {
            sub.status = "complete";
          }
          activeSubagentName = null;
        };

        const flushCurrentTextSegment = () => {
          if (currentTextSegment) {
            finalizedTextPrefix = finalizedTextPrefix + currentTextSegment;
            currentTextSegment = "";
            accumulatedText = finalizedTextPrefix;
          }
        };

        let lastStreamYieldTime = 0;
        const STREAM_YIELD_THROTTLE_MS = 25;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith(":")) continue;

              const dataPrefix = "data: ";
              if (!trimmed.startsWith(dataPrefix)) continue;

              const jsonStr = trimmed.substring(dataPrefix.length).trim();
              if (jsonStr === "[DONE]") {
                debugStream("sse.done");
                finalizeAllSubagents();
                flushCurrentTextSegment();
                for (const tc of toolCallsMap.values()) {
                  if (tc.status?.type === "running") {
                    tc.status = { type: "complete" };
                  }
                }
                for (const entry of reasoningEntries) {
                  // A field flip, where this used to be a string replaceAll over
                  // rendered markdown that would also have rewritten the literal
                  // text status="running" appearing inside a tool result.
                  if (entry.type === "tool" && entry.status === "running") {
                    entry.status = "complete";
                  }
                }
                accumulatedReasoning = buildReasoningMarkdown();
                accumulatedText = finalizedTextPrefix;

                yield createYieldContent(
                  accumulatedReasoning,
                  accumulatedText,
                  Array.from(toolCallsMap.values()),
                  latestEventId,
                  retrievedMemoriesList,
                  latestGroundingMetadata,
                  getMessageInfo()
                );
                return;
              }

              try {
                const parsed = JSON.parse(jsonStr);
                // Once per SSE event: hundreds of lines for a long generation.
                debugStream("sse.event", parsed.event_type);

                latestEventId =
                  parsed.eventId ||
                  parsed.event_id ||
                  parsed.id ||
                  parsed.invocation_id ||
                  latestEventId;
                latestInvocationId =
                  parsed.invocationId || parsed.invocation_id || latestInvocationId;
                latestModelVersion =
                  parsed.modelVersion || parsed.model_version || latestModelVersion;
                latestUsageMetadata =
                  parsed.usageMetadata || parsed.usage_metadata || latestUsageMetadata;
                latestAvgLogprobs =
                  parsed.avgLogprobs ?? parsed.avg_logprobs ?? latestAvgLogprobs;
                latestNodeInfo = parsed.nodeInfo || parsed.node_info || latestNodeInfo;
                latestNodePath = parsed.nodePath || parsed.node_path || latestNodePath;
                latestThoughtSignature =
                  parsed.thoughtSignature ||
                  parsed.thought_signature ||
                  latestThoughtSignature;
                latestActions =
                  parsed.actions ||
                  (parsed.state_delta || parsed.stateDelta
                    ? { state_delta: parsed.state_delta || parsed.stateDelta }
                    : latestActions);
                latestFinishReason =
                  parsed.finishReason || parsed.finish_reason || latestFinishReason;
                if (parsed.timestamp !== undefined) {
                  latestTimestamp = parsed.timestamp;
                }

                if (parsed.retrieved_memories || parsed.retrievedMemories) {
                  const memories = (parsed.retrieved_memories ||
                    parsed.retrievedMemories) as MemoryRetrievalItem[];
                  if (Array.isArray(memories)) {
                    for (const item of memories) {
                      if (
                        item &&
                        !retrievedMemoriesList.some(
                          (m) => m.id === item.id || m.fact === item.fact
                        )
                      ) {
                        retrievedMemoriesList.push(item);
                      }
                    }
                  }
                }

                const extractedMeta = extractGroundingMetadata(parsed);
                if (extractedMeta) {
                  latestGroundingMetadata = mergeGroundingMetadata([
                    latestGroundingMetadata,
                    extractedMeta,
                  ]);
                }

                const now = Date.now();
                const isHighFrequencyPartial = parsed.partial === true;
                const shouldYield =
                  !isHighFrequencyPartial ||
                  now - lastStreamYieldTime >= STREAM_YIELD_THROTTLE_MS;

                if (parsed.event_type === "content" && parsed.content) {
                  finalizeAllSubagents();
                  if (parsed.partial === true) {
                    currentTextSegment += parsed.content;
                    accumulatedText = finalizedTextPrefix + currentTextSegment;
                  } else if (parsed.partial === false) {
                    currentTextSegment = parsed.content;
                    finalizedTextPrefix = finalizedTextPrefix + currentTextSegment;
                    currentTextSegment = "";
                    accumulatedText = finalizedTextPrefix;
                  } else {
                    finalizedTextPrefix += parsed.content;
                    accumulatedText = finalizedTextPrefix;
                  }

                  accumulatedReasoning = buildReasoningMarkdown();
                  if (shouldYield) {
                    lastStreamYieldTime = now;
                    yield createYieldContent(
                      accumulatedReasoning,
                      accumulatedText,
                      Array.from(toolCallsMap.values()),
                      latestEventId,
                      retrievedMemoriesList,
                      latestGroundingMetadata,
                      getMessageInfo()
                    );
                  }
                } else if (parsed.event_type === "thought" && parsed.thought) {
                  const last = reasoningEntries[reasoningEntries.length - 1];
                  if (last && last.type === "thought") {
                    if (parsed.partial === true) {
                      last.text += parsed.thought;
                    } else if (parsed.partial === false) {
                      last.text = parsed.thought;
                    } else {
                      last.text = last.text
                        ? `${last.text}\n\n${parsed.thought}`
                        : parsed.thought;
                    }
                  } else {
                    reasoningEntries.push({
                      type: "thought",
                      text: parsed.thought,
                    });
                  }

                  accumulatedReasoning = buildReasoningMarkdown();
                  if (shouldYield) {
                    lastStreamYieldTime = now;
                    yield createYieldContent(
                      accumulatedReasoning,
                      accumulatedText,
                      Array.from(toolCallsMap.values()),
                      latestEventId,
                      retrievedMemoriesList,
                      latestGroundingMetadata,
                      getMessageInfo()
                    );
                  }
                } else if (parsed.event_type === "agent_call" && parsed.agent_call) {
                  const subagent = parsed.agent_call;
                  const agentName = subagent.agent || "subagent";
                  const displayName =
                    subagent.displayName || formatAgentDisplayName(agentName);
                  const inputStr = JSON.stringify(subagent.input || {}, null, 2);

                  if (activeSubagentName && activeSubagentName !== agentName) {
                    const prev = subagentsMap.get(activeSubagentName);
                    if (prev) prev.status = "complete";
                  }
                  activeSubagentName = agentName;

                  const existing = subagentsMap.get(agentName);
                  if (existing) {
                    existing.status = "running";
                    if (inputStr && !existing.input) {
                      existing.input = inputStr;
                    }
                  } else {
                    subagentsMap.set(agentName, {
                      agentName,
                      displayName,
                      input: inputStr,
                      response: "",
                      status: "running",
                    });
                    reasoningEntries.push({
                      type: "subagent",
                      agentName,
                    });
                  }

                  accumulatedReasoning = buildReasoningMarkdown();
                  yield createYieldContent(
                    accumulatedReasoning,
                    accumulatedText,
                    Array.from(toolCallsMap.values()),
                    latestEventId,
                    retrievedMemoriesList,
                    latestGroundingMetadata,
                    getMessageInfo()
                  );
                } else if (
                  parsed.event_type === "agent_response" &&
                  parsed.agent_response
                ) {
                  const subagent = parsed.agent_response;
                  const agentName = subagent.agent || "subagent";
                  const displayName =
                    subagent.displayName || formatAgentDisplayName(agentName);
                  const responseChunk =
                    typeof subagent.response === "string"
                      ? subagent.response
                      : JSON.stringify(subagent.response || {}, null, 2);

                  if (activeSubagentName && activeSubagentName !== agentName) {
                    const prev = subagentsMap.get(activeSubagentName);
                    if (prev) prev.status = "complete";
                  }
                  activeSubagentName = agentName;

                  const existing = subagentsMap.get(agentName);
                  if (existing) {
                    existing.response += responseChunk;
                  } else {
                    subagentsMap.set(agentName, {
                      agentName,
                      displayName,
                      response: responseChunk,
                      status: "running",
                    });
                    reasoningEntries.push({
                      type: "subagent",
                      agentName,
                    });
                  }

                  accumulatedReasoning = buildReasoningMarkdown();
                  yield createYieldContent(
                    accumulatedReasoning,
                    accumulatedText,
                    Array.from(toolCallsMap.values()),
                    latestEventId,
                    retrievedMemoriesList,
                    latestGroundingMetadata,
                    getMessageInfo()
                  );
                } else if (parsed.event_type === "tool_call" && parsed.tool_call) {
                  if (activeSubagentName) {
                    const prev = subagentsMap.get(activeSubagentName);
                    if (prev) prev.status = "complete";
                    activeSubagentName = null;
                  }
                  const tc = parsed.tool_call;
                  const toolName = tc.name || "tool";
                  const isReqAction =
                    tc.status === "requires-action" ||
                    tc.requires_action ||
                    tc.requires_confirmation ||
                    toolName === "adk_request_confirmation";

                  // Identity is the id when the backend supplies one. An id that
                  // is present but unknown means a genuinely new call, so it must
                  // NOT be folded into a same-named one in flight — that merged
                  // two parallel calls to the same tool into a single entry and
                  // destroyed one of them.
                  //
                  // The name-based merge survives only for id-less backends,
                  // where a re-emitted call and a second parallel call are
                  // indistinguishable and merging is the safer reading.
                  let existingCallId: string | undefined;
                  if (tc.id) {
                    if (toolCallsMap.has(tc.id)) {
                      existingCallId = tc.id;
                    }
                  } else {
                    for (const [id, item] of toolCallsMap.entries()) {
                      if (
                        item.toolName === toolName &&
                        item.status?.type !== "complete" &&
                        !item.hasBackendId
                      ) {
                        existingCallId = id;
                        break;
                      }
                    }
                  }

                  const toolCallId =
                    existingCallId ||
                    tc.id ||
                    `call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                  const isNewCall = !existingCallId;

                  toolCallsMap.set(toolCallId, {
                    toolCallId,
                    toolName,
                    args: tc.args || {},
                    hasBackendId: Boolean(tc.id),
                    status: {
                      type: isReqAction ? "requires-action" : "running",
                      ...(isReqAction ? { reason: "tool-calls" } : {}),
                    },
                  });

                  if (isNewCall) {
                    reasoningEntries.push({
                      type: "tool",
                      toolName,
                      argsJson: JSON.stringify(tc.args || {}, null, 2),
                      status: isReqAction ? "requires-action" : "running",
                    });
                  }
                  accumulatedReasoning = buildReasoningMarkdown();

                  yield createYieldContent(
                    accumulatedReasoning,
                    accumulatedText,
                    Array.from(toolCallsMap.values()),
                    latestEventId,
                    retrievedMemoriesList,
                    latestGroundingMetadata,
                    getMessageInfo()
                  );
                } else if (parsed.event_type === "tool_result" && parsed.tool_result) {
                  if (activeSubagentName) {
                    const prev = subagentsMap.get(activeSubagentName);
                    if (prev) prev.status = "complete";
                    activeSubagentName = null;
                  }
                  const toolName = parsed.tool_result.name || "tool";
                  const result = parsed.tool_result.result;
                  const resStr = JSON.stringify(result ?? {}, null, 2);

                  // Pair on id whenever the result carries one. Falling back to
                  // first-match-by-name for a result whose id is simply unknown
                  // attached it to an unrelated invocation of the same tool.
                  let matched = false;
                  if (parsed.tool_result.id) {
                    const tc = toolCallsMap.get(parsed.tool_result.id);
                    if (tc) {
                      tc.result = result;
                      tc.status = { type: "complete" };
                      matched = true;
                    }
                  } else {
                    // Id-less result: pair by name, but only against calls that
                    // are themselves id-less. A call with a real id can only be
                    // resolved by that id.
                    for (const tc of toolCallsMap.values()) {
                      if (
                        tc.toolName === toolName &&
                        tc.status?.type !== "complete" &&
                        !tc.hasBackendId
                      ) {
                        tc.result = result;
                        tc.status = { type: "complete" };
                        matched = true;
                        break;
                      }
                    }
                    if (!matched) {
                      console.warn(
                        `[createGeminiChatAdapter] Unpaired id-less tool_result for "${toolName}" — ` +
                          `no id-less call in flight to attach it to.`
                      );
                    }
                  }
                  if (!matched) {
                    const rawId = parsed.tool_result.id;
                    const existsInPriorMessages =
                      rawId &&
                      sourceMessages.some((msg) =>
                        msg.content?.some(
                          (p) =>
                            p.type === "tool-call" &&
                            "toolCallId" in p &&
                            p.toolCallId === rawId
                        )
                      );

                    if (!existsInPriorMessages) {
                      const toolCallId =
                        rawId ||
                        `result_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                      toolCallsMap.set(toolCallId, {
                        toolCallId,
                        toolName,
                        args: {},
                        result,
                        status: { type: "complete" },
                      });
                    }
                  }

                  const existingToolEntry = [...reasoningEntries]
                    .reverse()
                    .find((e) => e.type === "tool" && e.toolName === toolName);

                  if (existingToolEntry && existingToolEntry.type === "tool") {
                    // Set fields rather than rewriting rendered markdown.
                    existingToolEntry.resultJson = resStr;
                    existingToolEntry.status = "complete";
                  } else {
                    reasoningEntries.push({
                      type: "tool",
                      toolName,
                      resultJson: resStr,
                      status: "complete",
                    });
                  }
                  accumulatedReasoning = buildReasoningMarkdown();

                  yield createYieldContent(
                    accumulatedReasoning,
                    accumulatedText,
                    Array.from(toolCallsMap.values()),
                    latestEventId,
                    retrievedMemoriesList,
                    latestGroundingMetadata,
                    getMessageInfo()
                  );
                } else if (parsed.event_type === "error" && parsed.error) {
                  finalizeAllSubagents();
                  flushCurrentTextSegment();
                  accumulatedText +=
                    (accumulatedText ? "\n\n" : "") +
                    `⚠️ **Agent Runtime Error:** ${parsed.error}`;
                  yield createYieldContent(
                    accumulatedReasoning,
                    accumulatedText,
                    Array.from(toolCallsMap.values()),
                    latestEventId,
                    retrievedMemoriesList,
                    latestGroundingMetadata,
                    getMessageInfo()
                  );
                  return;
                } else if (parsed.event_type === "done") {
                  finalizeAllSubagents();
                  flushCurrentTextSegment();
                  for (const tc of toolCallsMap.values()) {
                    if (tc.status?.type === "running") {
                      tc.status = { type: "complete" };
                    }
                  }
                  for (const entry of reasoningEntries) {
                    if (entry.type === "tool" && entry.status === "running") {
                      entry.status = "complete";
                    }
                  }
                  accumulatedReasoning = buildReasoningMarkdown();
                  accumulatedText = finalizedTextPrefix;

                  yield createYieldContent(
                    accumulatedReasoning,
                    accumulatedText,
                    Array.from(toolCallsMap.values()),
                    latestEventId,
                    retrievedMemoriesList,
                    latestGroundingMetadata,
                    getMessageInfo()
                  );
                  return;
                } else if (extractedMeta) {
                  // Metadata-only event: nothing else to handle, so force a yield
                  // so the citations surface immediately.
                  //
                  // This must stay BELOW the terminal cases. It is keyed on the
                  // metadata rather than on event_type, so while it sat above
                  // `error` and `done` it captured any terminal event that also
                  // carried groundingMetadata — which is exactly what a grounded
                  // final event carries. That skipped the `done` branch's tool
                  // and subagent finalisation, leaving spinners running forever,
                  // and swallowed backend errors entirely.
                  yield createYieldContent(
                    accumulatedReasoning,
                    accumulatedText,
                    Array.from(toolCallsMap.values()),
                    latestEventId,
                    retrievedMemoriesList,
                    latestGroundingMetadata,
                    getMessageInfo()
                  );
                }
              } catch (e: unknown) {
                console.warn(
                  "[createGeminiChatAdapter] Malformed or non-JSON SSE payload ignored:",
                  jsonStr,
                  e
                );
              }
            }
          }

          flushCurrentTextSegment();
          accumulatedReasoning = buildReasoningMarkdown();
          accumulatedText = finalizedTextPrefix;
          yield createYieldContent(
            accumulatedReasoning,
            accumulatedText,
            Array.from(toolCallsMap.values()),
            latestEventId,
            retrievedMemoriesList,
            latestGroundingMetadata,
            getMessageInfo()
          );
        } finally {
          if (typeof reader?.releaseLock === "function") {
            try {
              reader.releaseLock();
            } catch {
              // Ignore
            }
          }
        }
      } catch (err: unknown) {
        if ((err instanceof Error && err.name === "AbortError") || abortSignal?.aborted) {
          debugStream("run.aborted");
          return;
        }
        console.error("[createGeminiChatAdapter] Run error:", err);
        throw err;
      }
    },
  };
}

export const geminiChatAdapter = createGeminiChatAdapter();
