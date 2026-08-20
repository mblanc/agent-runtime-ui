import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
  ThreadMessage,
} from "@assistant-ui/react";
import type {
  AgentMessage,
  AgentMessagePart,
  ArtifactStreamPayload,
} from "@/types/agent";

import {
  defaultAttachmentStore,
  type IAttachmentMetadataStore,
} from "../attachments/attachment-store";
import { inferMimeType } from "../attachments/mime-types";
import { debugStream } from "./debug-stream";
import { StreamAccumulator } from "./stream-accumulator";
import { streamChat, warnMalformedFrame } from "./sse-stream";

/**
 * The snapshot builder and its shapes live in ./yield-content, next to nothing
 * but themselves; they are re-exported here because this module is the import
 * site every consumer already uses, and because the accumulator that calls
 * them would otherwise import back from this file.
 */
export { createYieldContent } from "./yield-content";
export type { ToolCallYieldItem, YieldContentFields } from "./yield-content";

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
        const a2uiMatch = part.text.match(/^\[A2UI_ACTION:(.*?)\]$/);
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
        } else if (a2uiMatch) {
          try {
            const actionPayload = JSON.parse(a2uiMatch[1]);
            if (actionPayload && typeof actionPayload === "object") {
              parts.push({
                type: "a2ui_action",
                a2uiAction: actionPayload,
                a2ui_action: actionPayload,
              });
            } else {
              text += part.text;
              parts.push({ text: part.text });
            }
          } catch {
            text += part.text;
            parts.push({ text: part.text });
          }
        } else {
          text += part.text;
          parts.push({ text: part.text });
        }
      } else if (
        (part as { type?: string }).type === "a2ui_action" ||
        (part as { a2uiAction?: unknown }).a2uiAction
      ) {
        const actionPayload =
          (part as { a2uiAction?: unknown }).a2uiAction ||
          (part as { payload?: unknown }).payload;
        parts.push({
          type: "a2ui_action",
          a2uiAction: actionPayload as Record<string, unknown> & { event: string },
          a2ui_action: actionPayload as Record<string, unknown> & { event: string },
        });
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
  getThreadMessages?: () => readonly ThreadMessage[] | undefined,
  onStreamArtifact?: (artifact: ArtifactStreamPayload) => void
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
        const accumulator = new StreamAccumulator(sourceMessages);
        const emittedArtifactKeys = new Map<string, string>();

        const syncStreamArtifacts = () => {
          if (!onStreamArtifact) return;
          for (const art of accumulator.getArtifacts()) {
            const artKey = `${art.filename}:${art.version}:${art.gcsUri || art.content}`;
            if (
              !emittedArtifactKeys.has(art.filename) ||
              emittedArtifactKeys.get(art.filename) !== artKey
            ) {
              emittedArtifactKeys.set(art.filename, artKey);
              onStreamArtifact(art);
            }
          }
        };

        for await (const frame of streamChat({
          messages: formattedMessages,
          sessionId,
          agentId,
          location,
          abortSignal,
        })) {
          // One malformed frame must not end the turn. The guard this
          // reproduces opened before `JSON.parse` and closed after the entire
          // dispatch chain, so a throw from a carry-forward read, from
          // `JSON.stringify` over a circular tool result, or from anywhere in
          // the state machine dropped that frame and the stream carried on.
          // Splitting parse from dispatch across two modules must not narrow
          // it: the transport guards decoding, this guards dispatch, and
          // between them they cover what the single `try` covered.
          //
          // An abort is not caught here. It surfaces from `reader.read()`,
          // which is the `for await` advancing the transport — outside this
          // block — and so still reaches the outer catch as an AbortError.
          try {
            const outcome = accumulator.handle(frame.event);
            syncStreamArtifacts();
            if (outcome === "skip") continue;

            const snap = accumulator.snapshot();
            yield snap;

            // Terminal event. Returning here closes the transport generator
            // via its `finally`, which is what releases the reader's lock.
            if (outcome === "final") {
              syncStreamArtifacts();
              return;
            }
          } catch (error: unknown) {
            warnMalformedFrame(frame.raw, error);
            continue;
          }
        }

        // The stream closed without a terminal event.
        accumulator.finalize();
        syncStreamArtifacts();
        yield accumulator.snapshot();
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
