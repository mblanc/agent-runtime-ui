"use client";

import { ReactNode, useState, useMemo } from "react";
import { ChevronDown, ChevronRight, BrainCircuit, CheckCircle2 } from "lucide-react";
import type { ReasoningTraceEntry } from "@/types/agent";
import { cn } from "@/lib/utils";
import { SubAgentCollapsible } from "./subagent-collapsible";
import { ToolCollapsible } from "./tool-collapsible";
import { ThoughtCollapsible } from "./thought-collapsible";
import { ThoughtSignatureBadge } from "./thought-signature-badge";

export {
  SubAgentCollapsible,
  ToolCollapsible,
  ThoughtCollapsible,
  ThoughtSignatureBadge,
};

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
    <div
      role="button"
      tabIndex={0}
      onClick={() => setIsOpen(!isOpen)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setIsOpen(!isOpen);
        }
      }}
      className={cn(
        "flex w-full cursor-pointer items-center justify-between px-3.5 py-2.5 text-left text-xs font-medium text-[#444746] transition-colors hover:bg-[#eff2f6] dark:text-[#c4c7c5] dark:hover:bg-[#282a2c] select-none",
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

      <div className="flex items-center gap-2 text-muted-foreground">
        <ThoughtSignatureBadge variant="badge" />
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </div>
    </div>
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

/**
 * FALLBACK PATH.
 *
 * Everything from here down to `parseLegacyToolTraces` exists for messages that
 * arrive without a structured trace. Every live producer now ships the array
 * alongside the string — including the `:query` fallback, which used to encode
 * tool calls as `[Tool Executed]: name` thought text and now emits real
 * `tool_call` events — so nothing written today needs this.
 *
 * Two sources still can: sessions persisted before `ReasoningTraceEntry`
 * existed, and the single-assistant-event fast path in `group-turns.ts`, which
 * passes an event through without building a trace. This can be deleted once
 * neither can reach the renderer.
 */
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

/**
 * Repairs of the string representation, with no counterpart on the structured
 * path — deliberately.
 *
 * Two things happen here. Same-named subagent blocks are merged, because a
 * producer that emitted one block per response chunk would otherwise show one
 * card per chunk. And a tool's running block is dropped once a completed block
 * with the same `name-args` key exists, because the running and completed
 * states of one call were emitted as two separate blocks that the string form
 * gives no way to relate.
 *
 * Neither is needed for a `ReasoningTraceEntry[]`. Subagents are already one
 * entry per agent at both sources (`subagentsMap` when streaming,
 * `subagentsGrouped` on replay) and that entry is mutated in place. A tool is
 * one entry keyed by `toolCallId`, updated from running to complete rather than
 * appended to. Running the merge over structured entries would in fact be
 * *wrong*: its key is `name-args`, so two parallel calls to the same tool with
 * identical arguments — which the toolCallId keying exists to keep apart —
 * would collapse back into one card.
 */
function deduplicateParsedBlocks(blocks: ParsedReasoningBlock[]): ParsedReasoningBlock[] {
  const completedToolKeys = new Set<string>();

  for (const block of blocks) {
    if (block.type === "tool" && block.title) {
      const isComplete =
        block.meta?.status === "complete" || block.content.includes("**Result:**");
      if (isComplete) {
        const { args } = parseToolBlockContent(block.content);
        const key = `${block.title}-${args || ""}`;
        completedToolKeys.add(key);
      }
    }
  }

  const seenCompleteTools = new Set<string>();
  const subagentMergedMap = new Map<string, ParsedReasoningBlock>();
  const filtered: ParsedReasoningBlock[] = [];

  for (const block of blocks) {
    if (block.type === "subagent") {
      const agentKey = block.meta?.agent || block.title || "sub_agent";
      const existing = subagentMergedMap.get(agentKey);
      if (existing) {
        const p1 = parseSubAgentBlockContent(existing.content);
        const p2 = parseSubAgentBlockContent(block.content);
        const mergedInput = p1.input || p2.input;
        const o1 = p1.output || (!p1.input ? existing.content : "");
        const o2 = p2.output || (!p2.input ? block.content : "");
        const mergedOutput = o1 && o2 ? `${o1}\n${o2}` : o1 || o2;

        let newBody = "";
        if (mergedInput) {
          newBody += `**Input:**\n\`\`\`json\n${mergedInput}\n\`\`\`\n`;
        }
        if (mergedOutput) {
          if (mergedInput) {
            newBody += `**Response:**\n${mergedOutput}`;
          } else {
            newBody += mergedOutput;
          }
        }
        existing.content = newBody.trim();
        if (block.meta?.status) {
          existing.meta = { ...existing.meta, status: block.meta.status };
        }
        continue;
      } else {
        subagentMergedMap.set(agentKey, block);
        filtered.push(block);
        continue;
      }
    }

    if (block.type === "tool" && block.title) {
      const { args } = parseToolBlockContent(block.content);
      const key = `${block.title}-${args || ""}`;

      if (completedToolKeys.has(key)) {
        const isComplete =
          block.meta?.status === "complete" || block.content.includes("**Result:**");
        if (isComplete) {
          if (!seenCompleteTools.has(key)) {
            seenCompleteTools.add(key);
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

/**
 * Renders a trace that arrived as data.
 *
 * Nothing is parsed, nothing is unescaped, and no value is inspected for
 * characters that used to be able to break a block: a tool result containing
 * `\n:::` or `**Result:**` is just a string here. The cards and their props are
 * the same ones the string path feeds, so the two render identically for any
 * trace both can express.
 */
function ReasoningTraceBlocks({
  trace,
  streaming,
  defaultOpen,
  className,
}: {
  trace: readonly ReasoningTraceEntry[];
  streaming: boolean;
  defaultOpen: boolean;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {trace.map((entry, idx) => {
        if (entry.type === "subagent") {
          return (
            <SubAgentCollapsible
              key={`subagent-${entry.id || entry.agentName}-${idx}`}
              displayName={entry.displayName}
              agentName={entry.agentName}
              status={entry.status}
              callInput={entry.input}
              output={entry.response}
              defaultOpen={defaultOpen}
            />
          );
        }

        if (entry.type === "tool") {
          return (
            <ToolCollapsible
              key={`tool-${entry.toolCallId}`}
              toolName={entry.toolName}
              args={entry.argsJson}
              result={entry.resultJson}
              status={entry.status}
              defaultOpen={defaultOpen}
            />
          );
        }

        // Thoughts carry no status of their own. The string path inferred one
        // from position — the trailing block of a streaming message is the one
        // still being written — and that inference is kept here.
        return (
          <ThoughtCollapsible
            key={`thought-${idx}`}
            title="Thought"
            thought={entry.text}
            status={streaming && idx === trace.length - 1 ? "running" : "complete"}
            defaultOpen={defaultOpen}
          />
        );
      })}
    </div>
  );
}

export function ReasoningText({
  text,
  trace,
  children,
  defaultOpen = false,
  className,
}: {
  text?: string;
  /**
   * The trace as data. When present it is rendered directly and `text` is
   * ignored; `text` is the legacy string form, kept for messages that predate
   * the structured field.
   */
  trace?: readonly ReasoningTraceEntry[];
  children?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}) {
  const { streaming } = useContext(ReasoningContext);

  const raw = useMemo(() => {
    return text !== undefined ? text : getTextFromChildren(children);
  }, [text, children]);

  // A structured trace makes the string irrelevant, so it is not parsed at all
  // — not merely parsed and discarded. The hooks still run unconditionally;
  // only their work is skipped.
  const hasTrace = Boolean(trace && trace.length > 0);

  const rawString = useMemo(
    () => (hasTrace ? "" : parseLegacyToolTraces(raw)),
    [raw, hasTrace]
  );

  const blocks = useMemo(() => {
    if (!rawString.trim()) {
      return [];
    }
    return parseReasoningBlocks(rawString);
  }, [rawString]);

  if (trace && hasTrace) {
    return (
      <ReasoningTraceBlocks
        trace={trace}
        streaming={streaming}
        defaultOpen={defaultOpen}
        className={className}
      />
    );
  }

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
