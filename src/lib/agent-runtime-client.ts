import { GoogleAuth } from "google-auth-library";
import { AgentStreamEvent, ChatRequestBody } from "@/types/agent";

export class AgentRuntimeClient {
  private auth: GoogleAuth;
  private projectId: string;
  private location: string;
  private reasoningEngineId: string;
  private isMock: boolean;

  constructor() {
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT || "";
    this.location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
    this.reasoningEngineId = process.env.GOOGLE_REASONING_ENGINE_ID || "";
    this.isMock =
      process.env.MOCK_AGENT_RUNTIME === "true" ||
      !this.projectId ||
      !this.reasoningEngineId;

    this.auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
  }

  /**
   * Dispatches a streaming prompt to Google Cloud Agent Runtime.
   */
  async *streamQuery(
    body: ChatRequestBody,
    userId: string
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    if (this.isMock) {
      yield* this.mockStreamQuery(body);
      return;
    }

    try {
      // Instant zero-latency handshake event for immediate UI feedback
      yield {
        event_type: "thought",
        thought: `Connecting to Agent Runtime (${this.location}) and analyzing prompt...`,
      };

      const client = await this.auth.getClient();
      const accessToken = await client.getAccessToken();

      if (!accessToken.token) {
        throw new Error("Failed to obtain Google Cloud IAM access token");
      }

      // Endpoint for Vertex AI Reasoning Engine streamQuery
      const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/${this.reasoningEngineId}:streamQuery`;

      const lastUserMessage =
        [...body.messages].reverse().find((m) => m.role === "user")?.content || "";

      // ADK Reasoning Engine contract expects class_method + input
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          class_method: "async_stream_query",
          input: {
            message: lastUserMessage,
            user_id: userId,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Agent Runtime error (${response.status}): ${errText}`);
      }

      if (!response.body) {
        throw new Error("Empty response body from Agent Runtime");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;

          const dataStr = trimmed.startsWith("data: ") ? trimmed.slice(6) : trimmed;

          if (dataStr === "[DONE]") {
            yield { event_type: "done" };
            return;
          }

          try {
            const parsed = JSON.parse(dataStr);

            // Handle ADK content.parts event schema
            if (parsed.content?.parts && Array.isArray(parsed.content.parts)) {
              for (const part of parsed.content.parts) {
                if (part.text) {
                  if (part.thought) {
                    yield { event_type: "thought", thought: part.text };
                  } else {
                    yield { event_type: "content", content: part.text };
                  }
                }
                const fnCall = part.function_call || part.functionCall;
                if (fnCall) {
                  yield {
                    event_type: "tool_call",
                    tool_call: {
                      name: fnCall.name,
                      args: fnCall.args,
                    },
                  };
                }
              }
            } else if (parsed.text) {
              yield { event_type: "content", content: parsed.text };
            } else if (parsed.thought) {
              yield { event_type: "thought", thought: parsed.thought };
            } else if (parsed.tool_call) {
              yield { event_type: "tool_call", tool_call: parsed.tool_call };
            } else if (parsed.error_message) {
              yield {
                event_type: "content",
                content: `\n\n*Agent message: ${parsed.error_message}*`,
              };
            }
          } catch {
            yield { event_type: "content", content: dataStr };
          }
        }
      }
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

  /**
   * Realistic mock streaming generator for local testing.
   */
  private async *mockStreamQuery(
    body: ChatRequestBody
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    const lastPrompt =
      [...body.messages].reverse().find((m) => m.role === "user")?.content || "Hello";

    // 1. Send simulated thought event
    yield {
      event_type: "thought",
      thought: `Analyzing prompt "${lastPrompt}" across the council and checking Google Cloud Agent Runtime state...`,
    };
    await new Promise((r) => setTimeout(r, 400));

    // 2. Send simulated tool execution
    yield {
      event_type: "tool_call",
      tool_call: {
        name: "agent_runtime_query",
        args: { project: "gemini-enterprise", prompt: lastPrompt },
      },
    };
    await new Promise((r) => setTimeout(r, 600));

    // 3. Stream text tokens
    const sampleReply = `Hello! I am connected to your **ADK Agent** running on **Google Cloud Agent Runtime**.\n\nYou asked:\n> "${lastPrompt}"\n\n### System Capabilities:\n- Real-time streaming token generation\n- Google Single Sign-On via \`better-auth\`\n- Collapsible thought process inspection\n- ADK tool invocation rendering\n\nHow else can I assist your team today?`;

    const chunks = sampleReply.split(" ");
    for (const chunk of chunks) {
      yield {
        event_type: "content",
        content: chunk + " ",
      };
      await new Promise((r) => setTimeout(r, 45));
    }

    yield { event_type: "done" };
  }
}
