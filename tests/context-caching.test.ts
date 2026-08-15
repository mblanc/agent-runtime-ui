import { describe, it, expect } from "vitest";
import {
  calculateContextCacheMetrics,
  formatCacheHitPercentage,
} from "@/lib/context-caching/cache-metrics";
import type { UsageMetadata } from "@/types/agent";

describe("calculateContextCacheMetrics", () => {
  it("handles undefined and empty usage metadata gracefully", () => {
    const res1 = calculateContextCacheMetrics(undefined);
    expect(res1).toEqual({
      cachedTokens: 0,
      promptTokens: 0,
      totalTokens: 0,
      cacheHitRatio: 0,
      estimatedCostReductionPercent: 0,
      isCached: false,
    });

    const res2 = calculateContextCacheMetrics({});
    expect(res2).toEqual({
      cachedTokens: 0,
      promptTokens: 0,
      totalTokens: 0,
      cacheHitRatio: 0,
      estimatedCostReductionPercent: 0,
      isCached: false,
    });
  });

  it("handles usage metadata with zero cached tokens (cache miss)", () => {
    const usage: UsageMetadata = {
      prompt_token_count: 1200,
      candidates_token_count: 350,
      total_token_count: 1550,
      cached_content_token_count: 0,
    };

    const metrics = calculateContextCacheMetrics(usage);
    expect(metrics.cachedTokens).toBe(0);
    expect(metrics.promptTokens).toBe(1200);
    expect(metrics.totalTokens).toBe(1550);
    expect(metrics.cacheHitRatio).toBe(0);
    expect(metrics.estimatedCostReductionPercent).toBe(0);
    expect(metrics.isCached).toBe(false);
  });

  it("calculates partial cache hits with expected ratios and cost savings", () => {
    // 3,420 cached tokens out of 4,200 prompt tokens (81.4% hit)
    const usage: UsageMetadata = {
      prompt_token_count: 4200,
      candidates_token_count: 500,
      thoughts_token_count: 110,
      total_token_count: 4810,
      cached_content_token_count: 3420,
    };

    const metrics = calculateContextCacheMetrics(usage);
    expect(metrics.cachedTokens).toBe(3420);
    expect(metrics.promptTokens).toBe(4200);
    expect(metrics.totalTokens).toBe(4810);
    expect(metrics.cacheHitRatio).toBeCloseTo(3420 / 4200, 4);
    // 3420 / 4200 = 0.814285... * 75 = 61.07% -> 61%
    expect(metrics.estimatedCostReductionPercent).toBe(61);
    expect(metrics.isCached).toBe(true);
  });

  it("calculates 100% cache hits accurately", () => {
    const usage: UsageMetadata = {
      prompt_token_count: 5000,
      candidates_token_count: 200,
      total_token_count: 5200,
      cached_content_token_count: 5000,
    };

    const metrics = calculateContextCacheMetrics(usage);
    expect(metrics.cachedTokens).toBe(5000);
    expect(metrics.cacheHitRatio).toBe(1);
    expect(metrics.estimatedCostReductionPercent).toBe(75);
    expect(metrics.isCached).toBe(true);
  });

  it("supports camelCase property variants", () => {
    const usage: UsageMetadata = {
      promptTokenCount: 2000,
      candidatesTokenCount: 400,
      cachedTokenCount: 1500,
    };

    const metrics = calculateContextCacheMetrics(usage);
    expect(metrics.cachedTokens).toBe(1500);
    expect(metrics.promptTokens).toBe(2000);
    expect(metrics.totalTokens).toBe(2400);
    expect(metrics.cacheHitRatio).toBe(0.75);
    expect(metrics.estimatedCostReductionPercent).toBe(56); // 0.75 * 75 = 56.25 -> 56
    expect(metrics.isCached).toBe(true);
  });

  it("handles case where cachedTokens exceeds promptTokens safely without crashing", () => {
    const usage: UsageMetadata = {
      prompt_token_count: 1000,
      cached_content_token_count: 2000,
    };

    const metrics = calculateContextCacheMetrics(usage);
    expect(metrics.cachedTokens).toBe(2000);
    expect(metrics.cacheHitRatio).toBe(1);
    expect(metrics.estimatedCostReductionPercent).toBe(75);
  });
});

describe("formatCacheHitPercentage", () => {
  it("formats ratios as clean percentages", () => {
    expect(formatCacheHitPercentage(0)).toBe("0%");
    expect(formatCacheHitPercentage(1)).toBe("100%");
    expect(formatCacheHitPercentage(0.75)).toBe("75%");
    expect(formatCacheHitPercentage(0.81428)).toBe("81.4%");
    expect(formatCacheHitPercentage(0.999)).toBe("99.9%");
  });
});
