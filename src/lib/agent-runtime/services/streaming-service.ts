import { AgentStreamEvent, ChatRequestBody } from "@/types/agent";
import { log } from "@/lib/logger";
import { VertexAiContext } from "./context";
import {
  extractSessionIdFromResourceName,
  extractTextFromQueryOutput,
  isLocalSessionId,
} from "../event-normalizer";
import {
  mergeEventMetadata,
  normalizeEventMetadata,
  parseSseStream,
} from "../sse-parser";

export function buildStreamQueryInput(
  body: ChatRequestBody,
  userId: string,
  sessionId?: string
): Record<string, unknown> {
  const lastUserMsgObj = [...body.messages].reverse().find((m) => m.role === "user");
  const lastUserMessage = lastUserMsgObj?.content || "";

  const currentTurnFnResponses = (lastUserMsgObj?.parts || []).filter(
    (p) => p.function_response || p.functionResponse
  );

  const confirmationResp = currentTurnFnResponses.find(
    (p) =>
      p.function_response?.name === "adk_request_confirmation" ||
      p.functionResponse?.name === "adk_request_confirmation"
  );
  const fnResponsePart = confirmationResp || currentTurnFnResponses[0];

  const resolvedRunConfig: Record<string, unknown> = {
    streaming_mode:
      body.streamingMode ||
      body.runConfig?.streaming_mode ||
      body.runConfig?.streamingMode ||
      "sse",
    ...(body.runConfig || {}),
  };

  let resolvedMessage: unknown = lastUserMessage;
  let resolvedParts: Array<Record<string, unknown>> | undefined = undefined;

  if (fnResponsePart) {
    const fnResp = fnResponsePart.function_response || fnResponsePart.functionResponse;
    resolvedMessage = {
      role: "user",
      parts: [{ function_response: fnResp }],
    };
  } else {
    const nonTextParts = lastUserMsgObj?.parts?.filter(
      (p) =>
        p.file_data ||
        p.fileData ||
        p.image ||
        p.file ||
        p.function_response ||
        p.functionResponse ||
        p.function_call ||
        p.functionCall
    );

    if (nonTextParts && nonTextParts.length > 0 && lastUserMsgObj?.parts) {
      resolvedParts = lastUserMsgObj.parts.map((p) => {
        if (p.file_data) {
          return {
            file_data: {
              file_uri: p.file_data.file_uri,
              mime_type: p.file_data.mime_type,
            },
          };
        }
        if (p.fileData) {
          return {
            file_data: {
              file_uri: p.fileData.file_uri || p.fileData.fileUri || "",
              mime_type: p.fileData.mime_type || p.fileData.mimeType || "",
            },
          };
        }
        if (p.image) {
          let fileUri = p.image;
          if (fileUri.startsWith("https://storage.googleapis.com/")) {
            const match = fileUri.match(
              /^https:\/\/storage\.googleapis\.com\/([^/?#]+)\/([^?#]+)/
            );
            if (match) fileUri = `gs://${match[1]}/${match[2]}`;
          }
          return {
            file_data: {
              file_uri: fileUri,
              mime_type: "image/jpeg",
            },
          };
        }
        if (p.file) {
          return {
            file_data: {
              file_uri: p.file.data,
              mime_type:
                p.file.mimeType || p.file.mime_type || "application/octet-stream",
            },
          };
        }
        if (p.function_response || p.functionResponse) {
          return {
            function_response: p.function_response || p.functionResponse,
          };
        }
        if (p.function_call || p.functionCall) {
          return {
            function_call: p.function_call || p.functionCall,
          };
        }
        return { text: p.text || "" };
      });
    }
  }

  return {
    message: resolvedParts ? { role: "user", parts: resolvedParts } : resolvedMessage,
    user_id: userId,
    ...(sessionId ? { session_id: sessionId } : {}),
    run_config: resolvedRunConfig,
  };
}

export class VertexAiStreamingService {
  constructor(private context: VertexAiContext) {}

  async *streamQuery(
    body: ChatRequestBody,
    userId: string,
    signal?: AbortSignal
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    try {
      // Resolve the engine once and derive the host region from it: a display
      // name can resolve to a resource in a region other than the context
      // default, and the fallback `:query` below must not disagree with this URL.
      const engineResource = this.context.getNormalizedEngineResource();
      const loc = this.context.resolveLocationForResource(engineResource);
      const endpoint = `https://${loc}-aiplatform.googleapis.com/v1/${engineResource}:streamQuery`;
      const cleanSessionId =
        body.sessionId && !isLocalSessionId(body.sessionId)
          ? extractSessionIdFromResourceName(body.sessionId)
          : undefined;

      const inputPayload = buildStreamQueryInput(body, userId, cleanSessionId);

      const response = await this.context.fetchWithAuth(
        endpoint,
        {
          method: "POST",
          body: JSON.stringify({
            class_method: "async_stream_query",
            input: inputPayload,
          }),
          signal,
        },
        // No default timeout: a generation is long by design and is bounded by
        // `signal`, which the route aborts when the client disconnects.
        { streaming: true }
      );

      if (!response.ok) {
        const streamErrText = await response.text().catch(() => "");
        log.warn({
          event: "vertex.streamQuery.fallback",
          status: response.status,
          statusText: response.statusText,
          message: streamErrText,
        });
        const queryEndpoint = `https://${loc}-aiplatform.googleapis.com/v1/${engineResource}:query`;
        const queryResponse = await this.context.fetchWithAuth(
          queryEndpoint,
          {
            method: "POST",
            body: JSON.stringify({
              class_method: "query",
              input: inputPayload,
            }),
            signal,
          },
          // The :query fallback also produces a whole generation, so it is
          // bounded by the client signal rather than the default timeout.
          { streaming: true }
        );

        if (queryResponse.ok) {
          const result = await queryResponse.json();
          const parsed = extractTextFromQueryOutput(result);

          const rawObj = (result && typeof result === "object" ? result : {}) as Record<
            string,
            unknown
          >;
          const outputObj = (
            rawObj.output && typeof rawObj.output === "object" ? rawObj.output : {}
          ) as Record<string, unknown>;
          const respObj = (
            rawObj.response && typeof rawObj.response === "object" ? rawObj.response : {}
          ) as Record<string, unknown>;

          // The same normalisation the streaming path gets, over the three
          // places this response scatters metadata across. This block used to
          // re-derive model version, invocation id, usage, actions and a bare
          // `state_delta` from raw spellings itself — a third copy of knowledge
          // that already existed in the SSE parser, and one that silently
          // lacked whatever the parser had learned since.
          const meta = mergeEventMetadata(
            normalizeEventMetadata(rawObj),
            normalizeEventMetadata(outputObj),
            normalizeEventMetadata(respObj)
          );

          log.debug({
            event: "vertex.query.fallback",
            resultKeys: Object.keys(rawObj),
            outputKeys: Object.keys(outputObj),
            hasUsageMetadata: Boolean(meta.usageMetadata),
          });

          // Who produced the turn, on every event of it.
          const identity = {
            ...(meta.eventId ? { eventId: meta.eventId } : {}),
            ...(meta.modelVersion ? { modelVersion: meta.modelVersion } : {}),
            ...(meta.invocationId ? { invocationId: meta.invocationId } : {}),
          };

          // What the turn cost and changed, on the events that conclude it.
          const outcome = {
            ...(meta.usageMetadata ? { usageMetadata: meta.usageMetadata } : {}),
            ...(meta.groundingMetadata
              ? { groundingMetadata: meta.groundingMetadata }
              : {}),
            ...(meta.actions ? { actions: meta.actions } : {}),
          };

          if (parsed.thoughts.length > 0) {
            yield {
              event_type: "thought",
              thought: parsed.thoughts.join("\n\n"),
              ...identity,
            };
          }

          // Before the answer, and in call-then-result order, so the trace reads
          // the way it does on the streaming path: tool cards above the final
          // text. These used to reach the client as `[Tool Executed]: <name>`
          // lines inside the thought above, which the renderer had to
          // regex-match back into a tool card.
          for (const call of parsed.toolCalls) {
            yield {
              event_type: "tool_call",
              tool_call: call,
              ...identity,
            };
          }

          for (const toolResult of parsed.toolResults) {
            yield {
              event_type: "tool_result",
              tool_result: toolResult,
              ...identity,
            };
          }

          if (parsed.text) {
            yield {
              event_type: "content",
              content: parsed.text,
              ...identity,
              ...outcome,
            };
          }

          yield {
            event_type: "done",
            ...outcome,
          };
          return;
        } else {
          // A Response body is single-read: `streamErrText` was captured above
          // and must be reused here. Re-reading `response` rejects (the body is
          // already disturbed) and the swallowed rejection silently emptied the
          // :streamQuery message out of the diagnostic below.
          const queryErrText = await queryResponse.text().catch(() => "");
          throw new Error(
            `Agent Runtime error (${queryResponse.status}): ${queryErrText || streamErrText || response.statusText}`
          );
        }
      }

      if (!response.body) {
        throw new Error("Empty response body from Agent Runtime");
      }

      yield* parseSseStream(response.body);
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to stream from Agent Runtime";
      log.error({ event: "vertex.stream.error", message: errorMessage });
      yield {
        event_type: "error",
        error: errorMessage,
      };
    }
  }
}
