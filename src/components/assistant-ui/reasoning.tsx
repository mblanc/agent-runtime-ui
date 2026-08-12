"use client";

import { ReactNode, useState, useMemo } from "react";
import { ChevronDown, ChevronRight, BrainCircuit, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SubAgentCollapsible } from "./subagent-collapsible";
import { ToolCollapsible } from "./tool-collapsible";
import { ThoughtCollapsible } from "./thought-collapsible";

export { SubAgentCollapsible, ToolCollapsible, ThoughtCollapsible };

interface ReasoningRootProps {
  children: ReactNode;
  streaming?: boolean;
  defaultOpen?: boolean;
  className?: string;
}

export function ReasoningRoot({
  children,
  streaming = false,
  defaultOpen = false,
  className,
}: ReasoningRootProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        "my-2.5 overflow-hidden rounded-2xl border border-[#e3e3e3] bg-[#f8fafd] transition-all dark:border-[#333537] dark:bg-[#1a1c1e]",
        className
      )}
      data-state={isOpen ? "open" : "closed"}
    >
      <ReasoningContext.Provider value={{ isOpen, setIsOpen, streaming }}>
        {children}
      </ReasoningContext.Provider>
    </div>
  );
}

import { createContext, useContext } from "react";

const ReasoningContext = createContext<{
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  streaming: boolean;
}>({
  isOpen: false,
  setIsOpen: () => {},
  streaming: false,
});

interface ReasoningTriggerProps {
  active?: boolean;
  className?: string;
}

export function ReasoningTrigger({ active, className }: ReasoningTriggerProps) {
  const { isOpen, setIsOpen, streaming } = useContext(ReasoningContext);
  const isRunning = active ?? streaming;

  return (
    <button
      type="button"
      onClick={() => setIsOpen(!isOpen)}
      className={cn(
        "flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs font-medium text-[#444746] transition-colors hover:bg-[#eff2f6] dark:text-[#c4c7c5] dark:hover:bg-[#282a2c]",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <BrainCircuit className="h-4 w-4 text-[#1a73e8] dark:text-[#8ab4f8]" />
        <span className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">
          {isRunning ? "Thinking..." : "Thinking Process"}
        </span>
        {isRunning && (
          <span className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#1a73e8] dark:bg-[#8ab4f8] animate-bounce [animation-delay:-0.3s]" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#1a73e8] dark:bg-[#8ab4f8] animate-bounce [animation-delay:-0.15s]" />
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#1a73e8] dark:bg-[#8ab4f8] animate-bounce" />
          </span>
        )}
      </div>

      <div className="flex items-center gap-1 text-muted-foreground">
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </div>
    </button>
  );
}

export function ReasoningContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
  "aria-busy"?: boolean;
}) {
  const { isOpen, streaming } = useContext(ReasoningContext);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "border-t border-[#e3e3e3] px-4 py-3 text-xs leading-relaxed text-[#444746] dark:border-[#333537] dark:text-[#c4c7c5]",
        className
      )}
    >
      {streaming ? (
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[#1a73e8] dark:text-[#8ab4f8]">
          <span>Agent is working...</span>
        </div>
      ) : (
        <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span>Reasoning complete</span>
        </div>
      )}
      {children}
    </div>
  );
}

interface ParsedReasoningBlock {
  type: "thought" | "subagent" | "tool";
  title?: string;
  meta?: Record<string, string>;
  content: string;
}

function getTextFromChildren(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getTextFromChildren).join("");
  if (node && typeof node === "object" && "props" in node) {
    const props = (node as { props?: { children?: ReactNode } }).props;
    if (props?.children) {
      return getTextFromChildren(props.children);
    }
  }
  return "";
}

function parseToolBlockContent(content: string): {
  args?: string;
  result?: string;
} {
  let args: string | undefined;
  let result: string | undefined;

  const argsMatch = content.match(
    /\*\*Arguments:\*\*\s*\r?\n```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```/i
  );
  if (argsMatch) {
    args = argsMatch[1].trim();
  }

  const resultMatch = content.match(
    /\*\*Result:\*\*\s*\r?\n```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```/i
  );
  if (resultMatch) {
    result = resultMatch[1].trim();
  } else {
    const plainResultMatch = content.match(/\*\*Result:\*\*\s*\r?\n([\s\S]*)/i);
    if (plainResultMatch) {
      result = plainResultMatch[1].trim();
    }
  }

  if (!args && !result) {
    result = content.trim();
  }

  return { args, result };
}

function parseReasoningBlocks(rawText: string): ParsedReasoningBlock[] {
  const blocks: ParsedReasoningBlock[] = [];
  const regex =
    /:::(subagent|tool|thought)\[([^\]]*)\](?:\{([^}]*)\})?\s*\r?\n([\s\S]*?)(?:\r?\n:::|$)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rawText)) !== null) {
    const textBefore = rawText.substring(lastIndex, match.index).trim();
    if (textBefore) {
      blocks.push({ type: "thought", content: textBefore });
    }

    const blockType = match[1] as "subagent" | "tool" | "thought";
    const title = match[2]?.trim() || undefined;
    const metaStr = match[3] || "";
    const body = match[4];

    const meta: Record<string, string> = {};
    const metaRegex = /(\w+)="([^"]*)"/g;
    let m: RegExpExecArray | null;
    while ((m = metaRegex.exec(metaStr)) !== null) {
      meta[m[1]] = m[2];
    }

    blocks.push({
      type: blockType,
      title,
      meta,
      content: body.trim(),
    });

    lastIndex = regex.lastIndex;
  }

  const textAfter = rawText.substring(lastIndex).trim();
  if (textAfter) {
    blocks.push({ type: "thought", content: textAfter });
  }

  return deduplicateParsedBlocks(blocks);
}

