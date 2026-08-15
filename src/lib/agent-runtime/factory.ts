import { IAgentRuntimeProvider } from "./types";
import { VertexAiReasoningEngineProvider } from "./client";
import { MockAgentRuntimeProvider } from "./mock/mock-provider";

export function createAgentRuntimeProvider(
  agentId?: string,
  location?: string,
  tokenGetter?: () => Promise<string>
): IAgentRuntimeProvider {
  const isExplicitMock = process.env.MOCK_AGENT_RUNTIME === "true";
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || "";
  const effectiveAgentId = agentId || process.env.GOOGLE_REASONING_ENGINE_ID || "";
  const isFullResource = effectiveAgentId.startsWith("projects/");
  const isMockAgent =
    effectiveAgentId.startsWith("mock-") || effectiveAgentId === "mock-engine";
  const isConfigured = Boolean(
    (projectId || isFullResource) && effectiveAgentId && !isMockAgent
  );

  // Mock on intent, not on environment.
  //
  // This assertion used to be gated on NODE_ENV === "production", so a staging
  // deploy, a preview environment or a local run with a typo'd variable came up
  // looking healthy and answered with fabricated mock responses. The failure
  // then surfaced as "the agent gave a weird answer" rather than "the agent is
  // not configured", which is the opposite of fail-fast.
  if (isExplicitMock) {
    return new MockAgentRuntimeProvider(effectiveAgentId, location);
  }

  if (!isConfigured) {
    const missingVars: string[] = [];
    if (!projectId && !isFullResource) missingVars.push("GOOGLE_CLOUD_PROJECT");
    if (!effectiveAgentId) missingVars.push("GOOGLE_REASONING_ENGINE_ID");
    if (isMockAgent) missingVars.push(`a real agent id (got "${effectiveAgentId}")`);

    throw new Error(
      `Configuration Error: agent runtime is not configured. Missing: ${missingVars.join(
        ", "
      )}. ` +
        `Set these in .env.local, or set MOCK_AGENT_RUNTIME=true to run against the in-memory mock.`
    );
  }

  return new VertexAiReasoningEngineProvider(effectiveAgentId, location, tokenGetter);
}
