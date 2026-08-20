"use client";

import React from "react";
import type { A2UIComponentNode } from "@/types/agent";
import { AlertCircle } from "lucide-react";

export interface A2UIFallbackProps {
  node: A2UIComponentNode;
}

export function A2UIFallback({ node }: A2UIFallbackProps) {
  return (
    <div className="my-2 rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-3 text-xs text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/20 dark:text-amber-200">
      <div className="flex items-center gap-1.5 font-medium">
        <AlertCircle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
        <span>Component: {node.type || "Unknown"}</span>
      </div>
      {node.props && Object.keys(node.props).length > 0 && (
        <pre className="mt-2 overflow-x-auto rounded bg-amber-100/50 p-2 font-mono text-[11px] text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          {JSON.stringify(node.props, null, 2)}
        </pre>
      )}
    </div>
  );
}
