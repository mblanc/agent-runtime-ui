import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as listSessions, POST as createSession } from "@/app/api/sessions/route";
import { auth } from "@/lib/auth";
import { clearProviderCache } from "@/lib/agent-runtime/factory";
import {
  VertexAiContext,
  InvalidRoutingParameterError,
  assertValidLocation,
  assertValidEngineResource,
  engineDisplayNameCache,
} from "@/lib/agent-runtime/services/context";
import { VertexAiStreamingService } from "@/lib/agent-runtime/services/streaming-service";
import { VertexAiSessionService } from "@/lib/agent-runtime/services/session-service";
import { VertexAiMemoryService } from "@/lib/agent-runtime/services/memory-service";
import { VertexAiFeedbackService } from "@/lib/agent-runtime/services/feedback-service";
import { VertexAiAgentService } from "@/lib/agent-runtime/services/agent-service";

/**
 * Regression tests for the SSRF vector where a client-supplied `location`
 * (or the location segment of a client-supplied resource name) is interpolated
 * into the *hostname* of the upstream URL, and `fetchWithAuth` then attaches a
 * cloud-platform-scoped access token to whatever host that produced.
 */

// `attacker.example.com/x#` truncates the rest of the URL into a fragment, so
// `https://${loc}-aiplatform.googleapis.com/...` resolves to attacker.example.com.
const EVIL_LOCATION = "attacker.example.com/x#";

// The resource-name parsers capture the location with `([^/]+)`, so a payload
// containing a slash never matches them and falls through harmlessly. The
// vector through a resource name needs a slash-free payload, where the `#`
// alone is enough to truncate the intended host into a fragment.
const EVIL_LOCATION_SEGMENT = "evil.com#";

function makeContext(overrideEngineId?: string, overrideLocation?: string) {
  return new VertexAiContext(
    overrideEngineId,
    overrideLocation,
    async () => "fake-token"
  );
}

beforeEach(() => {
  process.env.GOOGLE_CLOUD_PROJECT = "test-project";
  process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
  process.env.GOOGLE_REASONING_ENGINE_ID = "123456";
});

describe("routing parameter validators", () => {
  it("accepts every location shape the UI legitimately produces", () => {
    for (const loc of [
      "us-central1",
      "europe-west4",
      "asia-northeast1",
      "northamerica-northeast1",
      "australia-southeast1",
      "me-west1",
      "global",
    ]) {
      expect(assertValidLocation(loc)).toBe(loc);
    }
  });

  it("rejects locations that would escape the hostname", () => {
    for (const loc of [
      EVIL_LOCATION,
      "evil.com",
      "us-central1.evil.com",
      "us-central1/../../evil",
      "us-central1#",
      "us-central1?x=1",
      "us-central1@evil.com",
      "US-CENTRAL1",
      "",
    ]) {
      expect(() => assertValidLocation(loc)).toThrow(InvalidRoutingParameterError);
    }
  });

  it("accepts bare ids, display names and full resource paths as engines", () => {
    for (const engine of [
      "123456",
      "industry-watch",
      "test-engine-123",
      "projects/test-project/locations/us-central1/reasoningEngines/123456",
    ]) {
      expect(assertValidEngineResource(engine)).toBe(engine);
    }
  });

  it("rejects engine values containing traversal or URL control characters", () => {
    for (const engine of [
      "../../evil",
      "123/../../evil",
      "123?x=1",
      "123#frag",
      "projects/p/locations/evil.com#/reasoningEngines/1",
    ]) {
      expect(() => assertValidEngineResource(engine)).toThrow(
        InvalidRoutingParameterError
      );
    }
  });
});

