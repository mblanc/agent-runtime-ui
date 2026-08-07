"use client";

import { useAuiState } from "@assistant-ui/react";
import type { SyntaxHighlighterProps } from "@assistant-ui/react-markdown";
import mermaid from "mermaid";
import { type FC, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export type MermaidDiagramProps = SyntaxHighlighterProps & {
  className?: string;
};

mermaid.initialize({ theme: "default", startOnLoad: false });

export const MermaidDiagram: FC<MermaidDiagramProps> = ({ code, className }) => {
  const ref = useRef<HTMLPreElement>(null);

  const isComplete = useAuiState((s) => {
    if (s.part.type !== "text") return false;
    const codeIndex = s.part.text.indexOf(code);
    if (codeIndex === -1) return false;
    const afterCode = s.part.text.substring(codeIndex + code.length);
    return /^```|^\n```/.test(afterCode);
  });

  useEffect(() => {
    if (!isComplete) return;
    (async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const result = await mermaid.render(id, code);
        if (ref.current) {
          ref.current.innerHTML = result.svg;
          result.bindFunctions?.(ref.current);
        }
      } catch (e) {
        console.warn("Failed to render Mermaid diagram:", e);
      }
    })();
  }, [isComplete, code]);

  return (
    <pre
      ref={ref}
      className={cn(
        "aui-mermaid-diagram my-3 overflow-x-auto rounded-xl border border-[#e3e3e3] bg-white p-4 text-xs dark:border-[#333537] dark:bg-[#1e1f20]",
        className
      )}
    >
      Drawing diagram...
    </pre>
  );
};

MermaidDiagram.displayName = "MermaidDiagram";
