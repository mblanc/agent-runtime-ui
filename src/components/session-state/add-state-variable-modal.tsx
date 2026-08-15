"use client";

import { useState } from "react";
import { X, SlidersHorizontal, Check } from "lucide-react";
import type { SessionStateValue } from "@/types/agent";
import { parseStateInputValue } from "@/lib/session-state/state-diff";

interface AddStateVariableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (key: string, value: SessionStateValue) => Promise<void>;
}

export function AddStateVariableModal({
  isOpen,
  onClose,
  onAdd,
}: AddStateVariableModalProps) {
  const [key, setKey] = useState("");
  const [valueStr, setValueStr] = useState("");
  const [valueType, setValueType] = useState<"string" | "number" | "boolean" | "json">(
    "string"
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanKey = key.trim();
    if (!cleanKey || isSubmitting) return;

    if (!/^[a-zA-Z0-9_-]+$/.test(cleanKey)) {
      setError("Variable key must be alphanumeric with underscores or dashes.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      let parsedVal: SessionStateValue;
      if (valueType === "boolean") {
        parsedVal = valueStr.trim().toLowerCase() === "true";
      } else if (valueType === "number") {
        const num = Number(valueStr.trim());
        if (isNaN(num)) {
          setError("Please enter a valid numeric value.");
          setIsSubmitting(false);
          return;
        }
        parsedVal = num;
      } else if (valueType === "json") {
        try {
          parsedVal = JSON.parse(valueStr.trim()) as SessionStateValue;
        } catch {
          setError("Please enter valid JSON syntax.");
          setIsSubmitting(false);
          return;
        }
      } else {
        parsedVal = parseStateInputValue(valueStr);
      }

      await onAdd(cleanKey, parsedVal);
      setKey("");
      setValueStr("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add variable");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-4 shadow-sm transition-all space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <span className="text-xs font-semibold text-foreground">
            Set Session State Variable
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
          aria-label="Close add variable form"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground block mb-1">
              Variable Key
            </label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="e.g. target_cluster, run_config"
              autoFocus
              className="w-full rounded-lg border border-border/80 bg-background px-3 py-1.5 font-mono text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground block mb-1">
              Data Type
            </label>
            <select
              value={valueType}
              onChange={(e) =>
                setValueType(e.target.value as "string" | "number" | "boolean" | "json")
              }
              className="w-full rounded-lg border border-border/80 bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-ring"
            >
              <option value="string">String (text)</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean (true/false)</option>
              <option value="json">JSON (Object / Array)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground block mb-1">
            Value
          </label>
          {valueType === "boolean" ? (
            <select
              value={valueStr}
              onChange={(e) => setValueStr(e.target.value)}
              className="w-full rounded-lg border border-border/80 bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-ring"
            >
              <option value="">Select Boolean...</option>
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <textarea
              value={valueStr}
              onChange={(e) => setValueStr(e.target.value)}
              placeholder={
                valueType === "json"
                  ? '{\n  "min_instances": 2,\n  "tier": "prod"\n}'
                  : "Enter value..."
              }
              rows={valueType === "json" ? 3 : 2}
              className="w-full rounded-lg border border-border/80 bg-background px-3 py-1.5 font-mono text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring resize-y"
            />
          )}
        </div>

        {error && <div className="text-xs text-destructive">{error}</div>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !key.trim()}
            className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm transition-all hover:bg-indigo-700 disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            <Check className="h-3.5 w-3.5" />
            {isSubmitting ? "Saving..." : "Set Variable"}
          </button>
        </div>
      </form>
    </div>
  );
}
