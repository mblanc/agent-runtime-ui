"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Brain, X, Search, Plus, Zap, Tag, Sparkles } from "lucide-react";
import { useMemory } from "@/lib/memory-context";
import { useSession } from "@/lib/auth-client";
import { MemoryItemCard, formatTopicName } from "./memory-item-card";
import { AddMemoryModal } from "./add-memory-modal";
import { cn } from "@/lib/utils";

export function MemoryDrawer() {
  const {
    filteredMemories,
    topics,
    activeTopic,
    searchQuery,
    isDrawerOpen,
    setIsDrawerOpen,
    setTopic,
    setSearchQuery,
    createMemory,
    updateMemory,
    deleteMemory,
    isLoading,
  } = useMemory();

  const { data: session } = useSession();
  const [isAddOpen, setIsAddOpen] = useState(false);

  return (
    <Dialog.Root open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby="memory-drawer-description"
          className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border/60 bg-background shadow-2xl transition-all duration-300 ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-lg"
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-border/40 p-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#d3e3fd]/60 dark:bg-[#1b2f9c]/40 text-[#062e6f] dark:text-[#d3e3fd]">
                <Brain className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <Dialog.Title className="text-base font-semibold text-foreground">
                  Memory Bank Profile
                </Dialog.Title>
                <p
                  id="memory-drawer-description"
                  className="text-xs text-muted-foreground"
                >
                  Personalized semantic context for{" "}
                  <span className="font-medium text-foreground">
                    {session?.user?.email || "Current User"}
                  </span>
                </p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close memory drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Controls: Search and Add Button */}
          <div className="flex flex-col gap-3 border-b border-border/40 p-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search facts..."
                  className="h-9 w-full rounded-full border border-border/60 bg-muted/40 pl-9 pr-3 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:bg-background"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsAddOpen((prev) => !prev)}
                className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#d3e3fd] px-3.5 text-xs font-medium text-[#062e6f] transition-all hover:bg-[#c2d7fc] active:scale-95 dark:bg-[#1b2f9c] dark:text-[#d3e3fd]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Memory</span>
              </button>
            </div>

            {/* Topic Filter Chips */}
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto pb-1 text-xs">
              {topics.map((t) => {
                const isActive = activeTopic.toLowerCase() === t.name.toLowerCase();
                return (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => setTopic(t.name)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-foreground text-background shadow-xs"
                        : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <Tag className="h-3 w-3" />
                    <span>{formatTopicName(t.name)}</span>
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.2 text-[10px]",
                        isActive
                          ? "bg-background/20 text-background"
                          : "bg-muted-foreground/20 text-muted-foreground"
                      )}
                    >
                      {t.count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Add Memory Form Accordion */}
            <AddMemoryModal
              isOpen={isAddOpen}
              onClose={() => setIsAddOpen(false)}
              onAdd={createMemory}
            />
          </div>

          {/* Memory List Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {isLoading ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
                <Brain className="h-6 w-6 animate-pulse" />
                <span className="text-xs">Loading memory profile...</span>
              </div>
            ) : filteredMemories.length === 0 ? (
              <div className="flex h-64 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <Sparkles className="h-8 w-8 opacity-40" />
                <div className="text-sm font-medium text-foreground">
                  No memories found
                </div>
                <p className="max-w-xs text-xs text-muted-foreground">
                  {searchQuery
                    ? `No facts matching "${searchQuery}" in this category.`
                    : "Add facts about your preferences, tools, or projects to personalize responses."}
                </p>
              </div>
            ) : (
              filteredMemories.map((mem) => (
                <MemoryItemCard
                  key={mem.id}
                  memory={mem}
                  onUpdate={updateMemory}
                  onDelete={deleteMemory}
                />
              ))
            )}
          </div>

          {/* Drawer Footer with Auto-Consolidation Status */}
          <div className="flex items-center justify-between border-t border-border/40 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              <span>Auto-Consolidation</span>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Active
            </span>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
