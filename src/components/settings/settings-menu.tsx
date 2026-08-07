"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Settings, Sun, Moon, Monitor, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface SettingsMenuProps {
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

export function SettingsMenu({
  className,
  side = "top",
  align = "end",
}: SettingsMenuProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch by waiting for mount
  useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = mounted ? theme : "system";

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger
            aria-label="Settings and Theme"
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none ring-offset-background transition-all hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:scale-95",
              className
            )}
          >
            <Settings className="h-4 w-4" />
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side={side}>
          <p>Settings & Theme</p>
        </TooltipContent>
      </Tooltip>

      <DropdownMenuContent
        align={align}
        side={side}
        className="w-48 p-1.5 shadow-xl rounded-2xl"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Appearance
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* System Theme Option */}
        <DropdownMenuItem
          onClick={() => setTheme("system")}
          className="flex cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-xs font-medium focus:bg-muted/80"
        >
          <div className="flex items-center gap-2">
            <Monitor className="h-4 w-4 text-muted-foreground" />
            <span>System</span>
          </div>
          {currentTheme === "system" && (
            <Check className="h-3.5 w-3.5 text-[#1a73e8] dark:text-[#8ab4f8]" />
          )}
        </DropdownMenuItem>

        {/* Light Theme Option */}
        <DropdownMenuItem
          onClick={() => setTheme("light")}
          className="flex cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-xs font-medium focus:bg-muted/80"
        >
          <div className="flex items-center gap-2">
            <Sun className="h-4 w-4 text-amber-500" />
            <span>Light</span>
          </div>
          {currentTheme === "light" && (
            <Check className="h-3.5 w-3.5 text-[#1a73e8] dark:text-[#8ab4f8]" />
          )}
        </DropdownMenuItem>

        {/* Dark Theme Option */}
        <DropdownMenuItem
          onClick={() => setTheme("dark")}
          className="flex cursor-pointer items-center justify-between rounded-xl px-2.5 py-2 text-xs font-medium focus:bg-muted/80"
        >
          <div className="flex items-center gap-2">
            <Moon className="h-4 w-4 text-indigo-400" />
            <span>Dark</span>
          </div>
          {currentTheme === "dark" && (
            <Check className="h-3.5 w-3.5 text-[#1a73e8] dark:text-[#8ab4f8]" />
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
