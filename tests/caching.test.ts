import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TtlCache, memoize } from "@/lib/agent-runtime/services/ttl-cache";
import { VertexAiContext } from "@/lib/agent-runtime/services/context";
import {
  VertexAiAgentService,
  clearAgentCaches,
} from "@/lib/agent-runtime/services/agent-service";
import {
  createAgentRuntimeProvider,
  clearProviderCache,
} from "@/lib/agent-runtime/factory";

/**
 * listAgents was re-fetched from Vertex on every call — including from
 * resolveEngineIdAsync, which runs for any request naming an agent by display
 * name — and every route built a fresh provider, so each request created a new
 * GoogleAuth client and defeated its per-instance token cache.
 */

const SAVED = { ...process.env };

beforeEach(() => {
  vi.restoreAllMocks();
  clearAgentCaches();
  clearProviderCache();
  process.env.GOOGLE_CLOUD_PROJECT = "test-project";
  process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
  process.env.GOOGLE_REASONING_ENGINE_ID = "123456";
  delete process.env.MOCK_AGENT_RUNTIME;
});

afterEach(() => {
  process.env = { ...SAVED };
  clearAgentCaches();
  clearProviderCache();
});

describe("TtlCache", () => {
  it("returns a stored value and forgets it once expired", () => {
    const cache = new TtlCache<string>(50);
    cache.set("k", "v");
    expect(cache.get("k")).toBe("v");

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 1000);
    expect(cache.get("k")).toBeUndefined();
  });

  it("sweeps expired entries on write, so it cannot grow without bound", () => {
    const cache = new TtlCache<string>(50);
    const base = Date.now();
    cache.set("a", "1");
    cache.set("b", "2");
    expect(cache.size).toBe(2);

    vi.spyOn(Date, "now").mockReturnValue(base + 1000);
    cache.set("c", "3");

    expect(cache.size).toBe(1);
    expect(cache.get("c")).toBe("3");
  });
});

describe("memoize", () => {
  it("collapses concurrent cold calls into one upstream request", async () => {
    const cache = new TtlCache<Promise<number>>(1000);
    let calls = 0;
    const factory = async () => {
      calls++;
      await new Promise((r) => setTimeout(r, 10));
      return 42;
    };

    const results = await Promise.all([
      memoize(cache, "k", factory),
      memoize(cache, "k", factory),
      memoize(cache, "k", factory),
    ]);

    expect(results).toEqual([42, 42, 42]);
    expect(calls).toBe(1);
  });

  it("does not cache a rejection, so a blip is not served for the whole TTL", async () => {
    const cache = new TtlCache<Promise<string>>(60_000);
    let calls = 0;
    const flaky = async () => {
      calls++;
      if (calls === 1) throw new Error("transient");
      return "recovered";
    };

    await expect(memoize(cache, "k", flaky)).rejects.toThrow("transient");
    await expect(memoize(cache, "k", flaky)).resolves.toBe("recovered");
    expect(calls).toBe(2);
  });
});

describe("listAgents memoisation", () => {
  function agentService() {
    const ctx = new VertexAiContext("123456", undefined, async () => "fake-token");
    return new VertexAiAgentService(ctx);
  }

  function mockVertex() {
    return vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          reasoningEngines: [
            {
              name: "projects/p/locations/us-central1/reasoningEngines/999",
              displayName: "Research Agent",
            },
          ],
        }),
        { status: 200 }
      )
    );
  }

  it("fetches once across repeated calls", async () => {
    const spy = mockVertex();
    const svc = agentService();

    await svc.listAgents();
    await svc.listAgents();
    await svc.listAgents();

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("refetches once the entry expires", async () => {
    const spy = mockVertex();
    const svc = agentService();
    const base = Date.now();

    await svc.listAgents();
    vi.spyOn(Date, "now").mockReturnValue(base + 61_000);
    await svc.listAgents();

    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("still resolves a display name to an engine id through the cache", async () => {
    mockVertex();
    const ctx = new VertexAiContext("123456", undefined, async () => "fake-token");
    const svc = new VertexAiAgentService(ctx);

    await svc.listAgents();

    expect(ctx.resolveEngineId("Research Agent")).toBe("999");
    expect(ctx.resolveEngineId("research agent")).toBe("999");
    expect(ctx.resolveEngineId("research-agent")).toBe("999");
  });
});

describe("provider memoisation", () => {
  it("reuses one provider for the same agent and location", () => {
    const a = createAgentRuntimeProvider("123456", "us-central1");
    const b = createAgentRuntimeProvider("123456", "us-central1");
    expect(a).toBe(b);
  });

  it("keeps different routing pairs apart", () => {
    const a = createAgentRuntimeProvider("123456", "us-central1");
    const b = createAgentRuntimeProvider("123456", "europe-west4");
    const c = createAgentRuntimeProvider("999", "us-central1");

    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("never shares a provider built with a caller-supplied token", () => {
    // A tokenGetter is per-request identity; sharing it would serve one
    // caller's credentials to another.
    const getter = async () => "caller-token";
    const a = createAgentRuntimeProvider("123456", "us-central1", getter);
    const b = createAgentRuntimeProvider("123456", "us-central1", getter);

    expect(a).not.toBe(b);
  });

  it("rejects a hostile location before it can become a cache key", () => {
    expect(() => createAgentRuntimeProvider("123456", "evil.com/x#")).toThrow();
  });
});
