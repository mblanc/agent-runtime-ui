"use client";

import { useState, useMemo, ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  Wrench,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  isLoadSkillTool,
  isSearchSkillsTool,
  parseLoadedSkillPayload,
  parseSearchSkillsPayload,
} from "@/lib/skills/skill-parser";
import { SkillLoadedBadge, SearchSkillsPill } from "@/components/skills";

export interface ToolCollapsibleProps {
  toolName?: string;
  args?: string | Record<string, unknown>;
  result?: string | Record<string, unknown>;
  status?: "running" | "complete" | "error" | string;
  children?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function ToolCollapsible({
  toolName = "tool",
  args,
  result,
  status = "complete",
  children,
  defaultOpen = false,
  className,
}: ToolCollapsibleProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const isRunning = status === "running";
  const isError = status === "error" || status === "incomplete";

  const loadedSkill = useMemo(() => {
    if (isLoadSkillTool(toolName)) {
      return parseLoadedSkillPayload(args, result);
    }
    return null;
  }, [toolName, args, result]);

  const searchSkills = useMemo(() => {
    if (isSearchSkillsTool(toolName)) {
      return parseSearchSkillsPayload(args, result);
    }
    return null;
  }, [toolName, args, result]);

  if (loadedSkill) {
    return (
      <SkillLoadedBadge
        skill={loadedSkill}
        status={status}
        defaultOpen={defaultOpen}
        className={className}
      />
    );
  }

  if (searchSkills) {
    return (
      <SearchSkillsPill
        query={searchSkills.query}
        matches={searchSkills.matches}
        status={status}
        className={className}
      />
    );
  }

  const formattedArgs =
    typeof args === "string" ? args : args ? JSON.stringify(args, null, 2) : "";

  const formattedResult =
    typeof result === "string" ? result : result ? JSON.stringify(result, null, 2) : "";

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-2xl border border-[#e3e3e3] bg-[#f8fafd] text-xs transition-all dark:border-[#333537] dark:bg-[#1a1c1e]",
        className
      )}
    >
      {/* Disclosure Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left font-medium text-[#444746] transition-colors hover:bg-[#eff2f6] dark:text-[#c4c7c5] dark:hover:bg-[#282a2c]"
      >
        <div className="flex items-center gap-2">
          {/* Tool Icon */}
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1a73e8]/10 text-[#1a73e8] dark:bg-[#8ab4f8]/15 dark:text-[#8ab4f8]">
            <Wrench className="h-3.5 w-3.5" />
          </div>

          {/* Tool Name */}
          <span className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">
            {toolName}
          </span>

          {/* Status badge */}
          {isRunning && (
            <span className="flex items-center gap-1 text-[11px] text-[#1a73e8] dark:text-[#8ab4f8]">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Running</span>
            </span>
          )}

          {status === "requires-action" && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-3 w-3" />
              <span>Requires Approval</span>
            </span>
          )}

          {!isRunning && status !== "requires-action" && !isError && (
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

        {/* Disclosure Triangle */}
        <div className="flex items-center gap-1 text-muted-foreground transition-transform duration-200">
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-[#1a73e8] dark:text-[#8ab4f8]" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </div>
      </button>

      {/* Expanded Details Panel */}
      {isOpen && (
        <div className="border-t border-[#e3e3e3] bg-white/60 p-3.5 font-mono text-[11px] dark:border-[#333537] dark:bg-[#141517]/80">
          {formattedArgs && (
            <div className="mb-2.5">
              <div className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Arguments
              </div>
              <pre className="max-h-48 overflow-auto rounded-lg border border-[#d3d7dc] bg-[#eef2f6] p-2.5 font-mono text-[11px] text-[#1f1f1f] dark:border-[#333537] dark:bg-[#1a1c1e] dark:text-[#e3e3e3]">
                {formattedArgs}
              </pre>
            </div>
          )}

          {formattedResult && (
            <div>
              <div className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Result
              </div>
              <pre className="max-h-60 overflow-auto rounded-lg border border-[#d3d7dc] bg-[#eef2f6] p-2.5 font-mono text-[11px] text-[#1f1f1f] dark:border-[#333537] dark:bg-[#1a1c1e] dark:text-[#e3e3e3]">
                {formattedResult}
              </pre>
            </div>
          )}

          {isRunning && !formattedResult && (
            <div className="flex items-center gap-2 py-1 text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
              <span>Executing tool and awaiting response...</span>
            </div>
          )}

          {children}
        </div>
      )}
    </div>
  );
}
