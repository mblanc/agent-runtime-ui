"use client";

import React from "react";
import type { A2UIComponentNode } from "@/types/agent";
import { cn } from "@/lib/utils";

export interface A2UIChartProps {
  node: A2UIComponentNode;
}

export function A2UIProgressBar({ node }: A2UIChartProps) {
  const value = Math.max(0, Math.min(100, Number(node.props?.value ?? 0)));
  const label = typeof node.props?.label === "string" ? node.props.label : undefined;
  const showValue = Boolean(node.props?.showValue ?? true);
  const color = typeof node.props?.color === "string" ? node.props.color : "primary";

  const colorClasses: Record<string, string> = {
    primary: "bg-[#1a73e8] dark:bg-[#8ab4f8]",
    success: "bg-emerald-500",
    warning: "bg-amber-500",
    danger: "bg-rose-500",
  };

  return (
    <div id={node.id} className="my-2 w-full space-y-1.5">
      {(label || showValue) && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          {label && <span>{label}</span>}
          {showValue && <span className="font-mono font-medium">{value}%</span>}
        </div>
      )}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/60">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            colorClasses[color] || colorClasses.primary
          )}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export interface MiniBarItem {
  label: string;
  value: number;
  color?: string;
}

export function A2UIMiniBarChart({ node }: A2UIChartProps) {
  const data = Array.isArray(node.props?.data) ? (node.props.data as MiniBarItem[]) : [];
  const title = typeof node.props?.title === "string" ? node.props.title : undefined;

  const maxValue = Math.max(1, ...data.map((d) => Number(d.value) || 0));

  return (
    <div
      id={node.id}
      className="my-2.5 w-full rounded-xl border border-border/70 bg-card p-3 text-card-foreground"
    >
      {title && <h4 className="mb-2 text-xs font-semibold text-foreground">{title}</h4>}
      <div className="space-y-2">
        {data.map((item, idx) => {
          const pct = Math.min(
            100,
            Math.max(0, ((Number(item.value) || 0) / maxValue) * 100)
          );
          return (
            <div key={idx} className="space-y-1">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span className="truncate font-medium">{item.label}</span>
                <span className="font-mono font-medium">{item.value}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60">
                <div
                  className="h-full rounded-full bg-[#1a73e8] dark:bg-[#8ab4f8] transition-all duration-300"
                  style={{
                    width: `${pct}%`,
                    ...(item.color ? { backgroundColor: item.color } : {}),
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
