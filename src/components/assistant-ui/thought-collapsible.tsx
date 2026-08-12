"use client";

import { useState, ReactNode } from "react";
import { Streamdown } from "streamdown";
import {
  ChevronDown,
  ChevronRight,
  Sparkles,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ThoughtCollapsibleProps {
  title?: string;
  thought?: string;
  children?: ReactNode;
  status?: "running" | "complete" | "error" | string;
  defaultOpen?: boolean;
  className?: string;
}

export function ThoughtCollapsible({
  title = "Thought",
  thought,
  children,
  status = "complete",
  defaultOpen = false,
  className,
}: ThoughtCollapsibleProps) {
  const isRunning = status === "running";
  const isError = status === "error";
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const bodyText = thought;

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-2xl border border-[#e3e3e3] bg-[#f8fafd] text-xs transition-all dark:border-[#333537] dark:bg-[#1a1c1e]",
        className
      )}
    >
      {/* Disclosure Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left font-medium text-[#444746] transition-colors hover:bg-[#eff2f6] dark:text-[#c4c7c5] dark:hover:bg-[#282a2c]"
      >
        <div className="flex items-center gap-2">
          {/* Sparkles Icon */}
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1a73e8]/10 text-[#1a73e8] dark:bg-[#8ab4f8]/15 dark:text-[#8ab4f8]">
            <Sparkles className="h-3.5 w-3.5" />
          </div>

          {/* Title */}
          <span className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">
            {title}
          </span>

          {/* Running Spinner */}
          {isRunning && (
            <span className="flex items-center gap-1 text-[11px] text-[#1a73e8] dark:text-[#8ab4f8]">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Thinking</span>
            </span>
          )}

          {/* Completed Check */}
          {!isRunning && !isError && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              <span>Complete</span>
            </span>
          )}

          {/* Error Indicator */}
          {isError && (
            <span className="flex items-center gap-1 text-[11px] text-destructive">
              <AlertCircle className="h-3 w-3" />
              <span>Error</span>
            </span>
          )}
        </div>

        {/* Disclosure Triangle (ChevronRight / ChevronDown) */}
        <div className="flex items-center gap-1 text-muted-foreground transition-transform duration-200">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-[#1a73e8] dark:text-[#8ab4f8]" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
      </button>

      {/* Expanded Deliberation Body */}
      {isOpen && (
        <div className="border-t border-[#e3e3e3] bg-white/60 p-3.5 dark:border-[#333537] dark:bg-[#141517]/80">
          {bodyText ? (
            <div className="prose prose-neutral dark:prose-invert max-w-none text-[13px] leading-relaxed text-[#1f1f1f] dark:text-[#e3e3e3]">
              <Streamdown>{bodyText}</Streamdown>
            </div>
          ) : children ? (
            <div className="font-sans text-[13px] leading-relaxed text-[#1f1f1f] dark:text-[#e3e3e3]">
              {children}
            </div>
          ) : isRunning ? (
            <div className="flex items-center gap-2 py-1 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Thinking...</span>
            </div>
          ) : (
            <div className="italic text-muted-foreground">
              No reasoning details available.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
