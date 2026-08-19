"use client";

import { FC, useMemo } from "react";
import {
  FileCode,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  ArrowUpRight,
} from "lucide-react";
import type { ArtifactStreamPayload } from "@/types/agent";
import { useOptionalArtifacts } from "@/lib/artifacts/artifact-context";
import { cn } from "@/lib/utils";

interface ArtifactChipProps {
  artifact: ArtifactStreamPayload;
  className?: string;
}

export const ArtifactChip: FC<ArtifactChipProps> = ({ artifact, className }) => {
  const artifactsContext = useOptionalArtifacts();

  const mime = artifact.mimeType || "text/plain";
  const icon = useMemo(() => {
    if (mime === "text/html") return <FileCode className="w-4 h-4 text-amber-500" />;
    if (mime === "text/csv" || mime === "text/tab-separated-values") {
      return <FileSpreadsheet className="w-4 h-4 text-emerald-500" />;
    }
    if (mime === "image/svg+xml" || mime.startsWith("image/"))
      return <ImageIcon className="w-4 h-4 text-purple-500" />;
    if (mime === "text/markdown") return <FileText className="w-4 h-4 text-blue-500" />;
    return <FileCode className="w-4 h-4 text-primary" />;
  }, [mime]);

  const handleClick = () => {
    if (artifactsContext) {
      artifactsContext.ingestStreamArtifact(artifact);
      artifactsContext.openArtifact(artifact.filename, artifact.version);
    }
  };

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={cn(
        "group my-3 flex items-center justify-between gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted/40 hover:border-primary/40 transition-all duration-150 cursor-pointer select-none shadow-xs",
        className
      )}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-muted border border-border/80 shrink-0 group-hover:scale-105 transition-transform">
          {icon}
        </div>

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs text-foreground truncate group-hover:text-primary transition-colors">
              {artifact.title || artifact.filename}
            </span>
            <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-primary/10 text-primary shrink-0">
              v{artifact.version}
            </span>
          </div>

          <span className="text-[11px] font-mono text-muted-foreground truncate">
            {artifact.filename}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors shrink-0">
        <span className="hidden sm:inline text-[11px]">Open Canvas</span>
        <ArrowUpRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
      </div>
    </div>
  );
};
