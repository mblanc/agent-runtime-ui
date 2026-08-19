"use client";

import { FC, useState, useCallback, useMemo } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Download, Copy, Check, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import DOMPurify from "isomorphic-dompurify";

interface SvgDiagramRendererProps {
  svg: string;
  filename?: string;
  title?: string;
}

function sanitizeSvg(rawSvg: string): string {
  if (!rawSvg) return "";
  let svg = rawSvg.trim();

  // If it starts with data URI, decode it or extract SVG
  if (svg.startsWith("data:image/svg+xml")) {
    if (svg.includes(";base64,")) {
      const b64 = svg.split(";base64,")[1] || "";
      if (b64.startsWith("<svg") || b64.startsWith("%3Csvg")) {
        svg = decodeURIComponent(b64);
      } else {
        try {
          svg = atob(b64);
        } catch {
          // ignore
        }
      }
    } else if (svg.includes(";utf8,")) {
      svg = decodeURIComponent(svg.split(";utf8,")[1] || "");
    }
  }

  // Extract <svg ... </svg> if wrapped in other markdown or text
  const match = svg.match(/<svg[\s\S]*?<\/svg>/i);
  if (match) {
    svg = match[0];
  }

  // Robust DOMPurify sanitization for SVG
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "foreignObject", "iframe", "object", "embed"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus"],
  });
}

export const SvgDiagramRenderer: FC<SvgDiagramRendererProps> = ({
  svg,
  filename = "diagram.svg",
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [copied, setCopied] = useState(false);
  const [bgMode, setBgMode] = useState<"light" | "dark" | "checker">("checker");

  const handleZoomIn = useCallback(() => {
    setZoom((z) => Math.min(3, z + 0.25));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.25, z - 0.25));
  }, []);

  const handleResetZoom = useCallback(() => {
    setZoom(1);
  }, []);

  const cleanSvg = useMemo(() => sanitizeSvg(svg), [svg]);

  const handleCopy = useCallback(async () => {
    if (!cleanSvg) return;
    try {
      await navigator.clipboard.writeText(cleanSvg);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard error
    }
  }, [cleanSvg]);

  const handleDownload = useCallback(() => {
    if (!cleanSvg) return;
    const blob = new Blob([cleanSvg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      filename.endsWith(".svg") ? filename : `${filename}.svg`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [cleanSvg, filename]);

  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden relative">
      {/* SVG Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/40 text-xs text-muted-foreground select-none">
        <div className="flex items-center gap-2">
          <Eye className="w-3.5 h-3.5 text-primary" />
          <span className="font-medium text-foreground">SVG Vector Graphics</span>
          <span className="text-muted-foreground/60">•</span>
          <span>{Math.round(zoom * 100)}% zoom</span>
        </div>

        <div className="flex items-center gap-1">
          <TooltipProvider delayDuration={200}>
            {/* Background Style Toggle */}
            <div className="flex items-center bg-muted rounded-md p-0.5 border border-border mr-1">
              <button
                type="button"
                onClick={() => setBgMode("checker")}
                className={`px-1.5 py-0.5 text-[10px] rounded font-medium transition-colors ${
                  bgMode === "checker"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground"
                }`}
              >
                Grid
              </button>
              <button
                type="button"
                onClick={() => setBgMode("light")}
                className={`px-1.5 py-0.5 text-[10px] rounded font-medium transition-colors ${
                  bgMode === "light"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground"
                }`}
              >
                Light
              </button>
              <button
                type="button"
                onClick={() => setBgMode("dark")}
                className={`px-1.5 py-0.5 text-[10px] rounded font-medium transition-colors ${
                  bgMode === "dark"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground"
                }`}
              >
                Dark
              </button>
            </div>

            {/* Zoom Controls */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleZoomOut}
                  disabled={zoom <= 0.25}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  aria-label="Zoom out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom out</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleResetZoom}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  aria-label="Reset zoom"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Reset zoom (100%)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleZoomIn}
                  disabled={zoom >= 3}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  aria-label="Zoom in"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Zoom in</TooltipContent>
            </Tooltip>

            <div className="w-px h-4 bg-border mx-1" />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  aria-label="Copy SVG XML"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy SVG XML</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownload}
                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                  aria-label="Download SVG"
                >
                  <Download className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download SVG</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* SVG Canvas Viewport */}
      <div
        className={`flex-1 overflow-auto flex items-center justify-center p-8 transition-colors ${
          bgMode === "light"
            ? "bg-[#ffffff] text-zinc-900"
            : bgMode === "dark"
              ? "bg-[#141517] text-white"
              : "bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#27272a_1px,transparent_1px)] [background-size:16px_16px] bg-[#f8fafc] dark:bg-[#090a0f] text-foreground"
        }`}
      >
        <div
          style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
          className="transition-transform duration-150 ease-out max-w-full max-h-full flex items-center justify-center shadow-xs rounded-lg p-4 [&>svg]:max-h-[70vh] [&>svg]:max-w-[70vw] [&>svg]:w-auto [&>svg]:h-auto [&>svg]:min-w-[120px] [&>svg]:min-h-[120px] [&>svg]:select-none"
          dangerouslySetInnerHTML={{ __html: cleanSvg }}
        />
      </div>
    </div>
  );
};
