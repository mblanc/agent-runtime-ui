import { describe, expect, it, vi, beforeEach } from "vitest";
import { createGeminiChatAdapter } from "@/lib/adapters/chat-adapter";
import type { ChatModelRunResult } from "@assistant-ui/react";
import { groupTurnSessionEvents } from "@/lib/agent-runtime/event-normalizer";

/**
 * Regression tests for tool call/result pairing.
 *
 * Both the registration and the result-matching paths fell back to matching by
 * tool *name*. Two concurrent calls to the same tool — the normal case for a
 * parallel-tool-calling agent — therefore collapsed into one entry, and results
 * attached in arrival order rather than call order.
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

async function runAdapter(): Promise<ChatModelRunResult[]> {
  const adapter = createGeminiChatAdapter();
  const runResult = adapter.run({
    messages: [
      {
        id: "msg-1",
        role: "user",
        content: [{ type: "text", text: "compare two things" }],
        attachments: [],
        status: { type: "complete", reason: "unknown" },
        createdAt: new Date(),
        metadata: { custom: {} },
      },
    ],
    abortSignal: new AbortController().signal,
  } as unknown as Parameters<typeof adapter.run>[0]);

  const results: ChatModelRunResult[] = [];
  if (Symbol.asyncIterator in runResult) {
    for await (const res of runResult as AsyncGenerator<
      ChatModelRunResult,
      void,
      unknown
    >) {
      results.push(res);
    }
  }
  return results;
}

type ToolPart = {
  type: string;
  toolCallId: string;
  toolName: string;
  args?: Record<string, unknown>;
  result?: unknown;
};

function toolPartsOf(res: ChatModelRunResult[]): ToolPart[] {
  const last = res[res.length - 1]!;
  return (last.content || []).filter(
    (p: { type: string }) => p.type === "tool-call"
  ) as unknown as ToolPart[];
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("parallel calls to the same tool", () => {
  it("keeps two concurrent calls to one tool distinct", async () => {
    streamOf([
      'data: {"event_type":"tool_call","tool_call":{"id":"call-A","name":"search","args":{"q":"alpha"}}}\n\n',
      'data: {"event_type":"tool_call","tool_call":{"id":"call-B","name":"search","args":{"q":"beta"}}}\n\n',
      "data: [DONE]\n\n",
    ]);

    const parts = toolPartsOf(await runAdapter());

    expect(parts).toHaveLength(2);
    expect(new Set(parts.map((p) => p.toolCallId)).size).toBe(2);
    expect(parts.map((p) => p.args?.q).sort()).toEqual(["alpha", "beta"]);
  });

  it("routes each result to the call that produced it, not to arrival order", async () => {
    // B resolves first — the name-based fallback would attach B's result to A.
    streamOf([
      'data: {"event_type":"tool_call","tool_call":{"id":"call-A","name":"search","args":{"q":"alpha"}}}\n\n',
      'data: {"event_type":"tool_call","tool_call":{"id":"call-B","name":"search","args":{"q":"beta"}}}\n\n',
      'data: {"event_type":"tool_result","tool_result":{"id":"call-B","name":"search","result":{"hit":"beta-result"}}}\n\n',
      'data: {"event_type":"tool_result","tool_result":{"id":"call-A","name":"search","result":{"hit":"alpha-result"}}}\n\n',
      "data: [DONE]\n\n",
    ]);

    const parts = toolPartsOf(await runAdapter());
    const a = parts.find((p) => p.toolCallId === "call-A");
    const b = parts.find((p) => p.toolCallId === "call-B");

    expect(a?.args?.q).toBe("alpha");
    expect(b?.args?.q).toBe("beta");
    expect((a?.result as { hit: string })?.hit).toBe("alpha-result");
    expect((b?.result as { hit: string })?.hit).toBe("beta-result");
  });

  it("does not attach a result whose id matches no known call", async () => {
    streamOf([
      'data: {"event_type":"tool_call","tool_call":{"id":"call-A","name":"search","args":{"q":"alpha"}}}\n\n',
      'data: {"event_type":"tool_result","tool_result":{"id":"call-ZZZ","name":"search","result":{"hit":"stray"}}}\n\n',
      "data: [DONE]\n\n",
    ]);

    const parts = toolPartsOf(await runAdapter());
    const a = parts.find((p) => p.toolCallId === "call-A");

    // An id that is present but unknown must not silently name-match.
    expect((a?.result as { hit?: string })?.hit).not.toBe("stray");
  });

  it("routes each result to its own thinking-trace block, not just its tool part", async () => {
    // The trace used to be keyed by tool name while the tool-call panel was
    // keyed by id, so the two structures disagreed: both results landed on the
    // last same-named block and the other block stayed resultless.
    streamOf([
      'data: {"event_type":"tool_call","tool_call":{"id":"call-A","name":"search","args":{"q":"alpha"}}}\n\n',
      'data: {"event_type":"tool_call","tool_call":{"id":"call-B","name":"search","args":{"q":"beta"}}}\n\n',
      'data: {"event_type":"tool_result","tool_result":{"id":"call-B","name":"search","result":{"hit":"beta-result"}}}\n\n',
      'data: {"event_type":"tool_result","tool_result":{"id":"call-A","name":"search","result":{"hit":"alpha-result"}}}\n\n',
      "data: [DONE]\n\n",
    ]);

    const results = await runAdapter();
    const parts = toolPartsOf(results);
    const a = parts.find((p) => p.toolCallId === "call-A");
    const b = parts.find((p) => p.toolCallId === "call-B");
    expect((a?.result as { hit: string })?.hit).toBe("alpha-result");
    expect((b?.result as { hit: string })?.hit).toBe("beta-result");

    const last = results[results.length - 1]!;
    const reasoning = (last.content || [])
      .filter((p: { type: string }) => p.type === "reasoning")
      .map((p) => (p as unknown as { text: string }).text)
      .join("\n");

    const blocks = reasoning
      .split(":::tool[")
      .slice(1)
      .map((b) => b.split("\n:::")[0]!);

    expect(blocks).toHaveLength(2);

    const alphaBlock = blocks.find((b) => b.includes('"alpha"'))!;
    const betaBlock = blocks.find((b) => b.includes('"beta"'))!;
    expect(alphaBlock).toBeDefined();
    expect(betaBlock).toBeDefined();

    expect(alphaBlock).toContain("alpha-result");
    expect(alphaBlock).not.toContain("beta-result");
    expect(betaBlock).toContain("beta-result");
    expect(betaBlock).not.toContain("alpha-result");
  });
});

describe("backends that omit ids", () => {
  it("still pairs a single call and result by name", async () => {
    streamOf([
      'data: {"event_type":"tool_call","tool_call":{"name":"search","args":{"q":"alpha"}}}\n\n',
      'data: {"event_type":"tool_result","tool_result":{"name":"search","result":{"hit":"alpha-result"}}}\n\n',
      "data: [DONE]\n\n",
    ]);

    const parts = toolPartsOf(await runAdapter());

    expect(parts).toHaveLength(1);
    expect((parts[0]!.result as { hit: string })?.hit).toBe("alpha-result");
  });

  it("merges id-less calls to the same tool, an accepted ambiguity", async () => {
    // Without ids, two parallel calls are indistinguishable from one call
    // re-emitted with growing args. Merging keeps the re-emission case correct;
    // splitting would fix a hypothetical and break a real backend. The fix
    // therefore only applies where ids exist. Pinned so the choice is explicit.
    streamOf([
      'data: {"event_type":"tool_call","tool_call":{"name":"search","args":{"q":"alpha"}}}\n\n',
      'data: {"event_type":"tool_call","tool_call":{"name":"search","args":{"q":"beta"}}}\n\n',
      "data: [DONE]\n\n",
    ]);

    const parts = toolPartsOf(await runAdapter());

    expect(parts).toHaveLength(1);
  });

  it("keeps updating a single in-flight id-less call rather than duplicating it", async () => {
    // A backend that re-emits the same call with growing args must still yield
    // one entry — this is what the name-based merge existed to handle.
    streamOf([
      'data: {"event_type":"tool_call","tool_call":{"name":"search","args":{}}}\n\n',
      'data: {"event_type":"tool_result","tool_result":{"name":"search","result":{"hit":"done"}}}\n\n',
      "data: [DONE]\n\n",
    ]);

    const parts = toolPartsOf(await runAdapter());
    expect(parts).toHaveLength(1);
  });
});

describe("replay pairs the same way streaming does", () => {
  it("routes each result to its own call when ids are present", () => {
    const rawEvents = [
      {
        author: "USER",
        content: { parts: [{ text: "compare alpha and beta" }] },
        createTime: "2026-08-15T10:00:00Z",
      },
      {
        author: "AGENT",
        content: {
          parts: [
            { function_call: { id: "call-A", name: "search", args: { q: "alpha" } } },
            { function_call: { id: "call-B", name: "search", args: { q: "beta" } } },
          ],
        },
        createTime: "2026-08-15T10:00:01Z",
      },
      {
        author: "AGENT",
        content: {
          parts: [
            {
              function_response: {
                id: "call-B",
                name: "search",
                response: { hit: "beta-result" },
              },
            },
            {
              function_response: {
                id: "call-A",
                name: "search",
                response: { hit: "alpha-result" },
              },
            },
          ],
        },
        createTime: "2026-08-15T10:00:02Z",
      },
      {
        author: "AGENT",
        root_output: true,
        content: { parts: [{ text: "Both searched." }] },
        createTime: "2026-08-15T10:00:03Z",
      },
    ];

    const grouped = groupTurnSessionEvents(rawEvents, "s1");
    const assistant = grouped.find((g) => g.role === "assistant")!;
    const reasoning = assistant.thought || "";

    // Each tool block must carry the result belonging to its own arguments.
    const alphaIdx = reasoning.indexOf("alpha");
    const betaIdx = reasoning.indexOf("beta");
    expect(alphaIdx).toBeGreaterThan(-1);
    expect(betaIdx).toBeGreaterThan(-1);

    const alphaBlock = reasoning.slice(
      alphaIdx,
      betaIdx > alphaIdx ? betaIdx : undefined
    );
    expect(alphaBlock).toContain("alpha-result");
    expect(alphaBlock).not.toContain("beta-result");
  });
});
