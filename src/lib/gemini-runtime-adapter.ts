import {
  type ChatModelAdapter,
  type ChatModelRunOptions,
  type ChatModelRunResult,
  type FeedbackAdapter,
  type AttachmentAdapter,
  type PendingAttachment,
  type CompleteAttachment,
  type Attachment,
  type ThreadUserMessagePart,
  WebSpeechDictationAdapter,
  WebSpeechSynthesisAdapter,
} from "@assistant-ui/react";
import type { FeedbackType, AgentMessagePart, PresignBatchResponse } from "@/types/agent";
import { formatAgentDisplayName } from "@/lib/utils";

export interface AttachmentMetadata {
  gcsUri: string;
  readUrl: string;
  previewUrl: string;
  contentType: string;
}

export const attachmentMetadataMap = new Map<string, AttachmentMetadata>();

export function appendToolResultToReasoning(
  reasoning: string,
  toolName: string,
  resStr: string
): string {
  const runningHeader = `:::tool[${toolName}]{status="running"}`;
  const reqActionHeader = `:::tool[${toolName}]{status="requires-action"}`;

  let lastIdx = reasoning.lastIndexOf(runningHeader);
  let header = runningHeader;
  if (lastIdx === -1) {
    lastIdx = reasoning.lastIndexOf(reqActionHeader);
    header = reqActionHeader;
  }

  if (lastIdx !== -1) {
    const before = reasoning.substring(0, lastIdx);
    const after = reasoning.substring(lastIdx);
    const closeIdx = after.indexOf("\n:::", header.length);
    if (closeIdx !== -1) {
      const blockInside = after
        .substring(0, closeIdx)
        .replace(header, `:::tool[${toolName}]{status="complete"}`);
      const remainder = after.substring(closeIdx);
      return `${before}${blockInside}\n**Result:**\n\`\`\`json\n${resStr}\n\`\`\`${remainder}`;
    }
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
  displayName?: string
): string {
  const name = displayName || formatAgentDisplayName(agentName);
  const runningHeader = `:::subagent[${name}]{status="running" agent="${agentName}"}`;
  const lastIdx = reasoning.lastIndexOf(runningHeader);

  if (lastIdx !== -1) {
    const before = reasoning.substring(0, lastIdx);
    const after = reasoning.substring(lastIdx);
    const closeIdx = after.indexOf("\n:::", runningHeader.length);
    if (closeIdx !== -1) {
      const blockInside = after
        .substring(0, closeIdx)
        .replace(
          runningHeader,
          `:::subagent[${name}]{status="complete" agent="${agentName}"}`
        );
      const remainder = after.substring(closeIdx);
      return `${before}${blockInside}\n**Response:**\n${responseStr}${remainder}`;
    }
  }

  return (
    reasoning +
    `\n\n:::subagent[${name}]{status="complete" agent="${agentName}"}\n${responseStr}\n:::`
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

function createYieldContent(
  reasoning: string,
  text: string,
  toolCalls?: ToolCallYieldItem[]
): ChatModelRunResult {
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
  };
}

export function createGeminiChatAdapter(
  getSessionId?: () => string | undefined,
  getAgentId?: () => string | undefined,
  getLocation?: () => string | undefined
): ChatModelAdapter {
  return {
    async *run({
      messages,
      abortSignal,
    }: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult, void, unknown> {
      const formattedMessages = messages.map((m) => {
        let text = "";
        const parts: AgentMessagePart[] = [];

        for (const part of m.content) {
          if (part.type === "text") {
            text += part.text;
            parts.push({ text: part.text });
          } else if (part.type === "image") {
            const imgPart = part as { image?: string; filename?: string };
            const imgUrl = imgPart.image || "";
            const meta = imgUrl
              ? Array.from(attachmentMetadataMap.values()).find(
                  (val) => val.readUrl === imgUrl || val.previewUrl === imgUrl
                )
              : undefined;
            const gcsUri =
              meta?.gcsUri || (imgUrl.startsWith("gs://") ? imgUrl : undefined);
            const mimeType = meta?.contentType || "image/png";

            if (gcsUri) {
              parts.push({
                file_data: {
                  file_uri: gcsUri,
                  mime_type: mimeType,
                },
                image: imgUrl,
              });
            } else if (imgUrl) {
              parts.push({
                image: imgUrl,
              });
            }
          } else if (part.type === "file") {
            const filePart = part as {
              data?: string;
              mimeType?: string;
              filename?: string;
            };
            const fileUri = filePart.data || "";
            parts.push({
              file_data: {
                file_uri: fileUri,
                mime_type: filePart.mimeType || "application/octet-stream",
              },
              file: {
                filename: filePart.filename,
                data: fileUri,
                mimeType: filePart.mimeType || "application/octet-stream",
              },
            });
          } else if (part.type === "tool-call") {
            const tc = part as {
              toolCallId?: string;
              id?: string;
              toolName?: string;
              args?: Record<string, unknown>;
              result?: unknown;
            };
            if (tc.result !== undefined) {
              const responseObj =
                typeof tc.result === "object" && tc.result !== null
                  ? (tc.result as Record<string, unknown>)
                  : { result: tc.result };

              parts.push({
                function_response: {
                  id: tc.toolCallId || tc.id || "adk-call-id",
                  name: tc.toolName || "adk_request_confirmation",
                  response: responseObj,
                },
                functionResponse: {
                  id: tc.toolCallId || tc.id || "adk-call-id",
                  name: tc.toolName || "adk_request_confirmation",
                  response: responseObj,
                },
              });
            } else {
              parts.push({
                function_call: {
                  id: tc.toolCallId || tc.id,
                  name: tc.toolName || "tool",
                  args: tc.args || {},
                },
                functionCall: {
                  name: tc.toolName || "tool",
                  args: tc.args || {},
                },
              });
            }
          }
        }

        // Check if there are attachments attached to user message
        const msgWithAttachments = m as unknown as {
          attachments?: Array<{
            id: string;
            name: string;
            contentType?: string;
          }>;
        };
        if (
          msgWithAttachments.attachments &&
          Array.isArray(msgWithAttachments.attachments)
        ) {
          for (const att of msgWithAttachments.attachments) {
            const meta = attachmentMetadataMap.get(att.id);
            if (meta?.gcsUri) {
              const alreadyPresent = parts.some(
                (p) => p.file_data?.file_uri === meta.gcsUri
              );
              if (!alreadyPresent) {
                parts.push({
                  file_data: {
                    file_uri: meta.gcsUri,
                    mime_type:
                      meta.contentType || att.contentType || "application/octet-stream",
                  },
                });
              }
            }
          }
        }

        return {
          role: m.role as "user" | "assistant" | "system",
          content: text,
          ...(parts.length > 0 ? { parts } : {}),
        };
      });

      const sessionId = getSessionId?.();
      const reasoningEngineId = getAgentId?.();
      const location = getLocation?.();

      try {
        console.log(
          "[createGeminiChatAdapter] Starting run for sessionId:",
          sessionId,
          "agentId:",
          reasoningEngineId,
          "location:",
          location
        );
        abortSignal?.addEventListener("abort", () => {
          console.warn(
            "[createGeminiChatAdapter] AbortSignal triggered! Reason:",
            abortSignal.reason
          );
        });

        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: formattedMessages,
            ...(sessionId ? { sessionId } : {}),
            ...(reasoningEngineId ? { reasoningEngineId } : {}),
            ...(location ? { location } : {}),
          }),
          signal: abortSignal,
        });

        if (!response.ok) {
          const err = await response.text();
          console.error("[createGeminiChatAdapter] HTTP error:", response.status, err);
          throw new Error(`Chat request failed (${response.status}): ${err}`);
        }

        if (!response.body) {
          console.error("[createGeminiChatAdapter] Empty response body");
          throw new Error("No response body received");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = "";
        let accumulatedReasoning = "";
        let currentAuthor: string | undefined = undefined;
        let currentAuthorText = "";
        let buffer = "";
        const toolCallsMap = new Map<string, ToolCallYieldItem>();

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log(
              "[createGeminiChatAdapter] Reader done. Aborted:",
              abortSignal?.aborted,
              "Reason:",
              abortSignal?.reason
            );
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            const dataStr = trimmed.slice(6);
            if (dataStr === "[DONE]") {
              console.log("[createGeminiChatAdapter] Received [DONE]");
              return;
            }

            try {
              const parsed = JSON.parse(dataStr);
              console.log(
                "[createGeminiChatAdapter] Parsed SSE event:",
                parsed.event_type
              );

              if (parsed.event_type === "thought" && parsed.thought) {
                accumulatedReasoning +=
                  (accumulatedReasoning ? "\n" : "") + parsed.thought;
                yield createYieldContent(
                  accumulatedReasoning,
                  accumulatedText,
                  Array.from(toolCallsMap.values())
                );
              } else if (parsed.event_type === "content" && parsed.content) {
                const author = parsed.author as string | undefined;

                if (
                  author &&
                  currentAuthor &&
                  author !== currentAuthor &&
                  currentAuthorText.trim()
                ) {
                  const name = formatAgentDisplayName(currentAuthor);
                  accumulatedReasoning = appendAgentResponseToReasoning(
                    accumulatedReasoning,
                    currentAuthor,
                    currentAuthorText.trim(),
                    name
                  );
                  currentAuthor = author;
                  currentAuthorText = parsed.content;
                  accumulatedText = parsed.content;
                } else {
                  if (!currentAuthor && author) {
                    currentAuthor = author;
                  }
                  currentAuthorText += parsed.content;
                  accumulatedText += parsed.content;
                }
                yield createYieldContent(
                  accumulatedReasoning,
                  accumulatedText,
                  Array.from(toolCallsMap.values())
                );
              } else if (parsed.event_type === "agent_call" && parsed.agent_call) {
                if (currentAuthor && currentAuthorText.trim()) {
                  const name = formatAgentDisplayName(currentAuthor);
                  accumulatedReasoning = appendAgentResponseToReasoning(
                    accumulatedReasoning,
                    currentAuthor,
                    currentAuthorText.trim(),
                    name
                  );
                  currentAuthor = undefined;
                  currentAuthorText = "";
                  accumulatedText = "";
                }

                const name =
                  parsed.agent_call.displayName || parsed.agent_call.agent || "Sub-Agent";
                const inputStr = parsed.agent_call.input
                  ? `**Task Input:**\n\`\`\`json\n${typeof parsed.agent_call.input === "string" ? parsed.agent_call.input : JSON.stringify(parsed.agent_call.input, null, 2)}\n\`\`\``
                  : "";
                accumulatedReasoning += `\n\n:::subagent[${name}]{status="running" agent="${parsed.agent_call.agent}"}\n${inputStr}\n:::`;
                yield createYieldContent(
                  accumulatedReasoning,
                  accumulatedText,
                  Array.from(toolCallsMap.values())
                );
              } else if (
                parsed.event_type === "agent_response" &&
                parsed.agent_response
              ) {
                if (currentAuthor && currentAuthorText.trim()) {
                  const name = formatAgentDisplayName(currentAuthor);
                  accumulatedReasoning = appendAgentResponseToReasoning(
                    accumulatedReasoning,
                    currentAuthor,
                    currentAuthorText.trim(),
                    name
                  );
                  currentAuthor = undefined;
                  currentAuthorText = "";
                  accumulatedText = "";
                }

                const agent = parsed.agent_response.agent || "sub_agent";
                const name =
                  parsed.agent_response.displayName || formatAgentDisplayName(agent);
                accumulatedReasoning = appendAgentResponseToReasoning(
                  accumulatedReasoning,
                  agent,
                  parsed.agent_response.response,
                  name
                );
                yield createYieldContent(
                  accumulatedReasoning,
                  accumulatedText,
                  Array.from(toolCallsMap.values())
                );
              } else if (parsed.event_type === "tool_call" && parsed.tool_call) {
                if (currentAuthor && currentAuthorText.trim()) {
                  const name = formatAgentDisplayName(currentAuthor);
                  accumulatedReasoning = appendAgentResponseToReasoning(
                    accumulatedReasoning,
                    currentAuthor,
                    currentAuthorText.trim(),
                    name
                  );
                  currentAuthor = undefined;
                  currentAuthorText = "";
                  accumulatedText = "";
                }

                const toolName = parsed.tool_call.name || "agent_tool";
                const toolCallId =
                  parsed.tool_call.id ||
                  `call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                const args = parsed.tool_call.args || {};
                const isRequiresAction =
                  toolName === "adk_request_confirmation" ||
                  parsed.tool_call.status === "requires-action" ||
                  parsed.tool_call.requires_confirmation === true ||
                  parsed.tool_call.requires_action === true;

                const toolStatus = isRequiresAction
                  ? { type: "requires-action" as const, reason: "interrupt" as const }
                  : { type: "running" as const };

                toolCallsMap.set(toolCallId, {
                  toolCallId,
                  toolName,
                  args,
                  status: toolStatus,
                });

                const argsStr = JSON.stringify(args, null, 2);
                accumulatedReasoning += `\n\n:::tool[${toolName}]{status="${isRequiresAction ? "requires-action" : "running"}"}\n**Arguments:**\n\`\`\`json\n${argsStr}\n\`\`\`\n:::`;
                yield createYieldContent(
                  accumulatedReasoning,
                  accumulatedText,
                  Array.from(toolCallsMap.values())
                );
              } else if (parsed.event_type === "tool_result" && parsed.tool_result) {
                const toolName = parsed.tool_result.name || "agent_tool";
                const result = parsed.tool_result.result || {};
                const resStr = JSON.stringify(result, null, 2);

                let matched = false;
                for (const tc of toolCallsMap.values()) {
                  if (tc.toolName === toolName && tc.status?.type !== "complete") {
                    tc.result = result;
                    tc.status = { type: "complete" };
                    matched = true;
                    break;
                  }
                }
                if (!matched) {
                  const toolCallId =
                    parsed.tool_result.id ||
                    `result_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
                  toolCallsMap.set(toolCallId, {
                    toolCallId,
                    toolName,
                    args: {},
                    result,
                    status: { type: "complete" },
                  });
                }

                accumulatedReasoning = appendToolResultToReasoning(
                  accumulatedReasoning,
                  toolName,
                  resStr
                );
                yield createYieldContent(
                  accumulatedReasoning,
                  accumulatedText,
                  Array.from(toolCallsMap.values())
                );
              } else if (parsed.event_type === "error" && parsed.error) {
                accumulatedText +=
                  (accumulatedText ? "\n\n" : "") +
                  `⚠️ **Agent Runtime Error:** ${parsed.error}`;
                yield createYieldContent(
                  accumulatedReasoning,
                  accumulatedText,
                  Array.from(toolCallsMap.values())
                );
                return;
              } else if (parsed.event_type === "done") {
                // Finalize any running markers to complete
                for (const tc of toolCallsMap.values()) {
                  if (tc.status?.type === "running") {
                    tc.status = { type: "complete" };
                  }
                }
                accumulatedReasoning = accumulatedReasoning.replaceAll(
                  'status="running"',
                  'status="complete"'
                );
                yield createYieldContent(
                  accumulatedReasoning,
                  accumulatedText,
                  Array.from(toolCallsMap.values())
                );
                return;
              }
            } catch (e: unknown) {
              if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
                throw e;
              }
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

export function createGeminiFeedbackAdapter(
  getSessionId?: () => string | undefined
): FeedbackAdapter {
  return {
    submit: async ({ message, type }) => {
      const feedbackType: FeedbackType =
        type === "positive" ? "THUMBS_UP" : "THUMBS_DOWN";
      const sessionId = getSessionId?.() || "default";

      try {
        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            eventId: message.id,
            feedbackType,
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(
            `[createGeminiFeedbackAdapter] Feedback submission failed (${response.status}):`,
            errText
          );
        }
      } catch (err: unknown) {
        console.error(
          "[createGeminiFeedbackAdapter] Network error submitting feedback:",
          err
        );
      }
    },
  };
}

export const geminiFeedbackAdapter = createGeminiFeedbackAdapter();

export function createWebSpeechDictationAdapter(): WebSpeechDictationAdapter | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return new WebSpeechDictationAdapter();
  } catch {
    return undefined;
  }
}

export function createWebSpeechSynthesisAdapter(): WebSpeechSynthesisAdapter | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return new WebSpeechSynthesisAdapter();
  } catch {
    return undefined;
  }
}

export function createGcsAttachmentAdapter(): AttachmentAdapter {
  return {
    accept:
      "image/*,application/pdf,text/*,audio/*,video/*,application/json,application/xml",
    async *add({
      file,
    }: {
      file: File;
    }): AsyncGenerator<PendingAttachment, void, unknown> {
      const previewUrl =
        typeof URL !== "undefined" && URL.createObjectURL
          ? URL.createObjectURL(file)
          : "";
      const tempId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const isImage = file.type.startsWith("image/");
      const attachmentType = isImage ? "image" : "document";

      yield {
        id: tempId,
        type: attachmentType,
        name: file.name,
        contentType: file.type || "application/octet-stream",
        file,
        status: {
          type: "running",
          reason: "uploading",
          progress: 0,
        },
      };

      try {
        const presignRes = await fetch("/api/uploads/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: [
              {
                filename: file.name,
                contentType: file.type || "application/octet-stream",
                sizeBytes: file.size,
              },
            ],
          }),
        });

        if (!presignRes.ok) {
          const errText = await presignRes.text();
          throw new Error(`Failed to get upload URL (${presignRes.status}): ${errText}`);
        }

        const { uploads } = (await presignRes.json()) as PresignBatchResponse;
        const uploadItem = uploads?.[0];
        if (!uploadItem) {
          throw new Error("No upload data returned from server");
        }

        yield {
          id: uploadItem.fileId || tempId,
          type: attachmentType,
          name: file.name,
          contentType: file.type || "application/octet-stream",
          file,
          status: {
            type: "running",
            reason: "uploading",
            progress: 0.5,
          },
        };

        const uploadRes = await fetch(uploadItem.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error(`Upload to storage failed with status ${uploadRes.status}`);
        }

        const finalId = uploadItem.fileId || tempId;
        attachmentMetadataMap.set(finalId, {
          gcsUri: uploadItem.gcsUri,
          readUrl: uploadItem.readUrl || previewUrl,
          previewUrl,
          contentType: file.type || "application/octet-stream",
        });

        yield {
          id: finalId,
          type: attachmentType,
          name: file.name,
          contentType: file.type || "application/octet-stream",
          file,
          status: {
            type: "requires-action",
            reason: "composer-send",
          },
        };
        return;
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : "Upload failed";
        console.error("[createGcsAttachmentAdapter] Upload error:", errorMsg);
        yield {
          id: tempId,
          type: attachmentType,
          name: file.name,
          contentType: file.type || "application/octet-stream",
          file,
          status: {
            type: "incomplete",
            reason: "error",
            message: errorMsg,
          },
        };
        return;
      }
    },
    async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
      const meta = attachmentMetadataMap.get(attachment.id);
      const isImage =
        attachment.file.type.startsWith("image/") || attachment.type === "image";
      const gcsUri =
        meta?.gcsUri ||
        `gs://mock-bucket/users/current/${attachment.id}-${attachment.name}`;
      const readUrl =
        meta?.readUrl ||
        meta?.previewUrl ||
        (typeof URL !== "undefined" && URL.createObjectURL
          ? URL.createObjectURL(attachment.file)
          : "");

      let content: ThreadUserMessagePart[];

      if (isImage) {
        content = [
          {
            type: "image",
            image: readUrl,
            filename: attachment.name,
          },
        ];
      } else {
        content = [
          {
            type: "file",
            data: gcsUri,
            mimeType:
              attachment.contentType ||
              attachment.file.type ||
              "application/octet-stream",
            filename: attachment.name,
            sourceType: "url",
          },
        ];
      }

      return {
        id: attachment.id,
        type: attachment.type,
        name: attachment.name,
        contentType: attachment.contentType,
        file: attachment.file,
        status: {
          type: "complete",
        },
        content,
      };
    },
    async remove(attachment: Attachment): Promise<void> {
      const meta = attachmentMetadataMap.get(attachment.id);
      if (meta?.previewUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
        try {
          URL.revokeObjectURL(meta.previewUrl);
        } catch {
          // ignore
        }
      }
      attachmentMetadataMap.delete(attachment.id);
    },
  };
}

export const gcsAttachmentAdapter = createGcsAttachmentAdapter();
