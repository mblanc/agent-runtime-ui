import { describe, expect, it, vi } from "vitest";
import type { ChatModelRunResult } from "@assistant-ui/react";
import { parseSseStream } from "@/lib/agent-runtime/sse-parser";
import { createGeminiChatAdapter } from "@/lib/adapters/chat-adapter";

describe("Streaming Deduplication & ADK Event Handling", () => {
  describe("parseSseStream", () => {
    it("extracts partial=true, partial=false, and turn_complete flags from ADK SSE events", async () => {
      const mockStream = new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(
              'data: {"content":{"parts":[{"thought":true,"text":"Thinking about query..."}]},"partial":true,"id":"evt-1"}\n\n'
            )
          );
          controller.enqueue(
            encoder.encode(
              'data: {"content":{"parts":[{"thought":true,"text":"Thinking about query..."}]},"partial":false,"id":"evt-2"}\n\n'
            )
          );
          controller.enqueue(
            encoder.encode(
              'data: {"content":{"parts":[{"text":"Hello "}]},"partial":true,"id":"evt-3"}\n\n'
            )
          );
          controller.enqueue(
            encoder.encode(
              'data: {"content":{"parts":[{"text":"world!"}]},"partial":true,"id":"evt-4"}\n\n'
            )
          );
          controller.enqueue(
            encoder.encode(
              'data: {"content":{"parts":[{"text":"Hello world!"}]},"partial":false,"id":"evt-5"}\n\n'
            )
          );
          controller.enqueue(
            encoder.encode(
              'data: {"content":{"parts":[]},"partial":false,"turn_complete":true,"id":"evt-6"}\n\n'
            )
          );
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      const events = [];
      for await (const event of parseSseStream(mockStream)) {
        events.push(event);
      }

      expect(events.length).toBe(6); // 2 thoughts, 3 content chunks, 1 done

      expect(events[0]).toMatchObject({
        event_type: "thought",
        thought: "Thinking about query...",
        partial: true,
        eventId: "evt-1",
      });

      expect(events[1]).toMatchObject({
        event_type: "thought",
        thought: "Thinking about query...",
        partial: false,
        eventId: "evt-2",
      });

      expect(events[2]).toMatchObject({
        event_type: "content",
        content: "Hello ",
        partial: true,
        eventId: "evt-3",
      });

      expect(events[3]).toMatchObject({
        event_type: "content",
        content: "world!",
        partial: true,
        eventId: "evt-4",
      });

      expect(events[4]).toMatchObject({
        event_type: "content",
        content: "Hello world!",
        partial: false,
        eventId: "evt-5",
      });

      expect(events[5]).toMatchObject({
        event_type: "done",
      });
    });
  });

  describe("createGeminiChatAdapter Deduplication", () => {
    it("prevents duplication of thoughts and answers when receiving partial chunks followed by complete merged event (reproducing user scenario)", async () => {
      const thoughtsText =
        "Answering Identity Query\n\nI'm processing the request to define myself. My current focus is on crafting a concise response that highlights my role as a versatile, helpful, and knowledgeable AI assistant, internally known as a large language model.";
      const answerText =
        'I am a versatile, helpful, and knowledgeable AI assistant. My purpose is to answer your questions on any topic, provide information, and assist you with various tasks. Internally, I am known as the "root_agent". How can I help you today?';

      const sseChunks = [
        `data: ${JSON.stringify({
          event_type: "thought",
          thought: thoughtsText,
          partial: true,
          eventId: "evt-1",
        })}\n\n`,
        `data: ${JSON.stringify({
          event_type: "thought",
          thought: thoughtsText,
          partial: false,
          eventId: "evt-2",
        })}\n\n`,
        `data: ${JSON.stringify({
          event_type: "content",
          content: answerText,
          partial: true,
          eventId: "evt-3",
        })}\n\n`,
        `data: ${JSON.stringify({
          event_type: "content",
          content: answerText,
          partial: false,
          eventId: "evt-4",
        })}\n\n`,
        `data: [DONE]\n\n`,
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            for (const chunk of sseChunks) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          },
        }),
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        mockFetch as unknown as typeof fetch
      );

      const adapter = createGeminiChatAdapter();
      const generator = adapter.run({
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Who are you?" }],
            attachments: [],
            createdAt: new Date(),
            metadata: {},
          },
        ],
        abortSignal: new AbortController().signal,
        config: {},
      } as unknown as Parameters<typeof adapter.run>[0]) as AsyncGenerator<
        ChatModelRunResult,
        void,
        unknown
      >;

      const results: ChatModelRunResult[] = [];
      for await (const result of generator) {
        results.push(result);
      }

      expect(results.length).toBeGreaterThan(0);
      const finalResult = results[results.length - 1];

      const reasoningPart = finalResult.content?.find(
        (p): p is { type: "reasoning"; text: string } => p.type === "reasoning"
      );
      const textPart = finalResult.content?.find(
        (p): p is { type: "text"; text: string } => p.type === "text"
      );

      // Verify reasoning is NOT duplicated
      expect(reasoningPart).toBeDefined();
      expect(reasoningPart?.text).toBe(thoughtsText);
      // Ensure the text only appears ONCE in reasoning
      const thoughtMatches = reasoningPart?.text?.match(/Answering Identity Query/g);
      expect(thoughtMatches?.length).toBe(1);

      // Verify answer text is NOT duplicated
      expect(textPart).toBeDefined();
      expect(textPart?.text).toBe(answerText);
      // Ensure the text only appears ONCE
      const answerMatches = textPart?.text?.match(/How can I help you today\?/g);
      expect(answerMatches?.length).toBe(1);
    });

    it("correctly handles multi-token streaming with partial=true and finalizes with partial=false", async () => {
      const sseChunks = [
        `data: ${JSON.stringify({
          event_type: "content",
          content: "The ",
          partial: true,
        })}\n\n`,
        `data: ${JSON.stringify({
          event_type: "content",
          content: "capital of France ",
          partial: true,
        })}\n\n`,
        `data: ${JSON.stringify({
          event_type: "content",
          content: "is Paris.",
          partial: true,
        })}\n\n`,
        `data: ${JSON.stringify({
          event_type: "content",
          content: "The capital of France is Paris.",
          partial: false,
        })}\n\n`,
        `data: [DONE]\n\n`,
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            for (const chunk of sseChunks) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          },
        }),
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        mockFetch as unknown as typeof fetch
      );

      const adapter = createGeminiChatAdapter();
      const generator = adapter.run({
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Capital of France?" }],
            attachments: [],
            createdAt: new Date(),
            metadata: {},
          },
        ],
        abortSignal: new AbortController().signal,
        config: {},
      } as unknown as Parameters<typeof adapter.run>[0]) as AsyncGenerator<
        ChatModelRunResult,
        void,
        unknown
      >;

      const results: ChatModelRunResult[] = [];
      for await (const result of generator) {
        results.push(result);
      }

      const finalResult = results[results.length - 1];
      const textPart = finalResult.content?.find(
        (p): p is { type: "text"; text: string } => p.type === "text"
      );
      expect(textPart?.text).toBe("The capital of France is Paris.");
    });

    it("supports backward-compatible plain delta streaming when partial flag is undefined", async () => {
      const sseChunks = [
        `data: ${JSON.stringify({
          event_type: "thought",
          thought: "Looking up information...",
        })}\n\n`,
        `data: ${JSON.stringify({
          event_type: "content",
          content: "Here is ",
        })}\n\n`,
        `data: ${JSON.stringify({
          event_type: "content",
          content: "your result.",
        })}\n\n`,
        `data: [DONE]\n\n`,
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            for (const chunk of sseChunks) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          },
        }),
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        mockFetch as unknown as typeof fetch
      );

      const adapter = createGeminiChatAdapter();
      const generator = adapter.run({
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Hi" }],
            attachments: [],
            createdAt: new Date(),
            metadata: {},
          },
        ],
        abortSignal: new AbortController().signal,
        config: {},
      } as unknown as Parameters<typeof adapter.run>[0]) as AsyncGenerator<
        ChatModelRunResult,
        void,
        unknown
      >;

      const results: ChatModelRunResult[] = [];
      for await (const result of generator) {
        results.push(result);
      }

      const finalResult = results[results.length - 1];
      const reasoningPart = finalResult.content?.find(
        (p): p is { type: "reasoning"; text: string } => p.type === "reasoning"
      );
      const textPart = finalResult.content?.find(
        (p): p is { type: "text"; text: string } => p.type === "text"
      );

      expect(reasoningPart?.text).toBe("Looking up information...");
      expect(textPart?.text).toBe("Here is your result.");
    });

    it("correctly preserves thoughts and tool call blocks in multi-step execution", async () => {
      const sseChunks = [
        `data: ${JSON.stringify({
          event_type: "thought",
          thought: "I will check the weather.",
          partial: true,
        })}\n\n`,
        `data: ${JSON.stringify({
          event_type: "thought",
          thought: "I will check the weather.",
          partial: false,
        })}\n\n`,
        `data: ${JSON.stringify({
          event_type: "tool_call",
          tool_call: {
            id: "call-1",
            name: "get_weather",
            args: { city: "Tokyo" },
          },
        })}\n\n`,
        `data: ${JSON.stringify({
          event_type: "tool_result",
          tool_result: {
            id: "call-1",
            name: "get_weather",
            result: { temp: 22, condition: "Sunny" },
          },
        })}\n\n`,
        `data: ${JSON.stringify({
          event_type: "content",
          content: "The weather in Tokyo is sunny with 22°C.",
          partial: true,
        })}\n\n`,
        `data: ${JSON.stringify({
          event_type: "content",
          content: "The weather in Tokyo is sunny with 22°C.",
          partial: false,
        })}\n\n`,
        `data: [DONE]\n\n`,
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            for (const chunk of sseChunks) {
              controller.enqueue(encoder.encode(chunk));
            }
            controller.close();
          },
        }),
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        mockFetch as unknown as typeof fetch
      );

      const adapter = createGeminiChatAdapter();
      const generator = adapter.run({
        messages: [
          {
            id: "msg-1",
            role: "user",
            content: [{ type: "text", text: "Weather in Tokyo?" }],
            attachments: [],
            createdAt: new Date(),
            metadata: {},
          },
        ],
        abortSignal: new AbortController().signal,
        config: {},
      } as unknown as Parameters<typeof adapter.run>[0]) as AsyncGenerator<
        ChatModelRunResult,
        void,
        unknown
      >;

      const results: ChatModelRunResult[] = [];
      for await (const result of generator) {
        results.push(result);
      }

      const finalResult = results[results.length - 1];
      const reasoningPart = finalResult.content?.find(
        (p): p is { type: "reasoning"; text: string } => p.type === "reasoning"
      );
      const textPart = finalResult.content?.find(
        (p): p is { type: "text"; text: string } => p.type === "text"
      );
      type ToolCallContentPart = Extract<
        NonNullable<ChatModelRunResult["content"]>[number],
        { type: "tool-call" }
      >;
      const toolPart = finalResult.content?.find(
        (p): p is ToolCallContentPart => p.type === "tool-call"
      );

      expect(reasoningPart?.text).toContain("I will check the weather.");
      expect(reasoningPart?.text).toContain(':::tool[get_weather]{status="complete"}');
      expect(reasoningPart?.text).toContain('"temp": 22');
      expect(toolPart).toBeDefined();
      expect(toolPart?.toolName).toBe("get_weather");
      expect(textPart?.text).toBe("The weather in Tokyo is sunny with 22°C.");
    });
  });
});
