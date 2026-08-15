"use client";

import { useAuiState } from "@assistant-ui/react";
import { SlidersHorizontal, ArrowUpRight } from "lucide-react";
import type { AgentActionsDelta, SessionStateMap } from "@/types/agent";
import { useOptionalSessionState } from "@/lib/session-state/state-context";
import { cn } from "@/lib/utils";

export interface StateDeltaChipProps {
  actions?: AgentActionsDelta;
  className?: string;
}

export function StateDeltaChip({ actions: propActions, className }: StateDeltaChipProps) {
  const sessionStateContext = useOptionalSessionState();

  const customActions = useAuiState(
    (s: {
      message?: {
        metadata?: {
          custom?: {
            actions?: AgentActionsDelta;
          };
        };
      };
    }) => ("message" in s ? s.message?.metadata?.custom?.actions : undefined)
  );

  const actions = propActions || customActions;
  const stateDelta: SessionStateMap | undefined = actions?.state_delta;

  if (!stateDelta || Object.keys(stateDelta).length === 0) {
    return null;
  }

  const entries = Object.entries(stateDelta);
  const displayCount = entries.length;

  const handleOpenDrawer = () => {
    sessionStateContext?.setIsDrawerOpen(true);
  };

  return (
    <div
      onClick={handleOpenDrawer}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleOpenDrawer();
        }
      }}
      aria-label={`Session State Delta: ${displayCount} variable${displayCount > 1 ? "s" : ""} modified`}
      className={cn(
        "group my-2 inline-flex flex-wrap items-center gap-2 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/15 border border-indigo-500/25 px-3 py-1.5 text-xs text-indigo-950 dark:text-indigo-200 transition-all cursor-pointer shadow-xs",
        className
      )}
    >
      <div className="flex items-center gap-1.5 font-medium">
        <SlidersHorizontal className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
        <span className="font-semibold text-indigo-900 dark:text-indigo-300">
          State Delta ({displayCount}):
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {entries.slice(0, 3).map(([key, val]) => {
          const displayVal =
            typeof val === "object" && val !== null ? "{...}" : String(val);

          return (
            <span
              key={key}
              className="inline-flex items-center gap-1 rounded-md bg-background/80 px-1.5 py-0.5 font-mono text-[11px] text-foreground border border-border/40"
            >
              <span className="text-indigo-600 dark:text-indigo-400">{key}:</span>
              <span className="max-w-[120px] truncate text-muted-foreground">
                {displayVal}
              </span>
            </span>
          );
        })}

        {displayCount > 3 && (
          <span className="text-[10px] text-muted-foreground font-mono">
            +{displayCount - 3} more
          </span>
        )}
      </div>

      <span className="inline-flex items-center text-[10px] font-medium text-indigo-600 dark:text-indigo-400 group-hover:underline ml-auto">
        Inspect{" "}
        <ArrowUpRight className="h-3 w-3 ml-0.5 opacity-70 group-hover:opacity-100" />
      </span>
    </div>
  );
}
