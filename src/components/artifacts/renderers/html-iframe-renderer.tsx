"use client";

import { FC, useState, useCallback, useMemo } from "react";
import { RotateCw, Download, ShieldCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HtmlIframeRendererProps {
  html: string;
  title?: string;
  isStreaming?: boolean;
  filename?: string;
}

export const HtmlIframeRenderer: FC<HtmlIframeRendererProps> = ({
  html,
  title = "HTML Preview",
  isStreaming = false,
  filename = "index.html",
}) => {
  const [reloadKey, setReloadKey] = useState(0);
  const [hasError, setHasError] = useState(false);

  const handleRefresh = useCallback(() => {
    setReloadKey((prev) => prev + 1);
    setHasError(false);
  }, []);

  const handleDownload = useCallback(() => {
    if (!html) return;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      filename.endsWith(".html") ? filename : `${filename}.html`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [html, filename]);

  const sanitizedHtml = useMemo(() => {
    return html || "<p class='p-4 text-gray-500'>Empty HTML content</p>";
  }, [html]);

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden relative">
      {/* Renderer Subheader Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/40 text-xs text-muted-foreground select-none">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          <span className="font-medium">Sandboxed Execution</span>
          {isStreaming && (
            <span className="inline-flex items-center gap-1 text-primary animate-pulse font-medium ml-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              Live Streaming
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <TooltipProvider delayDuration={200}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRefresh}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  aria-label="Refresh preview"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reload preview</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownload}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  aria-label="Download HTML"
                >
                  <Download className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download HTML</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Sandboxed Iframe Container */}
      <div className="flex-1 relative w-full h-full bg-white dark:bg-[#1a1b1e]">
        {hasError ? (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground">
            <AlertCircle className="w-8 h-8 text-amber-500 mb-2" />
            <p className="font-semibold text-sm text-foreground">
              Preview Rendering Error
            </p>
            <p className="text-xs mt-1 max-w-sm">
              The preview could not be loaded. You can inspect the source code or reload.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              className="mt-4 text-xs"
            >
              Reload
            </Button>
          </div>
        ) : (
          <iframe
            key={reloadKey}
            title={title}
            srcDoc={sanitizedHtml}
            // Strict sandboxing: allow scripts, forms, modals, and popups, but NEVER allow-same-origin or allow-top-navigation
            sandbox="allow-scripts allow-forms allow-modals allow-popups"
            className="w-full h-full border-0 absolute inset-0"
            onError={() => setHasError(true)}
          />
        )}
      </div>
    </div>
  );
};
