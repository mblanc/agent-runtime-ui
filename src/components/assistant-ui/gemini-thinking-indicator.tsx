"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

interface GeminiThinkingIndicatorProps {
  statusText?: string;
}

export function GeminiThinkingIndicator({
  statusText = "Thinking...",
}: GeminiThinkingIndicatorProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      setElapsed(Number(((Date.now() - startTime) / 1000).toFixed(1)));
    }, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex items-center gap-2.5">
        {/* Animated Gemini Sparkle */}
        <div className="relative flex h-6 w-6 items-center justify-center">
          <div className="absolute inset-0 animate-ping rounded-full bg-[#1a73e8]/20 dark:bg-[#8ab4f8]/20" />
          <Sparkles className="relative h-4 w-4 animate-spin text-[#1a73e8] dark:text-[#8ab4f8] [animation-duration:3s]" />
        </div>

        {/* Dynamic status and live timer */}
        <div className="flex items-center gap-2 text-sm font-medium text-[#444746] dark:text-[#c4c7c5]">
          <span>{statusText}</span>
          <span className="text-xs text-muted-foreground font-mono">({elapsed}s)</span>
        </div>
      </div>

      {/* Shimmering Gradient Bar */}
      <div className="relative h-1.5 w-48 overflow-hidden rounded-full bg-[#e8eaed] dark:bg-[#282a2c]">
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-[#1a73e8]/60 to-transparent dark:via-[#8ab4f8]/60" />
      </div>
    </div>
  );
}
