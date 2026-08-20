"use client";

import React from "react";
import type { A2UIComponentNode } from "@/types/agent";
import { cn } from "@/lib/utils";
import { A2UIBadge } from "./a2ui-typography";

export interface A2UICardProps {
  node: A2UIComponentNode;
  children?: React.ReactNode;
}

export function A2UICard({ node, children }: A2UICardProps) {
  const title = typeof node.props?.title === "string" ? node.props.title : undefined;
  const description =
    typeof node.props?.description === "string" ? node.props.description : undefined;
  const status = typeof node.props?.status === "string" ? node.props.status : undefined;
  const statusVariant =
    typeof node.props?.statusVariant === "string" ? node.props.statusVariant : "neutral";
  const icon = typeof node.props?.icon === "string" ? node.props.icon : undefined;

  return (
    <div
      id={node.id}
      className={cn(
        "my-3 w-full rounded-2xl border border-[#e3e3e3] bg-card p-4 text-card-foreground shadow-sm transition-all dark:border-[#3c4043] dark:bg-[#1a1c1e]",
        "hover:border-[#c2e7ff]/80 dark:hover:border-[#004a77]/80"
      )}
    >
      {(title || status || icon) && (
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-border/40 pb-2.5">
          <div className="flex items-center gap-2">
            {icon && <span className="text-base select-none">{icon}</span>}
            {title && <h3 className="text-sm font-semibold text-foreground">{title}</h3>}
          </div>
          {status && (
            <A2UIBadge
              node={{
                type: "Badge",
                props: { label: status, variant: statusVariant },
              }}
            />
          )}
        </div>
      )}

      {description && (
        <p className="mb-3 text-xs text-muted-foreground leading-relaxed">
          {description}
        </p>
      )}

      <div className="space-y-3">{children}</div>
    </div>
  );
}
