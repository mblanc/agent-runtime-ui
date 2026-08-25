"use client";

import { Wrench, ShieldCheck, User, BookOpen, ExternalLink } from "lucide-react";
import type { LoadedSkillMetadata } from "@/types/agent";
import { cn } from "@/lib/utils";

export interface SkillMetadataCardProps {
  skill: LoadedSkillMetadata;
  className?: string;
}

export function SkillMetadataCard({ skill, className }: SkillMetadataCardProps) {
  const hasTools = Boolean(skill.tools && skill.tools.length > 0);
  const hasAuthorOrLicense = Boolean(skill.author || skill.license);

  return (
    <div
      className={cn(
        "rounded-xl border border-purple-200/80 bg-purple-50/60 p-3 text-xs leading-relaxed text-[#1f1f1f] shadow-xs dark:border-purple-800/50 dark:bg-purple-950/30 dark:text-[#e3e3e3]",
        className
      )}
      data-testid="skill-metadata-card"
    >
      {/* Error Banner */}
      {skill.error && (
        <div className="mb-2.5 rounded-lg border border-rose-200 bg-rose-50/90 p-2 text-rose-950 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          <div className="flex items-center gap-1.5 font-semibold text-[11px] text-rose-700 dark:text-rose-300">
            <span>
              {skill.errorCode
                ? `Registry Error (${skill.errorCode})`
                : "Skill Ingestion Error"}
            </span>
          </div>
          <p className="mt-1 font-mono text-[11px] leading-relaxed text-rose-900/90 dark:text-rose-200/90">
            {skill.error}
          </p>
        </div>
      )}

      {/* Description */}
      {skill.description && (
        <p className="mb-2.5 font-medium text-[#3c4043] dark:text-[#c4c7c5]">
          {skill.description}
        </p>
      )}

      {/* Author & License & Version Row */}
      {hasAuthorOrLicense && (
        <div className="mb-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
          {skill.author && (
            <div className="flex items-center gap-1">
              <User className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
              <span>
                Author:{" "}
                <strong className="font-semibold text-foreground">{skill.author}</strong>
              </span>
            </div>
          )}
          {skill.license && (
            <div className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
              <span>
                License: <span className="font-mono">{skill.license}</span>
              </span>
            </div>
          )}
          {skill.version && (
            <div className="flex items-center gap-1 font-mono text-[10px]">
              <span className="rounded bg-purple-200/60 px-1.5 py-0.5 text-purple-800 dark:bg-purple-900/60 dark:text-purple-300">
                v{skill.version}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Unlocked Tools */}
      {hasTools && (
        <div className="mb-2">
          <div className="mb-1.5 flex items-center gap-1.5 font-sans text-[10px] font-semibold tracking-wider text-purple-900 uppercase dark:text-purple-300">
            <Wrench className="h-3 w-3 text-purple-600 dark:text-purple-400" />
            <span>Tools Unlocked ({skill.tools?.length})</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {skill.tools?.map((toolName) => (
              <span
                key={toolName}
                className="inline-flex items-center gap-1 rounded-md border border-purple-300/60 bg-white/80 px-2 py-0.5 font-mono text-[11px] font-medium text-purple-950 shadow-2xs dark:border-purple-700/50 dark:bg-black/40 dark:text-purple-200"
                data-testid="unlocked-tool-chip"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-purple-500 dark:bg-purple-400" />
                {toolName}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Instructions Snippet */}
      {skill.instructionsSnippet && (
        <div className="mt-2.5 border-t border-purple-200/60 pt-2 text-[11px] dark:border-purple-800/40">
          <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase">
            <BookOpen className="h-3 w-3" />
            <span>Instructions & Guidance</span>
          </div>
          <blockquote className="rounded-md border-l-2 border-purple-400 bg-white/40 p-2 font-mono text-[11px] text-[#444746] italic dark:bg-black/20 dark:text-[#c4c7c5]">
            {skill.instructionsSnippet}
          </blockquote>
        </div>
      )}

      {/* Registry Attribution */}
      <div className="mt-2.5 flex items-center justify-between border-t border-purple-200/50 pt-2 text-[10px] text-muted-foreground dark:border-purple-800/30">
        <span>Google Cloud Skill Registry</span>
        <a
          href="https://adk.dev/integrations/skills-registry/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-purple-600 hover:underline dark:text-purple-400"
        >
          <span>Registry Spec</span>
          <ExternalLink className="h-2.5 w-2.5" />
        </a>
      </div>
    </div>
  );
}
