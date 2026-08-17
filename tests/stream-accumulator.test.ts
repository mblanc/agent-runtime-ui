import { describe, expect, it, vi, afterEach } from "vitest";
import type { ChatModelRunResult, ThreadMessage } from "@assistant-ui/react";
import { StreamAccumulator } from "@/lib/adapters/stream-accumulator";
import type { AgentStreamEvent, ReasoningTraceEntry } from "@/types/agent";

/**
 * Unit tests for the streaming state machine.
 *
 * These used to be unreachable: the same logic lived inside the chat adapter's
 * `run()` generator, so every assertion about pairing, subagent lifecycle or
 * text flushing had to be made by driving a whole turn through a mocked
 * `fetch` and a hand-written SSE body. Here the events go in directly.
 */

type ToolCallPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
  status?: { type: string; reason?: string };
};

function toolCalls(snapshot: ChatModelRunResult): ToolCallPart[] {
  // Read through a local shape rather than assistant-ui's part union: these
  // assertions are about the fields the accumulator sets, not about the
  // library's exact part type.
  return (snapshot.content || []).filter(
    (p) => p.type === "tool-call"
  ) as unknown as ToolCallPart[];
}

function text(snapshot: ChatModelRunResult): string {
  const part = (snapshot.content || []).find((p) => p.type === "text");
  return part && part.type === "text" ? part.text : "";
}

function trace(snapshot: ChatModelRunResult): ReasoningTraceEntry[] {
  const custom = snapshot.metadata?.custom as
    { reasoningTrace?: ReasoningTraceEntry[] } | undefined;
  return custom?.reasoningTrace ?? [];
}

function custom(snapshot: ChatModelRunResult): Record<string, unknown> {
  return (snapshot.metadata?.custom ?? {}) as Record<string, unknown>;
}

function feed(acc: StreamAccumulator, events: AgentStreamEvent[]): string[] {
  return events.map((e) => acc.handle(e));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("StreamAccumulator — tool call/result pairing", () => {
  it("pairs a result to its call by toolCallId, leaving parallel calls untouched", () => {
    const acc = new StreamAccumulator();
    feed(acc, [
      {
        event_type: "tool_call",
        tool_call: { id: "tc-1", name: "search", args: { q: "a" } },
      },
      {
        event_type: "tool_call",
        tool_call: { id: "tc-2", name: "search", args: { q: "b" } },
      },
      {
        event_type: "tool_result",
        tool_result: { id: "tc-2", name: "search", result: { hits: 2 } },
      },
    ]);

    const calls = toolCalls(acc.snapshot());
    expect(calls).toHaveLength(2);

    const first = calls.find((c) => c.toolCallId === "tc-1")!;
    const second = calls.find((c) => c.toolCallId === "tc-2")!;
    expect(first.result).toBeUndefined();
    expect(first.status?.type).toBe("running");
    expect(second.result).toEqual({ hits: 2 });
    expect(second.status?.type).toBe("complete");

    // The reasoning trace pairs on the same id the panel did, not on name.
    const toolEntries = trace(acc.snapshot()).filter((e) => e.type === "tool");
    expect(toolEntries).toHaveLength(2);
    const traced1 = toolEntries.find(
      (e) => e.type === "tool" && e.toolCallId === "tc-1"
    )!;
    const traced2 = toolEntries.find(
      (e) => e.type === "tool" && e.toolCallId === "tc-2"
    )!;
    expect(traced1.type === "tool" && traced1.resultJson).toBeUndefined();
    expect(traced1.type === "tool" && traced1.status).toBe("running");
    expect(traced2.type === "tool" && traced2.resultJson).toContain('"hits": 2');
    expect(traced2.type === "tool" && traced2.status).toBe("complete");
  });

  it("never merges a second call that carries its own unknown id", () => {
    const acc = new StreamAccumulator();
    feed(acc, [
      {
        event_type: "tool_call",
        tool_call: { id: "tc-1", name: "search", args: { q: "a" } },
      },
      {
        event_type: "tool_call",
        tool_call: { id: "tc-2", name: "search", args: { q: "b" } },
      },
    ]);

    const calls = toolCalls(acc.snapshot());
    expect(calls.map((c) => c.toolCallId).sort()).toEqual(["tc-1", "tc-2"]);
    expect(calls.map((c) => c.args)).toEqual([{ q: "a" }, { q: "b" }]);
  });

  it("pairs an id-less result only against an id-less call in flight", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const acc = new StreamAccumulator();
    feed(acc, [
      { event_type: "tool_call", tool_call: { id: "tc-1", name: "search", args: {} } },
      { event_type: "tool_result", tool_result: { name: "search", result: { hits: 1 } } },
    ]);

    // The call with a backend id must not absorb it; the result becomes its
    // own orphan entry instead.
    const calls = toolCalls(acc.snapshot());
    const withId = calls.find((c) => c.toolCallId === "tc-1")!;
    expect(withId.result).toBeUndefined();
    expect(withId.status?.type).toBe("running");
    expect(calls).toHaveLength(2);
    expect(warn).toHaveBeenCalled();
  });

  it("completes tool calls and their trace entries still running at `done`", () => {
    const acc = new StreamAccumulator();
    feed(acc, [
      { event_type: "tool_call", tool_call: { id: "tc-1", name: "search", args: {} } },
    ]);
    expect(acc.handle({ event_type: "done" })).toBe("final");

    expect(toolCalls(acc.snapshot())[0]!.status?.type).toBe("complete");
    const entry = trace(acc.snapshot()).find((e) => e.type === "tool")!;
    expect(entry.type === "tool" && entry.status).toBe("complete");
  });
});

