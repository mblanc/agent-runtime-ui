"use client";

import { FC, useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import ShikiHighlighter from "react-shiki";

export interface CodeEditorPanelProps {
  code: string;
  language?: string;
  isRunning?: boolean;
  className?: string;
}

export const CodeEditorPanel: FC<CodeEditorPanelProps> = ({
  code,
  language = "python",
  isRunning = false,
  className,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failures in restricted environments
    }
  };

  return (
    <div
      className={cn(
        "relative rounded-xl border border-[#e3e3e3] bg-[#f8fafd] text-[13px] dark:border-[#333537] dark:bg-[#141517]",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-[#e3e3e3] px-3 py-1.5 dark:border-[#333537] bg-muted/30">
        <span className="font-mono text-xs font-medium text-muted-foreground uppercase">
          {language}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy code"
          className="flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-emerald-500">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      <div className="overflow-x-auto p-3 font-mono leading-relaxed">
        {isRunning ? (
          <pre className="m-0 p-0 text-xs font-mono leading-relaxed">
            <code>{code || "# Executing code..."}</code>
          </pre>
        ) : (
          <ShikiHighlighter
            language={(language || "python").toLowerCase()}
            theme={{
              light: "github-light",
              dark: "github-dark",
            }}
            defaultColor="light-dark()"
          >
            {code || "# No code provided"}
          </ShikiHighlighter>
        )}
      </div>
    </div>
  );
};
