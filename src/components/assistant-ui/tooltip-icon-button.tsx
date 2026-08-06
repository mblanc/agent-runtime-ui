"use client";

import { ComponentPropsWithoutRef, ReactNode, forwardRef } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface TooltipIconButtonProps extends ComponentPropsWithoutRef<typeof Button> {
  tooltip: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}

export const TooltipIconButton = forwardRef<HTMLButtonElement, TooltipIconButtonProps>(
  ({ tooltip, side = "top", className, children, ...props }, ref) => {
    return (
      <TooltipPrimitive.Provider>
        <TooltipPrimitive.Root>
          <TooltipPrimitive.Trigger asChild>
            <Button
              ref={ref}
              variant="ghost"
              size="icon"
              className={cn(
                "h-7 w-7 rounded-lg text-muted-foreground hover:text-foreground",
                className
              )}
              {...props}
            >
              {children}
              <span className="sr-only">
                {typeof tooltip === "string" ? tooltip : "action"}
              </span>
            </Button>
          </TooltipPrimitive.Trigger>
          <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
              side={side}
              sideOffset={4}
              className="z-50 overflow-hidden rounded-md bg-popover px-2.5 py-1 text-xs text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
            >
              {tooltip}
            </TooltipPrimitive.Content>
          </TooltipPrimitive.Portal>
        </TooltipPrimitive.Root>
      </TooltipPrimitive.Provider>
    );
  }
);

TooltipIconButton.displayName = "TooltipIconButton";
