"use client";

import { useActiveAgent } from "@/lib/agent-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bot, Check, ChevronDown, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DeployedAgent } from "@/types/agent";

interface AgentHeaderSelectorProps {
  className?: string;
  onAgentChange?: (agent: DeployedAgent) => void;
}

export function AgentHeaderSelector({
  className,
  onAgentChange,
}: AgentHeaderSelectorProps) {
  const { activeAgent, availableAgents, setActiveAgent, isLoading } = useActiveAgent();

  if (isLoading && !activeAgent) {
    return (
      <div
        className={cn(
          "flex h-9 items-center gap-2 rounded-full border border-border/40 bg-white/70 px-3.5 text-xs text-muted-foreground shadow-xs backdrop-blur-xs dark:bg-[#1e1f20]/70",
          className
        )}
      >
        <Sparkles className="h-3.5 w-3.5 animate-spin text-[#1a73e8] dark:text-[#8ab4f8]" />
        <span>Loading agents...</span>
      </div>
    );
  }

  if (!activeAgent && availableAgents.length === 0) {
    return null;
  }

  const currentDisplayName = activeAgent?.displayName || "Select Agent";
  const currentLocation = activeAgent?.location || "us-central1";

  const handleSelect = (agent: DeployedAgent) => {
    setActiveAgent(agent);
    onAgentChange?.(agent);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label="Select active agent"
        className={cn(
          "group flex h-9 items-center gap-2 rounded-full border border-border/60 bg-white/80 px-3.5 text-sm font-medium text-foreground shadow-xs backdrop-blur-xs transition-all hover:bg-muted/70 hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:bg-[#1e1f20]/80 dark:hover:bg-[#282a2c]",
          className
        )}
      >
        <Bot className="h-4 w-4 shrink-0 text-[#1a73e8] dark:text-[#8ab4f8]" />
        <span className="max-w-[200px] truncate font-medium sm:max-w-[280px]">
          {currentDisplayName}
        </span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-normal text-muted-foreground">
          {currentLocation}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-80 p-1.5 shadow-xl sm:w-96">
        <div className="px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Deployed Agents
        </div>

        {availableAgents.map((agent) => {
          const isActive = agent.id === activeAgent?.id;

          return (
            <DropdownMenuItem
              key={agent.id}
              onClick={() => handleSelect(agent)}
              className={cn(
                "flex cursor-pointer items-start justify-between gap-3 rounded-lg px-2.5 py-2.5 transition-colors",
                isActive
                  ? "bg-[#f0f4f9] font-medium text-foreground dark:bg-[#282a2c]"
                  : "hover:bg-muted/60"
              )}
            >
              <div className="flex flex-1 flex-col gap-0.5 overflow-hidden text-left">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-foreground">
                    {agent.displayName}
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {agent.location}
                  </span>
                </div>
                {agent.description && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {agent.description}
                  </p>
                )}
                {agent.model && (
                  <span className="text-[10px] text-[#1a73e8] dark:text-[#8ab4f8]">
                    Model: {agent.model}
                  </span>
                )}
              </div>

              {isActive && (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#1a73e8] dark:text-[#8ab4f8]" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
