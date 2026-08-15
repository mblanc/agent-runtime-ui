import { describe, expect, it, vi, beforeEach } from "vitest";
import { createGeminiChatAdapter } from "@/lib/adapters/chat-adapter";
import type { ChatModelRunResult } from "@assistant-ui/react";

/**
 * Regression tests for the SSE dispatch ordering defect: `extractedMeta` is
 * computed for every event and its branch sat ABOVE `error` and `done` in the
 * else-if chain. A terminal event that also carried groundingMetadata — which
 * is exactly what a grounded final event carries — matched the metadata branch
 * and never reached its own handler, so tool spinners never completed and
 * backend errors were silently dropped.
 */

const GROUNDING = {
  webSearchQueries: ["vertex ai"],
  groundingChunks: [{ web: { uri: "https://cloud.google.com", title: "GCP" } }],
};

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
        content: [{ type: "text", text: "search something" }],
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

const TOOL_CALL_EVENT =
  'data: {"event_type":"tool_call","tool_call":{"id":"tc-1","name":"search","args":{"q":"x"}}}\n\n';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("terminal events carrying grounding metadata", () => {
  it("completes running tool statuses when `done` also carries groundingMetadata", async () => {
    streamOf([
      TOOL_CALL_EVENT,
      `data: {"event_type":"done","grounding_metadata":${JSON.stringify(GROUNDING)}}\n\n`,
      "data: [DONE]\n\n",
    ]);

    const results = await runAdapter();
    const last = results[results.length - 1]!;

    const toolParts = (last.content || []).filter(
      (p: { type: string }) => p.type === "tool-call"
    ) as Array<{ status?: { type: string } }>;

    expect(toolParts.length).toBeGreaterThan(0);
    for (const part of toolParts) {
      expect(part.status?.type).toBe("complete");
    }
  });

  it("leaves no running tool markers in the reasoning when `done` carries grounding", async () => {
    streamOf([
      TOOL_CALL_EVENT,
      `data: {"event_type":"done","grounding_metadata":${JSON.stringify(GROUNDING)}}\n\n`,
      "data: [DONE]\n\n",
    ]);

    const results = await runAdapter();
    const last = results[results.length - 1]!;

    const reasoning = (last.content || [])
      .filter((p: { type: string }) => p.type === "reasoning")
      .map((p) => (p as { text?: string }).text || "")
      .join("");

    expect(reasoning).not.toContain('status="running"');
  });

  it("still surfaces the error text when `error` also carries groundingMetadata", async () => {
    streamOf([
      `data: {"event_type":"error","error":"upstream exploded","grounding_metadata":${JSON.stringify(
        GROUNDING
      )}}\n\n`,
      "data: [DONE]\n\n",
    ]);

    const results = await runAdapter();
    const last = results[results.length - 1]!;

    const text = (last.content || [])
      .filter((p: { type: string }) => p.type === "text")
      .map((p) => (p as { text?: string }).text || "")
      .join("");

    expect(text).toContain("Agent Runtime Error");
    expect(text).toContain("upstream exploded");
  });

  it("still yields grounding metadata for a metadata-only event", async () => {
    // The relocated branch must keep doing its original job.
    streamOf([
      `data: {"event_type":"grounding","grounding_metadata":${JSON.stringify(
        GROUNDING
      )}}\n\n`,
      'data: {"event_type":"content","content":"answer"}\n\n',
      "data: [DONE]\n\n",
    ]);

    const results = await runAdapter();
    const last = results[results.length - 1]!;
    const custom = last.metadata?.custom as Record<string, unknown>;

    expect(custom.groundingMetadata).toBeDefined();
  });

  it("still attaches grounding metadata from a grounded `done` event", async () => {
    streamOf([
      'data: {"event_type":"content","content":"answer"}\n\n',
      `data: {"event_type":"done","grounding_metadata":${JSON.stringify(GROUNDING)}}\n\n`,
      "data: [DONE]\n\n",
    ]);

    const results = await runAdapter();
    const last = results[results.length - 1]!;
    const custom = last.metadata?.custom as Record<string, unknown>;

    expect(custom.groundingMetadata).toBeDefined();
  });
});
