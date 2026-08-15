import { beforeEach, describe, expect, it, vi } from "vitest";
import { VertexAiContext } from "@/lib/agent-runtime/services/context";
import { MockAgentRuntimeProvider } from "@/lib/agent-runtime/mock/mock-provider";
import type { AgentStreamEvent } from "@/types/agent";

/**
 * Regression tests for the missing timeouts and the leaked upstream stream:
 * fetchWithAuth passed no signal at all, and /api/chat's cancel() only set a
 * boolean, so a client closing the tab left the Vertex generation running to
 * completion — billed, holding a request slot.
 */

function makeContext() {
  process.env.GOOGLE_CLOUD_PROJECT = "test-project";
  process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
  process.env.GOOGLE_REASONING_ENGINE_ID = "123456";
  return new VertexAiContext("123456", undefined, async () => "fake-token");
}

const URL_OK = "https://us-central1-aiplatform.googleapis.com/v1beta1/projects/p";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("fetchWithAuth timeouts", () => {
  it("attaches a signal to ordinary calls, which previously had none", async () => {
    const ctx = makeContext();
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await ctx.fetchWithAuth(URL_OK);

    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal!.aborted).toBe(false);
  });

  it("does not impose the default timeout on streaming calls", async () => {
    const ctx = makeContext();
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await ctx.fetchWithAuth(URL_OK, {}, { streaming: true });

    const init = spy.mock.calls[0]![1] as RequestInit;
    // No caller signal and no default timeout => nothing bounding the stream
    // except the caller, which is the point: a long generation must not be cut.
    expect(init.signal ?? undefined).toBeUndefined();
  });

  it("preserves a caller signal on a streaming call", async () => {
    const ctx = makeContext();
    const controller = new AbortController();
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await ctx.fetchWithAuth(URL_OK, { signal: controller.signal }, { streaming: true });

    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(init.signal).toBe(controller.signal);
  });

  it("aborts a non-streaming call when the caller's signal fires", async () => {
    const ctx = makeContext();
    const controller = new AbortController();
    const spy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await ctx.fetchWithAuth(URL_OK, { signal: controller.signal });
    const init = spy.mock.calls[0]![1] as RequestInit;

    expect(init.signal!.aborted).toBe(false);
    controller.abort();
    // The composed signal must follow the caller's, not just the timeout.
    expect(init.signal!.aborted).toBe(true);
  });
});

describe("streamQuery abort propagation", () => {
  it("stops producing events once the signal is aborted", async () => {
    const provider = new MockAgentRuntimeProvider();
    const controller = new AbortController();

    const received: AgentStreamEvent[] = [];
    let aborted = false;

    try {
      for await (const evt of provider.streamQuery(
        { messages: [{ role: "user", content: "tell me about vertex ai specs" }] },
        "test-user",
        controller.signal
      )) {
        received.push(evt);
        if (received.length === 2) controller.abort();
      }
    } catch (err) {
      aborted = (err as Error).name === "AbortError";
    }

    expect(aborted).toBe(true);
    // Without abort support the mock would run its whole canned generation.
    expect(received.length).toBeLessThan(20);
  });

  it("runs to completion when never aborted", async () => {
    const provider = new MockAgentRuntimeProvider();
    const received: AgentStreamEvent[] = [];

    for await (const evt of provider.streamQuery(
      { messages: [{ role: "user", content: "hello" }] },
      "test-user",
      new AbortController().signal
    )) {
      received.push(evt);
    }

    expect(received.length).toBeGreaterThan(0);
    expect(received[received.length - 1]!.event_type).toBe("done");
  });

  it("refuses to start when handed an already-aborted signal", async () => {
    const provider = new MockAgentRuntimeProvider();
    const controller = new AbortController();
    controller.abort();

    let aborted = false;
    const received: AgentStreamEvent[] = [];
    try {
      for await (const evt of provider.streamQuery(
        { messages: [{ role: "user", content: "hello" }] },
        "test-user",
        controller.signal
      )) {
        received.push(evt);
      }
    } catch (err) {
      aborted = (err as Error).name === "AbortError";
    }

    expect(aborted).toBe(true);
  });
});
