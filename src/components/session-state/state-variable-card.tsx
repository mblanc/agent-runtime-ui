"use client";

import { useState } from "react";
import {
  Edit2,
  Trash2,
  Check,
  X,
  Copy,
  Code2,
  Type,
  Hash,
  ToggleLeft,
  Brackets,
} from "lucide-react";
import type { SessionStateValue } from "@/types/agent";
import {
  inferValueType,
  parseStateInputValue,
  type SessionStateType,
} from "@/lib/session-state/state-diff";
import { cn, copyToClipboardSafe } from "@/lib/utils";

interface StateVariableCardProps {
  variableKey: string;
  value: SessionStateValue;
  onUpdate: (key: string, value: SessionStateValue) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
}

function getTypeBadge(type: SessionStateType) {
  switch (type) {
    case "string":
      return {
        label: "string",
        icon: <Type className="h-3 w-3" />,
        className: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
      };
    case "number":
      return {
        label: "number",
        icon: <Hash className="h-3 w-3" />,
        className:
          "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
      };
    case "boolean":
      return {
        label: "boolean",
        icon: <ToggleLeft className="h-3 w-3" />,
        className:
          "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
      };
    case "array":
      return {
        label: "array",
        icon: <Brackets className="h-3 w-3" />,
        className:
          "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
      };
    case "object":
      return {
        label: "object",
        icon: <Code2 className="h-3 w-3" />,
        className:
          "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20",
      };
    case "null":
    default:
      return {
        label: "null",
        icon: <Code2 className="h-3 w-3" />,
        className: "bg-muted text-muted-foreground border-border/40",
      };
  }
}

export function StateVariableCard({
  variableKey,
  value,
  onUpdate,
  onDelete,
}: StateVariableCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valueType = inferValueType(value);
  const badge = getTypeBadge(valueType);

  const formatDisplayValue = (val: SessionStateValue): string => {
    if (val === null || val === undefined) return "null";
    if (typeof val === "object") {
      try {
        return JSON.stringify(val, null, 2);
      } catch {
        return String(val);
      }
    }
    return String(val);
  };

  const handleStartEdit = () => {
    setEditValue(
      typeof value === "object" && value !== null
        ? JSON.stringify(value, null, 2)
        : String(value ?? "")
    );
    setError(null);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    try {
      setIsSubmitting(true);
      setError(null);
      const parsed = parseStateInputValue(editValue);
      await onUpdate(variableKey, parsed);
      setIsEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update variable");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      setError(null);
      await onDelete(variableKey);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete variable");
      setIsDeleting(false);
    }
  };

  const handleCopy = async () => {
    const textToCopy =
      typeof value === "object" && value !== null
        ? JSON.stringify(value, null, 2)
        : String(value ?? "");
    const ok = await copyToClipboardSafe(textToCopy);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="group rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/30 p-3.5 transition-all text-xs space-y-2.5">
      {/* Header Row: Key + Type Badge + Actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-mono font-bold text-foreground text-[13px] truncate">
            {variableKey}
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-mono font-medium border",
              badge.className
            )}
          >
            {badge.icon}
            <span>{badge.label}</span>
          </span>
        </div>

        {!isEditing && (
          <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
            <button
              type="button"
              onClick={handleCopy}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Copy value"
              aria-label="Copy variable value"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              onClick={handleStartEdit}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Edit variable"
              aria-label="Edit variable"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
              title="Delete variable"
              aria-label="Delete variable"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Value Container or Edit Form */}
      {isEditing ? (
        <div className="space-y-2 pt-1">
          <textarea
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            rows={typeof value === "object" ? 4 : 2}
            autoFocus
            className="w-full rounded-lg border border-border/80 bg-background px-2.5 py-1.5 font-mono text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring resize-y"
          />

          {error && <div className="text-[11px] text-destructive">{error}</div>}

          <div className="flex items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Check className="h-3 w-3" />
              {isSubmitting ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-lg bg-background/80 border border-border/40 px-3 py-2 font-mono text-[12px] text-foreground/90 overflow-x-auto max-h-48 whitespace-pre-wrap">
          {formatDisplayValue(value)}
        </div>
      )}
    </div>
  );
}
