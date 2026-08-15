import { beforeEach, describe, expect, it, vi } from "vitest";
import { VertexAiContext } from "@/lib/agent-runtime/services/context";
import { VertexAiMemoryService } from "@/lib/agent-runtime/services/memory-service";

/**
 * Regression tests for the IDOR where updateMemory/deleteMemory mutated any
 * memoryId without ever checking who owned it.
 */

const OWNER = "user-owner";
const ATTACKER = "user-attacker";

function makeService() {
  process.env.GOOGLE_CLOUD_PROJECT = "test-project";
  process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
  process.env.GOOGLE_REASONING_ENGINE_ID = "123456";
  const ctx = new VertexAiContext("123456", undefined, async () => "fake-token");
  return new VertexAiMemoryService(ctx);
}

/** Responds to the ownership GET with `record`, and records any mutation. */
function mockUpstream(record: Record<string, unknown> | null) {
  const mutations: Array<{ method: string; url: string }> = [];

  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method || "GET";
      const url = String(input);

      if (method === "GET") {
        if (!record) return new Response("not found", { status: 404 });
        return new Response(JSON.stringify(record), { status: 200 });
      }

      mutations.push({ method, url });
      return new Response(JSON.stringify(record ?? {}), { status: 200 });
    });

  return { fetchSpy, mutations };
}

const ownedByOwner = {
  name: "projects/p/locations/us-central1/reasoningEngines/123456/memories/m1",
  fact: "the owner's secret",
  scope: { user_id: OWNER, app_name: "app" },
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("updateMemory ownership", () => {
  it("rejects an update of another user's memory and issues no PATCH", async () => {
    const svc = makeService();
    const { mutations } = mockUpstream(ownedByOwner);

    await expect(svc.updateMemory(ATTACKER, "m1", "rewritten")).rejects.toThrow(
      /Unauthorized/
    );
    expect(mutations).toHaveLength(0);
  });

  it("allows the owner to update their own memory", async () => {
    const svc = makeService();
    const { mutations } = mockUpstream(ownedByOwner);

    await svc.updateMemory(OWNER, "m1", "rewritten");

    expect(mutations).toHaveLength(1);
    expect(mutations[0]!.method).toBe("PATCH");
  });

  it("reports a missing memory as not found rather than mutating", async () => {
    const svc = makeService();
    const { mutations } = mockUpstream(null);

    await expect(svc.updateMemory(OWNER, "m1", "rewritten")).rejects.toThrow(/not found/);
    expect(mutations).toHaveLength(0);
  });
});

describe("deleteMemory ownership", () => {
  it("rejects a delete of another user's memory and issues no DELETE", async () => {
    const svc = makeService();
    const { mutations } = mockUpstream(ownedByOwner);

    await expect(svc.deleteMemory(ATTACKER, "m1")).rejects.toThrow(/Unauthorized/);
    expect(mutations).toHaveLength(0);
  });

  it("allows the owner to delete their own memory", async () => {
    const svc = makeService();
    const { mutations } = mockUpstream(ownedByOwner);

    await svc.deleteMemory(OWNER, "m1");

    expect(mutations).toHaveLength(1);
    expect(mutations[0]!.method).toBe("DELETE");
  });

  it("stays idempotent when the memory is already gone", async () => {
    const svc = makeService();
    const { mutations } = mockUpstream(null);

    await expect(svc.deleteMemory(OWNER, "m1")).resolves.toBeUndefined();
    expect(mutations).toHaveLength(0);
  });
});

describe("ownership check fails closed", () => {
  // normalizeMemoryRecord substitutes the caller's own id when a record has no
  // scope, so an ownership check routed through it would pass for everyone.
  it("denies a record whose owner cannot be determined", async () => {
    const svc = makeService();
    const { mutations } = mockUpstream({ name: "m1", fact: "unscoped" });

    await expect(svc.deleteMemory(ATTACKER, "m1")).rejects.toThrow(/Unauthorized/);
    await expect(svc.updateMemory(ATTACKER, "m1", "x")).rejects.toThrow(/Unauthorized/);
    expect(mutations).toHaveLength(0);
  });

  it("denies an unscoped record even for the very first caller", async () => {
    const svc = makeService();
    const { mutations } = mockUpstream({ name: "m1", fact: "unscoped" });

    await expect(svc.deleteMemory(OWNER, "m1")).rejects.toThrow(/Unauthorized/);
    expect(mutations).toHaveLength(0);
  });

  it("accepts the snake_case and camelCase spellings Vertex may return", async () => {
    for (const record of [
      { name: "m1", scope: { user_id: OWNER } },
      { name: "m1", scope: { userId: OWNER } },
      { name: "m1", user_id: OWNER },
      { name: "m1", userId: OWNER },
    ]) {
      const svc = makeService();
      const { mutations } = mockUpstream(record);

      await svc.deleteMemory(OWNER, "m1");
      expect(mutations).toHaveLength(1);
      vi.restoreAllMocks();
    }
  });
});
