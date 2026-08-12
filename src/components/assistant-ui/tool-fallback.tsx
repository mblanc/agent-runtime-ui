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

import { useAui } from "@assistant-ui/react";

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
  const aui = useAui();
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

  const isRequiresAction =
    status.type === "requires-action" ||
    toolName === "adk_request_confirmation" ||
    toolName.includes("confirmation") ||
    toolName.includes("approval");

  const isRunning = status.type === "running";
  const isError = status.type === "incomplete" || Boolean(status.error);
  const isComplete = status.type === "complete" && !isError;

  const targetToolInfo = useMemo(() => {
    if (!parsedArgs || typeof parsedArgs !== "object") {
      return { name: toolName, args: parsedArgs };
    }
    const orig = parsedArgs.originalFunctionCall as Record<string, unknown> | undefined;
    const toolConf = parsedArgs.toolConfirmation as Record<string, unknown> | undefined;
    const payload = toolConf?.payload as Record<string, unknown> | undefined;

    const name =
      (orig?.name as string) ||
      (payload?.tool_name as string) ||
      (toolConf?.tool_name as string) ||
      toolName;

    const targetArgs = orig?.args || payload?.args || toolConf?.args || parsedArgs;

    return { name, args: targetArgs };
  }, [parsedArgs, toolName]);

  const hitlDescription = useMemo(() => {
    if (parsedArgs && typeof parsedArgs === "object") {
      const toolConf = parsedArgs.toolConfirmation as Record<string, unknown> | undefined;
      const hint = toolConf?.hint;
      if (typeof hint === "string" && hint.trim()) {
        return hint.trim();
      }

      const customPrompt =
        parsedArgs.prompt ||
        parsedArgs.action_description ||
        parsedArgs.actionDescription ||
        parsedArgs.description ||
        parsedArgs.message ||
        parsedArgs.query ||
        parsedArgs.action;
      if (typeof customPrompt === "string" && customPrompt.trim()) {
        return customPrompt.trim();
      }
    }
    if (targetToolInfo.name && targetToolInfo.name !== "adk_request_confirmation") {
      return `The agent requests authorization to execute "${targetToolInfo.name}".`;
    }
    return "Action requires human approval to proceed";
  }, [parsedArgs, targetToolInfo.name]);

  const formattedArgs = useMemo(() => {
    const rawToFormat = targetToolInfo.args ?? args;
    if (argsText && (!parsedArgs || Object.keys(parsedArgs).length === 0)) {
      try {
        return JSON.stringify(JSON.parse(argsText), null, 2);
      } catch {
        return argsText;
      }
    }
    if (typeof rawToFormat === "string") {
      try {
        return JSON.stringify(JSON.parse(rawToFormat), null, 2);
      } catch {
        return rawToFormat;
      }
    }
    if (rawToFormat !== undefined && rawToFormat !== null) {
      return JSON.stringify(rawToFormat, null, 2);
    }
    return "";
  }, [args, argsText, parsedArgs, targetToolInfo.args]);

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
      let handled = false;
      if (addResult) {
        addResult({ confirmed: true });
        handled = true;
      }
      if (respondToApproval) {
        respondToApproval(payload);
        handled = true;
      }
      if (resume) {
        resume(payload);
        handled = true;
      }
      if (!handled && aui?.thread?.append) {
        aui.thread.append({
          role: "user",
          content: [{ type: "text", text: "Yes, I approve and confirm this action." }],
        });
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
      let handled = false;
      if (addResult) {
        addResult({ confirmed: false });
        handled = true;
      }
      if (respondToApproval) {
        respondToApproval(payload);
        handled = true;
      }
      if (resume) {
        resume(payload);
        handled = true;
      }
      if (!handled && aui?.thread?.append) {
        aui.thread.append({
          role: "user",
          content: [{ type: "text", text: "No, I decline and cancel this action." }],
        });
      }
      setSubmittedDecision("declined");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={cn(
        "my-3 overflow-hidden rounded-2xl border text-xs transition-all",
        isRequiresAction
          ? "border-amber-500/30 bg-amber-500/10 shadow-sm dark:border-amber-400/25 dark:bg-amber-950/25"
          : "border-[#e3e3e3] bg-[#f8fafd] dark:border-[#333537] dark:bg-[#1a1c1e]",
        className
      )}
    >
      {/* For HITL Requires Action: Render prominent confirmation card directly in message area */}
      {isRequiresAction ? (
        <div className="p-4 space-y-3">
          {/* Top header row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
              </div>
              <span className="font-semibold text-sm text-amber-950 dark:text-amber-100">
                Action Requires Approval
              </span>
              <span className="rounded-md bg-amber-500/15 px-2 py-0.5 font-mono text-[11px] text-amber-800 dark:text-amber-300">
                {targetToolInfo.name}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                Requires Approval
              </span>
              <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                aria-expanded={isOpen}
                aria-label={toolName}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-amber-500/15 hover:text-foreground"
              >
                <span>{isOpen ? "Hide Details" : "View Details"}</span>
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* Action Prompt / Description */}
          <div className="rounded-xl border border-amber-500/20 bg-white/70 p-3 text-[14px] font-medium leading-relaxed text-[#1f1f1f] shadow-xs dark:border-amber-400/20 dark:bg-black/30 dark:text-[#e3e3e3]">
            {hitlDescription}
          </div>

          {/* Action Decision Buttons */}
          <div className="flex items-center justify-between pt-0.5">
            {!submittedDecision && result === undefined ? (
              <div className="flex items-center gap-2.5">
                <Button
                  size="sm"
                  type="button"
                  onClick={handleApprove}
                  disabled={isSubmitting}
                  aria-label="Approve tool execution"
                  className="h-8 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 active:scale-95 disabled:opacity-50 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                >
                  {isSubmitting ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="mr-1.5 h-3.5 w-3.5 stroke-[2.5]" />
                  )}
                  Approve Action
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={handleDecline}
                  disabled={isSubmitting}
                  aria-label="Decline tool execution"
                  className="h-8 rounded-xl border-amber-300 bg-white px-4 text-xs font-semibold text-[#444746] shadow-xs hover:border-destructive hover:bg-rose-50 hover:text-destructive active:scale-95 disabled:opacity-50 dark:border-amber-800/60 dark:bg-[#282a2c] dark:text-[#c4c7c5] dark:hover:bg-[#333537] dark:hover:text-rose-400"
                >
                  <X className="mr-1.5 h-3.5 w-3.5 stroke-[2.5]" />
                  Decline Action
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-1.5 text-xs font-medium dark:bg-black/30">
                {submittedDecision === "approved" ||
                (result as Record<string, unknown>)?.confirmed === true ||
                (result as Record<string, unknown>)?.approved === true ? (
                  <span className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                    <Check className="h-4 w-4 stroke-[2.5]" /> Approved by user — resuming
                    execution
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 font-semibold text-rose-600 dark:text-rose-400">
                    <X className="h-4 w-4 stroke-[2.5]" /> Declined by user — execution
                    canceled
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Normal tool execution header */
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-label={toolName}
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
