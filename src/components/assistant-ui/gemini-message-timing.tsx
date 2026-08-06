"use client";

import { Zap } from "lucide-react";

interface GeminiMessageTimingProps {
  durationSeconds?: number;
  tokensPerSecond?: number;
  engineName?: string;
}

export function GeminiMessageTiming({
  durationSeconds = 2.1,
  tokensPerSecond = 46,
  engineName = "Vertex AI Reasoning Engine",
}: GeminiMessageTimingProps) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80 font-mono pt-1">
      <Zap className="h-3 w-3 text-amber-500" />
      <span>{durationSeconds.toFixed(1)}s</span>
      <span>•</span>
      <span>{tokensPerSecond} tok/s</span>
      <span>•</span>
      <span className="truncate max-w-[160px]">{engineName}</span>
    </div>
  );
}
