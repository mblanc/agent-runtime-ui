"use client";

import { useAuiState } from "@assistant-ui/react";
import { Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface GeminiMessageTimingProps {
  durationSeconds?: number;
  tokensPerSecond?: number;
  engineName?: string;
}

interface MessageContentPart {
  type?: string;
  text?: string;
}

interface MessageTimingMetadata {
  duration?: number;
  tokensPerSecond?: number;
  engineName?: string;
}

interface AuiMessageState {
  message?: {
    status?: { type?: string };
    content?: ReadonlyArray<MessageContentPart>;
    metadata?: { timing?: MessageTimingMetadata };
  };
}

export function GeminiMessageTiming({
  durationSeconds: propDuration,
  tokensPerSecond: propTps,
  engineName: propEngine,
}: GeminiMessageTimingProps) {
  const startTimeRef = useRef<number>(Date.now());
  const [elapsedDuration, setElapsedDuration] = useState<number | null>(null);

  const isRunning = useAuiState((s: AuiMessageState) =>
    Boolean("message" in s && s.message?.status?.type === "running")
  );

  const charCount = useAuiState((s: AuiMessageState) => {
    if (!("message" in s) || s.message?.status?.type === "running") return 0;
    const content = s.message?.content || [];
    return content
      .filter((p) => p.type === "text" && p.text)
      .reduce((acc, p) => acc + (p.text?.length || 0), 0);
  });

  const metadataTiming = useAuiState((s: AuiMessageState) =>
    "message" in s ? s.message?.metadata?.timing : undefined
  );

  // Track elapsed generation duration when streaming finishes
  useEffect(() => {
    if (isRunning) {
      startTimeRef.current = Date.now();
    } else if (elapsedDuration === null) {
      const elapsed = Math.max(0.4, (Date.now() - startTimeRef.current) / 1000);
      setElapsedDuration(elapsed);
    }
  }, [isRunning, elapsedDuration]);

  // While the agent is actively reasoning or generating, hide the timing badge
  if (isRunning) {
    return null;
  }

  // Resolve values
  const duration =
    propDuration ??
    (metadataTiming?.duration
      ? metadataTiming.duration / 1000
      : (elapsedDuration ?? 1.8));

  const calculatedTokens = Math.max(1, Math.round(charCount / 4));
  const calculatedTps = Math.round(calculatedTokens / Math.max(0.5, duration));

  const tps = propTps ?? metadataTiming?.tokensPerSecond ?? calculatedTps;
  const engine = propEngine ?? metadataTiming?.engineName ?? "Vertex AI Reasoning Engine";

  return (
    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80 font-mono pt-1">
      <Zap className="h-3 w-3 text-amber-500" />
      <span>{duration.toFixed(1)}s</span>
      <span>•</span>
      <span>{tps} tok/s</span>
      <span>•</span>
      <span className="truncate max-w-[180px]">{engine}</span>
    </div>
  );
}
