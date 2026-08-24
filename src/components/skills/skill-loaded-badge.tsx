"use client";

import { useState } from "react";
import { Puzzle, ChevronDown, ChevronRight, CheckCircle2, Loader2 } from "lucide-react";
import type { LoadedSkillMetadata } from "@/types/agent";
import { cn } from "@/lib/utils";
import { SkillMetadataCard } from "./skill-metadata-card";

export interface SkillLoadedBadgeProps {
  skill: LoadedSkillMetadata;
  status?: "running" | "complete" | "error" | string;
  defaultOpen?: boolean;
  className?: string;
}

export function SkillLoadedBadge({
  skill,
  status = "complete",
  defaultOpen = false,
  className,
}: SkillLoadedBadgeProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const isRunning = status === "running";

  const displayName = skill.skillName || "Skill";
  const formattedTitle = displayName
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-2xl border border-purple-200 bg-[#fbf9fe] text-xs transition-all dark:border-purple-900/60 dark:bg-[#1c1624]",
        className
      )}
      data-testid="skill-loaded-badge"
    >
      {/* Header Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between px-3.5 py-2.5 text-left font-medium text-[#3c4043] transition-colors hover:bg-purple-50/70 dark:text-[#c4c7c5] dark:hover:bg-purple-950/40"
      >
        <div className="flex items-center gap-2">
          {/* Puzzle Icon */}
          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/15 text-purple-600 dark:bg-purple-400/20 dark:text-purple-300">
            <Puzzle className="h-3.5 w-3.5" />
          </div>

          {/* Skill Title & Loaded Label */}
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-purple-950 dark:text-purple-100">
              Skill Loaded:
            </span>
            <span className="font-medium text-foreground">{formattedTitle}</span>
          </div>

          {/* Version Pill */}
          {skill.version && (
            <span className="rounded-md bg-purple-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-purple-700 dark:bg-purple-400/15 dark:text-purple-300">
              v{skill.version}
            </span>
          )}

          {/* Running vs Executed Status */}
          {isRunning ? (
            <span className="flex items-center gap-1 text-[11px] text-purple-600 dark:text-purple-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Loading...</span>
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              <span>Mounted</span>
            </span>
          )}
        </div>

        {/* View / Hide Details Toggle */}
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span>{isOpen ? "Hide" : "View"}</span>
          {isOpen ? (
            <ChevronDown className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </div>
      </button>

      {/* Expanded Metadata Card */}
      {isOpen && (
        <div className="border-t border-purple-200/70 p-3 dark:border-purple-900/50">
          <SkillMetadataCard skill={skill} />
        </div>
      )}
    </div>
  );
}
