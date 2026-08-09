"use client";

import { useState, useCallback } from "react";
import { Plus, MessageSquare, PanelLeftClose, PanelLeft, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatarMenu } from "@/components/auth/user-avatar-menu";
import { SettingsMenu } from "@/components/settings/settings-menu";
import { ThreadListPrimitive, ThreadListItemPrimitive } from "@assistant-ui/react";
import { useOptionalActiveAgent } from "@/lib/agent-context";

interface ThreadSidebarProps {
  className?: string;
}

function SidebarThreadItem({ isOpen }: { isOpen: boolean }) {
  return (
    <ThreadListItemPrimitive.Root
      className={cn(
        "group relative flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-sm transition-colors hover:bg-muted/60 data-[active=true]:bg-[#e8eaed] data-[active=true]:font-medium data-[active=true]:text-foreground dark:data-[active=true]:bg-[#282a2c]",
        !isOpen && "justify-center px-0"
      )}
    >
      <ThreadListItemPrimitive.Trigger
        className={cn(
          "flex flex-1 items-center gap-2 overflow-hidden text-left outline-none",
          !isOpen && "justify-center"
        )}
      >
        <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground group-data-[active=true]:text-foreground" />
        {isOpen && (
          <span className="truncate text-xs text-muted-foreground group-data-[active=true]:text-foreground">
            <ThreadListItemPrimitive.Title fallback="Untitled conversation" />
          </span>
        )}
      </ThreadListItemPrimitive.Trigger>

      {isOpen && (
        <ThreadListItemPrimitive.Delete asChild>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
            aria-label="Delete conversation"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </ThreadListItemPrimitive.Delete>
      )}
    </ThreadListItemPrimitive.Root>
  );
}

export function ThreadSidebar({ className }: ThreadSidebarProps) {
  const [isOpen, setIsOpen] = useState(true);

  const agentCtx = useOptionalActiveAgent();
  const activeAgentName = agentCtx?.activeAgent?.displayName;

  const renderThreadListItem = useCallback(
    () => <SidebarThreadItem isOpen={isOpen} />,
    [isOpen]
  );

  return (
    <aside
      className={cn(
        "relative flex h-screen flex-col border-r border-border/40 bg-[#f9f9fb] transition-all duration-300 dark:bg-[#131314]",
        isOpen ? "w-64" : "w-16",
        className
      )}
    >
      <ThreadListPrimitive.Root className="flex flex-1 flex-col overflow-hidden">
        {/* Top Header / Toggle */}
        <div className="flex h-14 items-center justify-between px-3.5">
          {isOpen && (
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Agent Runtime UI
            </span>
          )}
          <button
            type="button"
            onClick={() => setIsOpen(!isOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {isOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeft className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* New Chat Button */}
        <div className="px-3 py-2">
          <ThreadListPrimitive.New asChild>
            <button
              type="button"
              className={cn(
                "flex h-10 w-full items-center gap-2 rounded-full border border-border/60 bg-white px-3 text-sm font-medium text-foreground shadow-sm transition-all hover:bg-muted/70 dark:bg-[#1e1f20] dark:hover:bg-[#282a2c]",
                !isOpen && "justify-center px-0"
              )}
            >
              <Plus className="h-4 w-4 text-[#1a73e8] dark:text-[#8ab4f8]" />
              {isOpen && <span>New chat</span>}
            </button>
          </ThreadListPrimitive.New>
        </div>

        {/* Recent Chats List */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
          {isOpen && (
            <div className="flex flex-col gap-0.5 px-2 py-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Recent
              </div>
              {activeAgentName && (
                <div className="truncate text-[10px] text-muted-foreground/80 font-normal">
                  Threads for {activeAgentName}
                </div>
              )}
            </div>
          )}
          <ThreadListPrimitive.Items
            components={{
              ThreadListItem: renderThreadListItem,
            }}
          />
        </div>

        {/* Bottom Profile & Settings Footer */}
        <div
          className={cn(
            "border-t border-border/40 transition-all",
            isOpen
              ? "flex items-center justify-between gap-1 p-2"
              : "flex flex-col items-center justify-center gap-2 p-2"
          )}
        >
          {!isOpen && <SettingsMenu side="right" align="start" />}
          <div className={cn(isOpen ? "flex-1 min-w-0" : "flex justify-center")}>
            <UserAvatarMenu
              showName={isOpen}
              side={isOpen ? "top" : "right"}
              align={isOpen ? "end" : "start"}
            />
          </div>
          {isOpen && <SettingsMenu side="top" align="end" />}
        </div>
      </ThreadListPrimitive.Root>
    </aside>
  );
}
