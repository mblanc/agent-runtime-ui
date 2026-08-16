import { IAgentRuntimeProvider } from "./types";
import { VertexAiReasoningEngineProvider } from "./client";
import { MockAgentRuntimeProvider } from "./mock/mock-provider";
import { TtlCache } from "./services/ttl-cache";

/**
 * Providers are reused across requests rather than rebuilt per call.
 *
 * Every one of the 15 routes constructs an AgentRuntimeClient per request, and
 * each build creates a GoogleAuth client. google-auth-library caches access
 * tokens *per instance*, so a fresh instance per request defeated that cache and
 * re-hit the metadata server on essentially every call.
 *
 * Safe to key on agentId and location only because both are validated at the
 * boundary now (see assertValidLocation / assertValidEngineResource). Caching on
 * an unvalidated key would let one user's poisoned `location` be served to
 * another — which is why this had to wait for that fix to land.
 *
 * A caller-supplied tokenGetter bypasses the cache entirely: it is per-request
 * identity and must never be shared.
 */
const providerCache = new TtlCache<IAgentRuntimeProvider>(5 * 60_000);

/** Exposed for tests, which must not inherit a provider built under other env. */
export function clearProviderCache(): void {
  providerCache.clear();
}

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

  // Cache key is the validated routing pair. Env vars are part of it because
  // they change the resolved project, and tests vary them between cases.
  const cacheKey = `${projectId}|${effectiveAgentId}|${location || ""}`;

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

  // A per-request tokenGetter is caller identity, never shareable.
  if (tokenGetter) {
    return new VertexAiReasoningEngineProvider(effectiveAgentId, location, tokenGetter);
  }

  return (
    providerCache.get(cacheKey) ??
    providerCache.set(
      cacheKey,
      new VertexAiReasoningEngineProvider(effectiveAgentId, location)
    )
  );
}
