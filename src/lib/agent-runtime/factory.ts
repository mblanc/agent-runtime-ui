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

  // Fail-fast assertion in production mode
  if (!isExplicitMock && !isConfigured && process.env.NODE_ENV === "production") {
    throw new Error(
      "Configuration Error: GOOGLE_CLOUD_PROJECT and GOOGLE_REASONING_ENGINE_ID must be configured in production."
    );
  }

  if (isExplicitMock || !isConfigured) {
    return new MockAgentRuntimeProvider(effectiveAgentId, location);
  }

  return new VertexAiReasoningEngineProvider(
    effectiveAgentId,
    location,
    tokenGetter
  );
}
