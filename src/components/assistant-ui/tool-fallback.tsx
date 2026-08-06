"use client";

import { useState } from "react";
import {
  Wrench,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ToolFallbackProps {
  toolName?: string;
  args?: Record<string, unknown> | string;
  result?: unknown;
  status?: {
    type: "running" | "complete" | "incomplete" | "requires-action";
    reason?: string;
    error?: unknown;
  };
  className?: string;
}

export function ToolFallback({
  toolName = "tool_call",
  args,
  result,
  status = { type: "complete" },
  className,
}: ToolFallbackProps) {
  const isRunning = status.type === "running";
  const isError = status.type === "incomplete" || Boolean(status.error);
  const [isOpen, setIsOpen] = useState(false);

  const formattedArgs = typeof args === "string" ? args : JSON.stringify(args, null, 2);
  const formattedResult =
    typeof result === "string" ? result : JSON.stringify(result, null, 2);

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-2xl border border-[#e3e3e3] bg-[#f8fafd] text-xs transition-all dark:border-[#333537] dark:bg-[#1a1c1e]",
        className
      )}
    >
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left font-medium text-[#444746] transition-colors hover:bg-[#eff2f6] dark:text-[#c4c7c5] dark:hover:bg-[#282a2c]"
      >
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-[#1a73e8] dark:text-[#8ab4f8]" />
          <span className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">
            {toolName}
          </span>
          {isRunning && (
            <span className="flex items-center gap-1 text-[11px] text-[#1a73e8] dark:text-[#8ab4f8]">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Running</span>
            </span>
          )}
          {!isRunning && !isError && (
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

        <div className="flex items-center gap-1 text-muted-foreground">
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-[#e3e3e3] bg-white/50 p-3 font-mono text-[11px] dark:border-[#333537] dark:bg-[#141517]">
          {args && (
            <div className="mb-2">
              <div className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Arguments
              </div>
              <pre className="max-h-40 overflow-auto rounded-lg bg-muted/50 p-2 text-foreground">
                {formattedArgs}
              </pre>
            </div>
          )}

          {result !== undefined && (
            <div>
              <div className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Result
              </div>
              <pre className="max-h-60 overflow-auto rounded-lg bg-muted/50 p-2 text-foreground">
                {formattedResult}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
