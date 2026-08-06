"use client";

import { ReactNode, useState, useEffect } from "react";
import { ChevronDown, ChevronRight, BrainCircuit, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const [isOpen, setIsOpen] = useState(defaultOpen || streaming);

  // Auto-expand while streaming, retain state once manual toggle occurs
  useEffect(() => {
    if (streaming) {
      setIsOpen(true);
    }
  }, [streaming]);

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
    <button
      type="button"
      onClick={() => setIsOpen(!isOpen)}
      className={cn(
        "flex w-full items-center justify-between px-3.5 py-2.5 text-left text-xs font-medium text-[#444746] transition-colors hover:bg-[#eff2f6] dark:text-[#c4c7c5] dark:hover:bg-[#282a2c]",
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

      <div className="flex items-center gap-1 text-muted-foreground">
        {isOpen ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
      </div>
    </button>
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

export function ReasoningText({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "font-mono text-[11.5px] leading-5 text-[#575b5f] dark:text-[#9aa0a6] whitespace-pre-wrap",
        className
      )}
    >
      {children}
    </div>
  );
}

export function Reasoning({ text }: { text?: string }) {
  return <ReasoningText>{text}</ReasoningText>;
}
