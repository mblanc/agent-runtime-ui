"use client";

import { FC } from "react";
import ShikiHighlighter, { type ShikiHighlighterProps } from "react-shiki";
import { useAuiState } from "@assistant-ui/react";
import type { SyntaxHighlighterProps as AUIProps } from "@assistant-ui/react-markdown";
import { cn } from "@/lib/utils";

export type HighlighterProps = Omit<ShikiHighlighterProps, "children" | "theme"> & {
  theme?: ShikiHighlighterProps["theme"];
} & Pick<AUIProps, "language" | "code"> &
  Partial<Pick<AUIProps, "node" | "components">>;

const containerClassName =
  "aui-shiki-base overflow-x-auto rounded-b-xl border border-t-0 border-[#e3e3e3] bg-[#f8fafd] p-3.5 font-mono text-[13px] leading-relaxed text-foreground dark:border-[#333537] dark:bg-[#141517]";

export const SyntaxHighlighter: FC<HighlighterProps> = ({
  code,
  language = "text",
  theme = {
    light: "github-light",
    dark: "github-dark",
  },
  className,
  ...props
}) => {
  const isRunning = useAuiState((s: Record<string, unknown>) => {
    if ("message" in s && s.message && typeof s.message === "object") {
      const msg = s.message as { status?: { type?: string } };
      return msg.status?.type === "running";
    }
    if ("thread" in s && s.thread && typeof s.thread === "object") {
      const thread = s.thread as { isRunning?: boolean };
      return Boolean(thread.isRunning);
    }
    return false;
  });

  if (isRunning) {
    return (
      <div className={cn(containerClassName, className)}>
        <pre className="m-0 p-0">
          <code>{code}</code>
        </pre>
      </div>
    );
  }

  return (
    <div className={cn(containerClassName, className)}>
      <ShikiHighlighter
        language={language}
        theme={theme}
        defaultColor="light-dark()"
        {...props}
      >
        {code}
      </ShikiHighlighter>
    </div>
  );
};
