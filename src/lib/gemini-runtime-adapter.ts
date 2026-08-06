import type {
  ChatModelAdapter,
  ChatModelRunOptions,
  ChatModelRunResult,
} from "@assistant-ui/react";

export const geminiChatAdapter: ChatModelAdapter = {
  async *run({
    messages,
    abortSignal,
  }: ChatModelRunOptions): AsyncGenerator<ChatModelRunResult, void, unknown> {
    const formattedMessages = messages.map((m) => {
      let text = "";
      for (const part of m.content) {
        if (part.type === "text") {
          text += part.text;
        }
      }
      return {
        role: m.role as "user" | "assistant" | "system",
        content: text,
      };
    });

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: formattedMessages }),
      signal: abortSignal,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Chat request failed (${response.status}): ${err}`);
    }

    if (!response.body) {
      throw new Error("No response body received");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;

        const dataStr = trimmed.slice(6);
        if (dataStr === "[DONE]") return;

        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.event_type === "content" && parsed.content) {
            accumulatedText += parsed.content;
            yield {
              content: [{ type: "text", text: accumulatedText }],
            };
          } else if (parsed.event_type === "error" && parsed.error) {
            throw new Error(parsed.error);
          } else if (parsed.event_type === "done") {
            return;
          }
        } catch (e: unknown) {
          if (e instanceof Error && e.message !== "Unexpected end of JSON input") {
            throw e;
          }
        }
      }
    }
  },
};