describe("StreamAccumulator — snapshot isolation", () => {
  it("does not mutate an already-yielded snapshot when a result lands", () => {
    const acc = new StreamAccumulator();
    acc.handle({
      event_type: "tool_call",
      tool_call: { id: "tc-1", name: "search", args: {} },
    });

    // A consumer holds onto this one — assistant-ui keeps yielded snapshots.
    const earlier = acc.snapshot();
    const earlierEntry = trace(earlier).find((e) => e.type === "tool")!;
    expect(earlierEntry.type === "tool" && earlierEntry.status).toBe("running");

    acc.handle({
      event_type: "tool_result",
      tool_result: { id: "tc-1", name: "search", result: { hits: 1 } },
    });

    // Trace entries are mutated in place as results arrive, so the trace has
    // to hand out copies: the snapshot above must still read "running".
    expect(earlierEntry.type === "tool" && earlierEntry.status).toBe("running");
    expect(earlierEntry.type === "tool" && earlierEntry.resultJson).toBeUndefined();

    const later = trace(acc.snapshot()).find((e) => e.type === "tool")!;
    expect(later.type === "tool" && later.status).toBe("complete");
  });

  it("does not mutate an already-yielded snapshot when a subagent completes", () => {
    const acc = new StreamAccumulator();
    acc.handle({ event_type: "agent_call", agent_call: { agent: "researcher" } });

    const earlier = acc.snapshot();
    const earlierSub = trace(earlier).find((e) => e.type === "subagent")!;

    acc.handle({ event_type: "done" });

    expect(earlierSub.type === "subagent" && earlierSub.status).toBe("running");
  });
});

