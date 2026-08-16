import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createAgentRuntimeProvider,
  clearProviderCache,
} from "@/lib/agent-runtime/factory";
import { MockAgentRuntimeProvider } from "@/lib/agent-runtime/mock/mock-provider";
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

  it("builds the real provider when fully configured", () => {
    process.env.GOOGLE_CLOUD_PROJECT = "my-project";
    expect(createAgentRuntimeProvider("123456")).toBeInstanceOf(
      VertexAiReasoningEngineProvider
    );
  });
});
