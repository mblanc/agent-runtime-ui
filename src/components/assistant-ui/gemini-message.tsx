"use client";

import {
  AuiIf,
  MessagePrimitive,
  ActionBarPrimitive,
  ComposerPrimitive,
  AttachmentPrimitive,
  SelectionToolbarPrimitive,
  groupPartByType,
  useAuiState,
} from "@assistant-ui/react";
import {
  Copy,
  RotateCw,
  Check,
  Quote,
  Pencil,
  ThumbsUp,
  ThumbsDown,
  Volume2,
  VolumeX,
  FileText,
} from "lucide-react";
import { useState, memo } from "react";
import type { MemoryRetrievalItem } from "@/types/agent";
import {
  ReasoningRoot,
  ReasoningTrigger,
  ReasoningContent,
  ReasoningText,
} from "./reasoning";
import { ToolFallback } from "./tool-fallback";
import { MarkdownText } from "./markdown-text";
import { GeminiMessageTiming } from "./gemini-message-timing";
import { MemoryRetrievalBadge } from "@/components/memory/memory-retrieval-badge";

const MESSAGE_GROUP_BY = groupPartByType({
  reasoning: ["group-reasoning"],
});

function AssistantMessageRetrievedMemories() {
  const retrievedMemories = useAuiState(
    (s: {
      message?: {
        metadata?: {
          custom?: {
            retrievedMemories?: MemoryRetrievalItem[];
          };
        };
      };
    }) => ("message" in s ? s.message?.metadata?.custom?.retrievedMemories : undefined)
  );

  return <MemoryRetrievalBadge memories={retrievedMemories} />;
}

function AssistantWorkingDots() {
  const isRunning = useAuiState(
    (s: { message?: { status?: { type?: string } } }) =>
      s.message?.status?.type === "running"
  );
  const hasText = useAuiState(
    (s: { message?: { content?: readonly { type?: string; text?: string }[] } }) =>
      s.message?.content?.some((p) => p.type === "text" && Boolean(p.text?.trim()))
  );

  if (!isRunning || hasText) return null;

  return (
    <div
      className="flex items-center gap-1.5 py-3 text-[#1a73e8] dark:text-[#8ab4f8]"
      aria-label="Agent is working..."
    >
      <span className="inline-block h-2 w-2 rounded-full bg-current animate-bounce [animation-delay:-0.3s]" />
      <span className="inline-block h-2 w-2 rounded-full bg-current animate-bounce [animation-delay:-0.15s]" />
      <span className="inline-block h-2 w-2 rounded-full bg-current animate-bounce" />
    </div>
  );
}

