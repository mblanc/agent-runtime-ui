"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAuiState } from "@assistant-ui/react";
import { Check, Copy, Lock, ShieldCheck } from "lucide-react";
import { cn, copyToClipboardSafe } from "@/lib/utils";

export interface ThoughtSignatureBadgeProps {
  signature?: string;
  className?: string;
  variant?: "badge" | "icon" | "inline";
}

export function ThoughtSignatureBadge({
  signature: propSignature,
  className,
  variant = "badge",
}: ThoughtSignatureBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const customState = useAuiState(
    (s: {
      message?: {
        metadata?: {
          custom?: Record<string, unknown>;
        };
      };
    }) => ("message" in s ? s.message?.metadata?.custom : undefined)
  );

  const rawSig =
    propSignature ||
    (customState?.thoughtSignature as string | undefined) ||
    (customState?.thought_signature as string | undefined);

  const signature = typeof rawSig === "string" && rawSig ? rawSig : undefined;

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsOpen(true), 150);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setIsOpen(false), 250);
  };

  const handleClickOutside = useCallback((event: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isOpen, handleClickOutside]);

  const copySignature = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!signature) return;
    const success = await copyToClipboardSafe(signature);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!signature) {
    return null;
  }

  const truncatedSignature =
    signature.length > 28
      ? `${signature.substring(0, 14)}...${signature.substring(signature.length - 10)}`
      : signature;

  return (
    <div
      ref={containerRef}
      className={cn("relative inline-flex items-center", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Trigger */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        aria-expanded={isOpen}
        aria-label="Verified reasoning signature details"
        className={cn(
          "inline-flex items-center gap-1 transition-all rounded-full font-mono",
          variant === "badge" &&
            "px-2 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 border border-emerald-500/20 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-500/30",
          variant === "icon" &&
            "p-1 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 rounded-full dark:text-emerald-400",
          variant === "inline" &&
            "px-1.5 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline",
          isOpen && "ring-1 ring-emerald-500/40"
        )}
      >
        <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
        {variant === "badge" && <span>Verified Reasoning</span>}
      </button>

      {/* Popover Card */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Cryptographic Reasoning Signature"
          className={cn(
            "absolute bottom-full right-0 sm:left-0 sm:right-auto z-50 mb-2 w-72 sm:w-80 rounded-2xl border border-emerald-500/20 bg-background/95 p-3.5 shadow-2xl backdrop-blur-md dark:border-emerald-500/30 dark:bg-[#1e1f20]/95 text-foreground",
            "animate-in fade-in-0 zoom-in-95"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-border/40 pb-2 mb-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
              <Lock className="h-3.5 w-3.5" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-foreground tracking-tight">
                Verified Reasoning Trace
              </h4>
              <span className="text-[10px] text-muted-foreground block">
                Vertex AI Cryptographic Signature
              </span>
            </div>
          </div>

          {/* Description */}
          <p className="text-[11px] leading-relaxed text-muted-foreground mb-3">
            Signed by Google Cloud Vertex AI to guarantee chain-of-thought provenance and
            ensure that intermediate reasoning steps were preserved without tampering.
          </p>

          {/* Signature Code Box */}
          <div className="rounded-xl bg-muted/50 p-2 border border-border/40 flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-wider block mb-0.5">
                Thought Signature
              </span>
              <span
                className="font-mono text-[10px] text-foreground truncate block select-all"
                title={signature}
              >
                {truncatedSignature}
              </span>
            </div>
            <button
              type="button"
              onClick={copySignature}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-background hover:bg-muted text-muted-foreground hover:text-foreground transition-colors border border-border/50"
              aria-label="Copy Thought Signature"
            >
              {copied ? (
                <Check className="h-3 w-3 text-emerald-500" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
