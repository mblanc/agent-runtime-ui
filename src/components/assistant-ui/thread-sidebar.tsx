"use client";

import { useState } from "react";
import { Plus, MessageSquare, PanelLeftClose, PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { UserAvatarMenu } from "@/components/auth/user-avatar-menu";

interface ThreadSidebarProps {
  onNewChat?: () => void;
  className?: string;
}

export function ThreadSidebar({ onNewChat, className }: ThreadSidebarProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [threads] = useState<Array<{ id: string; title: string; date: string }>>([
    { id: "1", title: "Council Strategy & Analysis", date: "Today" },
    { id: "2", title: "Architecture Review", date: "Yesterday" },
  ]);
  const [activeId, setActiveId] = useState("1");

  return (
    <aside
      className={cn(
        "relative flex h-screen flex-col border-r border-border/40 bg-[#f9f9fb] transition-all duration-300 dark:bg-[#131314]",
        isOpen ? "w-64" : "w-16",
        className
      )}
    >
      {/* Top Header / Toggle */}
      <div className="flex h-14 items-center justify-between px-3.5">
        {isOpen && (
          <span className="text-sm font-semibold tracking-tight text-foreground">
            LLM Council
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
        <button
          type="button"
          onClick={onNewChat}
          className={cn(
            "flex h-10 w-full items-center gap-2 rounded-full border border-border/60 bg-white px-3 text-sm font-medium text-foreground shadow-sm transition-all hover:bg-muted/70 dark:bg-[#1e1f20] dark:hover:bg-[#282a2c]",
            !isOpen && "justify-center px-0"
          )}
        >
          <Plus className="h-4 w-4 text-[#1a73e8] dark:text-[#8ab4f8]" />
          {isOpen && <span>New chat</span>}
        </button>
      </div>

      {/* Recent Chats List */}
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {isOpen && (
          <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recent
          </div>
        )}
        {threads.map((thread) => (
          <button
            key={thread.id}
            type="button"
            onClick={() => setActiveId(thread.id)}
            className={cn(
              "group flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
              activeId === thread.id
                ? "bg-[#e8eaed] text-foreground font-medium dark:bg-[#282a2c]"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              !isOpen && "justify-center px-0"
            )}
          >
            <MessageSquare className="h-4 w-4 shrink-0" />
            {isOpen && <span className="truncate text-xs">{thread.title}</span>}
          </button>
        ))}
      </div>

      {/* Bottom Profile Footer */}
      <div className="border-t border-border/40 p-3 flex items-center justify-between">
        <UserAvatarMenu />
      </div>
    </aside>
  );
}
