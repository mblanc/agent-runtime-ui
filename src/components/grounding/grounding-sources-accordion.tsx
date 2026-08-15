"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Search,
  Globe,
  Database,
  ExternalLink,
  FileText,
} from "lucide-react";
import type { GroundingMetadata, RetrievedContextChunk } from "@/types/agent";
import { extractDomainFromUri } from "@/lib/grounding/citation-parser";
import { useGrounding } from "./grounding-context";
import { cn, sanitizeUrl } from "@/lib/utils";

interface GroundingSourcesAccordionProps {
  metadata?: GroundingMetadata;
  onInspectRagDoc?: (chunk: RetrievedContextChunk) => void;
  className?: string;
}

export function GroundingSourcesAccordion({
  metadata,
  onInspectRagDoc,
  className,
}: GroundingSourcesAccordionProps) {
  const [isOpen, setIsOpen] = useState(false);
  const grounding = useGrounding();
  const effectiveInspectRagDoc = onInspectRagDoc || grounding?.inspectRagDoc;

  if (!metadata) {
    return null;
  }

  const chunks = metadata.groundingChunks || [];
  const queries = metadata.webSearchQueries || [];
  const hasWeb = chunks.some((c) => Boolean(c.web));
  const hasRag = chunks.some((c) => Boolean(c.retrievedContext));

  const totalSources = chunks.length;
  if (totalSources === 0 && queries.length === 0) {
    return null;
  }

  let label = "Grounded Sources";
  if (hasWeb && hasRag) {
    label = "Grounded with Google Search & Enterprise Docs";
  } else if (hasWeb) {
    label = "Grounded with Google Search";
  } else if (hasRag) {
    label = "Grounded with Enterprise Knowledge Base";
  }

  return (
    <div className={cn("my-2 flex flex-col items-start w-full", className)}>
      {/* Accordion Toggle Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-label={`Toggle grounding sources list, ${totalSources} sources available`}
        className="group inline-flex items-center gap-2 rounded-full border border-[#d3e3fd] bg-[#f0f4f9]/80 px-3.5 py-1.5 text-xs font-medium text-[#062e6f] shadow-2xs transition-all hover:bg-[#e2ecfd] dark:border-[#1b2f9c]/60 dark:bg-[#1b2f9c]/20 dark:text-[#d3e3fd] dark:hover:bg-[#1b2f9c]/40"
      >
        <Search className="h-3.5 w-3.5 text-[#1a73e8] dark:text-[#8ab4f8]" />
        <span>{label}</span>
        {totalSources > 0 && (
          <span className="rounded-full bg-white/80 dark:bg-black/40 px-2 py-0.5 text-[11px] font-bold text-[#1a73e8] dark:text-[#8ab4f8]">
            {totalSources} {totalSources === 1 ? "Source" : "Sources"}
          </span>
        )}
        {isOpen ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground transition-transform" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform" />
        )}
      </button>

      {/* Expanded Sources Panel */}
      {isOpen && (
        <div className="mt-2 w-full rounded-2xl border border-border/60 bg-background/95 p-4 shadow-lg backdrop-blur-xs transition-all dark:bg-[#1e1f20]/95 animate-in fade-in-0 zoom-in-95 space-y-3">
          {/* Web Search Queries */}
          {queries.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border/40 pb-2.5 text-xs">
              <span className="text-[11px] font-semibold text-muted-foreground">
                Searches:
              </span>
              {queries.map((q, qIdx) => (
                <span
                  key={qIdx}
                  className="rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-foreground"
                >
                  &ldquo;{q}&rdquo;
                </span>
              ))}
            </div>
          )}

          {/* Sources List */}
          <div className="space-y-2">
            {chunks.map((chunk, idx) => {
              const citationIndex = idx + 1;
              const isWeb = Boolean(chunk.web);
              const isRag = Boolean(chunk.retrievedContext);

              const title =
                chunk.web?.title ||
                chunk.retrievedContext?.title ||
                `Source ${citationIndex}`;
              const uri = chunk.web?.uri || chunk.retrievedContext?.uri || "";
              const domain = chunk.web?.domain || extractDomainFromUri(uri);
              const confidenceScore = chunk.retrievedContext?.confidenceScore;

              return (
                <div
                  key={idx}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border/40 bg-muted/30 p-3 text-xs transition-colors hover:bg-muted/50"
                >
                  {/* Left: Index badge & Title & Link */}
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#1a73e8]/15 text-[11px] font-bold text-[#1a73e8] dark:bg-[#8ab4f8]/20 dark:text-[#8ab4f8]">
                      {citationIndex}
                    </span>

                    <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {isWeb ? (
                          <Globe className="h-3.5 w-3.5 shrink-0 text-[#1a73e8] dark:text-[#8ab4f8]" />
                        ) : (
                          <Database className="h-3.5 w-3.5 shrink-0 text-purple-600 dark:text-purple-400" />
                        )}
                        <span className="font-semibold text-foreground truncate">
                          {title}
                        </span>
                      </div>

                      {uri && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          {domain && (
                            <span className="font-medium text-foreground/80">
                              {domain}
                            </span>
                          )}
                          {isWeb ? (
                            <a
                              href={sanitizeUrl(uri)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-0.5 text-[#1a73e8] hover:underline dark:text-[#8ab4f8] truncate max-w-xs"
                            >
                              <span className="truncate">{uri}</span>
                              <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                            </a>
                          ) : (
                            <span className="truncate font-mono text-[10px] max-w-xs">
                              {uri}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Actions / Badges */}
                  <div className="flex items-center gap-2 shrink-0">
                    {confidenceScore !== undefined && (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {Math.round(confidenceScore * 100)}% match
                      </span>
                    )}

                    {isRag && chunk.retrievedContext && effectiveInspectRagDoc && (
                      <button
                        type="button"
                        onClick={() => effectiveInspectRagDoc(chunk.retrievedContext!)}
                        className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2.5 py-1 text-[11px] font-medium text-purple-700 hover:bg-purple-100 dark:bg-purple-950/50 dark:text-purple-300 dark:hover:bg-purple-900/50 transition-colors"
                      >
                        <FileText className="h-3 w-3" />
                        <span>Inspect</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
