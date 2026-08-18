"use client";

import { FC, useState } from "react";
import { Check, Copy, Terminal, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { ansiToHtml } from "@/lib/code-execution/ansi-to-html";
import type { CodeExecutionOutcome } from "@/types/agent";

export interface ConsoleOutputPanelProps {
  stdout: string;
  outcome?: CodeExecutionOutcome;
  durationMs?: number;
  className?: string;
}

export const ConsoleOutputPanel: FC<ConsoleOutputPanelProps> = ({
  stdout,
  outcome = "OUTCOME_OK",
  durationMs,
  className,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!stdout) return;
    try {
      await navigator.clipboard.writeText(stdout);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failures
    }
  };

  const isFailed =
    outcome === "OUTCOME_FAILED" || outcome === "OUTCOME_DEADLINE_EXCEEDED";
  const formattedHtml = ansiToHtml(stdout);

  return (
    <div
      className={cn(
        "relative rounded-xl border border-[#e3e3e3] bg-[#141517] text-[13px] text-zinc-200 dark:border-[#333537]",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-zinc-800 bg-[#1c1e21] px-3 py-1.5 text-xs text-zinc-400">
        <div className="flex items-center gap-2">
          <Terminal className="h-3.5 w-3.5 text-zinc-400" />
          <span className="font-mono font-medium">Console Output</span>
          {durationMs !== undefined && (
            <span className="flex items-center gap-1 text-[11px] text-zinc-500">
              <Clock className="h-3 w-3" />
              {durationMs}ms
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isFailed && (
            <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-rose-400">
              {outcome === "OUTCOME_DEADLINE_EXCEEDED" ? "Timeout" : "Error"}
            </span>
          )}
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy output"
            className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="max-h-80 overflow-auto p-3 font-mono leading-relaxed select-text">
        {formattedHtml ? (
          <pre
            className="m-0 whitespace-pre-wrap break-all text-xs"
            dangerouslySetInnerHTML={{ __html: formattedHtml }}
          />
        ) : (
          <div className="italic text-zinc-500 text-xs">
            (No standard output produced)
          </div>
        )}
      </div>
    </div>
  );
};
