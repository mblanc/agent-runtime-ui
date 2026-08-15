import type { UsageMetadata, ContextCacheSavingsMetrics } from "@/types/agent";

/**
 * Calculates context caching metrics, hit ratios, and estimated cost reductions
 * from Vertex AI Reasoning Engine / Gemini usage_metadata.
 */
export function calculateContextCacheMetrics(
  usage?: UsageMetadata
): ContextCacheSavingsMetrics {
  const cachedTokens =
    usage?.cached_content_token_count ??
    usage?.cachedContentTokenCount ??
    usage?.cached_token_count ??
    usage?.cachedTokenCount ??
    0;

  const promptTokens = usage?.prompt_token_count ?? usage?.promptTokenCount ?? 0;
  const candidatesTokens =
    usage?.candidates_token_count ?? usage?.candidatesTokenCount ?? 0;
  const thoughtsTokens = usage?.thoughts_token_count ?? usage?.thoughtsTokenCount ?? 0;
  const totalTokens =
    usage?.total_token_count ??
    usage?.totalTokenCount ??
    promptTokens + candidatesTokens + thoughtsTokens;

  // Total input tokens considered for prompt caching
  const totalInputTokens = Math.max(promptTokens, cachedTokens);
  const cacheHitRatio =
    totalInputTokens > 0 ? Math.min(1, Math.max(0, cachedTokens / totalInputTokens)) : 0;

  // Gemini 2.0 / 2.5 Flash charges 75% less for cached context tokens (1/4th regular input price)
  const estimatedCostReductionPercent = Math.round(cacheHitRatio * 75);

  return {
    cachedTokens,
    promptTokens,
    totalTokens,
    cacheHitRatio,
    estimatedCostReductionPercent,
    isCached: cachedTokens > 0,
  };
}

/**
 * Formats a cache hit ratio (0.0 - 1.0) as a clean percentage string (e.g. "81.4%" or "75%").
 */
export function formatCacheHitPercentage(ratio: number): string {
  const pct = Math.round(ratio * 1000) / 10;
  return `${pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}
