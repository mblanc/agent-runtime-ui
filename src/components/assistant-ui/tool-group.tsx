"use client";

import { ReactNode, useState } from "react";
import { ChevronDown, ChevronRight, Cpu, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolGroupRootProps {
  children: ReactNode;
  defaultOpen?: boolean;
  className?: string;
}

export function ToolGroupRoot({
  children,
  defaultOpen = false,
  className,
}: ToolGroupRootProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      className={cn(
        "my-2.5 overflow-hidden rounded-2xl border border-[#e3e3e3] bg-[#f8fafd] text-xs transition-all dark:border-[#333537] dark:bg-[#1a1c1e]",
        className
      )}
    >
      <ToolGroupContext.Provider value={{ isOpen, setIsOpen }}>
        {children}
      </ToolGroupContext.Provider>
    </div>
  );
}

import { createContext, useContext } from "react";

const ToolGroupContext = createContext<{
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}>({
  isOpen: false,
  setIsOpen: () => {},
});

interface ToolGroupTriggerProps {
  count?: number;
  active?: boolean;
  className?: string;
}

export function ToolGroupTrigger({
  count = 1,
  active = false,
  className,
}: ToolGroupTriggerProps) {
  const { isOpen, setIsOpen } = useContext(ToolGroupContext);

  return (
    <button
      type="button"
      onClick={() => setIsOpen(!isOpen)}
      className={cn(
        "flex w-full items-center justify-between px-3.5 py-2.5 text-left font-medium text-[#444746] transition-colors hover:bg-[#eff2f6] dark:text-[#c4c7c5] dark:hover:bg-[#282a2c]",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <Cpu className="h-4 w-4 text-[#1a73e8] dark:text-[#8ab4f8]" />
        <span className="font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]">
          {active
            ? `Running ${count} ${count === 1 ? "tool" : "tools"}...`
            : `Executed ${count} ${count === 1 ? "tool" : "tools"}`}
        </span>
        {active ? (
          <span className="flex items-center gap-1 text-[11px] text-[#1a73e8] dark:text-[#8ab4f8]">
            <Loader2 className="h-3 w-3 animate-spin" />
          </span>
        ) : (
          <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" />
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

export function ToolGroupContent({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const { isOpen } = useContext(ToolGroupContext);

  if (!isOpen) return null;

  return (
    <div
      className={cn(
        "border-t border-[#e3e3e3] p-3 space-y-2 dark:border-[#333537]",
        className
      )}
    >
      {children}
    </div>
  );
}
