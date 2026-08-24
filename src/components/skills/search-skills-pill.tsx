"use client";

import { useState } from "react";
import { Search, ChevronDown, ChevronRight, Puzzle, Loader2 } from "lucide-react";
import type { SkillSearchMatch } from "@/types/agent";
import { cn } from "@/lib/utils";

export interface SearchSkillsPillProps {
  query: string;
  matches?: SkillSearchMatch[];
  status?: "running" | "complete" | string;
  className?: string;
}

export function SearchSkillsPill({
  query,
  matches = [],
  status = "complete",
  className,
}: SearchSkillsPillProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isRunning = status === "running";
  const hasMatches = matches.length > 0;

  return (
    <div
      className={cn(
        "my-1.5 overflow-hidden rounded-xl border border-indigo-200/80 bg-indigo-50/40 text-xs transition-all dark:border-indigo-900/50 dark:bg-indigo-950/20",
        className
      )}
      data-testid="search-skills-pill"
    >
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-2 text-indigo-950 dark:text-indigo-200">
          <div className="flex h-4 w-4 items-center justify-center rounded-full bg-indigo-500/15 text-indigo-600 dark:bg-indigo-400/20 dark:text-indigo-300">
            {isRunning ? (
              <Loader2 className="h-2.5 w-2.5 animate-spin" />
            ) : (
              <Search className="h-2.5 w-2.5" />
            )}
          </div>
          <span className="font-medium">
            Searched Skill Registry for:{" "}
            <strong className="font-semibold">&ldquo;{query}&rdquo;</strong>
          </span>

          {hasMatches && (
            <span className="rounded-full bg-indigo-500/10 px-2 py-0.2 font-mono text-[10px] text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300">
              {matches.length} {matches.length === 1 ? "match" : "matches"}
            </span>
          )}
        </div>

        {hasMatches && (
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            aria-expanded={isOpen}
            className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 transition-colors hover:bg-indigo-100/60 dark:text-indigo-400 dark:hover:bg-indigo-900/40"
          >
            <span>{isOpen ? "Hide" : "Matches"}</span>
            {isOpen ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </button>
        )}
      </div>

      {/* Expanded Matches List */}
      {isOpen && hasMatches && (
        <div className="border-t border-indigo-200/60 bg-white/50 p-2.5 dark:border-indigo-900/40 dark:bg-black/20">
          <div className="flex flex-col gap-1.5">
            {matches.map((m, idx) => (
              <div
                key={`${m.skillName}-${idx}`}
                className="flex items-start justify-between gap-2 rounded-lg border border-indigo-100 bg-white/80 p-2 text-[11px] dark:border-indigo-950 dark:bg-black/40"
              >
                <div className="flex items-start gap-1.5">
                  <Puzzle className="mt-0.5 h-3 w-3 text-indigo-500 shrink-0 dark:text-indigo-400" />
                  <div>
                    <div className="font-semibold text-foreground">
                      {m.skillName}
                      {m.version && (
                        <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                          v{m.version}
                        </span>
                      )}
                    </div>
                    {m.description && (
                      <p className="text-[10px] text-muted-foreground">{m.description}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
