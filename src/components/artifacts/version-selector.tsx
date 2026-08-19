"use client";

import { FC } from "react";
import { History, ChevronDown, Check } from "lucide-react";
import type { AgentArtifact } from "@/types/agent";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

interface VersionSelectorProps {
  artifact: AgentArtifact;
  selectedVersion: number | null;
  onSelectVersion: (version: number) => void;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatRelativeTime(isoString?: string): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export const VersionSelector: FC<VersionSelectorProps> = ({
  artifact,
  selectedVersion,
  onSelectVersion,
}) => {
  const versions = [...(artifact.versions || [])].sort((a, b) => b.version - a.version);
  const activeVerNum =
    selectedVersion !== null ? selectedVersion : artifact.currentVersion;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-xs font-mono gap-1.5 bg-background border-border text-foreground hover:bg-muted"
          aria-label="Select artifact version"
        >
          <History className="w-3.5 h-3.5 text-muted-foreground" />
          <span>v{activeVerNum}</span>
          {activeVerNum === artifact.currentVersion && (
            <span className="text-[10px] text-primary font-sans font-medium px-1 py-0.2 rounded bg-primary/10">
              latest
            </span>
          )}
          <ChevronDown className="w-3 h-3 text-muted-foreground ml-0.5" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56 text-xs">
        <DropdownMenuLabel className="text-[11px] text-muted-foreground font-normal">
          Version History ({versions.length})
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {versions.map((v) => {
          const isSelected = v.version === activeVerNum;
          const isLatest = v.version === artifact.currentVersion;

          return (
            <DropdownMenuItem
              key={v.version}
              onClick={() => onSelectVersion(v.version)}
              className="flex items-center justify-between cursor-pointer py-1.5"
            >
              <div className="flex items-center gap-2">
                {isSelected ? (
                  <Check className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <span className="w-3.5 h-3.5" />
                )}
                <div className="flex flex-col">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-medium">v{v.version}</span>
                    {isLatest && (
                      <span className="text-[9px] text-primary font-sans font-semibold px-1 py-0.2 rounded bg-primary/10">
                        latest
                      </span>
                    )}
                  </div>
                  {v.createTime && (
                    <span className="text-[10px] text-muted-foreground">
                      {formatRelativeTime(v.createTime)} • {formatBytes(v.sizeBytes)}
                    </span>
                  )}
                </div>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
