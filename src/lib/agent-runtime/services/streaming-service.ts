import { AgentStreamEvent, ChatRequestBody } from "@/types/agent";
import { VertexAiContext } from "./context";
import {
  extractSessionIdFromResourceName,
  extractTextFromQueryOutput,
  isLocalSessionId,
} from "../event-normalizer";
import { parseSseStream } from "../sse-parser";

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
    userId: string
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    try {
      const endpoint = `https://${this.context.location}-aiplatform.googleapis.com/v1/${this.context.getNormalizedEngineResource()}:streamQuery`;
      const cleanSessionId =
        body.sessionId && !isLocalSessionId(body.sessionId)
          ? extractSessionIdFromResourceName(body.sessionId)
          : undefined;

      const inputPayload = buildStreamQueryInput(body, userId, cleanSessionId);

      const response = await this.context.fetchWithAuth(endpoint, {
        method: "POST",
        body: JSON.stringify({
          class_method: "async_stream_query",
          input: inputPayload,
        }),
      });

      if (!response.ok) {
        const queryEndpoint = `https://${this.context.location}-aiplatform.googleapis.com/v1/${this.context.getNormalizedEngineResource()}:query`;
        const queryResponse = await this.context.fetchWithAuth(queryEndpoint, {
          method: "POST",
          body: JSON.stringify({
            class_method: "query",
            input: inputPayload,
          }),
        });

        if (queryResponse.ok) {
          const result = await queryResponse.json();
          const parsed = extractTextFromQueryOutput(result);

          if (parsed.thoughts.length > 0) {
            yield {
              event_type: "thought",
              thought: parsed.thoughts.join("\n\n"),
            };
          }

          if (parsed.text) {
            yield {
              event_type: "content",
              content: parsed.text,
            };
          }

          yield { event_type: "done" };
          return;
        } else {
          const streamErrText = await response.text().catch(() => "");
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
      console.error("Agent Runtime stream error:", errorMessage);
      yield {
        event_type: "error",
        error: errorMessage,
      };
    }
  }
}
