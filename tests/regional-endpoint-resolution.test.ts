import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as listMemoriesRoute } from "@/app/api/memory/route";
import { auth } from "@/lib/auth";
import { clearProviderCache } from "@/lib/agent-runtime/factory";
import {
  InvalidRoutingParameterError,
  VertexAiContext,
  engineDisplayNameCache,
} from "@/lib/agent-runtime/services/context";
import {
  VertexAiAgentService,
  clearAgentCaches,
} from "@/lib/agent-runtime/services/agent-service";
import { VertexAiMemoryService } from "@/lib/agent-runtime/services/memory-service";
import { VertexAiFeedbackService } from "@/lib/agent-runtime/services/feedback-service";
import { VertexAiSessionService } from "@/lib/agent-runtime/services/session-service";

/**
 * The feedback and memory URL builders derived the *host* from the unresolved
 * engine value while the *path* came from `getNormalizedEngineResource`, which
 * does resolve a display name onto a full resource path. An agent addressed by
 * display name and living outside the configured region therefore produced a
 * URL whose host said us-central1 and whose path said europe-west4 — the same
 * defect already fixed in streaming-service and session-service.
 *
 * Every case below asserts host and path agree *and* name the resolved region,
 * because either half alone still passes with the bug present.
 */

const DISPLAY_NAME = "industry-watch";
const CROSS_REGION_ENGINE =
  "projects/test-project/locations/europe-west4/reasoningEngines/999";

// `attacker.example.com/x#` truncates the rest of the URL into a fragment, so
// `https://${loc}-aiplatform.googleapis.com/...` resolves to attacker.example.com.
const EVIL_LOCATION = "attacker.example.com/x#";

function makeContext(overrideEngineId?: string, overrideLocation?: string) {
  return new VertexAiContext(
    overrideEngineId,
    overrideLocation,
    async () => "fake-token"
  );
}

function makeMemoryService(ctx: VertexAiContext) {
  return new VertexAiMemoryService(ctx, new VertexAiAgentService(ctx));
}

function makeFeedbackService(ctx: VertexAiContext) {
  const agents = new VertexAiAgentService(ctx);
  return new VertexAiFeedbackService(
    ctx,
    new VertexAiSessionService(ctx, agents),
    agents
  );
}

