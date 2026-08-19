"use client";

import { FC, useState, useCallback, useMemo } from "react";
import { FileText, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CodeArtifactRenderer } from "./code-artifact-renderer";

interface MarkdownArtifactRendererProps {
  markdown: string;
  filename?: string;
}

export const MarkdownArtifactRenderer: FC<MarkdownArtifactRendererProps> = ({
  markdown,
  filename = "document.md",
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"rendered" | "raw">("rendered");

  const handleCopy = useCallback(async () => {
    if (!markdown) return;
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [markdown]);

  const wordCount = useMemo(() => {
    if (!markdown) return 0;
    return markdown.trim().split(/\s+/).filter(Boolean).length;
  }, [markdown]);

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden relative">
      {/* Markdown Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/40 text-xs text-muted-foreground select-none">
        <div className="flex items-center gap-2">
          <FileText className="w-3.5 h-3.5 text-primary" />
          <span className="font-medium text-foreground">Markdown Document</span>
          <span className="text-muted-foreground/60">•</span>
          <span>{wordCount} words</span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted rounded-md p-0.5 border border-border">
            <button
              type="button"
              onClick={() => setViewMode("rendered")}
              className={`px-2 py-0.5 text-[10px] rounded font-medium transition-colors ${
                viewMode === "rendered"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground"
              }`}
            >
              Formatted
            </button>
            <button
              type="button"
              onClick={() => setViewMode("raw")}
              className={`px-2 py-0.5 text-[10px] rounded font-medium transition-colors ${
                viewMode === "raw"
                  ? "bg-background text-foreground shadow-xs"
                  : "text-muted-foreground"
              }`}
            >
              Raw
            </button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
            aria-label="Copy markdown"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-emerald-500 font-medium">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Markdown Content Viewport */}
      {viewMode === "raw" ? (
        <CodeArtifactRenderer code={markdown} language="markdown" filename={filename} />
      ) : (
        <div className="flex-1 overflow-auto p-6 max-w-3xl mx-auto w-full prose dark:prose-invert prose-headings:font-semibold prose-a:text-primary prose-code:text-primary prose-pre:bg-muted text-sm leading-relaxed">
          <div className="whitespace-pre-wrap font-sans text-foreground">
            {markdown || "No markdown content."}
          </div>
        </div>
      )}
    </div>
  );
};
