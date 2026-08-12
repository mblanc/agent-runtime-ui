"use client";

import { useOptionalMemory } from "@/lib/memory-context";
import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface MemoryHeaderButtonProps {
  className?: string;
}

export function MemoryHeaderButton({ className }: MemoryHeaderButtonProps) {
  const memoryContext = useOptionalMemory();

  if (!memoryContext) return null;

  const { memories, isDrawerOpen, setIsDrawerOpen } = memoryContext;
  const count = memories.length;

  return (
    <button
      type="button"
      onClick={() => setIsDrawerOpen(!isDrawerOpen)}
      aria-label="Open Memory Bank"
      title="Open Memory Bank profile & preferences"
      className={cn(
        "group flex h-9 items-center gap-2 rounded-full border border-border/60 bg-white/80 px-3 text-sm font-medium text-foreground shadow-xs backdrop-blur-xs transition-all hover:bg-muted/70 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 dark:bg-[#1e1f20]/80 dark:hover:bg-[#282a2c]",
        isDrawerOpen && "border-primary/40 bg-primary/5 dark:bg-primary/10",
        className
      )}
    >
      <Brain className="h-4 w-4 shrink-0 text-[#1a73e8] transition-transform group-hover:scale-110 dark:text-[#8ab4f8]" />
      <span className="hidden font-medium sm:inline">Memory Bank</span>
      {count > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#d3e3fd] px-1.5 text-[11px] font-semibold text-[#062e6f] dark:bg-[#1b2f9c] dark:text-[#d3e3fd]">
          {count}
        </span>
      )}
    </button>
  );
}
