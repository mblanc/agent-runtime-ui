"use client";

import { FC, useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Code2,
  Terminal,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AgentCodeExecutionBlock } from "@/types/agent";
import { CodeEditorPanel } from "./code-editor-panel";
import { ConsoleOutputPanel } from "./console-output-panel";
import { PlotViewerPanel } from "./plot-viewer-panel";

export interface CodeExecutionCardProps {
  block: AgentCodeExecutionBlock;
  defaultOpen?: boolean;
  className?: string;
}

export type CodeTab = "code" | "output" | "plots";

export const CodeExecutionCard: FC<CodeExecutionCardProps> = ({
  block,
  defaultOpen = false,
  className,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const images = useMemo(() => {
    return block.result?.generatedImages || [];
  }, [block.result]);

  const hasImages = images.length > 0;
  const isRunning = block.status === "running";
  const isError =
    block.status === "error" ||
    block.result?.outcome === "OUTCOME_FAILED" ||
    block.result?.outcome === "OUTCOME_DEADLINE_EXCEEDED";

  // Pick smart dynamic tab based on current execution state
  const smartTab: CodeTab = useMemo(() => {
    if (hasImages) return "plots";
    if (isError) return "output";
    return "code";
  }, [hasImages, isError]);

  const [userSelectedTab, setUserSelectedTab] = useState<CodeTab | null>(null);
  const activeTab = userSelectedTab ?? smartTab;

  return (
    <div
      className={cn(
        "my-3 overflow-hidden rounded-2xl border border-[#e3e3e3] bg-[#f8fafd] text-xs transition-all dark:border-[#333537] dark:bg-[#1a1c1e]",
        className
      )}
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e3e3e3] px-3.5 py-2.5 dark:border-[#333537] bg-muted/20">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          className="flex items-center gap-2 font-medium text-[#444746] transition-colors hover:text-foreground dark:text-[#c4c7c5]"
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}

          {/* Status Icon */}
          <div className="flex h-5 w-5 items-center justify-center rounded-full">
            {isRunning ? (
              <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
            ) : isError ? (
              <AlertCircle className="h-4 w-4 text-rose-500" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            )}
          </div>

          <span className="font-semibold text-foreground">
            {isRunning
              ? "Running Python Sandbox..."
              : isError
                ? "Code Execution Failed"
                : "Python Sandbox Execution"}
          </span>

          {block.result?.durationMs !== undefined && (
            <span className="flex items-center gap-1 rounded-full bg-muted/80 px-2 py-0.5 text-[11px] text-muted-foreground">
              <Clock className="h-3 w-3" />
              {block.result.durationMs}ms
            </span>
          )}
        </button>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-0.5 dark:bg-[#141517]">
          <button
            type="button"
            onClick={() => {
              setUserSelectedTab("code");
              if (!isOpen) setIsOpen(true);
            }}
            className={cn(
              "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              activeTab === "code"
                ? "bg-white text-foreground shadow-sm dark:bg-[#282a2c]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Code2 className="h-3.5 w-3.5" />
            <span>Code</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setUserSelectedTab("output");
              if (!isOpen) setIsOpen(true);
            }}
            className={cn(
              "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              activeTab === "output"
                ? "bg-white text-foreground shadow-sm dark:bg-[#282a2c]"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Terminal className="h-3.5 w-3.5" />
            <span>Output</span>
          </button>

          {hasImages && (
            <button
              type="button"
              onClick={() => {
                setUserSelectedTab("plots");
                if (!isOpen) setIsOpen(true);
              }}
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                activeTab === "plots"
                  ? "bg-white text-[#1a73e8] shadow-sm dark:bg-[#282a2c] dark:text-[#8ab4f8]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <ImageIcon className="h-3.5 w-3.5" />
              <span>Plot ({images.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Accordion Body */}
      {isOpen && (
        <div className="p-3">
          {activeTab === "code" && (
            <CodeEditorPanel
              code={block.code}
              language={block.language?.toLowerCase() || "python"}
              isRunning={isRunning}
            />
          )}

          {activeTab === "output" && (
            <ConsoleOutputPanel
              stdout={block.result?.output || ""}
              outcome={block.result?.outcome}
              durationMs={block.result?.durationMs}
            />
          )}

          {activeTab === "plots" && <PlotViewerPanel images={images} />}
        </div>
      )}
    </div>
  );
};
