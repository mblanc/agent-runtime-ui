import { describe, expect, it, vi } from "vitest";
import type { ChatModelRunResult } from "@assistant-ui/react";
import { createGeminiChatAdapter } from "@/lib/adapters/chat-adapter";
import { MockAgentRuntimeProvider } from "@/lib/agent-runtime/mock/mock-provider";
import { parseSseStream } from "@/lib/agent-runtime/sse-parser";
import type { AgentStreamEvent } from "@/types/agent";

/**
 * The SSE boundary is the one place that knows Vertex AI spells its metadata
 * both ways. These tests pin that down from three directions: the boundary
 * itself erases the difference, every producer of `AgentStreamEvent` emits the
 * normalised side of it, and a field survives from the parser to the message
 * metadata the UI reads without anyone extracting it a second time.
 */

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

async function collect(chunks: string[]): Promise<AgentStreamEvent[]> {
  const events: AgentStreamEvent[] = [];
  for await (const evt of parseSseStream(streamOf(chunks))) events.push(evt);
  return events;
}

/**
 * The same event twice: once as `:streamQuery` v1 spells it, once as the
 * camelCase endpoints do. Only the spelling differs — including the nested
 * `usage_metadata`/`usageMetadata` container key and the part-level thought
 * signature, both of which used to be resolved independently downstream.
 */
const SNAKE_CHUNK = {
  id: "evt-1",
  invocation_id: "inv-1",
  model_version: "gemini-flash-latest",
  content: {
    parts: [{ text: "Answer.", thought_signature: "sig-1" }],
  },
  finish_reason: "STOP",
  usage_metadata: {
    prompt_token_count: 100,
    candidates_token_count: 20,
    total_token_count: 120,
  },
  avg_logprobs: -0.5,
  node_info: { path: "root_agent@1" },
  node_path: "root_agent@1",
  actions: { state_delta: { step: 1 } },
  turn_complete: false,
};

const CAMEL_CHUNK = {
  id: "evt-1",
  invocationId: "inv-1",
  modelVersion: "gemini-flash-latest",
  content: {
    parts: [{ text: "Answer.", thoughtSignature: "sig-1" }],
  },
  finishReason: "STOP",
  usageMetadata: {
    promptTokenCount: 100,
    candidatesTokenCount: 20,
    totalTokenCount: 120,
  },
  avgLogprobs: -0.5,
  nodeInfo: { path: "root_agent@1" },
  nodePath: "root_agent@1",
  actions: { state_delta: { step: 1 } },
  turnComplete: false,
};

