"use client";

import { MessagePrimitive, ActionBarPrimitive } from "@assistant-ui/react";
import { MarkdownTextPrimitive } from "@assistant-ui/react-markdown";
import { Copy, RotateCw, Check } from "lucide-react";
import { useState } from "react";
import { GeminiToolCall } from "./gemini-tools";

export function ChatMessage() {
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
          {/* Full-width avatar-free Markdown Content */}
          <div className="prose prose-neutral dark:prose-invert max-w-none text-[15px] leading-relaxed">
            <MessagePrimitive.Content
              components={{
                Text: () => <MarkdownTextPrimitive />,
                tools: {
                  by_name: {
                    custom_tool: ({ args, result, status }) => (
                      <GeminiToolCall
                        toolName="agent_tool"
                        args={args as Record<string, unknown>}
                        result={result}
                        status={status?.type === "running" ? "running" : "complete"}
                      />
                    ),
                  },
                  Fallback: ({ toolName, args, result, status }) => (
                    <GeminiToolCall
                      toolName={toolName}
                      args={args as Record<string, unknown>}
                      result={result}
                      status={status?.type === "running" ? "running" : "complete"}
                    />
                  ),
                },
              }}
            />
          </div>

          {/* Action Bar revealed on hover */}
          <div className="flex items-center gap-1 pt-1 opacity-0 transition-opacity group-hover:opacity-100">
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
      </MessagePrimitive.If>
    </MessagePrimitive.Root>
  );
}
