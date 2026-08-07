"use client";

import { ThreadPrimitive, useAuiState } from "@assistant-ui/react";
import { GeminiComposer } from "./gemini-composer";
import { ChatMessage } from "./gemini-message";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export function GeminiThread() {
  const isEmpty = useAuiState(
    (s: { thread?: { messages?: readonly unknown[] } }) =>
      (s.thread?.messages?.length ?? 0) === 0
  );

  return (
    <ThreadPrimitive.Root className="relative flex h-full w-full flex-col overflow-hidden bg-[#fdfcfc] text-[#1f1f1f] dark:bg-[#0c0c0c] dark:text-[#e3e3e3]">
      {/* Centered Ambient Glow */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[140px] bg-[#a9d1fb]/50 blur-[90px] transition-all duration-700 dark:bg-[#1b2f9c]/40",
          isEmpty
            ? "h-[300px] w-[720px] max-w-[92%] opacity-100 scale-100"
            : "h-[180px] w-[400px] opacity-20 scale-75"
        )}
      />

      {/* Main Viewport Container */}
      <div className="relative z-10 flex h-full w-full flex-col justify-between overflow-hidden">
        {/* Messages List Area */}
        <ThreadPrimitive.Viewport
          className={cn(
            "flex-1 overflow-y-auto px-4 transition-all duration-500",
            isEmpty ? "hidden pointer-events-none" : "block pt-6"
          )}
        >
          <div className="mx-auto max-w-3xl pb-24">
            <ThreadPrimitive.Messages
              components={{
                Message: ChatMessage,
              }}
            />
          </div>
        </ThreadPrimitive.Viewport>

        {/* Empty State Hero Content */}
        {isEmpty && (
          <div className="flex flex-1 flex-col items-center justify-center px-4 transition-all duration-500 ease-out animate-in fade-in zoom-in-95">
            <div className="flex w-full max-w-3xl flex-col items-center text-center">
              {/* Sparkle Tag */}
              <div className="mb-4 flex items-center gap-2 text-sm font-medium text-[#1a73e8] dark:text-[#8ab4f8]">
                <Sparkles className="h-5 w-5" />
                <span>Google Cloud Agent Runtime</span>
              </div>

              {/* Centered Greeting */}
              <h1 className="mb-8 text-4xl font-normal tracking-tight text-[#1f1f1f] dark:text-white md:text-5xl">
                How can I help you today?
              </h1>
            </div>
          </div>
        )}

        {/* Single Continuously Mounted Composer */}
        <div
          className={cn(
            "z-20 w-full transition-all duration-500 px-4",
            isEmpty
              ? "pb-12"
              : "sticky bottom-0 bg-gradient-to-t from-[#fdfcfc] via-[#fdfcfc]/95 to-transparent pb-6 pt-2 dark:from-[#0c0c0c] dark:via-[#0c0c0c]/95 animate-in fade-in slide-in-from-bottom-4"
          )}
        >
          <GeminiComposer />
          {!isEmpty && (
            <div className="mt-2 text-center text-[11px] text-muted-foreground">
              Agent Runtime UI connects to Google Cloud Agent Runtime. Verify important
              info.
            </div>
          )}
        </div>
      </div>
    </ThreadPrimitive.Root>
  );
}
