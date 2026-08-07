"use client";

import {
  MessagePrimitive,
  ActionBarPrimitive,
  SelectionToolbarPrimitive,
  groupPartByType,
} from "@assistant-ui/react";
import { Copy, RotateCw, Check, Quote } from "lucide-react";
import { useState, memo } from "react";
import {
  ReasoningRoot,
  ReasoningTrigger,
  ReasoningContent,
  ReasoningText,
} from "./reasoning";
import { ToolFallback } from "./tool-fallback";
import { ToolGroupRoot, ToolGroupTrigger, ToolGroupContent } from "./tool-group";
import { MarkdownText } from "./markdown-text";
import { GeminiMessageTiming } from "./gemini-message-timing";

const MESSAGE_GROUP_BY = groupPartByType({
  reasoning: ["group-reasoning"],
  "tool-call": ["group-tool"],
});

function ChatMessageImpl() {
  const [copied, setCopied] = useState(false);

  return (
    <MessagePrimitive.Root className="group relative flex w-full flex-col gap-2 py-4">
      {/* User Message */}
      <MessagePrimitive.If user>
        <div className="flex w-full justify-end">
          <div className="max-w-[80%] rounded-3xl bg-[#f0f4f9] px-5 py-3 text-[15px] leading-relaxed text-[#1f1f1f] shadow-sm dark:bg-[#282a2c] dark:text-[#e3e3e3]">
            <MessagePrimitive.Content />
          </div>
        </div>
      </MessagePrimitive.If>

      {/* Assistant Message */}
      <MessagePrimitive.If assistant>
        <div className="flex w-full flex-col space-y-2 text-[#1f1f1f] dark:text-[#e3e3e3]">
          {/* Floating Text Selection Toolbar */}
          <SelectionToolbarPrimitive.Root className="flex items-center gap-1 rounded-full bg-white px-2 py-1 shadow-xl border border-[#e3e3e3] text-xs dark:bg-[#1e1f20] dark:border-[#333537]">
            <SelectionToolbarPrimitive.Quote className="flex items-center gap-1 rounded-full px-2 py-1 font-medium text-foreground hover:bg-muted transition-colors">
              <Quote className="h-3.5 w-3.5 text-[#1a73e8] dark:text-[#8ab4f8]" />
              <span>Quote selection</span>
            </SelectionToolbarPrimitive.Quote>
          </SelectionToolbarPrimitive.Root>
          {/* Full-width avatar-free Content with GroupedParts & MarkdownText */}
          <div className="prose prose-neutral dark:prose-invert max-w-none text-[15px] leading-relaxed">
            <MessagePrimitive.GroupedParts groupBy={MESSAGE_GROUP_BY}>
              {({ part, children }) => {
                switch (part.type) {
                  case "group-reasoning": {
                    const running = part.status.type === "running";
                    return (
                      <ReasoningRoot streaming={running}>
                        <ReasoningTrigger active={running} />
                        <ReasoningContent aria-busy={running}>
                          {children}
                        </ReasoningContent>
                      </ReasoningRoot>
                    );
                  }
                  case "group-tool": {
                    const running = part.status.type === "running";
                    return (
                      <ToolGroupRoot>
                        <ToolGroupTrigger count={part.indices.length} active={running} />
                        <ToolGroupContent>{children}</ToolGroupContent>
                      </ToolGroupRoot>
                    );
                  }
                  case "text":
                    return <MarkdownText />;
                  case "reasoning":
                    return <ReasoningText text={part.text} />;
                  case "tool-call":
                    return part.toolUI ?? <ToolFallback {...part} />;
                  default:
                    return null;
                }
              }}
            </MessagePrimitive.GroupedParts>
          </div>

          {/* Footer: Timing stats + Action Bar */}
          <div className="flex items-center justify-between pt-1">
            <GeminiMessageTiming />

            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <ActionBarPrimitive.Root>
                <ActionBarPrimitive.Copy
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onClick={() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </ActionBarPrimitive.Copy>
                <ActionBarPrimitive.Reload className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                  <RotateCw className="h-4 w-4" />
                </ActionBarPrimitive.Reload>
              </ActionBarPrimitive.Root>
            </div>
          </div>
        </div>
      </MessagePrimitive.If>
    </MessagePrimitive.Root>
  );
}

export const ChatMessage = memo(ChatMessageImpl);
