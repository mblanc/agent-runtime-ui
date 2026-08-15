"use client";

import { useOptionalSessionState } from "@/lib/session-state/state-context";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface SessionStateHeaderButtonProps {
  className?: string;
}

export function SessionStateHeaderButton({ className }: SessionStateHeaderButtonProps) {
  const sessionStateContext = useOptionalSessionState();

  if (!sessionStateContext) return null;

  const { state, isDrawerOpen, setIsDrawerOpen } = sessionStateContext;
  const count = Object.keys(state).length;

  return (
    <button
      type="button"
      onClick={() => setIsDrawerOpen(!isDrawerOpen)}
      aria-label="Open Session State Inspector"
      title="Open ADK Session State Inspector"
      className={cn(
        "group flex h-9 items-center gap-2 rounded-full border border-border/60 bg-white/80 px-3 text-sm font-medium text-foreground shadow-xs backdrop-blur-xs transition-all hover:bg-muted/70 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95 dark:bg-[#1e1f20]/80 dark:hover:bg-[#282a2c]",
        isDrawerOpen && "border-indigo-500/40 bg-indigo-500/10 dark:bg-indigo-950/40",
        className
      )}
    >
      <SlidersHorizontal className="h-4 w-4 shrink-0 text-indigo-600 transition-transform group-hover:scale-110 dark:text-indigo-400" />
      <span className="hidden font-medium sm:inline">Session State</span>
      {count > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-100 px-1.5 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
          {count}
        </span>
      )}
    </button>
  );
}
