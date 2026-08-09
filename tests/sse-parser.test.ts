import { describe, it, expect } from "vitest";
import { parseSseStream } from "@/lib/agent-runtime/sse-parser";
import { AgentStreamEvent } from "@/types/agent";

describe("Agent Runtime SSE Parser", () => {
  function createReadableStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });
  }

  it("parses single and multiple SSE data events cleanly", async () => {
    const ssePayload = [
      'data: {"thought":"Analyzing requirements..."}\n\n',
      'data: {"text":"Hello, I am ready to help."}\n\n',
      "data: [DONE]\n\n",
    ];

    const stream = createReadableStream(ssePayload);
    const events: AgentStreamEvent[] = [];

    for await (const evt of parseSseStream(stream)) {
      events.push(evt);
    }

    expect(events.length).toBe(3);
    expect(events[0]).toEqual({
      event_type: "thought",
      thought: "Analyzing requirements...",
    });
    expect(events[1]).toEqual({
      event_type: "content",
      content: "Hello, I am ready to help.",
      author: undefined,
    });
    expect(events[2]).toEqual({
      event_type: "done",
    });
  });

  it("handles fragmented chunk boundaries across network packets", async () => {
    const fragmentedChunks = [
      'data: {"thought"',
      ':"Part 1... ',
      'Part 2..."}\n\n',
      "data: [DONE]\n\n",
    ];

    const stream = createReadableStream(fragmentedChunks);
    const events: AgentStreamEvent[] = [];

    for await (const evt of parseSseStream(stream)) {
      events.push(evt);
    }

    expect(events.length).toBe(2);
    expect(events[0]).toEqual({
      event_type: "thought",
      thought: "Part 1... Part 2...",
    });
    expect(events[1]).toEqual({
      event_type: "done",
    });
  });

  it("ignores SSE comments and keepalive heartbeats", async () => {
    const chunksWithHeartbeats = [
      ": keepalive\n\n",
      ": ping\n\n",
      'data: {"text":"Active response"}\n\n',
      ": keepalive\n\n",
      "data: [DONE]\n\n",
    ];

    const stream = createReadableStream(chunksWithHeartbeats);
    const events: AgentStreamEvent[] = [];

    for await (const evt of parseSseStream(stream)) {
      events.push(evt);
    }

    expect(events.length).toBe(2);
    expect(events[0].event_type).toBe("content");
    expect(events[0].content).toBe("Active response");
    expect(events[1].event_type).toBe("done");
  });

  it("extracts nested content parts and function calls from SSE payloads", async () => {
    const geminiRawChunk = [
      JSON.stringify({
        content: {
          parts: [
            {
              functionCall: {
                name: "query_database",
                args: { query: "SELECT * FROM users" },
              },
            },
          ],
        },
      }),
    ];

    const ssePayload = [`data: ${geminiRawChunk[0]}\n\n`, "data: [DONE]\n\n"];
    const stream = createReadableStream(ssePayload);
    const events: AgentStreamEvent[] = [];

    for await (const evt of parseSseStream(stream)) {
      events.push(evt);
    }

    expect(events.length).toBe(2);
    expect(events[0].event_type).toBe("tool_call");
    expect(events[0].tool_call?.name).toBe("query_database");
    expect(events[0].tool_call?.args).toEqual({ query: "SELECT * FROM users" });
    expect(events[1].event_type).toBe("done");
  });

  it("extracts and propagates eventId from chunk id and event_id attributes", async () => {
    const ssePayload = [
      'data: {"id":"2a18cb74-f654-47f3-86ac-dbb6223bbf8b","content":{"parts":[{"text":"Hello from agent"}]}}\n\n',
      'data: {"event_id":"evt-999","thought":"Thinking..."}\n\n',
      'data: {"invocation_id":"inv-123","agent_call":{"agent":"subagent"}}\n\n',
      "data: [DONE]\n\n",
    ];

    const stream = createReadableStream(ssePayload);
    const events: AgentStreamEvent[] = [];

    for await (const evt of parseSseStream(stream)) {
      events.push(evt);
    }

    expect(events.length).toBe(4);
    expect(events[0].eventId).toBe("2a18cb74-f654-47f3-86ac-dbb6223bbf8b");
    expect(events[0].content).toBe("Hello from agent");
    expect(events[1].eventId).toBe("evt-999");
    expect(events[1].thought).toBe("Thinking...");
    expect(events[2].eventId).toBe("inv-123");
    expect(events[2].agent_call?.agent).toBe("subagent");
    expect(events[3].event_type).toBe("done");
  });
});
