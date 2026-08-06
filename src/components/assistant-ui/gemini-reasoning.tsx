"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, BrainCircuit, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface GeminiReasoningAccordionProps {
  thoughtText?: string;
  durationSeconds?: number;
  stepsCount?: number;
  isStreaming?: boolean;
  className?: string;
}

export function GeminiReasoningAccordion({
  thoughtText,
  durationSeconds = 0,
  stepsCount = 1,
  isStreaming = false,
  className,
}: GeminiReasoningAccordionProps) {
  const [isOpen, setIsOpen] = useState(isStreaming);

  if (!thoughtText && !isStreaming) return null;

  return (
    <div
      className={cn(
        "my-2.5 overflow-hidden rounded-2xl border border-[#e3e3e3] bg-[#f8fafd] transition-all dark:border-[#333537] dark:bg-[#1a1c1e]",
        className
      )}
    >
      {/* Header / Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs font-medium text-[#444746] transition-colors hover:bg-[#eff2f6] dark:text-[#c4c7c5] dark:hover:bg-[#282a2c]"
      >
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-4 w-4 text-[#1a73e8] dark:text-[#8ab4f8]" />
          <span className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">
            {isStreaming ? "Thinking..." : "Thinking Process"}
          </span>
          {durationSeconds > 0 && (
            <span className="rounded-full bg-[#e8eaed] px-2 py-0.5 text-[11px] text-muted-foreground dark:bg-[#282a2c]">
              {durationSeconds.toFixed(1)}s
            </span>
          )}
          {stepsCount > 1 && (
            <span className="rounded-full bg-[#e8eaed] px-2 py-0.5 text-[11px] text-muted-foreground dark:bg-[#282a2c]">
              {stepsCount} steps
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

      {/* Expandable Reasoning Content */}
      {isOpen && (
        <div className="border-t border-[#e3e3e3] px-4 py-3 text-xs leading-relaxed text-[#444746] dark:border-[#333537] dark:text-[#c4c7c5]">
          {/* Multi-step progression chips */}
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="flex items-center gap-1 rounded-md bg-[#eaf2fd] px-2 py-1 text-[11px] font-medium text-[#0b57d0] dark:bg-[#1e2a4a] dark:text-[#a8c7fa]">
              <CheckCircle2 className="h-3 w-3" />
              <span>Prompt Deconstruction</span>
            </div>
            <div className="flex items-center gap-1 rounded-md bg-[#eaf2fd] px-2 py-1 text-[11px] font-medium text-[#0b57d0] dark:bg-[#1e2a4a] dark:text-[#a8c7fa]">
              <CheckCircle2 className="h-3 w-3" />
              <span>Council Deliberation & Verification</span>
            </div>
            <div className="flex items-center gap-1 rounded-md bg-[#eaf2fd] px-2 py-1 text-[11px] font-medium text-[#0b57d0] dark:bg-[#1e2a4a] dark:text-[#a8c7fa]">
              <CheckCircle2 className="h-3 w-3" />
              <span>Consensus Synthesis</span>
            </div>
          </div>

          {/* Detailed Thought Content */}
          <div className="whitespace-pre-wrap font-mono text-[11.5px] leading-5 text-[#575b5f] dark:text-[#9aa0a6]">
            {thoughtText || "Deliberating across LLM Council and reasoning engines..."}
          </div>
        </div>
      )}
    </div>
  );
}
