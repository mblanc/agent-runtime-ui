"use client";

import { AuiIf, ComposerPrimitive, AttachmentPrimitive } from "@assistant-ui/react";
import {
  Plus,
  ArrowUp,
  Square,
  Mic,
  Paperclip,
  Sparkles,
  Cpu,
  X,
  FileText,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOptionalActiveAgent } from "@/lib/agent-context";

export function GeminiComposer() {
  const agentCtx = useOptionalActiveAgent();
  const activeAgentName = agentCtx?.activeAgent?.displayName;

  const placeholder = activeAgentName ? `Ask ${activeAgentName}...` : "Ask Gemini";

  return (
    <ComposerPrimitive.Root className="relative mx-auto flex w-full max-w-3xl flex-col rounded-4xl bg-white p-2.5 shadow-[0_2px_14px_-2px_rgba(0,0,0,0.12)] transition-shadow hover:shadow-[0_4px_20px_-2px_rgba(0,0,0,0.16)] dark:bg-[#1e1f20] dark:shadow-[0_2px_14px_-2px_rgba(0,0,0,0.5)]">
      {/* Drag & Drop File Upload Overlay */}
      <ComposerPrimitive.AttachmentDropzone className="absolute inset-0 z-30 flex items-center justify-center rounded-4xl border-2 border-dashed border-blue-500 bg-blue-50/90 text-sm font-medium text-blue-600 opacity-0 pointer-events-none data-[dragging]:opacity-100 data-[dragging]:pointer-events-auto transition-opacity backdrop-blur-xs dark:border-blue-400 dark:bg-blue-950/90 dark:text-blue-200">
        <div className="flex items-center gap-2">
          <Paperclip className="h-5 w-5" />
          <span>Drop photos & files to attach</span>
        </div>
      </ComposerPrimitive.AttachmentDropzone>

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

      {/* Active Attachments Chips List */}
      <div className="mb-1.5 flex flex-wrap gap-2 px-1">
        <ComposerPrimitive.Attachments>
          {() => (
            <AttachmentPrimitive.Root className="group relative flex items-center gap-2 rounded-2xl bg-[#f0f4f9] py-1 pl-2.5 pr-2 text-xs text-[#1f1f1f] border border-[#e3e3e3] dark:bg-[#282a2c] dark:text-[#e3e3e3] dark:border-[#3c4043] transition-all hover:bg-[#e4e9f0] dark:hover:bg-[#333538]">
              <AttachmentPrimitive.unstable_Thumb className="h-5 w-5 shrink-0 rounded overflow-hidden object-cover bg-muted" />
              <FileText className="h-3.5 w-3.5 shrink-0 text-[#1a73e8] dark:text-[#8ab4f8]" />
              <span className="max-w-[150px] truncate font-medium">
                <AttachmentPrimitive.Name />
              </span>
              <AttachmentPrimitive.Remove
                type="button"
                aria-label="Remove attachment"
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[#575b5f] transition-colors hover:bg-[#444746]/15 hover:text-[#1f1f1f] dark:text-[#9aa0a6] dark:hover:bg-[#c4c7c5]/20 dark:hover:text-[#e3e3e3]"
              >
                <X className="h-3 w-3" />
              </AttachmentPrimitive.Remove>
            </AttachmentPrimitive.Root>
          )}
        </ComposerPrimitive.Attachments>
      </div>

      <div className="flex items-center gap-1.5">
        {/* Plus / Tools Menu */}
        <PlusMenu />

        {/* Text Input */}
        <ComposerPrimitive.Input
          rows={1}
          autoFocus
          placeholder={placeholder}
          className="max-h-40 flex-1 resize-none bg-transparent px-2.5 py-2 text-[16px] leading-6 text-[#1f1f1f] outline-none placeholder:text-[#575b5f] dark:text-[#e3e3e3] dark:placeholder:text-[#9aa0a6]"
        />

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
        <ComposerPrimitive.AddAttachment asChild multiple>
          <DropdownMenuItem
            className="cursor-pointer gap-2.5 py-2.5"
            onSelect={(e) => e.preventDefault()}
          >
            <Paperclip className="h-4 w-4 text-[#1a73e8] dark:text-[#8ab4f8]" />
            <span>Add photos & files</span>
          </DropdownMenuItem>
        </ComposerPrimitive.AddAttachment>
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
