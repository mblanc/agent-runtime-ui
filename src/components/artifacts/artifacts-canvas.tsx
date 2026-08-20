"use client";

import { FC, useMemo, useCallback, useState, useEffect } from "react";
import {
  X,
  Maximize2,
  Minimize2,
  Download,
  Copy,
  Check,
  Eye,
  Code2,
  Table as TableIcon,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { useArtifacts, type ArtifactTab } from "@/lib/artifacts/artifact-context";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { VersionSelector } from "./version-selector";
import { cn } from "@/lib/utils";
import { HtmlIframeRenderer } from "./renderers/html-iframe-renderer";
import { CodeArtifactRenderer } from "./renderers/code-artifact-renderer";
import { CsvTableRenderer } from "./renderers/csv-table-renderer";
import { SvgDiagramRenderer } from "./renderers/svg-diagram-renderer";
import { MarkdownArtifactRenderer } from "./renderers/markdown-artifact-renderer";
import { ImageArtifactRenderer } from "./renderers/image-artifact-renderer";

export const ArtifactsCanvas: FC = () => {
  const {
    isOpen,
    activeArtifact,
    activeVersion,
    selectedVersion,
    selectVersion,
    closeCanvas,
    isFullscreen,
    toggleFullscreen,
    activeTab,
    setActiveTab,
    artifacts,
    openArtifact,
  } = useArtifacts();

  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!activeVersion?.content) return;
    try {
      await navigator.clipboard.writeText(activeVersion.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [activeVersion?.content]);

  const handleDownload = useCallback(() => {
    if (!activeArtifact || !activeVersion) return;
    const blob = new Blob([activeVersion.content], {
      type: activeVersion.mimeType || activeArtifact.mimeType,
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", activeArtifact.filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [activeArtifact, activeVersion]);

  // Determine available tabs based on MIME type
  const availableTabs = useMemo<ArtifactTab[]>(() => {
    if (!activeArtifact) return ["preview", "code"];
    const mime = activeArtifact.mimeType;

    if (mime === "text/csv" || mime === "text/tab-separated-values") {
      return ["data", "code"];
    }
    if (
      mime === "text/html" ||
      mime === "image/svg+xml" ||
      mime === "text/markdown" ||
      mime.startsWith("image/")
    ) {
      return ["preview", "code"];
    }
    return ["code"];
  }, [activeArtifact]);

  // Adjust active tab if current tab is invalid for this artifact
  useEffect(() => {
    if (activeArtifact) {
      if (!availableTabs.includes(activeTab)) {
        setActiveTab(availableTabs[0]);
      }
    }
  }, [activeArtifact, availableTabs, activeTab, setActiveTab]);

  if (!isOpen || !activeArtifact || !activeVersion) {
    return null;
  }

  const mime = activeArtifact.mimeType;
  const content = activeVersion.content;

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-card border-l border-border transition-all duration-200 z-20 shadow-xl overflow-hidden",
        isFullscreen ? "fixed inset-0 z-50 w-screen h-screen border-none" : "w-full"
      )}
    >
      {/* Canvas Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/50 backdrop-blur-md select-none gap-2">
        {/* Left: Artifact Title & Switcher */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/10 text-primary shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>

          <div className="flex items-center gap-2 min-w-0">
            {artifacts.length > 1 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 text-left font-semibold text-sm text-foreground hover:text-primary transition-colors truncate focus:outline-none"
                  >
                    <span className="truncate max-w-[180px] sm:max-w-[260px]">
                      {activeArtifact.title || activeArtifact.filename}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Workspace Artifacts ({artifacts.length})
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {artifacts.map((art) => (
                    <DropdownMenuItem
                      key={art.filename}
                      onClick={() => openArtifact(art.filename)}
                      className="flex items-center justify-between cursor-pointer py-1.5"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span className="text-xs font-medium truncate">
                          {art.title || art.filename}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-muted-foreground">
                        v{art.currentVersion}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <span className="font-semibold text-sm text-foreground truncate max-w-[180px] sm:max-w-[260px]">
                {activeArtifact.title || activeArtifact.filename}
              </span>
            )}

            <span className="hidden sm:inline text-xs font-mono text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
              {activeArtifact.filename}
            </span>
          </div>
        </div>

        {/* Center/Right Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {/* Tab Switcher */}
          {availableTabs.length > 1 && (
            <div className="flex items-center bg-muted rounded-lg p-0.5 border border-border mr-1">
              {availableTabs.map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md font-medium capitalize transition-all",
                    activeTab === tab
                      ? "bg-background text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab === "preview" && <Eye className="w-3 h-3" />}
                  {tab === "code" && <Code2 className="w-3 h-3" />}
                  {tab === "data" && <TableIcon className="w-3 h-3" />}
                  <span>{tab}</span>
                </button>
              ))}
            </div>
          )}

          {/* Version Selector */}
          <VersionSelector
            artifact={activeArtifact}
            selectedVersion={selectedVersion}
            onSelectVersion={selectVersion}
          />

          <TooltipProvider delayDuration={200}>
            {/* Copy Content */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCopy}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  aria-label="Copy artifact content"
                >
                  {copied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Copy content</TooltipContent>
            </Tooltip>

            {/* Download File */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDownload}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  aria-label="Download artifact"
                >
                  <Download className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download file</TooltipContent>
            </Tooltip>

            {/* Fullscreen Toggle */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleFullscreen}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                  aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-3.5 h-3.5" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {isFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
              </TooltipContent>
            </Tooltip>

            {/* Close Canvas */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={closeCanvas}
                  className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground ml-1"
                  aria-label="Close workspace canvas"
                >
                  <X className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Close canvas (Esc or ⌘\)</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="flex-1 w-full h-full overflow-hidden relative">
        {activeTab === "code" ? (
          <CodeArtifactRenderer
            code={content}
            language={activeArtifact.filename.split(".").pop() || "typescript"}
            filename={activeArtifact.filename}
          />
        ) : activeTab === "data" ||
          mime === "text/csv" ||
          mime === "text/tab-separated-values" ? (
          <CsvTableRenderer csv={content} filename={activeArtifact.filename} />
        ) : mime === "text/html" ? (
          <HtmlIframeRenderer html={content} title={activeArtifact.title} />
        ) : mime === "image/svg+xml" ? (
          <SvgDiagramRenderer svg={content} filename={activeArtifact.filename} />
        ) : mime.startsWith("image/") ? (
          <ImageArtifactRenderer
            imageSrc={content}
            filename={activeArtifact.filename}
            title={activeArtifact.title}
          />
        ) : mime === "text/markdown" ? (
          <MarkdownArtifactRenderer
            markdown={content}
            filename={activeArtifact.filename}
          />
        ) : (
          <CodeArtifactRenderer
            code={content}
            language={activeArtifact.filename.split(".").pop() || "text"}
            filename={activeArtifact.filename}
          />
        )}
      </div>
    </div>
  );
};
