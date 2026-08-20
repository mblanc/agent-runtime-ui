"use client";

import React from "react";
import type { A2UIComponentNode } from "@/types/agent";
import { cn } from "@/lib/utils";

export interface A2UITableProps {
  node: A2UIComponentNode;
}

export function A2UITable({ node }: A2UITableProps) {
  const headers = Array.isArray(node.props?.headers)
    ? (node.props.headers as string[])
    : [];
  const rows = Array.isArray(node.props?.rows)
    ? (node.props.rows as (string | number | boolean)[][])
    : [];
  const caption =
    typeof node.props?.caption === "string" ? node.props.caption : undefined;

  return (
    <div
      id={node.id}
      className="my-2.5 w-full overflow-hidden rounded-xl border border-border/70"
    >
      {caption && (
        <div className="bg-muted/40 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border/50">
          {caption}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-foreground">
          {headers.length > 0 && (
            <thead className="border-b border-border bg-muted/60 font-semibold text-foreground">
              <tr>
                {headers.map((header, idx) => (
                  <th key={idx} className="px-3 py-2.5 whitespace-nowrap">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-border/40">
            {rows.map((row, rowIdx) => (
              <tr
                key={rowIdx}
                className={cn(
                  "transition-colors hover:bg-muted/30",
                  rowIdx % 2 === 1 && "bg-muted/10"
                )}
              >
                {Array.isArray(row) ? (
                  row.map((cell, cellIdx) => (
                    <td key={cellIdx} className="px-3 py-2 whitespace-nowrap">
                      {String(cell)}
                    </td>
                  ))
                ) : (
                  <td className="px-3 py-2">{String(row)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
