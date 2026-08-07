"use client";

import { useState, useMemo } from "react";
import {
  Wrench,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  AlertTriangle,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";

export interface ToolFallbackProps {
  toolCallId?: string;
  toolName?: string;
  args?: Record<string, unknown> | string;
  argsText?: string;
  result?: unknown;
  status?: {
    type: "running" | "complete" | "incomplete" | "requires-action";
    reason?: string;
    error?: unknown;
  };
  addResult?: ToolCallMessagePartProps["addResult"];
  resume?: ToolCallMessagePartProps["resume"];
  respondToApproval?: ToolCallMessagePartProps["respondToApproval"];
  defaultOpen?: boolean;
  className?: string;
}

export function ToolFallback({
  toolName = "tool_call",
  args,
  argsText,
  result,
  status = { type: "complete" },
  addResult,
  resume,
  respondToApproval,
  defaultOpen = false,
  className,
}: ToolFallbackProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsedArgs = useMemo<Record<string, unknown> | null>(() => {
    if (args && typeof args === "object") return args as Record<string, unknown>;
    if (typeof args === "string") {
      try {
        const parsed = JSON.parse(args);
        if (typeof parsed === "object" && parsed !== null) return parsed;
      } catch {
        return null;
      }
    }
    if (argsText) {
      try {
        const parsed = JSON.parse(argsText);
        if (typeof parsed === "object" && parsed !== null) return parsed;
      } catch {
        return null;
      }
    }
    return null;
  }, [args, argsText]);

  const [submittedDecision, setSubmittedDecision] = useState<
    "approved" | "declined" | null
  >(() => {
    if (result && typeof result === "object") {
      const res = result as Record<string, unknown>;
      if (res.confirmed === true || res.approved === true) return "approved";
      if (res.confirmed === false || res.approved === false) return "declined";
    }
    return null;
  });

  const isRequiresAction = status.type === "requires-action";
  const isRunning = status.type === "running";
  const isError = status.type === "incomplete" || Boolean(status.error);
  const isComplete = status.type === "complete" && !isError;

  const hitlDescription = useMemo(() => {
    if (parsedArgs && typeof parsedArgs === "object") {
      const customPrompt =
        parsedArgs.prompt ||
        parsedArgs.action_description ||
        parsedArgs.actionDescription ||
        parsedArgs.description ||
        parsedArgs.message;
      if (typeof customPrompt === "string" && customPrompt.trim()) {
        return customPrompt.trim();
      }
    }
    return "Tool requires human approval to proceed";
  }, [parsedArgs]);

  const formattedArgs = useMemo(() => {
    if (argsText) {
      try {
        return JSON.stringify(JSON.parse(argsText), null, 2);
      } catch {
        return argsText;
      }
    }
    if (typeof args === "string") {
      try {
        return JSON.stringify(JSON.parse(args), null, 2);
      } catch {
        return args;
      }
    }
    if (args !== undefined && args !== null) {
      return JSON.stringify(args, null, 2);
    }
    return "";
  }, [args, argsText]);

  const formattedResult = useMemo(() => {
    if (result === undefined) return "";
    if (typeof result === "string") {
      try {
        return JSON.stringify(JSON.parse(result), null, 2);
      } catch {
        return result;
      }
    }
    return JSON.stringify(result, null, 2);
  }, [result]);

  const handleApprove = () => {
    if (isSubmitting || submittedDecision) return;
    setIsSubmitting(true);
    try {
      const payload = { confirmed: true, approved: true };
      if (addResult) {
        addResult({ confirmed: true });
      }
      if (respondToApproval) {
        respondToApproval(payload);
      }
      if (resume) {
        resume(payload);
      }
      setSubmittedDecision("approved");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDecline = () => {
    if (isSubmitting || submittedDecision) return;
    setIsSubmitting(true);
    try {
      const payload = { confirmed: false, approved: false };
      if (addResult) {
        addResult({ confirmed: false });
      }
      if (respondToApproval) {
        respondToApproval(payload);
      }
      if (resume) {
        resume(payload);
      }
      setSubmittedDecision("declined");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={cn(
        "my-2.5 overflow-hidden rounded-2xl border border-[#e3e3e3] bg-[#f8fafd] text-xs transition-all dark:border-[#333537] dark:bg-[#1a1c1e]",
        className
      )}
    >
      {/* Header bar */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left font-medium text-[#444746] transition-colors hover:bg-[#eff2f6] dark:text-[#c4c7c5] dark:hover:bg-[#282a2c]"
      >
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1a73e8]/10 text-[#1a73e8] dark:bg-[#8ab4f8]/15 dark:text-[#8ab4f8]">
            <Wrench className="h-3.5 w-3.5" />
          </div>
          <span className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">
            {toolName}
          </span>
          {isRunning && (
            <span className="flex items-center gap-1 text-[11px] text-[#1a73e8] dark:text-[#8ab4f8]">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Running</span>
            </span>
          )}
          {isRequiresAction && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" />
              <span>Requires Approval</span>
            </span>
          )}
          {isComplete && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              <span>Executed</span>
            </span>
          )}
          {isError && (
            <span className="flex items-center gap-1 text-[11px] text-destructive">
              <AlertCircle className="h-3 w-3" />
              <span>Error</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-muted-foreground">
          <span className="text-[11px] hover:text-foreground">
            {isOpen ? "Collapse" : "View Details"}
          </span>
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-[#1a73e8] dark:text-[#8ab4f8]" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
      </button>

      {/* HITL Card (visible when requires-action) */}
      {isRequiresAction && (
        <div className="border-t border-amber-500/20 bg-amber-500/10 p-3 dark:border-amber-400/20 dark:bg-amber-950/30">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="flex-1 space-y-2">
              <div className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                {hitlDescription}
              </div>

              {!submittedDecision && result === undefined ? (
                <div className="flex items-center gap-2 pt-0.5">
                  <Button
                    size="sm"
                    type="button"
                    onClick={handleApprove}
                    disabled={isSubmitting}
                    aria-label="Approve tool execution"
                    className="h-7 rounded-lg bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700 active:scale-95 disabled:opacity-50 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                  >
                    {isSubmitting ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="mr-1 h-3 w-3" />
                    )}
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={handleDecline}
                    disabled={isSubmitting}
                    aria-label="Decline tool execution"
                    className="h-7 rounded-lg border-[#d3d7dc] bg-white px-3 text-xs font-medium text-[#444746] hover:bg-[#eff2f6] hover:text-destructive active:scale-95 disabled:opacity-50 dark:border-[#3c4043] dark:bg-[#282a2c] dark:text-[#c4c7c5] dark:hover:bg-[#333537] dark:hover:text-rose-400"
                  >
                    <X className="mr-1 h-3 w-3" />
                    Decline
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs font-medium pt-0.5">
                  {submittedDecision === "approved" ||
                  (result as Record<string, unknown>)?.confirmed === true ||
                  (result as Record<string, unknown>)?.approved === true ? (
                    <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <Check className="h-3.5 w-3.5" /> Approved by user
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400">
                      <X className="h-3.5 w-3.5" /> Declined by user
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Expanded Details Panel: Full Args & Full Raw Result */}
      {isOpen && (
        <div className="border-t border-[#e3e3e3] bg-white/60 p-3.5 font-mono text-[11px] dark:border-[#333537] dark:bg-[#141517]/80">
          {formattedArgs && (
            <div className="mb-2.5">
              <div className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Arguments
              </div>
              <pre className="max-h-48 overflow-auto rounded-lg border border-[#d3d7dc] bg-[#eef2f6] p-2.5 text-[#1f1f1f] dark:border-[#333537] dark:bg-[#1a1c1e] dark:text-[#e3e3e3]">
                {formattedArgs}
              </pre>
            </div>
          )}

          {formattedResult && (
            <div>
              <div className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Response Payload
              </div>
              <pre className="max-h-60 overflow-auto rounded-lg border border-[#d3d7dc] bg-[#eef2f6] p-2.5 text-[#1f1f1f] dark:border-[#333537] dark:bg-[#1a1c1e] dark:text-[#e3e3e3]">
                {formattedResult}
              </pre>
            </div>
          )}

          {isRunning && !formattedResult && (
            <div className="flex items-center gap-2 py-1 text-muted-foreground font-sans text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Executing tool and awaiting response...</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
