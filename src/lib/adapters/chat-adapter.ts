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
import { defaultAttachmentStore } from "../attachments/attachment-store";
import { inferMimeType } from "../attachments/mime-types";

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function appendToolResultToReasoning(
  reasoning: string,
  toolName: string,
  resStr: string
): string {
  const toolBlockRegex = new RegExp(
    `:::tool\\[${escapeRegex(toolName)}\\](\\{[^}]*status="(?:running|requires-action)"[^}]*\\})\\s*\\r?\\n([\\s\\S]*?)(?:\\r?\\n:::|$)`,
    "g"
  );

  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = toolBlockRegex.exec(reasoning)) !== null) {
    lastMatch = match;
  }

  if (lastMatch) {
    const matchIndex = lastMatch.index;
    const fullMatch = lastMatch[0];
    const attrGroup = lastMatch[1];
    const bodyGroup = lastMatch[2];

    const updatedAttr = attrGroup.replace(
      /status="(?:running|requires-action)"/,
      'status="complete"'
    );

    let updatedBody = bodyGroup.trimEnd();
    if (updatedBody.includes("**Result:**")) {
      updatedBody = updatedBody.replace(
        /\*\*Result:\*\*\s*\r?\n```(?:json)?\s*\r?\n[\s\S]*?\r?\n```/i,
        `**Result:**\n\`\`\`json\n${resStr}\n\`\`\``
      );
    } else {
      updatedBody = `${updatedBody}\n**Result:**\n\`\`\`json\n${resStr}\n\`\`\``;
    }

    const replacement = `:::tool[${toolName}]${updatedAttr}\n${updatedBody}\n:::`;
    return (
      reasoning.substring(0, matchIndex) +
      replacement +
      reasoning.substring(matchIndex + fullMatch.length)
    );
  }

  // If no running block was found, check if a complete block already exists with results
  const completeRegex = new RegExp(
    `:::tool\\[${escapeRegex(toolName)}\\]\\{status="complete"\\}`,
    "i"
  );
  if (completeRegex.test(reasoning)) {
    return reasoning;
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
  displayName?: string,
  status: "running" | "complete" = "complete"
): string {
  const name = displayName || formatAgentDisplayName(agentName);
  const subagentRegex = new RegExp(
    `:::subagent\\[${escapeRegex(name)}\\](\\{[^}]*agent="${escapeRegex(agentName)}"[^}]*\\})\\s*\\r?\\n([\\s\\S]*?)(?:\\r?\\n:::|$)`,
    "g"
  );

  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = subagentRegex.exec(reasoning)) !== null) {
    lastMatch = match;
  }

  if (lastMatch) {
    const matchIndex = lastMatch.index;
    const fullMatch = lastMatch[0];
    const attrGroup = lastMatch[1];
    const bodyGroup = lastMatch[2];

    const updatedAttr = attrGroup.replace(/status="[^"]*"/, `status="${status}"`);

    let updatedBody = bodyGroup.replace(/\r?\n$/, "");
    if (updatedBody.includes("**Response:**")) {
      const respRegex = /(\*\*Response:\*\*\s*\r?\n)([\s\S]*)/i;
      const respMatch = updatedBody.match(respRegex);
      if (respMatch) {
        const prefix = updatedBody.substring(0, respMatch.index! + respMatch[1].length);
        const currentResp = respMatch[2];
        const newResp = currentResp ? `${currentResp}${responseStr}` : responseStr;
        updatedBody = `${prefix}${newResp}`;
      } else {
        updatedBody = `${updatedBody}\n${responseStr}`;
      }
    } else if (
      updatedBody.includes("**Task Input:**") ||
      updatedBody.includes("**Input:**")
    ) {
      updatedBody = `${updatedBody.trimEnd()}\n**Response:**\n${responseStr}`;
    } else {
      updatedBody = updatedBody ? `${updatedBody}${responseStr}` : responseStr;
    }

    const replacement = `:::subagent[${name}]${updatedAttr}\n${updatedBody}\n:::`;
    return (
      reasoning.substring(0, matchIndex) +
      replacement +
      reasoning.substring(matchIndex + fullMatch.length)
    );
  }

  return (
    reasoning +
    `\n\n:::subagent[${name}]{status="${status}" agent="${agentName}"}\n${responseStr.trim()}\n:::`
  );
}

export interface ToolCallYieldItem {
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
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
            let resolvedUri = "";
            let resolvedMimeType = inferMimeType(imgPart.filename, "image/jpeg");

