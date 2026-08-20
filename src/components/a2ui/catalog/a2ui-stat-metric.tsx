"use client";

import React from "react";
import type { A2UIComponentNode } from "@/types/agent";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export interface A2UIStatMetricProps {
  node: A2UIComponentNode;
}

export function A2UIStatMetric({ node }: A2UIStatMetricProps) {
  const label = typeof node.props?.label === "string" ? node.props.label : "";
  const value = String(node.props?.value ?? "");
  const unit = typeof node.props?.unit === "string" ? node.props.unit : undefined;
  const change = typeof node.props?.change === "string" ? node.props.change : undefined;
  const changeType =
    typeof node.props?.changeType === "string" ? node.props.changeType : undefined;
  const icon = typeof node.props?.icon === "string" ? node.props.icon : undefined;

  const isPositive = changeType === "increase" || (change && change.startsWith("+"));
  const isNegative = changeType === "decrease" || (change && change.startsWith("-"));

  return (
    <div
      id={node.id}
      className={cn(
        "my-2 flex flex-col justify-between rounded-xl border border-[#e3e3e3] bg-[#f8fafd] p-3.5 shadow-none transition-colors dark:border-[#3c4043] dark:bg-[#202124]",
        "sm:min-w-[140px]"
      )}
    >
      <div className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
        <span className="truncate font-medium">{label}</span>
        {icon && <span className="text-sm select-none">{icon}</span>}
      </div>

      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-xl font-bold tracking-tight text-foreground">{value}</span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>

      {change && (
        <div
          className={cn(
            "mt-2 flex items-center gap-1 text-[11px] font-medium",
            isPositive && "text-emerald-600 dark:text-emerald-400",
            isNegative && "text-rose-600 dark:text-rose-400",
            !isPositive && !isNegative && "text-muted-foreground"
          )}
        >
          {isPositive && <TrendingUp className="h-3 w-3 shrink-0" />}
          {isNegative && <TrendingDown className="h-3 w-3 shrink-0" />}
          {!isPositive && !isNegative && <Minus className="h-3 w-3 shrink-0" />}
          <span>{change}</span>
        </div>
      )}
    </div>
  );
}
