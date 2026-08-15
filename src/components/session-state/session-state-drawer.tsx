"use client";

import { useState, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  SlidersHorizontal,
  X,
  Plus,
  RefreshCw,
  Copy,
  Check,
  Search,
  Database,
  Sparkles,
} from "lucide-react";
import { useSessionState } from "@/lib/session-state/state-context";
import { StateVariableCard } from "./state-variable-card";
import { AddStateVariableModal } from "./add-state-variable-modal";
import { copyToClipboardSafe, cn } from "@/lib/utils";

export function SessionStateDrawer() {
  const {
    state,
    isLoading,
    error,
    isDrawerOpen,
    setIsDrawerOpen,
    activeSessionId,
    refreshState,
    updateVariable,
    deleteVariable,
    updateTime,
  } = useSessionState();

  const [searchQuery, setSearchQuery] = useState("");
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const stateEntries = useMemo(() => Object.entries(state), [state]);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) return stateEntries;
    const q = searchQuery.toLowerCase().trim();
    return stateEntries.filter(([k, v]) => {
      if (k.toLowerCase().includes(q)) return true;
      try {
        return JSON.stringify(v).toLowerCase().includes(q);
      } catch {
        return false;
      }
    });
  }, [stateEntries, searchQuery]);

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await refreshState();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCopyAll = async () => {
    const jsonStr = JSON.stringify(state, null, 2);
    const ok = await copyToClipboardSafe(jsonStr);
    if (ok) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }
  };

  return (
    <Dialog.Root open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby="session-state-drawer-description"
          className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border/60 bg-background shadow-2xl transition-all duration-300 ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-lg"
        >
          {/* Drawer Header */}
          <div className="flex items-start justify-between border-b border-border/40 p-5 bg-background">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400">
                <SlidersHorizontal className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Dialog.Title className="text-base font-semibold text-foreground">
                    Session State Inspector
                  </Dialog.Title>
                  <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[11px] font-mono font-medium text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                    {stateEntries.length} {stateEntries.length === 1 ? "var" : "vars"}
                  </span>
                </div>
                <p
                  id="session-state-drawer-description"
                  className="text-xs text-muted-foreground mt-0.5"
                >
                  Live ADK multi-turn execution state for session{" "}
                  <span className="font-mono text-foreground font-medium">
                    {activeSessionId || "local"}
                  </span>
                </p>
              </div>
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close session state drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-col gap-2.5 border-b border-border/40 bg-muted/20 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter state variables..."
                  className="w-full rounded-xl border border-border/60 bg-background/80 pl-8.5 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                />
              </div>

              <button
                type="button"
                onClick={() => setIsAddOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-indigo-700 transition-all dark:bg-indigo-500 dark:hover:bg-indigo-600 shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Var</span>
              </button>

              <button
                type="button"
                onClick={handleRefresh}
                disabled={isRefreshing || isLoading}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/60 bg-background/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 shrink-0"
                title="Refresh session state from backend"
                aria-label="Refresh session state"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")}
                />
              </button>

              {stateEntries.length > 0 && (
                <button
                  type="button"
                  onClick={handleCopyAll}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-border/60 bg-background/80 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  title="Copy full state JSON"
                  aria-label="Copy full state JSON"
                >
                  {copiedAll ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>

            {/* Inline Add Variable Modal */}
            {isAddOpen && (
              <AddStateVariableModal
                isOpen={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                onAdd={async (k, v) => {
                  await updateVariable(k, v);
                }}
              />
            )}
          </div>

          {/* Variable List Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {error && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            )}

            {isLoading && stateEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-2">
                <RefreshCw className="h-6 w-6 animate-spin text-indigo-500" />
                <span className="text-xs text-muted-foreground font-medium">
                  Loading session state variables...
                </span>
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center space-y-3 px-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
                  <Database className="h-6 w-6" />
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-foreground">
                    {searchQuery ? "No matching variables" : "No State Variables Set"}
                  </h4>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    {searchQuery
                      ? "Try searching for a different variable key or clear your filter."
                      : "Session state variables are automatically tracked and modified as the agent reasons and executes tool actions."}
                  </p>
                </div>
                {!searchQuery && (
                  <button
                    type="button"
                    onClick={() => setIsAddOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/10 px-3.5 py-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/30 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add your first variable</span>
                  </button>
                )}
              </div>
            ) : (
              filteredEntries.map(([k, val]) => (
                <StateVariableCard
                  key={k}
                  variableKey={k}
                  value={val}
                  onUpdate={updateVariable}
                  onDelete={deleteVariable}
                />
              ))
            )}
          </div>

          {/* Drawer Footer */}
          <div className="flex items-center justify-between border-t border-border/40 p-4 bg-muted/10 text-[11px] text-muted-foreground font-mono">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-indigo-500" />
              <span>Vertex AI Reasoning Engine State</span>
            </div>
            {updateTime && (
              <span>Updated: {new Date(updateTime).toLocaleTimeString()}</span>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
