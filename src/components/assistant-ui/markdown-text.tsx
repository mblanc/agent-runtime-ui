"use client";

import { StreamdownTextPrimitive } from "@assistant-ui/react-streamdown";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { memo, useMemo } from "react";
import { useAuiState } from "@assistant-ui/react";
import type { GroundingMetadata } from "@/types/agent";
import { transformCitationsToMarkdownLinks } from "@/lib/grounding/citation-parser";
import { InlineCitationBadge } from "@/components/grounding/inline-citation-badge";
import { sanitizeUrl } from "@/lib/utils";

function normalizeCustomMathTags(input: string): string {
  if (!input.includes("[math]") && !input.includes("\\(") && !input.includes("\\[")) {
    return input;
  }
  return input
    .replace(/\[math\]([\s\S]*?)\[\/math\]/g, (_, c) => `$$${c.trim()}$$`)
    .replace(/\\{1,2}\(([\s\S]*?)\\{1,2}\)/g, (_, c) => `$${c.trim()}$`)
    .replace(/\\{1,2}\[([\s\S]*?)\\{1,2}\]/g, (_, c) => `$$${c.trim()}$$`);
}

function preprocessMarkdownText(input: string): string {
  if (!input) return "";
  const mathNormalized = normalizeCustomMathTags(input);
  if (!mathNormalized.includes("[")) {
    return mathNormalized;
  }
  return transformCitationsToMarkdownLinks(mathNormalized);
}

const MarkdownTextImpl = () => {
  const groundingMetadata = useAuiState(
    (s: {
      message?: {
        metadata?: {
          custom?: {
            groundingMetadata?: GroundingMetadata;
          };
        };
      };
    }) => ("message" in s ? s.message?.metadata?.custom?.groundingMetadata : undefined)
  );

  const components = useMemo(
    () => ({
      a: ({ href, children, ...props }: React.ComponentPropsWithoutRef<"a">) => {
        if (href?.startsWith("#cite-")) {
          const indexStr = href.replace("#cite-", "");
          const indices = indexStr
            .split(",")
            .map((n) => parseInt(n, 10))
            .filter((n) => !isNaN(n));

          return (
            <InlineCitationBadge
              indices={indices}
              chunks={groundingMetadata?.groundingChunks}
            />
          );
        }
        const safeHref = sanitizeUrl(href);
        return (
          <a
            href={safeHref}
            target={safeHref.startsWith("http") ? "_blank" : undefined}
            rel="noopener noreferrer"
            className="text-[#1a73e8] underline dark:text-[#8ab4f8]"
            {...props}
          >
            {children}
          </a>
        );
      },
    }),
    [groundingMetadata]
  );

  return (
    <StreamdownTextPrimitive
      plugins={{ code, math, mermaid }}
      shikiTheme={["github-light", "github-dark"]}
      preprocess={preprocessMarkdownText}
      components={components}
      caret="block"
      className="prose prose-neutral dark:prose-invert max-w-none text-[15px] leading-relaxed"
    />
  );
};

export const MarkdownText = memo(MarkdownTextImpl);
