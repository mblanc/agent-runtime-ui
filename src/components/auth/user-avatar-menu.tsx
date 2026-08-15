"use client";

import { useSession, signOut } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Brain, LogOut, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useOptionalMemory } from "@/lib/memory-context";
import { useOptionalSessionState } from "@/lib/session-state/state-context";

interface UserAvatarMenuProps {
  showName?: boolean;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

export function UserAvatarMenu({
  showName = true,
  className,
  side = "top",
  align = "end",
}: UserAvatarMenuProps) {
  const { data: session, isPending } = useSession();
  const memoryContext = useOptionalMemory();
  const sessionStateContext = useOptionalSessionState();

  if (isPending) {
    return (
      <div className="flex items-center gap-2.5">
        <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
        {showName && (
          <div className="space-y-1">
            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-28 animate-pulse rounded bg-muted" />
          </div>
        )}
      </div>
    );
  }

  if (!session?.user) {
    return (
      <Link
        href="/login"
        className="rounded-full bg-[#d3e3fd] px-4 py-1.5 text-xs font-medium text-[#062e6f] transition-colors hover:bg-[#c2d7fc] dark:bg-[#1b2f9c] dark:text-[#d3e3fd]"
      >
        Sign in
      </Link>
    );
  }

  const initials = session.user.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-2.5 rounded-2xl p-1.5 text-left outline-none ring-offset-background transition-colors hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring",
          showName && "w-full pr-2",
          className
        )}
      >
        <Avatar className="h-8 w-8 shrink-0 border border-border/40 shadow-sm">
          <AvatarImage src={session.user.image || ""} alt={session.user.name || "User"} />
          <AvatarFallback className="bg-[#d3e3fd] text-xs font-semibold text-[#062e6f] dark:bg-[#1b2f9c] dark:text-white">
            {initials}
          </AvatarFallback>
        </Avatar>

        {showName && (
          <div className="flex min-w-0 flex-1 flex-col text-left">
            <span className="truncate text-xs font-semibold text-foreground">
              {session.user.name}
            </span>
            <span className="truncate text-[10px] font-normal text-muted-foreground">
              {session.user.email}
            </span>
          </div>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} side={side} className="w-56 p-2 shadow-xl">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none text-foreground">
              {session.user.name}
            </p>
            <p className="text-xs leading-none text-muted-foreground">
              {session.user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {memoryContext && (
          <DropdownMenuItem
            className="cursor-pointer gap-2"
            onClick={() => memoryContext.setIsDrawerOpen(true)}
          >
            <Brain className="h-4 w-4 text-[#1a73e8] dark:text-[#8ab4f8]" />
            <span>Memory Bank Profile</span>
          </DropdownMenuItem>
        )}
        {sessionStateContext && (
          <DropdownMenuItem
            className="cursor-pointer gap-2"
            onClick={() => sessionStateContext.setIsDrawerOpen(true)}
          >
            <SlidersHorizontal className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <span>Session State Inspector</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="cursor-pointer gap-2 text-destructive focus:text-destructive"
          onClick={() => signOut()}
        >
          <LogOut className="h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