describe("stream event normalisation", () => {
  it("produces identical events from a snake_case-only and a camelCase-only payload", async () => {
    const fromSnake = await collect([
      `data: ${JSON.stringify(SNAKE_CHUNK)}\n\n`,
      "data: [DONE]\n\n",
    ]);
    const fromCamel = await collect([
      `data: ${JSON.stringify(CAMEL_CHUNK)}\n\n`,
      "data: [DONE]\n\n",
    ]);

    expect(fromSnake).toEqual(fromCamel);

    // …and identical to the normalised shape, not merely to each other: an
    // extractor that dropped both spellings would satisfy the equality above.
    const [first] = fromSnake;
    expect(first).toEqual({
      event_type: "content",
      content: "Answer.",
      author: undefined,
      eventId: "evt-1",
      invocationId: "inv-1",
      modelVersion: "gemini-flash-latest",
      finishReason: "STOP",
      usageMetadata: {
        prompt_token_count: 100,
        promptTokenCount: 100,
        candidates_token_count: 20,
        candidatesTokenCount: 20,
        total_token_count: 120,
        totalTokenCount: 120,
      },
      avgLogprobs: -0.5,
      nodeInfo: { path: "root_agent@1" },
      nodePath: "root_agent@1",
      thoughtSignature: "sig-1",
      actions: { state_delta: { step: 1 } },
      turnComplete: false,
    });
  });

  it("resolves metadata nested under config and raw_event to the same event", async () => {
    const nested = await collect([
      `data: ${JSON.stringify({
        id: "evt-1",
        content: { parts: [{ text: "Answer." }] },
        config: { invocation_id: "inv-1", model_version: "gemini-flash-latest" },
        raw_event: { finish_reason: "STOP" },
      })}\n\n`,
      "data: [DONE]\n\n",
    ]);

    expect(nested[0]).toMatchObject({
      invocationId: "inv-1",
      modelVersion: "gemini-flash-latest",
      finishReason: "STOP",
    });
  });

  it("emits no snake_case metadata key from the mock provider", async () => {
    // The mock never goes through `parseSseStream`, so nothing but this test
    // stops it drifting back to the dual-spelled shape it used to yield.
    const provider = new MockAgentRuntimeProvider();
    const events: AgentStreamEvent[] = [];
    for await (const evt of provider.streamQuery(
      { messages: [{ role: "user", content: "review the cloud architecture specs" }] },
      "test-user",
      new AbortController().signal
    )) {
      events.push(evt);
    }

    expect(events.length).toBeGreaterThan(0);

    // Our own payload keys, which never had a second spelling to normalise.
    const protocolKeys = new Set([
      "event_type",
      "agent_call",
      "agent_response",
      "tool_call",
      "tool_result",
      "retrieved_memories",
    ]);

    for (const evt of events) {
      const offending = Object.keys(evt).filter(
        (key) => key.includes("_") && !protocolKeys.has(key)
      );
      expect(offending).toEqual([]);
    }

    // Emitted, not merely camelCase: the fields the message-info panel reads.
    const last = events[events.length - 1]!;
    expect(last.event_type).toBe("done");
    expect(last.invocationId).toBeDefined();
    expect(last.eventId).toBe(last.invocationId);
    expect(last.modelVersion).toBe("gemini-2.5-flash");
    expect(last.usageMetadata).toBeDefined();
  });

  it("carries a parsed field to message metadata without a second extraction", async () => {
    // The whole path, in the order production runs it: Vertex speaks
    // snake_case, `parseSseStream` normalises, `api/chat/route.ts`
    // JSON.stringifies the event verbatim onto the browser wire, and the chat
    // adapter reads it. Nothing between the parser and `metadata.custom`
    // consults an alternative spelling — if the adapter still had to, these
    // fields would arrive undefined.
    const parsedEvents = await collect([
      `data: ${JSON.stringify(SNAKE_CHUNK)}\n\n`,
      "data: [DONE]\n\n",
    ]);

    const wire = parsedEvents
      .map((evt) => `data: ${JSON.stringify(evt)}\n\n`)
      .concat("data: [DONE]\n\n");

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: streamOf(wire),
    }) as unknown as typeof fetch;

    const adapter = createGeminiChatAdapter();
    const results: ChatModelRunResult[] = [];
    const run = adapter.run({
      messages: [
        {
          id: "msg-1",
          role: "user",
          content: [{ type: "text", text: "hi" }],
          attachments: [],
          status: { type: "complete", reason: "unknown" },
          createdAt: new Date(),
          metadata: { custom: {} },
        },
      ],
      abortSignal: new AbortController().signal,
      threadId: "test-thread",
    } as unknown as Parameters<typeof adapter.run>[0]);

    if (Symbol.asyncIterator in run) {
      for await (const res of run as AsyncGenerator<ChatModelRunResult>) {
        results.push(res);
      }
    }

    const custom = results[results.length - 1]!.metadata?.custom as Record<
      string,
      unknown
    >;

    expect(custom.eventId).toBe("evt-1");
    expect(custom.invocationId).toBe("inv-1");
    expect(custom.modelVersion).toBe("gemini-flash-latest");
    expect(custom.nodePath).toBe("root_agent@1");
    expect(custom.thoughtSignature).toBe("sig-1");
    expect(custom.finishReason).toBe("STOP");
    expect(custom.actions).toEqual({ state_delta: { step: 1 } });
    expect((custom.usageMetadata as Record<string, unknown>).total_token_count).toBe(120);
    expect(custom.avgLogprobs).toBe(-0.5);
  });
});
