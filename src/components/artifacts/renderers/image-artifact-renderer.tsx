"use client";

import { FC, useState } from "react";
import { ZoomIn, ZoomOut, Download, Copy, Check, ImageOff, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ImageArtifactRendererProps {
  imageSrc: string;
  filename: string;
  title?: string;
}

export const ImageArtifactRenderer: FC<ImageArtifactRendererProps> = ({
  imageSrc,
  filename,
  title,
}) => {
  const [zoom, setZoom] = useState(1);
  const [copied, setCopied] = useState(false);
  const [hasError, setHasError] = useState(false);

  const isGcs = Boolean(imageSrc && imageSrc.startsWith("gs://"));
  const isValidSrc =
    imageSrc &&
    (imageSrc.startsWith("data:image/") ||
      imageSrc.startsWith("http://") ||
      imageSrc.startsWith("https://") ||
      imageSrc.startsWith("/") ||
      isGcs ||
      (imageSrc.length > 50 &&
        !imageSrc.startsWith("#") &&
        !imageSrc.startsWith("import ") &&
        !imageSrc.startsWith("from ")));

  const src = !isValidSrc
    ? ""
    : isGcs
      ? `/api/uploads/signed-read?gcsUri=${encodeURIComponent(imageSrc)}&redirect=true`
      : imageSrc.startsWith("data:") ||
          imageSrc.startsWith("http") ||
          imageSrc.startsWith("/")
        ? imageSrc
        : `data:image/png;base64,${imageSrc}`;

  const handleZoomIn = () => setZoom((z) => Math.min(z + 0.25, 3));
  const handleZoomOut = () => setZoom((z) => Math.max(z - 0.25, 0.25));
  const handleResetZoom = () => setZoom(1);

  const handleDownload = () => {
    if (!src) return;
    const link = document.createElement("a");
    link.href = src;
    link.download = filename || "chart.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleCopy = async () => {
    if (!src) return;
    try {
      await navigator.clipboard.writeText(src);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  if (!isValidSrc || hasError) {
    return (
      <div className="relative flex flex-col items-center justify-center h-full w-full bg-muted/20 dark:bg-black/40 p-8 text-center">
        <div className="flex flex-col items-center max-w-md p-6 rounded-2xl border border-border bg-card shadow-sm space-y-4">
          <div className="p-3 rounded-full bg-muted text-muted-foreground">
            <ImageOff className="w-8 h-8" />
          </div>
          <div className="space-y-1.5">
            <h3 className="font-semibold text-foreground text-sm">
              Sandbox Artifact: {filename}
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This file was saved to the Python execution sandbox on Google Cloud, but
              binary image bytes were not included in the model response stream.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 border border-border/50">
            <Terminal className="w-3.5 h-3.5 shrink-0" />
            <span>
              Inspect the <strong>Code</strong> and <strong>Output</strong> in the
              execution block.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col h-full w-full bg-muted/20 dark:bg-black/40 overflow-hidden">
      {/* Floating Toolbar */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-xl bg-background/80 backdrop-blur-md p-1 border border-border shadow-sm">
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomIn}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                aria-label="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom In</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomOut}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                aria-label="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Zoom Out</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetZoom}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground text-[10px] font-mono"
                aria-label="Reset Zoom"
              >
                {Math.round(zoom * 100)}%
              </Button>
            </TooltipTrigger>
            <TooltipContent>Reset Zoom</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                aria-label="Copy Image URL"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{copied ? "Copied!" : "Copy Data URL"}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownload}
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                aria-label="Download Image"
              >
                <Download className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download {filename}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Image Display */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
        <div
          className="transition-transform duration-150 ease-out max-w-full max-h-full flex items-center justify-center rounded-2xl overflow-hidden shadow-md border border-border bg-white dark:bg-zinc-900"
          style={{ transform: `scale(${zoom})` }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={title || filename}
            className="max-h-[70vh] max-w-full object-contain select-none"
            loading="lazy"
            decoding="async"
            onError={() => setHasError(true)}
          />
        </div>
      </div>
    </div>
  );
};