function deduplicateParsedBlocks(blocks: ParsedReasoningBlock[]): ParsedReasoningBlock[] {
  const completedKeys = new Set<string>();

  for (const block of blocks) {
    if (block.type === "tool" && block.title) {
      const isComplete =
        block.meta?.status === "complete" || block.content.includes("**Result:**");
      if (isComplete) {
        const { args } = parseToolBlockContent(block.content);
        const key = `${block.title}-${args || ""}`;
        completedKeys.add(key);
      }
    }
  }

  if (completedKeys.size === 0) {
    return blocks;
  }

  const seenComplete = new Set<string>();
  const filtered: ParsedReasoningBlock[] = [];

  for (const block of blocks) {
    if (block.type === "tool" && block.title) {
      const { args } = parseToolBlockContent(block.content);
      const key = `${block.title}-${args || ""}`;

      if (completedKeys.has(key)) {
        const isComplete =
          block.meta?.status === "complete" || block.content.includes("**Result:**");
        if (isComplete) {
          if (!seenComplete.has(key)) {
            seenComplete.add(key);
            filtered.push(block);
          }
        }
        continue;
      }
    }
    filtered.push(block);
  }

  return filtered;
}

function parseSubAgentBlockContent(content: string): {
  input?: string;
  output?: string;
} {
  let input: string | undefined;
  let output: string | undefined;

  const inputMatch =
    content.match(
      /\*\*(?:Task Input|Input):\*\*\s*\r?\n```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```/i
    ) ||
    content.match(
      /\*\*(?:Task Input|Input):\*\*\s*\r?\n([\s\S]*?)(?=\r?\n\*\*(?:Response|Output|Result):\*\*|$)/i
    );

  if (inputMatch) {
    input = inputMatch[1].trim();
  }

  const outputMatch =
    content.match(
      /\*\*(?:Response|Output|Result):\*\*\s*\r?\n```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```/i
    ) || content.match(/\*\*(?:Response|Output|Result):\*\*\s*\r?\n([\s\S]*)/i);

  if (outputMatch) {
    output = outputMatch[1].trim();
  }

  if (!input && !output) {
    output = content.trim();
  }

  return { input, output };
}

export function parseLegacyToolTraces(text: string): string {
  if (!text) return "";
  // Convert legacy [Tool Executed]: name (args) and [Tool Completed]: name into :::tool[name] blocks
  const toolExecRegex =
    /\[Tool Executed\]:\s*([a-zA-Z0-9_-]+)(?:\s*\((.*?)\))?(?:\r?\n\s*\[Tool Completed\]:\s*\1)?/g;

  return text.replace(toolExecRegex, (_, toolName, argsStr) => {
    let formattedArgs = "";
    if (argsStr) {
      try {
        const pairs = argsStr.split(",").map((p: string) => p.trim());
        const obj: Record<string, unknown> = {};
        for (const pair of pairs) {
          const colonIdx = pair.indexOf(":");
          if (colonIdx !== -1) {
            const k = pair.substring(0, colonIdx).trim();
            const v = pair.substring(colonIdx + 1).trim();
            obj[k] = isNaN(Number(v)) ? v : Number(v);
          }
        }
        formattedArgs = JSON.stringify(obj, null, 2);
      } catch {
        formattedArgs = argsStr;
      }
    }

    return `:::tool[${toolName}]{status="complete"}\n**Arguments:**\n\`\`\`json\n${formattedArgs || "{}"}\n\`\`\`\n:::`;
  });
}

export function ReasoningText({
  text,
  children,
  defaultOpen = false,
  className,
}: {
  text?: string;
  children?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const { streaming } = useContext(ReasoningContext);

  const raw = useMemo(() => {
    return text !== undefined ? text : getTextFromChildren(children);
  }, [text, children]);

  const rawString = useMemo(() => parseLegacyToolTraces(raw), [raw]);

  const blocks = useMemo(() => {
    if (!rawString.trim()) {
      return [];
    }
    return parseReasoningBlocks(rawString);
  }, [rawString]);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className={cn("space-y-2", className)}>
      {blocks.map((block, idx) => {
        const isLastBlock = idx === blocks.length - 1;
        const isBlockRunning =
          block.meta?.status === "running" || (streaming && isLastBlock);

        if (block.type === "subagent") {
          const { input, output } = parseSubAgentBlockContent(block.content);
          return (
            <SubAgentCollapsible
              key={`subagent-${idx}-${block.title || idx}`}
              displayName={block.title}
              agentName={block.meta?.agent}
              status={
                (block.meta?.status as "running" | "complete" | "error") ||
                (isBlockRunning ? "running" : "complete")
              }
              callInput={input || block.meta?.input}
              output={output}
              defaultOpen={defaultOpen}
            />
          );
        }

        if (block.type === "tool") {
          const { args, result } = parseToolBlockContent(block.content);
          return (
            <ToolCollapsible
              key={`tool-${idx}-${block.title || idx}`}
              toolName={block.title}
              args={args}
              result={result}
              status={block.meta?.status || (isBlockRunning ? "running" : "complete")}
              defaultOpen={defaultOpen}
            />
          );
        }

        return (
          <ThoughtCollapsible
            key={`thought-${idx}`}
            title={block.title || "Thought"}
            thought={block.content}
            status={block.meta?.status || (isBlockRunning ? "running" : "complete")}
            defaultOpen={defaultOpen}
          />
        );
      })}
    </div>
  );
}

export function Reasoning({ text }: { text?: string }) {
  return <ReasoningText text={text} />;
}
