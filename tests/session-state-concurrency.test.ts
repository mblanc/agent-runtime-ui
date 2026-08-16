import { beforeEach, describe, expect, it, vi } from "vitest";
import { VertexAiContext } from "@/lib/agent-runtime/services/context";
import { VertexAiSessionService } from "@/lib/agent-runtime/services/session-service";
import { VertexAiAgentService } from "@/lib/agent-runtime/services/agent-service";

/**
 * Regression tests for lost session-state updates.
 *
 * `updateSessionState("merge")` used to GET the whole state, merge locally and
 * PATCH the result back with updateMask=sessionState. The Session resource has
 * no etag, so two writers interleaving read-then-write silently discarded the
 * earlier write — and because the mask replaces the whole map, what was lost was
 * the entire state object rather than one key.
 *
 * The fix sends only the delta via :appendEvent and lets the server apply it.
 */

function makeService() {
  process.env.GOOGLE_CLOUD_PROJECT = "test-project";
  process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
  process.env.GOOGLE_REASONING_ENGINE_ID = "123456";
  const ctx = new VertexAiContext("123456", undefined, async () => "fake-token");
  return new VertexAiSessionService(ctx, new VertexAiAgentService(ctx));
}

interface Call {
  url: string;
  method: string;
  body: Record<string, unknown>;
}

/** Records every upstream call and serves `serverState` for reads. */
function mockUpstream(serverState: Record<string, unknown>) {
  const calls: Call[] = [];

  vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      calls.push({ url, method, body });

      if (url.includes(":appendEvent")) {
        // Mirror the server: apply the delta rather than replacing the map.
        Object.assign(serverState, body.actions?.stateDelta || {});
        return new Response("{}", { status: 200 });
      }

      if (method === "GET") {
        return new Response(JSON.stringify({ sessionState: serverState }), {
          status: 200,
        });
      }

      return new Response("{}", { status: 200 });
    }
  );

  return calls;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("merge mode", () => {
  it("sends only the changed keys, not the whole map", async () => {
    const server = { a: 1, b: 2 };
    const calls = mockUpstream(server);

    await makeService().updateSessionState("sess-1", { b: 99 }, "merge");

    const append = calls.find((c) => c.url.includes(":appendEvent"));
    expect(append).toBeDefined();
    expect(append!.method).toBe("POST");
    expect(append!.body.actions).toEqual({ stateDelta: { b: 99 } });
  });

  it("never issues a whole-map PATCH in merge mode", async () => {
    const calls = mockUpstream({ a: 1 });

    await makeService().updateSessionState("sess-1", { b: 2 }, "merge");

    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("preserves a writer that lands between our read and our write", async () => {
    // The actual interleaving that lost data. The competing write must arrive
    // AFTER our read is served — a read-modify-write then PATCHes a whole map
    // built from stale data and erases it. Simulated by mutating the server
    // state as soon as it has answered a GET.
    const server: Record<string, unknown> = { existing: "kept" };
    let reads = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method || "GET";
        const body = init?.body ? JSON.parse(String(init.body)) : {};

        if (url.includes(":appendEvent")) {
          Object.assign(server, body.actions?.stateDelta || {});
          return new Response("{}", { status: 200 });
        }

        if (method === "PATCH") {
          // Whole-map replace, exactly as updateMask=sessionState behaves.
          for (const k of Object.keys(server)) delete server[k];
          Object.assign(server, body.sessionState || {});
          return new Response("{}", { status: 200 });
        }

        const snapshot = JSON.stringify({ sessionState: { ...server } });
        if (++reads === 1) {
          server.fromOtherWriter = "must survive";
        }
        return new Response(snapshot, { status: 200 });
      }
    );

    await makeService().updateSessionState("sess-1", { mine: "added" }, "merge");

    expect(server.fromOtherWriter).toBe("must survive");
    expect(server.existing).toBe("kept");
    expect(server.mine).toBe("added");
  });

  it("returns the server's authoritative state, not an optimistic guess", async () => {
    const server: Record<string, unknown> = { serverOnly: "present" };
    mockUpstream(server);

    const result = await makeService().updateSessionState("s", { mine: 1 }, "merge");

    expect(result).toEqual({ serverOnly: "present", mine: 1 });
  });

  it("sends the fields the SessionEvent schema marks required", async () => {
    const calls = mockUpstream({});

    await makeService().updateSessionState("sess-1", { k: "v" }, "merge");
    const append = calls.find((c) => c.url.includes(":appendEvent"))!;

    expect(append.body.author).toBeTruthy();
    expect(append.body.invocationId).toBeTruthy();
    expect(typeof append.body.timestamp).toBe("string");
    expect(new Date(append.body.timestamp as string).toString()).not.toBe("Invalid Date");
  });

  it("surfaces an appendEvent failure rather than reporting success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("boom", { status: 500 })
    );

    await expect(
      makeService().updateSessionState("sess-1", { k: "v" }, "merge")
    ).rejects.toThrow(/append session state delta/i);
  });
});

describe("replace mode", () => {
  it("still PATCHes the whole map, which is what replace means", async () => {
    const calls = mockUpstream({ old: "value" });

    const result = await makeService().updateSessionState(
      "sess-1",
      { fresh: "only" },
      "replace"
    );

    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch).toBeDefined();
    expect(patch!.url).toContain("updateMask=sessionState");
    expect(patch!.body.sessionState).toEqual({ fresh: "only" });
    expect(result).toEqual({ fresh: "only" });
  });

  it("does not append an event in replace mode", async () => {
    const calls = mockUpstream({});

    await makeService().updateSessionState("s", { a: 1 }, "replace");

    expect(calls.some((c) => c.url.includes(":appendEvent"))).toBe(false);
  });
});
