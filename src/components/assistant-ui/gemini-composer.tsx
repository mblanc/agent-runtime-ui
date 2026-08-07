"use client";

import { AuiIf, ComposerPrimitive } from "@assistant-ui/react";
import {
  Plus,
  ArrowUp,
  Square,
  Mic,
  ChevronDown,
  Paperclip,
  Sparkles,
  Cpu,
  Check,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";

export function GeminiComposer() {
  const [selectedModel, setSelectedModel] = useState<"flash" | "pro">("flash");

  return (
    <ComposerPrimitive.Root className="mx-auto flex w-full max-w-3xl flex-col rounded-4xl bg-white p-2.5 shadow-[0_2px_14px_-2px_rgba(0,0,0,0.12)] transition-shadow hover:shadow-[0_4px_20px_-2px_rgba(0,0,0,0.16)] dark:bg-[#1e1f20] dark:shadow-[0_2px_14px_-2px_rgba(0,0,0,0.5)]">
      {/* Queued Messages List */}
      <ComposerPrimitive.Queue>
        {({ queueItem }) => (
          <div className="mb-2 flex items-center justify-between rounded-2xl bg-amber-50 px-3.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-200 border border-amber-200 dark:border-amber-900/50">
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-semibold uppercase tracking-wider text-[10px]">
                Queued
              </span>
              <span className="truncate">{queueItem.prompt}</span>
            </div>
          </div>
        )}
      </ComposerPrimitive.Queue>

      <div className="flex items-center gap-1.5">
        {/* Plus / Tools Menu */}
        <PlusMenu />

        {/* Text Input */}
        <ComposerPrimitive.Input
          rows={1}
          autoFocus
          placeholder="Ask Gemini"
          className="max-h-40 flex-1 resize-none bg-transparent px-2.5 py-2 text-[16px] leading-6 text-[#1f1f1f] outline-none placeholder:text-[#575b5f] dark:text-[#e3e3e3] dark:placeholder:text-[#9aa0a6]"
        />

        {/* Model Picker */}
        <ModelPicker selectedModel={selectedModel} onSelectModel={setSelectedModel} />

        {/* Voice Dictation Trigger */}
        <AuiIf condition={({ composer }) => composer?.dictation == null}>
          <ComposerPrimitive.Dictate
            type="button"
            aria-label="Voice dictation"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#444746] transition-colors hover:bg-[#444746]/10 hover:text-[#1f1f1f] dark:text-[#c4c7c5] dark:hover:bg-[#c4c7c5]/10 dark:hover:text-[#e3e3e3]"
          >
            <Mic className="h-5 w-5" />
          </ComposerPrimitive.Dictate>
        </AuiIf>
        <AuiIf condition={({ composer }) => composer?.dictation != null}>
          <ComposerPrimitive.StopDictation
            type="button"
            aria-label="Stop dictation"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-600 animate-pulse transition-transform hover:scale-105 active:scale-95 dark:bg-rose-950/60 dark:text-rose-400"
          >
            <Mic className="h-5 w-5" />
          </ComposerPrimitive.StopDictation>
        </AuiIf>

        {/* Send Button */}
        <ComposerPrimitive.Send className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#d3e3fd] text-[#062e6f] transition-all hover:bg-[#c2d7fc] active:scale-95 disabled:bg-[#e8eaed] disabled:text-[#1f1f1f]/30 disabled:hover:scale-100 dark:bg-[#1b2f9c] dark:text-[#d3e3fd] dark:hover:bg-[#233bbd] dark:disabled:bg-[#282a2c] dark:disabled:text-[#e3e3e3]/20">
          <ArrowUp className="h-5 w-5" />
        </ComposerPrimitive.Send>

        {/* Stop Button (When Thread is Running) */}
        <AuiIf
          condition={(s: { thread?: { isRunning?: boolean } }) =>
            Boolean(s.thread?.isRunning)
          }
        >
          <ComposerPrimitive.Cancel className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700 transition-transform hover:scale-105 active:scale-95 dark:bg-rose-950 dark:text-rose-300">
            <Square className="h-3.5 w-3.5 fill-current" />
          </ComposerPrimitive.Cancel>
        </AuiIf>
      </div>
    </ComposerPrimitive.Root>
  );
}

function PlusMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        aria-label="Add files and tools"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#444746] transition-colors hover:bg-[#444746]/10 hover:text-[#1f1f1f] dark:text-[#c4c7c5] dark:hover:bg-[#c4c7c5]/10 dark:hover:text-[#e3e3e3]"
      >
        <Plus className="h-5 w-5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56 p-1.5 shadow-xl">
        <DropdownMenuItem className="cursor-pointer gap-2.5 py-2.5">
          <Paperclip className="h-4 w-4 text-[#1a73e8] dark:text-[#8ab4f8]" />
          <span>Add photos & files</span>
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer gap-2.5 py-2.5">
          <Sparkles className="h-4 w-4 text-[#1a73e8] dark:text-[#8ab4f8]" />
          <span>Deep Research</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer gap-2.5 py-2.5">
          <Cpu className="h-4 w-4 text-[#1a73e8] dark:text-[#8ab4f8]" />
          <span>Agent Tools</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ModelPicker({
  selectedModel,
  onSelectModel,
}: {
  selectedModel: "flash" | "pro";
  onSelectModel: (model: "flash" | "pro") => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        type="button"
        className="flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-medium text-[#444746] transition-colors hover:bg-[#444746]/10 hover:text-[#1f1f1f] dark:text-[#c4c7c5] dark:hover:bg-[#c4c7c5]/10 dark:hover:text-[#e3e3e3]"
      >
        <span>{selectedModel === "flash" ? "Flash" : "Pro"}</span>
        <ChevronDown className="h-3.5 w-3.5 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48 p-1.5 shadow-xl">
        <DropdownMenuItem
          className="cursor-pointer justify-between py-2"
          onClick={() => onSelectModel("flash")}
        >
          <div>
            <div className="font-medium text-foreground">Flash</div>
            <div className="text-xs text-muted-foreground">Fast & responsive</div>
          </div>
          {selectedModel === "flash" && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          className="cursor-pointer justify-between py-2"
          onClick={() => onSelectModel("pro")}
        >
          <div>
            <div className="font-medium text-foreground">Pro</div>
            <div className="text-xs text-muted-foreground">Complex reasoning</div>
          </div>
          {selectedModel === "pro" && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
