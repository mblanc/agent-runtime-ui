"use client";

import { StreamdownTextPrimitive } from "@assistant-ui/react-streamdown";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { memo } from "react";

function normalizeCustomMathTags(input: string): string {
  return input
    .replace(/\[math\]([\s\S]*?)\[\/math\]/g, (_, c) => `$$${c.trim()}$$`)
    .replace(/\\{1,2}\(([\s\S]*?)\\{1,2}\)/g, (_, c) => `$${c.trim()}$`)
    .replace(/\\{1,2}\[([\s\S]*?)\\{1,2}\]/g, (_, c) => `$$${c.trim()}$$`);
}

const MarkdownTextImpl = () => {
  return (
    <StreamdownTextPrimitive
      plugins={{ code, math, mermaid }}
      shikiTheme={["github-light", "github-dark"]}
      preprocess={normalizeCustomMathTags}
      caret="block"
      className="prose prose-neutral dark:prose-invert max-w-none text-[15px] leading-relaxed"
    />
  );
};

export const MarkdownText = memo(MarkdownTextImpl);
