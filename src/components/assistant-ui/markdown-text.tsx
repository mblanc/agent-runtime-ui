"use client";

import {
  type CodeHeaderProps,
  type SyntaxHighlighterProps,
  MarkdownTextPrimitive,
  unstable_memoizeMarkdownComponents as memoizeMarkdownComponents,
} from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { type FC, memo, useState, useCallback } from "react";
import { Check, Copy } from "lucide-react";
import dynamic from "next/dynamic";
import { TooltipIconButton } from "@/components/assistant-ui/tooltip-icon-button";
import { cn } from "@/lib/utils";

const SyntaxHighlighter = dynamic<SyntaxHighlighterProps>(
  () =>
    import("./shiki-highlighter").then(
      (mod) => mod.SyntaxHighlighter as FC<SyntaxHighlighterProps>
    ),
  {
    ssr: false,
    loading: () => (
      <div className="aui-shiki-base overflow-x-auto rounded-b-xl border border-t-0 border-[#e3e3e3] bg-[#f8fafd] p-3.5 font-mono text-[13px] dark:border-[#333537] dark:bg-[#141517] animate-pulse">
        Loading code syntax...
      </div>
    ),
  }
);

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const [copied, setCopied] = useState(false);

  const onCopy = useCallback(() => {
    if (!code || copied) return;
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code, copied]);

  return (
    <div className="mt-3 flex items-center justify-between rounded-t-xl border border-b-0 border-[#e3e3e3] bg-[#f0f4f9] px-3.5 py-1.5 text-xs dark:border-[#333537] dark:bg-[#1f2123]">
      <span className="font-mono text-[11px] font-medium lowercase text-muted-foreground">
        {language || "code"}
      </span>
      <TooltipIconButton tooltip="Copy code" onClick={onCopy}>
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </TooltipIconButton>
    </div>
  );
};

const defaultComponents = memoizeMarkdownComponents({
  CodeHeader,
  SyntaxHighlighter,
  table: ({ className, ...props }) => (
    <div className="my-4 w-full overflow-y-auto rounded-xl border border-[#e3e3e3] dark:border-[#333537]">
      <table
        className={cn("w-full text-left text-sm border-collapse", className)}
        {...props}
      />
    </div>
  ),
  thead: ({ className, ...props }) => (
    <thead
      className={cn(
        "border-b border-[#e3e3e3] bg-[#f8fafd] font-medium text-[#1f1f1f] dark:border-[#333537] dark:bg-[#1a1c1e] dark:text-[#e3e3e3]",
        className
      )}
      {...props}
    />
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        "px-4 py-2.5 font-semibold text-xs uppercase tracking-wider",
        className
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(
        "px-4 py-2.5 border-t border-[#e3e3e3]/60 text-xs dark:border-[#333537]/60",
        className
      )}
      {...props}
    />
  ),
  a: ({ className, ...props }) => (
    <a
      className={cn(
        "font-medium text-[#1a73e8] underline underline-offset-4 hover:text-[#174ea6] dark:text-[#8ab4f8] dark:hover:text-[#aecbfa]",
        className
      )}
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(
        "my-3 border-l-2 border-[#1a73e8] pl-4 italic text-muted-foreground dark:border-[#8ab4f8]",
        className
      )}
      {...props}
    />
  ),
});

const MarkdownTextImpl = () => {
  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="prose prose-neutral dark:prose-invert max-w-none text-[15px] leading-relaxed"
      components={defaultComponents}
    />
  );
};

export const MarkdownText = memo(MarkdownTextImpl);