describe("VertexAiContext", () => {
  it("rejects a hostile location passed as the constructor override", () => {
    expect(() => makeContext("123456", EVIL_LOCATION)).toThrow(
      InvalidRoutingParameterError
    );
  });

  it("still accepts a legitimate location override", () => {
    expect(makeContext("123456", "europe-west4").location).toBe("europe-west4");
  });

  it("refuses to attach the access token to a non-googleapis host", async () => {
    const ctx = makeContext("123456");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(ctx.fetchWithAuth("https://attacker.example.com/steal")).rejects.toThrow(
      InvalidRoutingParameterError
    );
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("rejects a host that merely embeds googleapis.com as a substring", async () => {
    const ctx = makeContext("123456");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      ctx.fetchWithAuth("https://googleapis.com.evil.example/steal")
    ).rejects.toThrow(InvalidRoutingParameterError);
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("allows a legitimate aiplatform host through", async () => {
    const ctx = makeContext("123456");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));

    await ctx.fetchWithAuth(
      "https://us-central1-aiplatform.googleapis.com/v1beta1/projects/p/locations/us-central1/reasoningEngines/1"
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const headers = (fetchSpy.mock.calls[0]![1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(headers.Authorization).toBe("Bearer fake-token");

    fetchSpy.mockRestore();
  });
});

describe("URL builders reject hostile locations", () => {
  it("blocks a hostile customLocation on the session endpoint", async () => {
    const ctx = makeContext("123456");
    const sessions = new VertexAiSessionService(ctx, new VertexAiAgentService(ctx));

    await expect(
      sessions.getSessionEndpoint("abc", undefined, "123456", EVIL_LOCATION)
    ).rejects.toThrow(InvalidRoutingParameterError);
  });

  it("blocks a hostile location smuggled through a session resource name", async () => {
    const ctx = makeContext("123456");
    const sessions = new VertexAiSessionService(ctx, new VertexAiAgentService(ctx));

    await expect(
      sessions.getSessionEndpoint(
        `projects/p/locations/${EVIL_LOCATION_SEGMENT}/reasoningEngines/1/sessions/abc`
      )
    ).rejects.toThrow(InvalidRoutingParameterError);
  });

  it("blocks a hostile customLocation on the memory endpoint", () => {
    const ctx = makeContext("123456");
    const memories = new VertexAiMemoryService(ctx);

    expect(() => memories.getMemoryEndpoint("m1", "123456", EVIL_LOCATION)).toThrow(
      InvalidRoutingParameterError
    );
  });

  it("blocks a hostile location smuggled through a memory resource name", () => {
    const ctx = makeContext("123456");
    const memories = new VertexAiMemoryService(ctx);

    expect(() =>
      memories.getMemoryEndpoint(
        `projects/p/locations/${EVIL_LOCATION_SEGMENT}/reasoningEngines/1/memories/m1`
      )
    ).toThrow(InvalidRoutingParameterError);
  });

  it("blocks a hostile location smuggled through the feedback session name", () => {
    const ctx = makeContext("123456");
    const feedback = new VertexAiFeedbackService(
      ctx,
      new VertexAiSessionService(ctx, new VertexAiAgentService(ctx))
    );

    expect(() =>
      feedback.getFeedbackBaseUrl(
        `projects/p/locations/${EVIL_LOCATION_SEGMENT}/reasoningEngines/1`
      )
    ).toThrow(InvalidRoutingParameterError);
  });

  it("still builds correct URLs for a legitimate cross-region call", async () => {
    const ctx = makeContext("123456");
    const sessions = new VertexAiSessionService(ctx, new VertexAiAgentService(ctx));

    const url = await sessions.getSessionEndpoint(
      "abc",
      undefined,
      "123456",
      "europe-west4"
    );

    expect(new URL(url).hostname).toBe("europe-west4-aiplatform.googleapis.com");
    expect(url).toContain("/locations/europe-west4/reasoningEngines/123456/sessions/abc");
  });
});

/**
 * `streamQuery` built its host from `context.location`, which stays at the
 * context default when the engine was selected by display name: the display
 * name resolves through `engineDisplayNameCache` to a full resource path in
 * another region, so the path said europe-west4 while the host said
 * us-central1 — a 404 on every message to a non-default-region agent.
 */
describe("streamQuery host follows the resolved engine's region", () => {
  const CROSS_REGION_ENGINE =
    "projects/test-project/locations/europe-west4/reasoningEngines/999";

  beforeEach(() => {
    engineDisplayNameCache.clear();
  });

  async function drain(ctx: VertexAiContext) {
    const streaming = new VertexAiStreamingService(ctx);
    for await (const _evt of streaming.streamQuery(
      { messages: [{ role: "user", content: "hi" }] },
      "test-user"
    )) {
      void _evt;
    }
  }

  it("routes :streamQuery to the region of the display-name-resolved engine", async () => {
    engineDisplayNameCache.set("industry-watch", CROSS_REGION_ENGINE);
    const ctx = makeContext("industry-watch");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("data: {}\n\n", { status: 200 }));

    await drain(ctx);

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(new URL(url).hostname).toBe("europe-west4-aiplatform.googleapis.com");
    expect(url).toBe(
      `https://europe-west4-aiplatform.googleapis.com/v1/${CROSS_REGION_ENGINE}:streamQuery`
    );

    fetchSpy.mockRestore();
  });

  it("routes the :query fallback to that same region", async () => {
    engineDisplayNameCache.set("industry-watch", CROSS_REGION_ENGINE);
    const ctx = makeContext("industry-watch");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("nope", { status: 404 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ output: {} }), { status: 200 })
      );

    await drain(ctx);

    const fallbackUrl = fetchSpy.mock.calls[1]![0] as string;
    expect(fallbackUrl).toBe(
      `https://europe-west4-aiplatform.googleapis.com/v1/${CROSS_REGION_ENGINE}:query`
    );

    fetchSpy.mockRestore();
  });

  it("still uses the context location for a bare engine id", async () => {
    const ctx = makeContext("123456");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("data: {}\n\n", { status: 200 }));

    await drain(ctx);

    const url = fetchSpy.mock.calls[0]![0] as string;
    expect(new URL(url).hostname).toBe("us-central1-aiplatform.googleapis.com");

    fetchSpy.mockRestore();
  });
});

