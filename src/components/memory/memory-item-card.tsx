"use client";

import { useState } from "react";
import { Pencil, Trash2, Check, X, Tag } from "lucide-react";
import type { AgentMemory } from "@/types/agent";
import { cn } from "@/lib/utils";

interface MemoryItemCardProps {
  memory: AgentMemory;
  onUpdate: (id: string, fact: string, topic?: string) => Promise<unknown>;
  onDelete: (id: string) => Promise<unknown>;
}

export function formatTopicName(topic?: string): string {
  if (!topic) return "General";
  switch (topic.toLowerCase()) {
    case "user_preferences":
      return "User Preferences";
    case "user_personal_info":
      return "Personal Info";
    case "key_conversation_details":
      return "Conversation Details";
    case "explicit_instructions":
      return "Explicit Instructions";
    case "coding_preferences":
      return "Coding Preferences";
    case "enterprise_context":
      return "Enterprise Context";
    case "communication_style":
      return "Communication Style";
    case "general":
      return "General";
    default:
      return topic.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export function getTopicBadgeStyles(topic?: string): string {
  switch (topic?.toLowerCase()) {
    case "user_preferences":
    case "coding_preferences":
      return "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200/60 dark:border-blue-800/40";
    case "enterprise_context":
    case "key_conversation_details":
      return "bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200/60 dark:border-purple-800/40";
    case "communication_style":
    case "explicit_instructions":
      return "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-800/40";
    case "user_personal_info":
      return "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/40";
    default:
      return "bg-muted text-muted-foreground border-border/40";
  }
}

export function MemoryItemCard({ memory, onUpdate, onDelete }: MemoryItemCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [factText, setFactText] = useState(memory.fact);
  const [selectedTopic, setSelectedTopic] = useState(memory.topic || "general");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSave = async () => {
    if (!factText.trim() || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await onUpdate(memory.id, factText.trim(), selectedTopic);
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to update memory:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    try {
      setIsDeleting(true);
      await onDelete(memory.id);
    } catch (err) {
      console.error("Failed to delete memory:", err);
      setIsDeleting(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex flex-col gap-2.5 rounded-2xl border border-border/80 bg-background p-3.5 shadow-xs transition-all">
        <textarea
          value={factText}
          onChange={(e) => setFactText(e.target.value)}
          rows={2}
          autoFocus
          className="w-full resize-none rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          placeholder="Memory fact..."
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            <select
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
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
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setFactText(memory.fact);
                setSelectedTopic(memory.topic || "general");
                setIsEditing(false);
              }}
              disabled={isSubmitting}
              className="flex h-7 items-center gap-1 rounded-full px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted"
            >
              <X className="h-3.5 w-3.5" />
              <span>Cancel</span>
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSubmitting || !factText.trim()}
              className="flex h-7 items-center gap-1 rounded-full bg-[#d3e3fd] px-3 text-xs font-medium text-[#062e6f] transition-all hover:bg-[#c2d7fc] disabled:opacity-50 dark:bg-[#1b2f9c] dark:text-[#d3e3fd]"
            >
              <Check className="h-3.5 w-3.5" />
              <span>{isSubmitting ? "Saving..." : "Save"}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative flex items-start justify-between gap-3 rounded-2xl border border-border/40 bg-card p-3.5 text-card-foreground shadow-2xs transition-all hover:border-border/80 hover:bg-muted/20">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
              getTopicBadgeStyles(memory.topic)
            )}
          >
            {formatTopicName(memory.topic)}
          </span>
          {memory.confidenceScore && (
            <span className="text-[10px] text-muted-foreground/70">
              {Math.round(memory.confidenceScore * 100)}% match
            </span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-foreground break-words font-normal">
          &ldquo;{memory.fact}&rdquo;
        </p>
      </div>

      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Edit memory"
          title="Edit memory"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label="Delete memory"
          title="Delete memory"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
