"use client";

import { useState } from "react";
import { Brain, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import type { MemoryRetrievalItem } from "@/types/agent";
import { formatTopicName, getTopicBadgeStyles } from "./memory-item-card";
import { cn } from "@/lib/utils";

interface MemoryRetrievalBadgeProps {
  memories?: MemoryRetrievalItem[];
  className?: string;
}

export function MemoryRetrievalBadge({ memories, className }: MemoryRetrievalBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!memories || memories.length === 0) {
    return null;
  }

  const count = memories.length;
  const previewText = memories
    .slice(0, 2)
    .map((m) => `"${m.fact.length > 28 ? m.fact.substring(0, 25) + "..." : m.fact}"`)
    .join(", ");

  return (
    <div className={cn("my-1.5 flex flex-col items-start", className)}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="group inline-flex items-center gap-1.5 rounded-full border border-[#d3e3fd] bg-[#f0f4f9]/80 px-3 py-1 text-xs font-medium text-[#062e6f] shadow-2xs transition-all hover:bg-[#e2ecfd] dark:border-[#1b2f9c]/60 dark:bg-[#1b2f9c]/20 dark:text-[#d3e3fd] dark:hover:bg-[#1b2f9c]/40"
        aria-expanded={isOpen}
        aria-label={`Toggle applied memories list, ${count} memories applied`}
      >
        <Brain className="h-3.5 w-3.5 text-[#1a73e8] dark:text-[#8ab4f8]" />
        <span>
          <strong className="font-semibold">{count}</strong>{" "}
          {count === 1 ? "Memory" : "Memories"} Applied
        </span>
        <span className="hidden sm:inline text-muted-foreground/80 font-normal">
          : {previewText}
        </span>
        {isOpen ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground transition-transform" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform" />
        )}
      </button>

      {isOpen && (
        <div className="mt-2 w-full max-w-lg rounded-2xl border border-border/60 bg-background/95 p-3.5 shadow-lg backdrop-blur-xs transition-all dark:bg-[#1e1f20]/95 animate-in fade-in-0 zoom-in-95">
          <div className="mb-2.5 flex items-center justify-between border-b border-border/40 pb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              <span>Retrieved Memory Context</span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Vertex AI Memory Bank
            </span>
          </div>

          <div className="space-y-2">
            {memories.map((mem, idx) => (
              <div
                key={mem.id || `retrieved-${idx}`}
                className="flex items-start justify-between gap-2.5 rounded-xl border border-border/40 bg-muted/30 p-2.5 text-xs transition-colors hover:bg-muted/50"
              >
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <span className="font-normal text-foreground leading-relaxed">
                    &ldquo;{mem.fact}&rdquo;
                  </span>
                  {mem.topic && (
                    <span
                      className={cn(
                        "w-fit rounded px-1.5 py-0.2 text-[10px] font-medium border",
                        getTopicBadgeStyles(mem.topic)
                      )}
                    >
                      {formatTopicName(mem.topic)}
                    </span>
                  )}
                </div>
                {mem.relevanceScore !== undefined && (
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                    {Math.round(mem.relevanceScore * 100)}% match
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