describe("StreamAccumulator — subagent lifecycle", () => {
  it("runs a subagent, appends its response chunks, and completes it on `done`", () => {
    const acc = new StreamAccumulator();
    acc.handle({
      event_type: "agent_call",
      agent_call: { agent: "researcher", input: { topic: "x" } },
    });

    let sub = trace(acc.snapshot()).find((e) => e.type === "subagent")!;
    expect(sub.type === "subagent" && sub.status).toBe("running");
    expect(sub.type === "subagent" && sub.input).toContain('"topic": "x"');

    acc.handle({
      event_type: "agent_response",
      agent_response: { agent: "researcher", response: "part one " },
    });
    acc.handle({
      event_type: "agent_response",
      agent_response: { agent: "researcher", response: "part two" },
    });

    sub = trace(acc.snapshot()).find((e) => e.type === "subagent")!;
    expect(sub.type === "subagent" && sub.response).toBe("part one part two");
    expect(sub.type === "subagent" && sub.status).toBe("running");

    acc.handle({ event_type: "done" });
    sub = trace(acc.snapshot()).find((e) => e.type === "subagent")!;
    expect(sub.type === "subagent" && sub.status).toBe("complete");
  });

  it("completes the running subagent when a tool step starts", () => {
    const acc = new StreamAccumulator();
    feed(acc, [
      { event_type: "agent_call", agent_call: { agent: "researcher" } },
      { event_type: "tool_call", tool_call: { id: "tc-1", name: "search", args: {} } },
    ]);

    const sub = trace(acc.snapshot()).find((e) => e.type === "subagent")!;
    expect(sub.type === "subagent" && sub.status).toBe("complete");
  });

  it("completes the previous subagent when a different one starts", () => {
    const acc = new StreamAccumulator();
    feed(acc, [
      { event_type: "agent_call", agent_call: { agent: "first" } },
      { event_type: "agent_call", agent_call: { agent: "second" } },
    ]);

    const subs = trace(acc.snapshot()).filter((e) => e.type === "subagent");
    expect(subs).toHaveLength(2);
    expect(subs[0]!.type === "subagent" && subs[0]!.status).toBe("complete");
    expect(subs[1]!.type === "subagent" && subs[1]!.status).toBe("running");
  });
});

describe("StreamAccumulator — error branch", () => {
  it("finalises subagents BEFORE the snapshot the caller yields", () => {
    const acc = new StreamAccumulator();
    acc.handle({ event_type: "agent_call", agent_call: { agent: "researcher" } });

    const outcome = acc.handle({ event_type: "error", error: "boom" });
    expect(outcome).toBe("final");

    // The snapshot the consumer takes after `handle` returns "final" is the
    // one the user sees. A subagent still marked running there is a spinner
    // that never stops.
    const snapshot = acc.snapshot();
    const sub = trace(snapshot).find((e) => e.type === "subagent")!;
    expect(sub.type === "subagent" && sub.status).toBe("complete");
    expect(text(snapshot)).toContain("⚠️ **Agent Runtime Error:** boom");
  });

  it("keeps the text streamed so far and appends the error to it", () => {
    const acc = new StreamAccumulator();
    acc.handle({ event_type: "content", content: "Partial answer", partial: true });
    acc.handle({ event_type: "error", error: "boom" });

    expect(text(acc.snapshot())).toBe(
      "Partial answer\n\n⚠️ **Agent Runtime Error:** boom"
    );
  });
});

describe("StreamAccumulator — text segments", () => {
  it("flushes the in-flight partial segment exactly once on finalize", () => {
    const acc = new StreamAccumulator();
    acc.handle({ event_type: "content", content: "Hel", partial: true });
    acc.handle({ event_type: "content", content: "lo", partial: true });

    acc.finalize();
    expect(text(acc.snapshot())).toBe("Hello");
  });

  it("flushes the in-flight partial segment on a terminal event", () => {
    const acc = new StreamAccumulator();
    acc.handle({ event_type: "content", content: "Hello", partial: true });
    acc.handle({ event_type: "done" });

    expect(text(acc.snapshot())).toBe("Hello");
  });

  it("does not re-emit a finalised segment when a later chunk arrives", () => {
    const acc = new StreamAccumulator();
    acc.handle({ event_type: "content", content: "Hello", partial: true });
    acc.handle({ event_type: "content", content: "Hello", partial: false });
    acc.handle({ event_type: "content", content: " world", partial: true });
    acc.finalize();

    expect(text(acc.snapshot())).toBe("Hello world");
  });

  it("throttles high-frequency partials but still accumulates their text", () => {
    const acc = new StreamAccumulator();
    const outcomes = [
      acc.handle({ event_type: "content", content: "a", partial: true }),
      acc.handle({ event_type: "content", content: "b", partial: true }),
    ];

    expect(outcomes[0]).toBe("yield");
    expect(outcomes[1]).toBe("skip");
    acc.finalize();
    expect(text(acc.snapshot())).toBe("ab");
  });
});