            if (imgUrl.startsWith("gs://")) {
              resolvedUri = imgUrl;
            } else {
              // 1. Look in message attachments
              const attMatch = m.attachments?.find(
                (a) =>
                  a.type === "image" || (imgPart.filename && a.name === imgPart.filename)
              );
              if (attMatch) {
                const meta = defaultAttachmentStore.get(attMatch.id);
                if (meta?.gcsUri) {
                  resolvedUri = meta.gcsUri;
                  if (meta.contentType)
                    resolvedMimeType = inferMimeType(imgPart.filename, meta.contentType);
                }
              }

              // 2. Look in attachment store by URL or filename
              if (!resolvedUri) {
                const meta =
                  defaultAttachmentStore.getByUrl?.(imgUrl) ||
                  (imgPart.filename
                    ? defaultAttachmentStore.getByFilename?.(imgPart.filename)
                    : undefined) ||
                  defaultAttachmentStore.findByAny?.(imgUrl);
                if (meta?.gcsUri) {
                  resolvedUri = meta.gcsUri;
                  if (meta.contentType)
                    resolvedMimeType = inferMimeType(imgPart.filename, meta.contentType);
                }
              }

              // 3. Extract gcsUri query param if present
              if (!resolvedUri && imgUrl.startsWith("http")) {
                try {
                  const urlObj = new URL(imgUrl);
                  const gcsQuery = urlObj.searchParams.get("gcsUri");
                  if (gcsQuery && gcsQuery.startsWith("gs://")) {
                    resolvedUri = gcsQuery;
                  }
                } catch {
                  // ignore invalid URLs
                }
              }

              // 4. Parse Google Cloud Storage signed / public URL
              if (!resolvedUri) {
                const gcsMatch = imgUrl.match(
                  /^https:\/\/storage\.googleapis\.com\/([^/?#]+)\/([^?#]+)/
                );
                if (gcsMatch) {
                  resolvedUri = `gs://${gcsMatch[1]}/${gcsMatch[2]}`;
                }
              }
            }

            resolvedMimeType = inferMimeType(imgPart.filename, resolvedMimeType);

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
            let gcsUri = filePart.data || "";
            let mimeType = inferMimeType(filePart.filename, filePart.mimeType);

            if (!gcsUri.startsWith("gs://")) {
              // 1. Look in message attachments
              const attMatch = m.attachments?.find(
                (a) =>
                  a.type === "document" ||
                  (filePart.filename && a.name === filePart.filename)
              );
              if (attMatch) {
                const meta = defaultAttachmentStore.get(attMatch.id);
                if (meta?.gcsUri) {
                  gcsUri = meta.gcsUri;
                  if (meta.contentType)
                    mimeType = inferMimeType(filePart.filename, meta.contentType);
                }
              }

              // 2. Look in attachment store by URL or filename
              if (!gcsUri.startsWith("gs://")) {
                const meta =
                  defaultAttachmentStore.getByUrl?.(gcsUri) ||
                  (filePart.filename
                    ? defaultAttachmentStore.getByFilename?.(filePart.filename)
                    : undefined) ||
                  defaultAttachmentStore.findByAny?.(gcsUri);
                if (meta?.gcsUri) {
                  gcsUri = meta.gcsUri;
                  if (meta.contentType)
                    mimeType = inferMimeType(filePart.filename, meta.contentType);
                }
              }

              // 3. Parse Google Cloud Storage signed URL
              if (!gcsUri.startsWith("gs://")) {
                const gcsMatch = gcsUri.match(
                  /^https:\/\/storage\.googleapis\.com\/([^/?#]+)\/([^?#]+)/
                );
                if (gcsMatch) {
                  gcsUri = `gs://${gcsMatch[1]}/${gcsMatch[2]}`;
                }
              }
            }

            mimeType = inferMimeType(filePart.filename, mimeType);

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

            // 1. Check content parts inside attachment
            if (att.content && Array.isArray(att.content)) {
              for (const cp of att.content) {
                if (cp.type === "image") {
                  const imgPart = cp as { image?: string; filename?: string };
                  const imgUrl = imgPart.image || "";
                  if (imgUrl.startsWith("gs://")) {
                    attGcsUri = imgUrl;
                  } else {
                    const meta =
                      defaultAttachmentStore.get(att.id) ||
                      defaultAttachmentStore.getByUrl?.(imgUrl) ||
                      defaultAttachmentStore.findByAny?.(att.id);
                    if (meta?.gcsUri) {
                      attGcsUri = meta.gcsUri;
                      if (meta.contentType)
                        attMimeType = inferMimeType(att.name, meta.contentType);
                    }
                  }
                } else if (cp.type === "file") {
                  const filePart = cp as { data?: string; mimeType?: string };
                  if (filePart.data?.startsWith("gs://")) {
                    attGcsUri = filePart.data;
                  }
                  if (filePart.mimeType)
                    attMimeType = inferMimeType(att.name, filePart.mimeType);
                }
              }
            }

            // 2. Direct lookup in attachment store
            if (!attGcsUri) {
              const meta =
                defaultAttachmentStore.get(att.id) ||
                defaultAttachmentStore.findByAny?.(att.id) ||
                defaultAttachmentStore.getByFilename?.(att.name);
              if (meta?.gcsUri) {
                attGcsUri = meta.gcsUri;
                if (meta.contentType)
                  attMimeType = inferMimeType(att.name, meta.contentType);
              }
            }

            attMimeType = inferMimeType(att.name, attMimeType);

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

      const sessionId = getSessionId?.();
      const agentId = getAgentId?.();
      const location = getLocation?.();

      console.log(
        `[createGeminiChatAdapter] Starting run for sessionId: ${sessionId} agentId: ${agentId} location: ${location}`
      );
      console.log(
        "[createGeminiChatAdapter] Sending formattedMessages:",
        JSON.stringify(formattedMessages, null, 2)
      );

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

        type ReasoningEntry =
          | { type: "thought"; text: string }
          | { type: "subagent"; agentName: string }
          | { type: "tool"; toolName: string; block: string };

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
          return `:::subagent[${sub.displayName}]{status="${sub.status}" agent="${sub.agentName}"}\n${body.trim()}\n:::`;
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
              if (entry.block.trim()) {
                parts.push(entry.block.trim());
              }
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
                console.log("[createGeminiChatAdapter] Received [DONE]");
                finalizeAllSubagents();
                flushCurrentTextSegment();
                for (const tc of toolCallsMap.values()) {
                  if (tc.status?.type === "running") {
                    tc.status = { type: "complete" };
                  }
                }
                for (const entry of reasoningEntries) {
                  if (entry.type === "tool") {
                    entry.block = entry.block.replaceAll(
                      'status="running"',
                      'status="complete"'
                    );
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
                console.log(
                  "[createGeminiChatAdapter] Parsed SSE event:",
                  parsed.event_type
                );

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

                  let existingCallId: string | undefined;
                  if (tc.id && toolCallsMap.has(tc.id)) {
                    existingCallId = tc.id;
                  } else {
                    for (const [id, item] of toolCallsMap.entries()) {
                      if (
                        item.toolName === toolName &&
                        item.status?.type !== "complete"
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
                    status: {
                      type: isReqAction ? "requires-action" : "running",
                      ...(isReqAction ? { reason: "tool-calls" } : {}),
                    },
                  });

                  if (isNewCall) {
                    const argsStr = JSON.stringify(tc.args || {}, null, 2);
                    const statusTag = isReqAction ? "requires-action" : "running";
                    const toolBlock = `:::tool[${toolName}]{status="${statusTag}"}\n**Arguments:**\n\`\`\`json\n${argsStr}\n\`\`\`\n:::`;
                    reasoningEntries.push({
                      type: "tool",
                      toolName,
                      block: toolBlock,
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

                  let matched = false;
                  if (parsed.tool_result.id && toolCallsMap.has(parsed.tool_result.id)) {
                    const tc = toolCallsMap.get(parsed.tool_result.id)!;
                    tc.result = result;
                    tc.status = { type: "complete" };
                    matched = true;
                  } else {
                    for (const tc of toolCallsMap.values()) {
                      if (tc.toolName === toolName && tc.status?.type !== "complete") {
                        tc.result = result;
                        tc.status = { type: "complete" };
                        matched = true;
                        break;
                      }
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
                    existingToolEntry.block = appendToolResultToReasoning(
                      existingToolEntry.block,
                      toolName,
                      resStr
                    );
                  } else {
                    reasoningEntries.push({
                      type: "tool",
                      toolName,
                      block: `:::tool[${toolName}]{status="complete"}\n**Result:**\n\`\`\`json\n${resStr}\n\`\`\`\n:::`,
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
                } else if (extractedMeta) {
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
                    if (entry.type === "tool") {
                      entry.block = entry.block.replaceAll(
                        'status="running"',
                        'status="complete"'
                      );
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
