import { describe, expect, it, vi, afterEach } from "vitest";
import type { ChatModelRunResult } from "@assistant-ui/react";

/**
 * One bad SSE frame must not end the turn.
 *
 * The adapter has always wrapped a whole frame — decode *and* dispatch — in a
 * single guard that logs "Malformed or non-JSON SSE payload ignored" and moves
 * on to the next frame. When decode and dispatch were split into a transport
 * module and a state machine, that guard had to be split with them without
 * narrowing; these tests pin both halves.
 *
 * `data: null` is the concrete trigger for the decode half: it parses
 * perfectly well and then throws on the first property read.
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
  const { createGeminiChatAdapter } = await import("@/lib/adapters/chat-adapter");
  const adapter = createGeminiChatAdapter();
  const runResult = adapter.run({
    messages: [],
    abortSignal: new AbortController().signal,
  } as unknown as Parameters<typeof adapter.run>[0]);

  const results: ChatModelRunResult[] = [];
  for await (const res of runResult as AsyncGenerator<
    ChatModelRunResult,
    void,
    unknown
  >) {
    results.push(res);
  }
  return results;
}

function text(snapshot: ChatModelRunResult): string {
  const part = (snapshot.content || []).find((p) => p.type === "text");
  return part && part.type === "text" ? part.text : "";
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock("@/lib/adapters/stream-accumulator");
  vi.resetModules();
});

describe("malformed frame guard", () => {
  it("drops a `data: null` frame and keeps streaming the ones around it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    streamOf([
      'data: {"event_type":"content","content":"before"}\n\n',
      "data: null\n\n",
      'data: {"event_type":"content","content":" after"}\n\n',
    ]);

    const results = await runAdapter();

    expect(results.map(text)).toEqual(["before", "before after", "before after"]);
    expect(warn).toHaveBeenCalledWith(
      "[createGeminiChatAdapter] Malformed or non-JSON SSE payload ignored:",
      "null",
      expect.any(TypeError)
    );
  });

  it("drops a frame whose payload is not JSON at all", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    streamOf([
      'data: {"event_type":"content","content":"before"}\n\n',
      "data: {not json\n\n",
      'data: {"event_type":"content","content":" after"}\n\n',
    ]);

    const results = await runAdapter();

    expect(results.map(text)).toEqual(["before", "before after", "before after"]);
    expect(warn).toHaveBeenCalledWith(
      "[createGeminiChatAdapter] Malformed or non-JSON SSE payload ignored:",
      "{not json",
      expect.any(Error)
    );
  });

  it("drops a frame the state machine throws on, and dispatches the next one", async () => {
    // The decode half is fine here; it is the dispatch that blows up. Only a
    // guard that still spans dispatch — which now lives on the far side of the
    // transport generator — keeps the turn alive.
    vi.resetModules();
    vi.doMock("@/lib/adapters/stream-accumulator", () => ({
      StreamAccumulator: class {
        private seen: string[] = [];
        handle(event: { content?: string }): string {
          if (event.content === "boom") throw new Error("dispatch exploded");
          if (event.content) this.seen.push(event.content);
          return "yield";
        }
        finalize(): void {}
        snapshot(): ChatModelRunResult {
          return { content: [{ type: "text", text: this.seen.join("") }] };
        }
      },
    }));

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    streamOf([
      'data: {"event_type":"content","content":"before"}\n\n',
      'data: {"event_type":"content","content":"boom"}\n\n',
      'data: {"event_type":"content","content":" after"}\n\n',
    ]);

    const results = await runAdapter();

    expect(results.map(text)).toEqual(["before", "before after", "before after"]);
    expect(warn).toHaveBeenCalledWith(
      "[createGeminiChatAdapter] Malformed or non-JSON SSE payload ignored:",
      '{"event_type":"content","content":"boom"}',
      expect.any(Error)
    );
  });

  it("does not swallow an abort as a malformed frame", async () => {
    const controller = new AbortController();
    const body = new ReadableStream({
      pull() {
        controller.abort();
        return Promise.reject(
          Object.assign(new Error("The user aborted a request."), {
            name: "AbortError",
          })
        );
      },
    });
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, body }) as unknown as typeof fetch;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { createGeminiChatAdapter } = await import("@/lib/adapters/chat-adapter");
    const adapter = createGeminiChatAdapter();
    const runResult = adapter.run({
      messages: [],
      abortSignal: controller.signal,
    } as unknown as Parameters<typeof adapter.run>[0]);

    const results: ChatModelRunResult[] = [];
    for await (const res of runResult as AsyncGenerator<
      ChatModelRunResult,
      void,
      unknown
    >) {
      results.push(res);
    }

    // An abort ends the turn silently: no frames, no malformed-frame warning.
    expect(results).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});
