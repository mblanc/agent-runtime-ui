"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { GroundingChunk, RetrievedContextChunk } from "@/types/agent";
import { resolveCitationSource } from "@/lib/grounding/citation-parser";
import { SourcePopoverContent } from "./source-popover";
import { useGrounding } from "./grounding-context";
import { cn } from "@/lib/utils";

interface InlineCitationBadgeProps {
  index?: number;
  indices?: number[];
  chunks?: GroundingChunk[];
  onInspectRagDoc?: (chunk: RetrievedContextChunk) => void;
  className?: string;
}

export function InlineCitationBadge({
  index,
  indices,
  chunks,
  onInspectRagDoc,
  className,
}: InlineCitationBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTabIdx, setActiveTabIdx] = useState(0);
  const containerRef = useRef<HTMLSpanElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const grounding = useGrounding();
  const effectiveInspectRagDoc = onInspectRagDoc || grounding?.inspectRagDoc;

  const parsedIndices = indices && indices.length > 0 ? indices : index ? [index] : [];

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsOpen(true), 120);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsOpen(false), 200);
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen((prev) => !prev);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setIsOpen((prev) => !prev);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, handleClickOutside]);

  if (parsedIndices.length === 0) {
    return null;
  }

  const label =
    parsedIndices.length === 1
      ? `[${parsedIndices[0]}]`
      : `[${parsedIndices.join(", ")}]`;

  const activeCitationIndex = parsedIndices[activeTabIdx] ?? parsedIndices[0];
  const activeChunk = chunks
    ? resolveCitationSource(activeCitationIndex, chunks)
    : undefined;

  return (
    <span
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        type="button"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={`Citation source ${label}`}
        className={cn(
          "inline-flex items-center justify-center font-mono text-[11px] font-semibold tracking-tight text-[#1a73e8] dark:text-[#8ab4f8] bg-[#1a73e8]/10 hover:bg-[#1a73e8]/20 dark:bg-[#8ab4f8]/15 dark:hover:bg-[#8ab4f8]/25 rounded px-1 py-0.5 mx-0.5 transition-all active:scale-95 cursor-pointer select-none align-baseline",
          isOpen && "ring-1 ring-[#1a73e8] dark:ring-[#8ab4f8]",
          className
        )}
      >
        {label}
      </button>

      {isOpen && activeChunk && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2">
          {parsedIndices.length > 1 && (
            <div className="mb-1 flex items-center justify-center gap-1 rounded-full bg-background/90 p-1 shadow-md backdrop-blur-xs border border-border/40">
              {parsedIndices.map((idxVal, i) => (
                <button
                  key={idxVal}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActiveTabIdx(i);
                  }}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors",
                    activeTabIdx === i
                      ? "bg-[#1a73e8] text-white dark:bg-[#8ab4f8] dark:text-[#062e6f]"
                      : "text-muted-foreground hover:bg-muted"
                  )}
                >
                  Source [{idxVal}]
                </button>
              ))}
            </div>
          )}

          <SourcePopoverContent
            chunk={activeChunk}
            index={activeCitationIndex}
            onInspectRagDoc={effectiveInspectRagDoc}
          />
        </div>
      )}
    </span>
  );
}
