import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAgentRuntimeProvider,
  clearProviderCache,
} from "@/lib/agent-runtime/factory";
import { MockAgentRuntimeProvider } from "@/lib/agent-runtime/mock/mock-provider";
import { mockAgentsStore } from "@/lib/agent-runtime/mock/mock-store";
import { VertexAiReasoningEngineProvider } from "@/lib/agent-runtime/client";

/**
 * The provider choice used to be gated on NODE_ENV === "production", so a
 * staging deploy or a local run with a typo'd variable came up healthy and
 * answered with fabricated mock responses. It now keys on intent.
 */

const SAVED = { ...process.env };

// NODE_ENV is typed readonly; these tests exist precisely to prove the factory no
// longer consults it, so they need to vary it.
function setNodeEnv(value: string) {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

beforeEach(() => {
  // Providers are cached across calls now; a stale one would mask an env change.
  clearProviderCache();
  delete process.env.MOCK_AGENT_RUNTIME;
  delete process.env.GOOGLE_CLOUD_PROJECT;
  delete process.env.GOOGLE_REASONING_ENGINE_ID;
  delete (process.env as Record<string, string | undefined>).NODE_ENV;
});

afterEach(() => {
  process.env = { ...SAVED };
});

describe("createAgentRuntimeProvider", () => {
  it("mocks when explicitly asked, regardless of configuration", () => {
    process.env.MOCK_AGENT_RUNTIME = "true";
    expect(createAgentRuntimeProvider()).toBeInstanceOf(MockAgentRuntimeProvider);
  });

  it("throws on incomplete config outside production, where it used to mock", () => {
    setNodeEnv("development");
    expect(() => createAgentRuntimeProvider()).toThrow(/not configured/i);
  });

  it("throws the same way in a staging-like environment", () => {
    setNodeEnv("staging");
    process.env.GOOGLE_CLOUD_PROJECT = "my-project";
    // Engine id missing — previously a silent fall back to the mock.
    expect(() => createAgentRuntimeProvider()).toThrow(/GOOGLE_REASONING_ENGINE_ID/);
  });

  it("names the missing variables and points at the mock flag", () => {
    setNodeEnv("development");
    try {
      createAgentRuntimeProvider();
      expect.unreachable("should have thrown");
    } catch (err) {
      const message = (err as Error).message;
      expect(message).toContain("GOOGLE_CLOUD_PROJECT");
      expect(message).toContain("GOOGLE_REASONING_ENGINE_ID");
      expect(message).toContain("MOCK_AGENT_RUNTIME=true");
    }
  });

  it("rejects a mock-shaped agent id when mocking was not requested", () => {
    process.env.GOOGLE_CLOUD_PROJECT = "my-project";
    expect(() => createAgentRuntimeProvider("mock-arch-advisor")).toThrow(
      /real agent id/
    );
  });

  /**
   * The invariant, asserted over the store rather than over one id: no fixture
   * can ever build a real provider.
   *
   * `generic-agent` used to match neither the `mock-` prefix nor `mock-engine`,
   * so it slipped past the guard and built a Vertex provider pointed at an
   * engine that exists nowhere upstream. It has since been renamed, but naming
   * is the weak part — a future fixture added without the prefix would
   * reintroduce exactly that hole, and a test naming a single id would not
   * notice. Driving the store catches it.
   *
   * A fixture id reaches a route from a stale `agent_runtime_active_agent_id`
   * left in localStorage by a mock-mode session, which is precisely the
   * misconfiguration this guard exists to name.
   */
  it("rejects every mock fixture id when mocking was not requested", () => {
    process.env.GOOGLE_CLOUD_PROJECT = "my-project";
    expect(mockAgentsStore.length).toBeGreaterThan(0);
    for (const agent of mockAgentsStore) {
      expect(() => createAgentRuntimeProvider(agent.id)).toThrow(/real agent id/);
      expect(() => createAgentRuntimeProvider(agent.id)).toThrow(agent.id);
    }
  });

  /**
   * Documents the short-circuit, and is not coverage of the guard: `isExplicitMock`
   * returns before `isMockAgent` is consulted, so this would pass for any string.
   * It is here so that a change making the guard run *before* the explicit-mock
   * check — which would break mock mode for every fixture — fails loudly.
   */
  it("still mocks every fixture id when mocking was requested", () => {
    process.env.MOCK_AGENT_RUNTIME = "true";
    for (const agent of mockAgentsStore) {
      expect(createAgentRuntimeProvider(agent.id)).toBeInstanceOf(
        MockAgentRuntimeProvider
      );
    }
  });

  it("builds the real provider when fully configured", () => {
    process.env.GOOGLE_CLOUD_PROJECT = "my-project";
    expect(createAgentRuntimeProvider("123456")).toBeInstanceOf(
      VertexAiReasoningEngineProvider
    );
  });
});
