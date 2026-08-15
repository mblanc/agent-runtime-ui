"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuiState } from "@assistant-ui/react";
import { Activity, Check, Copy, Sparkles } from "lucide-react";
import type { AgentMessageInfoMetadata } from "@/types/agent";
import { cn, copyToClipboardSafe } from "@/lib/utils";

export interface MessageInfoPopoverProps {
  metadata?: AgentMessageInfoMetadata;
  className?: string;
}

export function MessageInfoPopover({
  metadata: propMetadata,
  className,
}: MessageInfoPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const customState = useAuiState(
    (s: {
      message?: {
        metadata?: {
          custom?: Record<string, unknown>;
        };
      };
    }) => ("message" in s ? s.message?.metadata?.custom : undefined)
  );

  const meta = (propMetadata ||
    (customState as unknown as AgentMessageInfoMetadata | undefined)) as
    AgentMessageInfoMetadata | undefined;

  const modelVersion = meta?.modelVersion || meta?.model_version;
  const invocationId = meta?.invocationId || meta?.invocation_id;
  const usage = meta?.usageMetadata || meta?.usage_metadata;
  const avgLogprobs = meta?.avgLogprobs ?? meta?.avg_logprobs;
  const nodePath =
    meta?.nodePath ||
    meta?.node_path ||
    meta?.nodeInfo?.path ||
    (meta?.node_info as { path?: string } | undefined)?.path;
  const finishReason = meta?.finishReason || meta?.finish_reason;
  const actions = meta?.actions;

  const hasAnyTelemetry = Boolean(
    modelVersion ||
    invocationId ||
    usage ||
    avgLogprobs !== undefined ||
    nodePath ||
    finishReason ||
    actions
  );

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

  const copyToClipboard = async (text: string, fieldKey: string) => {
    const success = await copyToClipboardSafe(text);
    if (success) {
      setCopiedField(fieldKey);
      setTimeout(() => {
        setCopiedField((prev) => (prev === fieldKey ? null : prev));
      }, 2000);
    }
  };

  if (!hasAnyTelemetry) {
    return null;
  }

  // Token breakdown calculations
  const promptTokens = usage?.prompt_token_count ?? usage?.promptTokenCount ?? 0;
  const candidatesTokens =
    usage?.candidates_token_count ?? usage?.candidatesTokenCount ?? 0;
  const thoughtsTokens = usage?.thoughts_token_count ?? usage?.thoughtsTokenCount ?? 0;
  const totalTokens =
    usage?.total_token_count ?? usage?.totalTokenCount ?? promptTokens + candidatesTokens;
  const trafficType = usage?.traffic_type || usage?.trafficType;

  // Percentage calculations
  const effectiveTotal = Math.max(totalTokens, promptTokens + candidatesTokens, 1);
  const promptPct = Math.round((promptTokens / effectiveTotal) * 100);
  const candidatesPct = Math.round((candidatesTokens / effectiveTotal) * 100);
  const thoughtsPct = Math.round((thoughtsTokens / effectiveTotal) * 100);

  // Confidence calculation from logprobs
  const confidencePct =
    avgLogprobs !== undefined && !isNaN(avgLogprobs)
      ? Math.min(100, Math.max(0, Math.round(Math.exp(avgLogprobs) * 1000) / 10))
      : null;

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-flex items-center", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Trigger Pill / Button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        aria-expanded={isOpen}
        aria-label="View model execution telemetry and message info"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium font-mono transition-all",
          "text-muted-foreground/80 hover:text-foreground bg-muted/40 hover:bg-muted/80 border border-border/50",
          isOpen && "bg-muted border-[#1a73e8]/40 text-foreground"
        )}
      >
        <Sparkles className="h-3 w-3 text-[#1a73e8] dark:text-[#8ab4f8]" />
        {modelVersion ? (
          <span className="max-w-[130px] truncate">{modelVersion}</span>
        ) : (
          <span>Info</span>
        )}
        {totalTokens > 0 && (
          <>
            <span className="opacity-40">•</span>
            <span>{totalTokens.toLocaleString()} tok</span>
          </>
        )}
      </button>

      {/* Popover Floating Panel */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Message Execution Telemetry"
          className={cn(
            "absolute bottom-full left-0 z-50 mb-2 w-80 sm:w-96 rounded-2xl border border-[#e3e3e3] bg-background/95 p-4 shadow-2xl backdrop-blur-md dark:border-[#3c4043] dark:bg-[#1e1f20]/95 text-foreground",
            "animate-in fade-in-0 zoom-in-95"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/40 pb-2.5 mb-3">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-[#1a73e8]/10 text-[#1a73e8] dark:bg-[#8ab4f8]/20 dark:text-[#8ab4f8]">
                <Activity className="h-3.5 w-3.5" />
              </div>
              <h3 className="text-xs font-semibold text-foreground tracking-tight">
                Execution & Telemetry
              </h3>
            </div>

            {finishReason && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-mono font-medium text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                {finishReason}
              </span>
            )}
          </div>

          <div className="space-y-3 text-xs">
            {/* Model & Runtime Environment */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-muted/40 p-2.5">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                  Model Version
                </span>
                <span className="font-mono text-xs font-semibold text-foreground truncate block">
                  {modelVersion || "gemini-flash-latest"}
                </span>
              </div>

              <div className="rounded-xl bg-muted/40 p-2.5">
                <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                  Execution Node
                </span>
                <span className="font-mono text-xs font-semibold text-foreground truncate block">
                  {nodePath || "root_agent@1"}
                </span>
              </div>
            </div>

            {/* Invocation / Trace ID */}
            {invocationId && (
              <div className="rounded-xl bg-muted/40 p-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-0.5">
                    Invocation ID
                  </span>
                  <span className="font-mono text-[11px] text-foreground/90 truncate block select-all">
                    {invocationId}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => copyToClipboard(invocationId, "invocationId")}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border/50"
                  aria-label="Copy Invocation ID"
                >
                  {copiedField === "invocationId" ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            )}

            {/* Token Usage Breakdown */}
            {totalTokens > 0 && (
              <div className="rounded-xl bg-muted/40 p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                    Token Breakdown
                  </span>
                  {trafficType && (
                    <span className="text-[9px] font-mono text-muted-foreground/80 bg-muted/80 px-1.5 py-0.5 rounded">
                      {trafficType}
                    </span>
                  )}
                </div>

                {/* Progress bar visual */}
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    style={{ width: `${promptPct}%` }}
                    className="bg-[#1a73e8] dark:bg-[#8ab4f8]"
                    title={`Prompt: ${promptTokens.toLocaleString()} (${promptPct}%)`}
                  />
                  <div
                    style={{ width: `${candidatesPct}%` }}
                    className="bg-emerald-500"
                    title={`Output: ${candidatesTokens.toLocaleString()} (${candidatesPct}%)`}
                  />
                  {thoughtsPct > 0 && (
                    <div
                      style={{ width: `${thoughtsPct}%` }}
                      className="bg-purple-500"
                      title={`Thoughts: ${thoughtsTokens.toLocaleString()} (${thoughtsPct}%)`}
                    />
                  )}
                </div>

                {/* 3 or 4 metric pills */}
                <div className="grid grid-cols-3 gap-1.5 pt-1 text-[11px] font-mono text-center">
                  <div className="rounded-lg bg-background/80 p-1.5 border border-border/30">
                    <span className="text-[9px] text-[#1a73e8] dark:text-[#8ab4f8] block">
                      Prompt
                    </span>
                    <span className="font-semibold">{promptTokens.toLocaleString()}</span>
                  </div>

                  <div className="rounded-lg bg-background/80 p-1.5 border border-border/30">
                    <span className="text-[9px] text-emerald-600 dark:text-emerald-400 block">
                      Output
                    </span>
                    <span className="font-semibold">
                      {candidatesTokens.toLocaleString()}
                    </span>
                  </div>

                  <div className="rounded-lg bg-background/80 p-1.5 border border-border/30">
                    <span className="text-[9px] text-purple-600 dark:text-purple-400 block">
                      {thoughtsTokens > 0 ? "Thinking" : "Total"}
                    </span>
                    <span className="font-semibold">
                      {(thoughtsTokens > 0
                        ? thoughtsTokens
                        : totalTokens
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Logprobs / Confidence */}
            {avgLogprobs !== undefined && (
              <div className="rounded-xl bg-muted/40 p-2.5 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block mb-0.5">
                    Model Confidence
                  </span>
                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <span className="font-semibold text-foreground">
                      {confidencePct !== null ? `${confidencePct}%` : "N/A"}
                    </span>
                    <span className="text-muted-foreground text-[10px]">
                      (avg logprob: {avgLogprobs.toFixed(3)})
                    </span>
                  </div>
                </div>

                <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
                  <div
                    style={{ width: `${confidencePct ?? 50}%` }}
                    className={cn(
                      "h-full rounded-full",
                      (confidencePct ?? 0) > 75
                        ? "bg-emerald-500"
                        : (confidencePct ?? 0) > 50
                          ? "bg-amber-500"
                          : "bg-rose-500"
                    )}
                  />
                </div>
              </div>
            )}

            {/* Actions / Deltas */}
            {actions &&
              Boolean(
                actions.state_delta ||
                actions.stateDelta ||
                actions.artifact_delta ||
                actions.artifactDelta
              ) && (
                <div className="rounded-xl bg-muted/40 p-2.5 space-y-1">
                  <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider block">
                    Workflow Mutations
                  </span>
                  {(actions.state_delta || actions.stateDelta) && (
                    <div className="text-[11px] font-mono text-muted-foreground truncate">
                      State: {JSON.stringify(actions.state_delta || actions.stateDelta)}
                    </div>
                  )}
                  {(actions.artifact_delta || actions.artifactDelta) && (
                    <div className="text-[11px] font-mono text-muted-foreground truncate">
                      Artifacts:{" "}
                      {Object.keys(
                        actions.artifact_delta || actions.artifactDelta || {}
                      ).join(", ")}
                    </div>
                  )}
                </div>
              )}
          </div>

          {/* Footer Copy Payload Action */}
          <div className="mt-3 pt-2.5 border-t border-border/40 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              Vertex AI Agent Runtime Telemetry
            </span>
            <button
              type="button"
              onClick={() => copyToClipboard(JSON.stringify(meta, null, 2), "fullJson")}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-[#1a73e8] hover:underline dark:text-[#8ab4f8]"
            >
              {copiedField === "fullJson" ? (
                <>
                  <Check className="h-3 w-3 text-emerald-500" />
                  <span>Copied JSON</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy Metadata JSON</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
