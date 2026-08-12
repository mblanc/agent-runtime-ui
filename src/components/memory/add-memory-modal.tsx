"use client";

import { useState } from "react";
import { Plus, X, Brain } from "lucide-react";

interface AddMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (fact: string, topic?: string) => Promise<unknown>;
}

export function AddMemoryModal({ isOpen, onClose, onAdd }: AddMemoryModalProps) {
  const [fact, setFact] = useState("");
  const [topic, setTopic] = useState("coding_preferences");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fact.trim() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      setError(null);
      await onAdd(fact.trim(), topic);
      setFact("");
      setTopic("coding_preferences");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add memory");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 shadow-sm transition-all">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-foreground">
            Add Custom Memory Fact
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <textarea
          value={fact}
          onChange={(e) => setFact(e.target.value)}
          placeholder="e.g. Prefers TypeScript with strict typing, always uses Bun..."
          rows={2}
          autoFocus
          className="w-full resize-none rounded-xl border border-border/70 bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />

        {error && <div className="text-xs text-destructive">{error}</div>}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Category:</span>
            <select
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              className="rounded-lg border border-border/60 bg-background px-2.5 py-1 text-xs text-foreground outline-none focus:border-ring"
            >
              <optgroup label="Google Cloud Managed Topics">
                <option value="user_preferences">User Preferences</option>
                <option value="user_personal_info">User Personal Info</option>
                <option value="key_conversation_details">Key Conversation Details</option>
                <option value="explicit_instructions">Explicit Instructions</option>
              </optgroup>
              <optgroup label="Custom Agent Topics">
                <option value="coding_preferences">Coding Preferences</option>
                <option value="enterprise_context">Enterprise Context</option>
                <option value="communication_style">Communication Style</option>
                <option value="general">General</option>
              </optgroup>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !fact.trim()}
              className="flex items-center gap-1 rounded-full bg-[#d3e3fd] px-3.5 py-1.5 text-xs font-medium text-[#062e6f] transition-all hover:bg-[#c2d7fc] active:scale-95 disabled:opacity-50 dark:bg-[#1b2f9c] dark:text-[#d3e3fd]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{isSubmitting ? "Adding..." : "Add Memory"}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
