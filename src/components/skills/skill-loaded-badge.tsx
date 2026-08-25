"use client";

import { useState } from "react";
import {
  Puzzle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Loader2,
  AlertTriangle,
} from "lucide-react";
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
  const isError = status === "error" || Boolean(skill.error);

  const displayName = skill.skillName || "Skill";
  const formattedTitle = displayName
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div
      className={cn(
        "my-2 overflow-hidden rounded-2xl border text-xs transition-all",
        isError
          ? "border-rose-200 bg-[#fffbfa] dark:border-rose-900/60 dark:bg-[#201518]"
          : "border-purple-200 bg-[#fbf9fe] dark:border-purple-900/60 dark:bg-[#1c1624]",
        className
      )}
      data-testid="skill-loaded-badge"
    >
      {/* Header Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className={cn(
          "flex w-full items-center justify-between px-3.5 py-2.5 text-left font-medium text-[#3c4043] transition-colors dark:text-[#c4c7c5]",
          isError
            ? "hover:bg-rose-50/70 dark:hover:bg-rose-950/40"
            : "hover:bg-purple-50/70 dark:hover:bg-purple-950/40"
        )}
      >
        <div className="flex items-center gap-2">
          {/* Puzzle Icon */}
          <div
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full",
              isError
                ? "bg-rose-500/15 text-rose-600 dark:bg-rose-400/20 dark:text-rose-300"
                : "bg-purple-500/15 text-purple-600 dark:bg-purple-400/20 dark:text-purple-300"
            )}
          >
            <Puzzle className="h-3.5 w-3.5" />
          </div>

          {/* Skill Title & Loaded Label */}
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "font-semibold",
                isError
                  ? "text-rose-950 dark:text-rose-100"
                  : "text-purple-950 dark:text-purple-100"
              )}
            >
              {isError ? "Skill Load Failed:" : "Skill Loaded:"}
            </span>
            <span className="font-medium text-foreground">{formattedTitle}</span>
          </div>

          {/* Version Pill */}
          {skill.version && (
            <span className="rounded-md bg-purple-500/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-purple-700 dark:bg-purple-400/15 dark:text-purple-300">
              v{skill.version}
            </span>
          )}

          {/* Running vs Executed vs Error Status */}
          {isRunning ? (
            <span className="flex items-center gap-1 text-[11px] text-purple-600 dark:text-purple-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Loading...</span>
            </span>
          ) : isError ? (
            <span className="flex items-center gap-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">
              <AlertTriangle className="h-3 w-3" />
              <span>Error</span>
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
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5",
                isError
                  ? "text-rose-600 dark:text-rose-400"
                  : "text-purple-600 dark:text-purple-400"
              )}
            />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </div>
      </button>

      {/* Expanded Metadata Card */}
      {isOpen && (
        <div
          className={cn(
            "border-t p-3",
            isError
              ? "border-rose-200/70 dark:border-rose-900/50"
              : "border-purple-200/70 dark:border-purple-900/50"
          )}
        >
          <SkillMetadataCard skill={skill} />
        </div>
      )}
    </div>
  );
}