/** Asserts the host region and the path's `locations/` segment are the same. */
function expectRoutedTo(rawUrl: string, region: string) {
  const url = new URL(rawUrl);
  expect(url.hostname).toBe(`${region}-aiplatform.googleapis.com`);
  const pathRegion = url.pathname.match(/\/locations\/([^/]+)\//)?.[1];
  expect(pathRegion).toBe(region);
  expect(pathRegion).toBe(url.hostname.replace("-aiplatform.googleapis.com", ""));
}

beforeEach(() => {
  vi.restoreAllMocks();
  clearAgentCaches();
  process.env.GOOGLE_CLOUD_PROJECT = "test-project";
  process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
  process.env.GOOGLE_REASONING_ENGINE_ID = "123456";
});

afterEach(() => {
  clearAgentCaches();
});

describe("feedback routes to the resolved engine's region", () => {
  it("sends feedback for a display-name agent to the resolved region, host and path agreeing", async () => {
    engineDisplayNameCache.set(DISPLAY_NAME, CROSS_REGION_ENGINE);
    const feedback = makeFeedbackService(makeContext("123456"));
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    await feedback.submitFeedback(
      {
        sessionId: "abc",
        eventId: "evt-abcdef",
        feedbackType: "THUMBS_UP",
        reasoningEngineId: DISPLAY_NAME,
      },
      "test-user"
    );

    const url = String(fetchSpy.mock.calls[0]![0]);
    expectRoutedTo(url, "europe-west4");
    expect(url).toBe(
      `https://europe-west4-aiplatform.googleapis.com/v1beta1/${CROSS_REGION_ENGINE}/feedbackEntries`
    );
  });

  it("still uses the context region for a bare engine id", async () => {
    const feedback = makeFeedbackService(makeContext("123456"));
    const url = await feedback.getFeedbackBaseUrl(undefined, "123456");

    expectRoutedTo(url, "us-central1");
  });

  it("keeps the projects/... session-name fast path, routing by its embedded location", async () => {
    // The display name would resolve to europe-west4; a fully-qualified session
    // name is unambiguous and must win over it.
    engineDisplayNameCache.set(DISPLAY_NAME, CROSS_REGION_ENGINE);
    const feedback = makeFeedbackService(makeContext("123456"));

    const url = await feedback.getFeedbackBaseUrl(
      "projects/test-project/locations/asia-northeast1/reasoningEngines/77/sessions/s1",
      DISPLAY_NAME
    );

    expectRoutedTo(url, "asia-northeast1");
    expect(url).toBe(
      "https://asia-northeast1-aiplatform.googleapis.com/v1beta1/projects/test-project/locations/asia-northeast1/reasoningEngines/77/feedbackEntries"
    );
  });

  it("rejects a hostile location before any resolution request goes out", async () => {
    engineDisplayNameCache.set(DISPLAY_NAME, CROSS_REGION_ENGINE);
    const feedback = makeFeedbackService(makeContext("123456"));
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(() =>
      feedback.getFeedbackBaseUrl(undefined, DISPLAY_NAME, EVIL_LOCATION)
    ).toThrow(InvalidRoutingParameterError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("memory routes to the resolved engine's region", () => {
  it("lists memories from the resolved region, host and path agreeing", async () => {
    engineDisplayNameCache.set(DISPLAY_NAME, CROSS_REGION_ENGINE);
    const memories = makeMemoryService(makeContext("123456"));
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async () => new Response(JSON.stringify({ memories: [] }), { status: 200 })
      );

    await memories.listMemories("test-user", undefined, DISPLAY_NAME);

    const url = String(fetchSpy.mock.calls[0]![0]);
    expectRoutedTo(url, "europe-west4");
    expect(url).toBe(
      `https://europe-west4-aiplatform.googleapis.com/v1beta1/${CROSS_REGION_ENGINE}/memories:retrieve`
    );
  });

  it("creates a memory in the resolved region, host and path agreeing", async () => {
    engineDisplayNameCache.set(DISPLAY_NAME, CROSS_REGION_ENGINE);
    const memories = makeMemoryService(makeContext("123456"));
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));

    await memories.createMemory("test-user", "a fact", undefined, DISPLAY_NAME);

    const url = String(fetchSpy.mock.calls[0]![0]);
    expectRoutedTo(url, "europe-west4");
    expect(url).toBe(
      `https://europe-west4-aiplatform.googleapis.com/v1beta1/${CROSS_REGION_ENGINE}/memories`
    );
  });

  /**
   * The whole point of resolving asynchronously: on a cold cache the display
   * name -> id mapping only exists after `listAgents` has actually run. A
   * synchronous cache peek would find nothing on a cold cache and silently
   * fall back to using the raw display name as the engine id in the built
   * URL — wrong, and wrong only intermittently (whichever request happens to
   * lose the race with cache population). Proving the id in the resulting URL
   * is the *resolved* one (not the literal display name) demonstrates the
   * live `listAgents` round trip was actually awaited, not skipped.
   */
  it("resolves the display name to its id via a live lookup when the cache is cold", async () => {
    engineDisplayNameCache.clear();

    const memories = makeMemoryService(makeContext("123456"));
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/reasoningEngines")) {
        return new Response(
          JSON.stringify({
            reasoningEngines: [
              {
                name: "projects/test-project/locations/us-central1/reasoningEngines/999",
                displayName: DISPLAY_NAME,
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ memories: [] }), { status: 200 });
    });

    await memories.listMemories("test-user", undefined, DISPLAY_NAME);

    const memoryCall = fetchSpy.mock.calls
      .map((c) => String(c[0]))
      .find((u) => u.includes("/memories"));
    expect(memoryCall).toBeDefined();
    // A sync-only peek on a cold cache would have left the raw display name
    // in the URL instead of resolving it to "999".
    expect(memoryCall).toContain("/reasoningEngines/999/memories");
    expect(memoryCall).not.toContain(DISPLAY_NAME);
  });

  it("keeps the projects/... memory-name fast path, routing by its embedded location", async () => {
    engineDisplayNameCache.set(DISPLAY_NAME, CROSS_REGION_ENGINE);
    const memories = makeMemoryService(makeContext("123456"));

    const url = await memories.getMemoryEndpoint(
      "projects/test-project/locations/asia-northeast1/reasoningEngines/77/memories/m1",
      DISPLAY_NAME
    );

    expectRoutedTo(url, "asia-northeast1");
    expect(url).toBe(
      "https://asia-northeast1-aiplatform.googleapis.com/v1beta1/projects/test-project/locations/asia-northeast1/reasoningEngines/77/memories/m1"
    );
  });

  it("still uses the context region for a bare engine id", async () => {
    const memories = makeMemoryService(makeContext("123456"));
    expectRoutedTo(await memories.getMemoriesBaseUrl("123456"), "us-central1");
  });

  it("rejects a hostile location before any resolution request goes out", async () => {
    engineDisplayNameCache.set(DISPLAY_NAME, CROSS_REGION_ENGINE);
    const memories = makeMemoryService(makeContext("123456"));
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    expect(() => memories.getMemoriesBaseUrl(DISPLAY_NAME, EVIL_LOCATION)).toThrow(
      InvalidRoutingParameterError
    );
    expect(() => memories.getMemoryEndpoint("m1", DISPLAY_NAME, EVIL_LOCATION)).toThrow(
      InvalidRoutingParameterError
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("/api/memory rejects a hostile location with 400", () => {
  const SAVED = { ...process.env };

  beforeEach(() => {
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

  it("returns 400 and never calls fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await listMemoriesRoute(
      new NextRequest(
        `http://localhost:3000/api/memory?agentId=123456&location=${encodeURIComponent(
          EVIL_LOCATION
        )}`
      )
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("Invalid location");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
