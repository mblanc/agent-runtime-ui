"use client";

import { ExternalLink, FileText, Globe, Database, Sparkles, Search } from "lucide-react";
import type { GroundingChunk, RetrievedContextChunk } from "@/types/agent";
import { extractDomainFromUri } from "@/lib/grounding/citation-parser";
import { cn } from "@/lib/utils";

interface SourcePopoverContentProps {
  chunk: GroundingChunk;
  index?: number;
  onInspectRagDoc?: (chunk: RetrievedContextChunk) => void;
  className?: string;
}

export function SourcePopoverContent({
  chunk,
  index,
  onInspectRagDoc,
  className,
}: SourcePopoverContentProps) {
  const isWeb = Boolean(chunk.web);
  const isRag = Boolean(chunk.retrievedContext);

  const title = chunk.web?.title || chunk.retrievedContext?.title || "Grounding Source";
  const uri = chunk.web?.uri || chunk.retrievedContext?.uri || "";
  const domain = chunk.web?.domain || extractDomainFromUri(uri);
  const textSnippet = chunk.retrievedContext?.text;
  const confidenceScore = chunk.retrievedContext?.confidenceScore;
  const corpusId = chunk.retrievedContext?.ragCorpusId;

  return (
    <div
      className={cn(
        "w-80 max-w-sm rounded-2xl border border-[#e3e3e3] bg-background/95 p-3.5 shadow-xl backdrop-blur-md dark:border-[#3c4043] dark:bg-[#1e1f20]/95 text-foreground animate-in fade-in-0 zoom-in-95",
        className
      )}
    >
      {/* Header Tag */}
      <div className="mb-2 flex items-center justify-between border-b border-border/40 pb-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          {index !== undefined && (
            <span className="flex h-4 w-4 items-center justify-center rounded-md bg-[#1a73e8]/15 text-[10px] font-bold text-[#1a73e8] dark:bg-[#8ab4f8]/20 dark:text-[#8ab4f8]">
              {index}
            </span>
          )}
          {isWeb ? (
            <div className="flex items-center gap-1 text-[#1a73e8] dark:text-[#8ab4f8]">
              <Globe className="h-3.5 w-3.5" />
              <span>Google Search Source</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
              <Database className="h-3.5 w-3.5" />
              <span>Enterprise RAG Doc</span>
            </div>
          )}
        </div>

        {domain && (
          <span className="max-w-[130px] truncate rounded-full bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {domain}
          </span>
        )}
      </div>

      {/* Title & Link */}
      <div className="flex flex-col gap-1">
        <h4 className="text-xs font-medium text-foreground leading-snug line-clamp-2">
          {title}
        </h4>

        {isWeb && uri && (
          <a
            href={uri}
            target="_blank"
            rel="noopener noreferrer"
            className="group mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-[#1a73e8] hover:underline dark:text-[#8ab4f8]"
          >
            <span className="truncate max-w-[240px]">{uri}</span>
            <ExternalLink className="h-3 w-3 shrink-0 opacity-70 transition-opacity group-hover:opacity-100" />
          </a>
        )}

        {isRag && uri && (
          <div className="mt-1 flex items-center gap-1 text-[11px] font-mono text-muted-foreground">
            <FileText className="h-3 w-3 shrink-0 text-purple-500" />
            <span className="truncate max-w-[240px]">{uri}</span>
          </div>
        )}
      </div>

      {/* Snippet / Excerpt */}
      {textSnippet && (
        <div className="mt-2.5 rounded-xl bg-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
          &ldquo;{textSnippet}&rdquo;
        </div>
      )}

      {/* Metadata Badges & Inspector Action */}
      {(confidenceScore !== undefined || corpusId || isRag) && (
        <div className="mt-2.5 flex items-center justify-between border-t border-border/40 pt-2 text-[10px]">
          <div className="flex items-center gap-1.5">
            {confidenceScore !== undefined && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                <Sparkles className="h-2.5 w-2.5" />
                {Math.round(confidenceScore * 100)}% match
              </span>
            )}
            {corpusId && (
              <span className="rounded-full bg-muted/60 px-2 py-0.5 text-muted-foreground">
                {corpusId}
              </span>
            )}
          </div>

          {isRag && chunk.retrievedContext && onInspectRagDoc && (
            <button
              type="button"
              onClick={() => onInspectRagDoc(chunk.retrievedContext!)}
              className="inline-flex items-center gap-1 font-semibold text-[#1a73e8] hover:underline dark:text-[#8ab4f8]"
            >
              <Search className="h-3 w-3" />
              <span>Inspect Chunk</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
