"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuiState } from "@assistant-ui/react";
import { Database, Check, Copy, TrendingDown, Clock } from "lucide-react";
import type { AgentUsageMetadata } from "@/types/agent";
import {
  calculateContextCacheMetrics,
  formatCacheHitPercentage,
} from "@/lib/context-caching/cache-metrics";
import { cn, copyToClipboardSafe } from "@/lib/utils";

export interface ContextCachePopoverProps {
  usageMetadata?: AgentUsageMetadata;
  className?: string;
}

export function ContextCachePopover({
  usageMetadata: propUsage,
  className,
}: ContextCachePopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const customUsage = useAuiState(
    (s: {
      message?: {
        metadata?: {
          custom?: {
            usageMetadata?: AgentUsageMetadata;
            usage_metadata?: AgentUsageMetadata;
          };
        };
      };
    }) =>
      "message" in s
        ? s.message?.metadata?.custom?.usageMetadata ||
          s.message?.metadata?.custom?.usage_metadata
        : undefined
  );

  const usage = propUsage || customUsage;
  const metrics = calculateContextCacheMetrics(usage);
  const freshTokens = Math.max(0, metrics.promptTokens - metrics.cachedTokens);
  const cacheHitPctNumber = metrics.cacheHitRatio * 100;
  // Estimated Flash prompt pricing savings ($0.075/1M tokens standard, 75% cache discount = $0.05625/1M cached tokens)
  const estimatedCostSavingsUsd = (metrics.cachedTokens / 1_000_000) * 0.05625;

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsOpen(true), 150);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsOpen(false), 250);
  };

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isOpen, handleClickOutside]);

  const copyBreakdown = async () => {
    const summary = [
      `Vertex AI Context Caching Telemetry:`,
      `• Cached Tokens: ${metrics.cachedTokens.toLocaleString()}`,
      `• Fresh Prompt Tokens: ${freshTokens.toLocaleString()}`,
      `• Total Prompt Tokens: ${metrics.promptTokens.toLocaleString()}`,
      `• Cache Hit Ratio: ${formatCacheHitPercentage(metrics.cacheHitRatio)}`,
      `• Estimated Cost Reduction: ~${metrics.estimatedCostReductionPercent}% (saved ~$${estimatedCostSavingsUsd.toFixed(5)})`,
    ].join("\n");

    const ok = await copyToClipboardSafe(summary);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Only render badge if cache hit exists
  if (metrics.cachedTokens <= 0) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-flex items-center", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Badge Trigger */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        aria-expanded={isOpen}
        aria-label="View Vertex AI context caching savings"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium font-mono transition-all",
          "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30",
          isOpen && "bg-emerald-500/25 border-emerald-500/50 shadow-sm"
        )}
      >
        <Database className="h-3 w-3 text-emerald-500 animate-pulse" />
        <span>{formatCacheHitPercentage(metrics.cacheHitRatio)} cached</span>
        <span className="opacity-40">•</span>
        <span>{metrics.cachedTokens.toLocaleString()} tok</span>
      </button>

      {/* Floating Popover Card */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Context Caching Savings Details"
          className={cn(
            "absolute bottom-full left-0 z-50 mb-2 w-80 sm:w-88 rounded-2xl border border-emerald-500/30 bg-background/95 p-4 shadow-2xl backdrop-blur-md dark:bg-[#1e1f20]/95 text-foreground",
            "animate-in fade-in-0 zoom-in-95"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/40 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Database className="h-3.5 w-3.5" />
              </div>
              <h3 className="text-xs font-semibold text-foreground tracking-tight">
                Context Caching Savings
              </h3>
            </div>

            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              {formatCacheHitPercentage(metrics.cacheHitRatio)} Hit
            </span>
          </div>

          <div className="space-y-3 text-xs">
            {/* Visual Token Distribution Progress Bar */}
            <div className="rounded-xl bg-muted/40 p-2.5">
              <div className="flex items-center justify-between text-[11px] mb-1.5 font-medium">
                <span className="text-muted-foreground">Prompt Token Ingestion</span>
                <span className="font-mono text-foreground font-semibold">
                  {metrics.promptTokens.toLocaleString()} Total
                </span>
              </div>

              <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted/80">
                <div
                  style={{ width: `${cacheHitPctNumber}%` }}
                  className="bg-emerald-500 transition-all duration-500"
                  title={`Cached: ${metrics.cachedTokens.toLocaleString()} (${cacheHitPctNumber.toFixed(1)}%)`}
                />
                <div
                  style={{ width: `${100 - cacheHitPctNumber}%` }}
                  className="bg-blue-500 transition-all duration-500"
                  title={`Fresh: ${freshTokens.toLocaleString()} (${(100 - cacheHitPctNumber).toFixed(1)}%)`}
                />
              </div>

              <div className="flex items-center justify-between pt-2 text-[10px] font-mono">
                <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                  <span>Cached ({metrics.cachedTokens.toLocaleString()})</span>
                </div>
                <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                  <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                  <span>Fresh ({freshTokens.toLocaleString()})</span>
                </div>
              </div>
            </div>

            {/* Cost & Latency Impact Cards */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-2.5">
                <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 mb-1">
                  <TrendingDown className="h-3 w-3" />
                  <span className="text-[10px] font-medium uppercase tracking-wider">
                    Cost Saved
                  </span>
                </div>
                <div className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-300">
                  ${estimatedCostSavingsUsd.toFixed(5)}
                </div>
                <div className="text-[9px] text-muted-foreground mt-0.5">
                  ~{metrics.estimatedCostReductionPercent}% prompt discount
                </div>
              </div>

              <div className="rounded-xl bg-muted/40 p-2.5">
                <div className="flex items-center gap-1 text-muted-foreground mb-1">
                  <Clock className="h-3 w-3 text-amber-500" />
                  <span className="text-[10px] font-medium uppercase tracking-wider">
                    Time to First Token
                  </span>
                </div>
                <div className="font-mono text-xs font-bold text-foreground">
                  Reduced TTFT
                </div>
                <div className="text-[9px] text-muted-foreground mt-0.5">
                  Pre-computed KV cache
                </div>
              </div>
            </div>

            {/* Copy Breakdown Action */}
            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={copyBreakdown}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-500" />
                    <span className="text-emerald-500 font-medium">Copied summary</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>Copy telemetry</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
