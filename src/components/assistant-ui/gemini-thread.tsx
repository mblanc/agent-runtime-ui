"use client";

import { ThreadPrimitive } from "@assistant-ui/react";
import { GeminiComposer } from "./gemini-composer";
import { ChatMessage } from "./gemini-message";
import { Sparkles } from "lucide-react";

export function GeminiThread() {
  return (
    <ThreadPrimitive.Root className="relative flex h-full w-full flex-col overflow-hidden bg-[#fdfcfc] text-[#1f1f1f] dark:bg-[#0c0c0c] dark:text-[#e3e3e3]">
      <ThreadPrimitive.Empty>
        <GeminiEmptyState />
      </ThreadPrimitive.Empty>

      {/* Viewport for Active Conversation */}
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto px-4 pt-6">
        <div className="mx-auto max-w-3xl pb-32">
          <ThreadPrimitive.Messages
            components={{
              Message: ChatMessage,
            }}
          />
        </div>
      </ThreadPrimitive.Viewport>

      {/* Sticky Bottom Composer for Active Thread */}
      <div className="sticky bottom-0 z-20 w-full bg-gradient-to-t from-[#fdfcfc] via-[#fdfcfc]/95 to-transparent px-4 pb-6 pt-2 dark:from-[#0c0c0c] dark:via-[#0c0c0c]/95">
        <GeminiComposer />
        <div className="mt-2 text-center text-[11px] text-muted-foreground">
          LLM Council connects to Google Cloud Agent Runtime. Verify important info.
        </div>
      </div>
    </ThreadPrimitive.Root>
  );
}

function GeminiEmptyState() {
  return (
    <div className="relative flex h-full flex-col items-center justify-center px-4">
      {/* Centered ambient radial glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 h-[260px] w-[680px] max-w-[92%] -translate-x-1/2 -translate-y-1/2 rounded-[140px] bg-[#a9d1fb]/60 blur-[90px] dark:bg-[#1b2f9c]/50"
      />

      <div className="relative z-10 flex w-full max-w-3xl flex-col items-center">
        {/* Sparkle Header */}
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[#1a73e8] dark:text-[#8ab4f8]">
          <Sparkles className="h-5 w-5" />
          <span>Google Cloud Agent Runtime</span>
        </div>

        {/* Centered Headline */}
        <h1 className="mb-8 text-center text-4xl font-normal tracking-tight text-[#1f1f1f] dark:text-white md:text-5xl">
          How can I help you today?
        </h1>

        {/* Empty state pill composer */}
        <div className="w-full">
          <GeminiComposer />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {[
            "Analyze system architecture",
            "Synthesize council decisions",
            "Review deployment health",
          ].map((prompt, idx) => (
            <button
              key={idx}
              type="button"
              className="rounded-full border border-border/60 bg-white/80 px-4 py-2 text-xs text-[#444746] shadow-sm backdrop-blur-sm transition-colors hover:bg-muted/80 hover:text-foreground dark:bg-[#1e1f20]/80 dark:text-[#c4c7c5] dark:hover:bg-[#282a2c]"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
