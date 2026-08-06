"use client";

import { useState } from "react";
import { Wrench, CheckCircle2, ChevronDown, ChevronRight, Loader2 } from "lucide-react";

interface ToolCallProps {
  toolName: string;
  args?: Record<string, unknown>;
  result?: unknown;
  status?: "running" | "complete" | "incomplete";
}

export function GeminiToolCall({
  toolName,
  args,
  result,
  status = "complete",
}: ToolCallProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="my-2 overflow-hidden rounded-2xl border border-border/60 bg-muted/30 text-xs dark:bg-muted/10">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-3 py-2 text-left font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
      >
        <div className="flex items-center gap-2">
          {status === "running" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          ) : (
            <Wrench className="h-3.5 w-3.5 text-[#1a73e8] dark:text-[#8ab4f8]" />
          )}
          <span>
            Used tool: <span className="font-mono text-foreground">{toolName}</span>
          </span>
        </div>

        <div className="flex items-center gap-1">
          {status === "complete" && (
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          )}
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="border-t border-border/40 bg-background/50 p-3 space-y-2 font-mono">
          {args && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Arguments
              </div>
              <pre className="mt-1 overflow-x-auto rounded-lg bg-muted/50 p-2 text-[11px] text-foreground">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}
          {result !== undefined && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Result
              </div>
              <pre className="mt-1 max-h-40 overflow-x-auto rounded-lg bg-muted/50 p-2 text-[11px] text-foreground">
                {typeof result === "string" ? result : JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function GeminiReasoningTrace({ thought }: { thought: string }) {
  const [isOpen, setIsOpen] = useState(false);

  if (!thought) return null;

  return (
    <div className="my-2 rounded-2xl border border-border/40 bg-muted/20 text-xs">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left font-medium text-[#444746] transition-colors hover:text-foreground dark:text-[#c4c7c5]"
      >
        <span className="h-2 w-2 rounded-full bg-[#1a73e8] animate-pulse" />
        <span>Thinking process</span>
        {isOpen ? (
          <ChevronDown className="ml-auto h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="ml-auto h-3.5 w-3.5" />
        )}
      </button>

      {isOpen && (
        <div className="border-t border-border/40 p-3 text-muted-foreground leading-relaxed text-xs">
          {thought}
        </div>
      )}
    </div>
  );
}
