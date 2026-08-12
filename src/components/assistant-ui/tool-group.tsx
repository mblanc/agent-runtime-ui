"use client";

import { ReactNode, useState, useEffect, createContext, useContext } from "react";
import { ChevronDown, ChevronRight, Cpu, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

const ToolGroupContext = createContext<{
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}>({
  isOpen: false,
  setIsOpen: () => {},
});

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

  useEffect(() => {
    if (defaultOpen) {
      setIsOpen(true);
    }
  }, [defaultOpen]);

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

interface ToolGroupTriggerProps {
  count?: number;
  active?: boolean;
  status?: string;
  className?: string;
}

export function ToolGroupTrigger({
  count = 1,
  active = false,
  status,
  className,
}: ToolGroupTriggerProps) {
  const { isOpen, setIsOpen } = useContext(ToolGroupContext);
  const isRequiresAction = status === "requires-action";

  return (
    <button
      type="button"
      onClick={() => setIsOpen(!isOpen)}
      className={cn(
        "flex w-full items-center justify-between px-3.5 py-2.5 text-left font-medium text-[#444746] transition-colors hover:bg-[#eff2f6] dark:text-[#c4c7c5] dark:hover:bg-[#282a2c]",
        isRequiresAction && "bg-amber-500/10 hover:bg-amber-500/15 dark:bg-amber-950/30 dark:hover:bg-amber-950/40",
        className
      )}
    >
      <div className="flex items-center gap-2">
        {isRequiresAction ? (
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        ) : (
          <Cpu className="h-4 w-4 text-[#1a73e8] dark:text-[#8ab4f8]" />
        )}
        <span
          className={cn(
            "font-semibold text-[#1f1f1f] dark:text-[#e3e3e3]",
            isRequiresAction && "text-amber-900 dark:text-amber-200"
          )}
        >
          {isRequiresAction
            ? `${count === 1 ? "Tool requires" : `${count} tools require`} approval`
            : active
              ? `Running ${count} ${count === 1 ? "tool" : "tools"}...`
              : `Executed ${count} ${count === 1 ? "tool" : "tools"}`}
        </span>
        {isRequiresAction ? (
          <span className="flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
            Requires Approval
          </span>
        ) : active ? (
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
        <span className="text-[11px] hover:text-foreground">
          {isOpen ? "Collapse" : "View Details"}
        </span>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-[#1a73e8] dark:text-[#8ab4f8]" />
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