function ChatMessageImpl() {
  const [copied, setCopied] = useState(false);

  return (
    <MessagePrimitive.Root className="group relative flex w-full flex-col gap-2 py-4">
      {/* User Message */}
      <MessagePrimitive.If user>
        {/* Read-only User Bubble + Hover Edit Action */}
        <AuiIf condition={({ composer }) => !composer?.isEditing}>
          <div className="flex w-full flex-col items-end gap-1">
            <div className="max-w-[80%] rounded-3xl bg-[#f0f4f9] px-5 py-3 text-[15px] leading-relaxed text-[#1f1f1f] shadow-sm dark:bg-[#282a2c] dark:text-[#e3e3e3]">
              <div className="mb-2 flex flex-wrap gap-2">
                <MessagePrimitive.Attachments>
                  {() => (
                    <AttachmentPrimitive.Root className="flex items-center gap-2 rounded-2xl bg-white/80 px-3 py-1.5 text-xs border border-[#e3e3e3] dark:bg-black/40 dark:border-[#3c4043]">
                      <AttachmentPrimitive.unstable_Thumb className="h-5 w-5 shrink-0 rounded overflow-hidden object-cover bg-muted" />
                      <FileText className="h-3.5 w-3.5 shrink-0 text-[#1a73e8] dark:text-[#8ab4f8]" />
                      <span className="max-w-[150px] truncate font-medium">
                        <AttachmentPrimitive.Name />
                      </span>
                    </AttachmentPrimitive.Root>
                  )}
                </MessagePrimitive.Attachments>
              </div>
              <MessagePrimitive.Parts>
                {({ part }) => {
                  switch (part.type) {
                    case "text": {
                      const match = part.text.match(
                        /^\[TOOL_CONFIRMATION_RESPONSE:(.*?):(.*?):(true|false)\]$/
                      );
                      if (match) {
                        const [, , toolName, boolStr] = match;
                        const isApproved = boolStr === "true";
                        return (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-0.5">
                            <span>
                              {isApproved ? "✓ Approved action" : "✕ Declined action"}
                            </span>
                            <span className="font-mono text-[11px] opacity-70">
                              ({toolName})
                            </span>
                          </div>
                        );
                      }
                      return <p className="whitespace-pre-wrap">{part.text}</p>;
                    }
                    case "image":
                      return (
                        <div className="my-1.5 overflow-hidden rounded-2xl border border-[#e3e3e3] dark:border-[#3c4043] max-w-sm">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={part.image}
                            alt={part.filename || "Attached image"}
                            className="max-h-72 w-auto object-contain rounded-2xl"
                          />
                        </div>
                      );
                    case "file":
                      return (
                        <div className="my-1.5 flex items-center gap-2 rounded-2xl bg-white/70 px-3.5 py-2 text-xs border border-[#e3e3e3] dark:bg-black/30 dark:border-[#3c4043] max-w-sm">
                          <FileText className="h-4 w-4 shrink-0 text-[#1a73e8] dark:text-[#8ab4f8]" />
                          <span className="truncate font-medium">
                            {part.filename || "Attached file"}
                          </span>
                        </div>
                      );
                    default:
                      return null;
                  }
                }}
              </MessagePrimitive.Parts>
            </div>
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <ActionBarPrimitive.Root className="flex flex-row items-center gap-0.5 sm:gap-1">
                <ActionBarPrimitive.Edit
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Edit message"
                >
                  <Pencil className="h-4 w-4" />
                </ActionBarPrimitive.Edit>
              </ActionBarPrimitive.Root>
            </div>
          </div>
        </AuiIf>

        {/* Inline Edit Form */}
        <AuiIf condition={({ composer }) => Boolean(composer?.isEditing)}>
          <div className="flex w-full justify-end">
            <ComposerPrimitive.Root className="w-full max-w-[80%] rounded-3xl bg-[#f0f4f9] p-3 shadow-sm border border-[#e3e3e3] dark:bg-[#282a2c] dark:border-[#3c4043]">
              <ComposerPrimitive.Input
                rows={1}
                autoFocus
                className="max-h-60 w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed text-[#1f1f1f] outline-none placeholder:text-[#575b5f] dark:text-[#e3e3e3] dark:placeholder:text-[#9aa0a6]"
                placeholder="Edit message..."
              />
              <div className="mt-2 flex items-center justify-end gap-2">
                <ComposerPrimitive.Cancel className="rounded-full px-4 py-1.5 text-xs font-medium text-[#444746] transition-colors hover:bg-[#444746]/10 dark:text-[#c4c7c5] dark:hover:bg-[#c4c7c5]/10">
                  Cancel
                </ComposerPrimitive.Cancel>
                <ComposerPrimitive.Send className="rounded-full bg-[#d3e3fd] px-4 py-1.5 text-xs font-medium text-[#062e6f] transition-all hover:bg-[#c2d7fc] active:scale-95 disabled:opacity-50 dark:bg-[#1b2f9c] dark:text-[#d3e3fd] dark:hover:bg-[#233bbd]">
                  Save & Submit
                </ComposerPrimitive.Send>
              </div>
            </ComposerPrimitive.Root>
          </div>
        </AuiIf>
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

          {/* Retrieved Memory Bank Context Badge */}
          <AssistantMessageRetrievedMemories />

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
                  case "text":
                    return <MarkdownText />;
                  case "image":
                    return (
                      <div className="my-2 overflow-hidden rounded-2xl border border-[#e3e3e3] dark:border-[#3c4043] max-w-md">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={part.image}
                          alt={part.filename || "Assistant image"}
                          className="max-h-80 w-auto object-contain rounded-2xl"
                        />
                      </div>
                    );
                  case "file":
                    return (
                      <div className="my-2 flex items-center gap-2 rounded-2xl bg-[#f0f4f9] px-4 py-2.5 text-xs border border-[#e3e3e3] dark:bg-[#282a2c] dark:border-[#3c4043] max-w-md">
                        <FileText className="h-4 w-4 shrink-0 text-[#1a73e8] dark:text-[#8ab4f8]" />
                        <span className="truncate font-medium">
                          {part.filename || "File"}
                        </span>
                      </div>
                    );
                  case "reasoning":
                    return <ReasoningText text={part.text} />;
                  case "tool-call": {
                    const isRequiresAction =
                      part.status?.type === "requires-action" ||
                      part.toolName === "adk_request_confirmation" ||
                      part.toolName.includes("confirmation") ||
                      part.toolName.includes("approval");

                    // Only render ToolFallback outside reasoning if it requires user action/approval
                    // Regular/completed tool calls are already rendered within the Thinking Process.
                    if (!isRequiresAction) {
                      return null;
                    }
                    return part.toolUI ?? <ToolFallback {...part} />;
                  }
                  default:
                    return null;
                }
              }}
            </MessagePrimitive.GroupedParts>
            <AssistantWorkingDots />
          </div>

          {/* Footer: Timing stats + Action Bar */}
          <div className="flex items-center justify-between pt-1">
            <GeminiMessageTiming />

            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <ActionBarPrimitive.Root className="flex flex-row items-center gap-0.5 sm:gap-1">
                <AuiIf condition={({ message }) => message?.speech == null}>
                  <ActionBarPrimitive.Speak
                    className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label="Read aloud"
                  >
                    <Volume2 className="h-4 w-4" />
                  </ActionBarPrimitive.Speak>
                </AuiIf>
                <AuiIf condition={({ message }) => message?.speech != null}>
                  <ActionBarPrimitive.StopSpeaking
                    className="flex h-8 w-8 items-center justify-center rounded-full text-foreground bg-muted/80 animate-pulse transition-colors hover:bg-muted"
                    aria-label="Stop reading"
                  >
                    <VolumeX className="h-4 w-4" />
                  </ActionBarPrimitive.StopSpeaking>
                </AuiIf>
                <ActionBarPrimitive.Copy
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Copy message"
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
                <ActionBarPrimitive.Reload
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Reload message"
                >
                  <RotateCw className="h-4 w-4" />
                </ActionBarPrimitive.Reload>
                <ActionBarPrimitive.FeedbackPositive
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-emerald-600 dark:hover:text-emerald-400 data-[submitted=true]:text-emerald-600 dark:data-[submitted=true]:text-emerald-400 data-[submitted=true]:bg-emerald-50 dark:data-[submitted=true]:bg-emerald-950/40"
                  aria-label="Good response"
                >
                  <ThumbsUp className="h-4 w-4" />
                </ActionBarPrimitive.FeedbackPositive>
                <ActionBarPrimitive.FeedbackNegative
                  className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-rose-600 dark:hover:text-rose-400 data-[submitted=true]:text-rose-600 dark:data-[submitted=true]:text-rose-400 data-[submitted=true]:bg-rose-50 dark:data-[submitted=true]:bg-rose-950/40"
                  aria-label="Bad response"
                >
                  <ThumbsDown className="h-4 w-4" />
                </ActionBarPrimitive.FeedbackNegative>
              </ActionBarPrimitive.Root>
            </div>
          </div>
        </div>
      </MessagePrimitive.If>
    </MessagePrimitive.Root>
  );
}

export const ChatMessage = memo(ChatMessageImpl);
