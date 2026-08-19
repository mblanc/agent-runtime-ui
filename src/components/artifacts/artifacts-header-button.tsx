"use client";

import { FC } from "react";
import { Sparkles, ChevronDown } from "lucide-react";
import { useOptionalArtifacts } from "@/lib/artifacts/artifact-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const ArtifactsHeaderButton: FC = () => {
  const artifactsContext = useOptionalArtifacts();
  if (!artifactsContext) return null;

  const { artifacts, isOpen, toggleCanvas, openArtifact } = artifactsContext;
  const count = artifacts.length;

  if (count === 0) {
    return null;
  }

  return (
    <div className="flex items-center">
      {count === 1 ? (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isOpen ? "secondary" : "ghost"}
                size="sm"
                onClick={toggleCanvas}
                className="h-8 px-2.5 text-xs font-medium gap-1.5 text-muted-foreground hover:text-foreground relative"
                aria-label="Toggle workspace canvas"
              >
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="hidden sm:inline">Canvas</span>
                <span className="inline-flex items-center justify-center px-1.5 py-0.2 text-[10px] font-mono font-semibold rounded-full bg-primary/15 text-primary">
                  1
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open workspace canvas (⌘\)</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={isOpen ? "secondary" : "ghost"}
              size="sm"
              className="h-8 px-2.5 text-xs font-medium gap-1.5 text-muted-foreground hover:text-foreground relative"
              aria-label="Artifacts shelf"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="hidden sm:inline">Canvas</span>
              <span className="inline-flex items-center justify-center px-1.5 py-0.2 text-[10px] font-mono font-semibold rounded-full bg-primary/15 text-primary">
                {count}
              </span>
              <ChevronDown className="w-3 h-3 text-muted-foreground ml-0.5" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-64 text-xs">
            <DropdownMenuLabel className="flex items-center justify-between text-muted-foreground text-[11px]">
              <span>Artifacts Workspace</span>
              <span>{count} items</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {artifacts.map((art) => (
              <DropdownMenuItem
                key={art.filename}
                onClick={() => openArtifact(art.filename)}
                className="flex items-center justify-between cursor-pointer py-1.5"
              >
                <div className="flex flex-col min-w-0">
                  <span className="font-medium truncate text-foreground text-xs">
                    {art.title || art.filename}
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground truncate">
                    {art.filename}
                  </span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-muted text-muted-foreground shrink-0 ml-2">
                  v{art.currentVersion}
                </span>
              </DropdownMenuItem>
            ))}

            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={toggleCanvas}
              className="text-center justify-center text-primary font-medium cursor-pointer text-xs py-1.5"
            >
              {isOpen ? "Close Canvas" : "Open Workspace Canvas (⌘\\)"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};