describe("StreamAccumulator — carry-forward metadata", () => {
  it("keeps the last value seen for a field a later event omits", () => {
    const acc = new StreamAccumulator();
    feed(acc, [
      {
        event_type: "content",
        content: "hi",
        invocationId: "inv-1",
        modelVersion: "gemini-3-pro",
        avgLogprobs: 0,
        finishReason: "STOP",
        timestamp: 1700000000,
      },
      { event_type: "content", content: "!" },
    ]);

    const meta = custom(acc.snapshot());
    expect(meta.invocationId).toBe("inv-1");
    expect(meta.modelVersion).toBe("gemini-3-pro");
    // `??`, not `||`: a genuine 0 must survive.
    expect(meta.avgLogprobs).toBe(0);
    expect(meta.finishReason).toBe("STOP");
    expect(meta.timestamp).toBe(1700000000);
  });

  it("carries metadata forward across a terminal event", () => {
    const acc = new StreamAccumulator();
    acc.handle({ event_type: "content", content: "hi", eventId: "evt-1" });
    acc.handle({ event_type: "done" });

    expect(custom(acc.snapshot()).eventId).toBe("evt-1");
  });

  it("deduplicates retrieved memories across events", () => {
    const acc = new StreamAccumulator();
    feed(acc, [
      {
        event_type: "content",
        content: "hi",
        retrieved_memories: [{ id: "m1", fact: "likes tea", relevanceScore: 0.9 }],
      },
      {
        event_type: "content",
        content: "!",
        retrieved_memories: [
          { id: "m1", fact: "likes tea", relevanceScore: 0.9 },
          { id: "m2", fact: "lives in Paris", relevanceScore: 0.5 },
        ],
      },
    ]);

    const memories = custom(acc.snapshot()).retrievedMemories as Array<{ id: string }>;
    expect(memories.map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});

describe("StreamAccumulator — dispatch ordering", () => {
  it("handles a terminal event that also carries grounding metadata", () => {
    const acc = new StreamAccumulator();
    acc.handle({
      event_type: "tool_call",
      tool_call: { id: "tc-1", name: "search", args: {} },
    });

    const outcome = acc.handle({
      event_type: "done",
      groundingMetadata: {
        webSearchQueries: ["vertex ai"],
        groundingChunks: [{ web: { uri: "https://cloud.google.com", title: "GCP" } }],
      },
    });

    // The metadata-only branch must stay below the terminal cases, or this
    // event never reaches `done` and the tool spinner runs forever.
    expect(outcome).toBe("final");
    expect(toolCalls(acc.snapshot())[0]!.status?.type).toBe("complete");
    expect(custom(acc.snapshot()).groundingMetadata).toBeDefined();
  });

  it("yields on a metadata-only event that is not otherwise handled", () => {
    const acc = new StreamAccumulator();
    const outcome = acc.handle({
      groundingMetadata: {
        webSearchQueries: ["vertex ai"],
        groundingChunks: [{ web: { uri: "https://cloud.google.com", title: "GCP" } }],
      },
    });

    expect(outcome).toBe("yield");
  });

  it("skips an event it has nothing to do with", () => {
    const acc = new StreamAccumulator();
    expect(acc.handle({ event_type: "content", content: "" })).toBe("skip");
  });
});

describe("StreamAccumulator — prior-message tool results", () => {
  it("does not invent a tool call for a result whose call is in an earlier message", () => {
    const prior = [
      {
        id: "m1",
        role: "assistant",
        content: [
          { type: "tool-call", toolCallId: "tc-old", toolName: "search", args: {} },
        ],
      },
    ] as unknown as readonly ThreadMessage[];

    const acc = new StreamAccumulator(prior);
    acc.handle({
      event_type: "tool_result",
      tool_result: { id: "tc-old", name: "search", result: { hits: 1 } },
    });

    expect(toolCalls(acc.snapshot())).toHaveLength(0);
  });
});
