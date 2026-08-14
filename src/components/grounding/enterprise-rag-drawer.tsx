"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Database, FileText, X, Copy, Check, Sparkles } from "lucide-react";
import type { RetrievedContextChunk } from "@/types/agent";

interface EnterpriseRagDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  chunk: RetrievedContextChunk | null;
}

export function EnterpriseRagDrawer({
  isOpen,
  onClose,
  chunk,
}: EnterpriseRagDrawerProps) {
  const [copied, setCopied] = useState(false);

  if (!chunk) {
    return null;
  }

  const handleCopyUri = () => {
    if (chunk.uri) {
      navigator.clipboard.writeText(chunk.uri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs transition-opacity data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <Dialog.Content
          aria-describedby="rag-drawer-description"
          className="fixed inset-y-0 right-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border/60 bg-background shadow-2xl transition-all duration-300 ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-lg"
        >
          {/* Drawer Header */}
          <div className="flex items-start justify-between border-b border-border/40 p-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300">
                <Database className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <Dialog.Title className="text-base font-semibold text-foreground">
                  Enterprise RAG Inspector
                </Dialog.Title>
                <p id="rag-drawer-description" className="text-xs text-muted-foreground">
                  Internal Corporate Knowledge Base Document Chunk
                </p>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label="Close RAG inspector drawer"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Document Metadata Card */}
          <div className="flex flex-col gap-3 border-b border-border/40 bg-muted/20 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{chunk.title}</h3>
              {chunk.confidenceScore !== undefined && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  <Sparkles className="h-3 w-3" />
                  {Math.round(chunk.confidenceScore * 100)}% Match
                </span>
              )}
            </div>

            {chunk.uri && (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-border/60 bg-background/80 px-3 py-2 text-xs">
                <div className="flex items-center gap-1.5 min-w-0 flex-1 font-mono text-muted-foreground">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-purple-600 dark:text-purple-400" />
                  <span className="truncate">{chunk.uri}</span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyUri}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Copy document URI"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            )}

            {chunk.ragCorpusId && (
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>RAG Corpus:</span>
                <span className="rounded-md bg-muted px-2 py-0.5 font-mono font-medium text-foreground">
                  {chunk.ragCorpusId}
                </span>
              </div>
            )}
          </div>

          {/* Text Excerpt Chunk */}
          <div className="flex-1 overflow-y-auto p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Retrieved Context Text
              </span>
              <span className="text-[11px] text-muted-foreground">
                Vertex AI Vector Search
              </span>
            </div>

            <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 font-mono text-xs leading-relaxed text-foreground whitespace-pre-wrap selection:bg-purple-100 dark:selection:bg-purple-950/60">
              {chunk.text || "No excerpt text provided in document chunk payload."}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border/40 bg-muted/20 px-5 py-3.5 text-xs text-muted-foreground">
            <span>Vertex AI Reasoning Engine RAG</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90 active:scale-95"
            >
              Done
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