/**
 * `/api/sessions` (the collection route) gained a client-supplied `location` —
 * a GET query param and a POST body field — so that session list/create reach
 * the region an agent actually lives in. That value is only ever consumed by
 * `createAgentRuntimeProvider`, which is the same path the SSRF
 * validation guards, but the route is a new entry point to it and is asserted
 * end-to-end here: hostile input must be a 400, not an outbound request.
 */
describe("/api/sessions location parameter is validated at the boundary", () => {
  const SAVED = { ...process.env };

  beforeEach(() => {
    vi.restoreAllMocks();
    clearProviderCache();
    // The suite runs under MOCK_AGENT_RUNTIME=true, which short-circuits the
    // factory before any validation. Exercise the live-config path instead.
    delete process.env.MOCK_AGENT_RUNTIME;
    process.env.GOOGLE_CLOUD_PROJECT = "test-project";
    process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
    process.env.GOOGLE_REASONING_ENGINE_ID = "123456";
    vi.spyOn(auth.api, "getSession").mockResolvedValue({
      user: { id: "test-user", name: "Test User", email: "test@example.com" },
      session: { expiresAt: new Date(Date.now() + 86_400_000).toISOString() },
    } as never);
  });

  afterEach(() => {
    process.env = { ...SAVED };
    clearProviderCache();
  });

  it("rejects a hostile location on GET with 400 and never calls fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await listSessions(
      new NextRequest(
        `http://localhost:3000/api/sessions?agentId=123456&location=${encodeURIComponent(
          EVIL_LOCATION
        )}`
      )
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Invalid location");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a hostile location on POST with 400 and never calls fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await createSession(
      new NextRequest("http://localhost:3000/api/sessions", {
        method: "POST",
        body: JSON.stringify({ agentId: "123456", location: EVIL_LOCATION }),
      })
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Invalid location");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("routes a legitimate location to that region's host", async () => {
    vi.spyOn(VertexAiContext.prototype, "getAccessToken").mockResolvedValue("t");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      // listSessions issues one request per owner filter, so each call needs its
      // own Response — a single shared one is unusable after the first read.
      .mockImplementation(
        async () => new Response(JSON.stringify({ sessions: [] }), { status: 200 })
      );

    const res = await listSessions(
      new NextRequest(
        "http://localhost:3000/api/sessions?agentId=123456&location=europe-west4"
      )
    );

    expect(res.status).toBe(200);
    const url = String(fetchSpy.mock.calls[0]![0]);
    expect(new URL(url).hostname).toBe("europe-west4-aiplatform.googleapis.com");
    expect(url).toContain("/locations/europe-west4/reasoningEngines/123456/sessions");
  });

  it("falls back to the configured region when the param is absent", async () => {
    vi.spyOn(VertexAiContext.prototype, "getAccessToken").mockResolvedValue("t");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      // listSessions issues one request per owner filter, so each call needs its
      // own Response — a single shared one is unusable after the first read.
      .mockImplementation(
        async () => new Response(JSON.stringify({ sessions: [] }), { status: 200 })
      );

    const res = await listSessions(
      new NextRequest("http://localhost:3000/api/sessions?agentId=123456")
    );

    expect(res.status).toBe(200);
    expect(new URL(String(fetchSpy.mock.calls[0]![0])).hostname).toBe(
      "us-central1-aiplatform.googleapis.com"
    );
  });
});
