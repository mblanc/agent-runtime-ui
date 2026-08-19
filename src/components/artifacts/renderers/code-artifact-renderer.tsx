"use client";

import { FC, useState, useCallback } from "react";
import ShikiHighlighter from "react-shiki";
import { Check, Copy, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CodeArtifactRendererProps {
  code: string;
  language?: string;
  filename?: string;
}

export const CodeArtifactRenderer: FC<CodeArtifactRendererProps> = ({
  code,
  language = "typescript",
  filename,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard write failure
    }
  }, [code]);

  const lineCount = code ? code.split("\n").length : 0;
  const cleanLanguage = (language || "text").toLowerCase().replace(/^\./, "");

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden relative">
      {/* Code Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/40 text-xs text-muted-foreground select-none">
        <div className="flex items-center gap-2">
          <Code2 className="w-3.5 h-3.5 text-primary" />
          <span className="font-mono font-medium text-foreground">{cleanLanguage}</span>
          <span className="text-muted-foreground/60">•</span>
          <span>
            {lineCount} {lineCount === 1 ? "line" : "lines"}
          </span>
          {filename && (
            <>
              <span className="text-muted-foreground/60">•</span>
              <span className="font-mono text-muted-foreground truncate max-w-[200px]">
                {filename}
              </span>
            </>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5"
          aria-label="Copy code"
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

      {/* Code Content Viewport */}
      <div className="flex-1 overflow-auto p-4 font-mono text-[13px] leading-relaxed bg-[#f8fafd] dark:bg-[#141517]">
        <ShikiHighlighter
          language={cleanLanguage}
          theme={{
            light: "github-light",
            dark: "github-dark",
          }}
          defaultColor="light-dark()"
          className={cn("w-full m-0 p-0 bg-transparent")}
        >
          {code || ""}
        </ShikiHighlighter>
      </div>
    </div>
  );
};
