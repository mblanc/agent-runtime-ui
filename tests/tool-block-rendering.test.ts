import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createGeminiChatAdapter,
  sanitizeDirectiveName,
} from "@/lib/adapters/chat-adapter";
import type { ChatModelRunResult } from "@assistant-ui/react";

/**
 * Reasoning markdown is now rendered from structured entries once per yield.
 *
 * These replace the direct tests of appendToolResultToReasoning and
 * appendAgentResponseToReasoning, which edited rendered markdown in place with a
 * RegExp built from the model-supplied name. Those helpers are gone; the
 * behaviours they covered are asserted here against the rendered output, which
 * is what the UI actually consumes.
 */

function streamOf(chunks: string[]) {
  let i = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(new TextEncoder().encode(chunks[i]!));
        i++;
      } else {
        controller.close();
      }
    },
  });
  global.fetch = vi.fn().mockResolvedValue({ ok: true, body }) as unknown as typeof fetch;
}

async function reasoningOf(chunks: string[]): Promise<string> {
  streamOf(chunks);
  const adapter = createGeminiChatAdapter();
  const run = adapter.run({
    messages: [
      {
        id: "m1",
        role: "user",
        content: [{ type: "text", text: "go" }],
        attachments: [],
        status: { type: "complete", reason: "unknown" },
        createdAt: new Date(),
        metadata: { custom: {} },
      },
    ],
    abortSignal: new AbortController().signal,
  } as unknown as Parameters<typeof adapter.run>[0]);

  const results: ChatModelRunResult[] = [];
  if (Symbol.asyncIterator in run) {
    for await (const r of run as AsyncGenerator<ChatModelRunResult, void, unknown>) {
      results.push(r);
    }
  }
  const last = results[results.length - 1]!;
  return (last.content || [])
    .filter((p: { type: string }) => p.type === "reasoning")
    .map((p) => (p as { text?: string }).text || "")
    .join("");
}

const CALL = (name: string, args: Record<string, unknown> = { q: "x" }) =>
  `data: {"event_type":"tool_call","tool_call":{"id":"c1","name":${JSON.stringify(name)},"args":${JSON.stringify(args)}}}\n\n`;
const RESULT = (name: string, result: unknown) =>
  `data: {"event_type":"tool_result","tool_result":{"id":"c1","name":${JSON.stringify(name)},"result":${JSON.stringify(result)}}}\n\n`;
const DONE = 'data: {"event_type":"done"}\n\n';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("tool block rendering", () => {
  it("moves a running block to complete when its result arrives", async () => {
    const reasoning = await reasoningOf([
      CALL("search"),
      RESULT("search", { hits: 2 }),
      DONE,
      "data: [DONE]\n\n",
    ]);

    expect(reasoning).toContain(':::tool[search]{status="complete"}');
    expect(reasoning).not.toContain('status="running"');
    expect(reasoning).toContain('"hits": 2');
  });

  it("keeps arguments and result in the same single block", async () => {
    const reasoning = await reasoningOf([
      CALL("search", { q: "vertex" }),
      RESULT("search", { ok: true }),
      DONE,
      "data: [DONE]\n\n",
    ]);

    expect(reasoning.match(/:::tool\[search\]/g)).toHaveLength(1);
    expect(reasoning).toContain("**Arguments:**");
    expect(reasoning).toContain("**Result:**");
  });

  it("does not duplicate a block when a result arrives twice", async () => {
    const reasoning = await reasoningOf([
      CALL("search"),
      RESULT("search", { n: 1 }),
      RESULT("search", { n: 2 }),
      DONE,
      "data: [DONE]\n\n",
    ]);

    expect(reasoning.match(/:::tool\[search\]/g)).toHaveLength(1);
  });

  it("completes a requires-action block cleanly", async () => {
    const reasoning = await reasoningOf([
      'data: {"event_type":"tool_call","tool_call":{"id":"c1","name":"adk_request_confirmation","args":{}}}\n\n',
      RESULT("adk_request_confirmation", { confirmed: true }),
      DONE,
      "data: [DONE]\n\n",
    ]);

    expect(reasoning).toContain('status="complete"');
    expect(reasoning).not.toContain('status="requires-action"');
  });

  it("sweeps a still-running tool to complete on done", async () => {
    const reasoning = await reasoningOf([CALL("search"), DONE, "data: [DONE]\n\n"]);
    expect(reasoning).not.toContain('status="running"');
  });
});

describe("result content cannot corrupt its own block", () => {
  it("survives a result containing the block terminator", async () => {
    // The old in-place regex edit could be terminated early by this.
    const reasoning = await reasoningOf([
      CALL("search"),
      RESULT("search", { text: "line\n:::\nmore" }),
      DONE,
      "data: [DONE]\n\n",
    ]);

    expect(reasoning.match(/:::tool\[search\]/g)).toHaveLength(1);
    expect(reasoning).toContain('status="complete"');
  });

  it("survives a result containing a status attribute", async () => {
    const reasoning = await reasoningOf([
      CALL("search"),
      RESULT("search", { note: 'status="running"' }),
      DONE,
      "data: [DONE]\n\n",
    ]);

    // The literal text is preserved inside the result, and the block's own
    // status is still complete — a string replaceAll would have rewritten both.
    expect(reasoning).toContain(':::tool[search]{status="complete"}');
  });
});

describe("sanitizeDirectiveName", () => {
  it("strips characters that would break out of a directive", () => {
    expect(sanitizeDirectiveName('evil]{status="x"}')).not.toContain("]");
    expect(sanitizeDirectiveName('evil]{status="x"}')).not.toContain('"');
    expect(sanitizeDirectiveName("a:::b")).not.toContain(":");
  });

  it("leaves ordinary names alone", () => {
    expect(sanitizeDirectiveName("search")).toBe("search");
    expect(sanitizeDirectiveName("fetch_public_claims")).toBe("fetch_public_claims");
  });

  it("never returns an empty label", () => {
    expect(sanitizeDirectiveName(":::")).toBe("tool");
    expect(sanitizeDirectiveName("   ")).toBe("tool");
  });

  it("keeps a crafted tool name from injecting a directive", async () => {
    const reasoning = await reasoningOf([
      CALL('x]{status="complete"}\n:::\n:::tool[injected'),
      DONE,
      "data: [DONE]\n\n",
    ]);

    expect(reasoning).not.toContain(":::tool[injected");
  });
});

describe("subagent block rendering", () => {
  it("accumulates streaming response chunks into one block", async () => {
    // Replaces the direct appendAgentResponseToReasoning test: subagent state
    // lives in a map and renders once per yield, so repeated chunks append to
    // the same block rather than being spliced into markdown by regex.
    const reasoning = await reasoningOf([
      'data: {"event_type":"agent_call","agent_call":{"name":"member_1","args":{"task":"Analyze AI History"}}}\n\n',
      'data: {"event_type":"agent_response","agent_response":{"name":"member_1","response":"In 1950, "}}\n\n',
      'data: {"event_type":"agent_response","agent_response":{"name":"member_1","response":"Alan Turing proposed the Turing Test."}}\n\n',
      DONE,
      "data: [DONE]\n\n",
    ]);

    expect(reasoning.match(/:::subagent\[/g)).toHaveLength(1);
    expect(reasoning).toContain("In 1950, Alan Turing proposed the Turing Test.");
    expect(reasoning).toContain('status="complete"');
    expect(reasoning).not.toContain('status="running"');
  });
});
