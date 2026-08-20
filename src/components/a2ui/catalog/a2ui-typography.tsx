"use client";

import React from "react";
import type { A2UIComponentNode } from "@/types/agent";
import { cn } from "@/lib/utils";

export interface A2UITypographyProps {
  node: A2UIComponentNode;
  children?: React.ReactNode;
}

export function A2UIHeading({ node, children }: A2UITypographyProps) {
  const level = Number(node.props?.level) || 2;
  const text =
    typeof node.children === "string"
      ? node.children
      : typeof node.props?.text === "string"
        ? node.props.text
        : "";

  const headingClasses =
    {
      1: "text-lg font-semibold tracking-tight text-foreground sm:text-xl",
      2: "text-base font-semibold text-foreground sm:text-lg",
      3: "text-sm font-medium text-foreground sm:text-base",
      4: "text-xs font-medium uppercase tracking-wider text-muted-foreground",
    }[level as 1 | 2 | 3 | 4] || "text-base font-semibold text-foreground";

  const content = text || children;

  switch (level) {
    case 1:
      return <h1 className={cn("my-1.5", headingClasses)}>{content}</h1>;
    case 3:
      return <h3 className={cn("my-1", headingClasses)}>{content}</h3>;
    case 4:
      return <h4 className={cn("my-0.5", headingClasses)}>{content}</h4>;
    case 2:
    default:
      return <h2 className={cn("my-1.5", headingClasses)}>{content}</h2>;
  }
}

export function A2UIText({ node, children }: A2UITypographyProps) {
  const text =
    typeof node.children === "string"
      ? node.children
      : typeof node.props?.text === "string"
        ? node.props.text
        : "";
  const variant = String(node.props?.variant || "body");
  const muted = Boolean(node.props?.muted);

  const textClasses = cn(
    "leading-relaxed",
    variant === "caption" && "text-xs text-muted-foreground",
    variant === "body" && "text-sm text-foreground/90",
    variant === "lead" && "text-base text-foreground font-normal",
    muted && "text-muted-foreground"
  );

  return <p className={cn("my-1", textClasses)}>{text || children}</p>;
}

export function A2UIBadge({ node, children }: A2UITypographyProps) {
  const label =
    typeof node.props?.label === "string"
      ? node.props.label
      : typeof node.children === "string"
        ? node.children
        : "";
  const variant = String(node.props?.variant || "default");

  const badgeStyles: Record<string, string> = {
    default: "bg-muted text-muted-foreground border-border",
    success:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60",
    warning:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60",
    error:
      "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60",
    info: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60",
    neutral:
      "bg-[#f0f4f9] text-[#444746] border-[#e3e3e3] dark:bg-[#282a2c] dark:text-[#c4c7c5] dark:border-[#3c4043]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        badgeStyles[variant] || badgeStyles.default
      )}
    >
      {label || children}
    </span>
  );
}

export function A2UIDivider({ node }: A2UITypographyProps) {
  const orientation = String(node.props?.orientation || "horizontal");

  if (orientation === "vertical") {
    return <div className="mx-2 inline-block h-4 w-px bg-border align-middle" />;
  }

  return <hr className="my-3 border-t border-border/70" />;
}
