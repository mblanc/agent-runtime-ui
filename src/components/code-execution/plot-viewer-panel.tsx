"use client";

import { FC, useState, useEffect } from "react";
import { Download, Maximize2, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PlotViewerPanelProps {
  images: string[];
  className?: string;
}

export function isSafeImageUri(uri: string): boolean {
  if (!uri || typeof uri !== "string") return false;
  const trimmed = uri.trim();
  return (
    /^data:image\/(?:png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(
      trimmed
    ) ||
    /^https?:\/\/[^\s]+$/i.test(trimmed) ||
    /^gs:\/\/[a-z0-9._-]+\/[^\s]+$/i.test(trimmed) ||
    /^blob:[^\s]+$/i.test(trimmed) ||
    /^\/api\/[^\s]+$/i.test(trimmed)
  );
}

function resolveDisplayImageSrc(uri: string): string {
  if (uri.startsWith("gs://")) {
    return `/api/uploads/signed-read?gcsUri=${encodeURIComponent(uri)}`;
  }
  return uri;
}

function getImageDownloadExtension(uri: string): string {
  if (uri.startsWith("data:image/svg+xml")) return "svg";
  if (uri.startsWith("data:image/jpeg") || uri.startsWith("data:image/jpg")) return "jpg";
  if (uri.startsWith("data:image/webp")) return "webp";
  const match = uri.match(/\.(png|jpe?g|webp|svg)/i);
  return match ? match[1].toLowerCase() : "png";
}

export const PlotViewerPanel: FC<PlotViewerPanelProps> = ({ images, className }) => {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  useEffect(() => {
    if (!lightboxImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setLightboxImage(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxImage]);

  const safeImages = (images || []).filter(isSafeImageUri);

  if (safeImages.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border border-[#e3e3e3] bg-muted/20 p-8 text-center text-xs text-muted-foreground dark:border-[#333537]",
          className
        )}
      >
        <ImageIcon className="mb-2 h-8 w-8 opacity-40" />
        <p>No plots or visual outputs generated for this execution.</p>
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          "flex flex-col gap-3 rounded-xl border border-[#e3e3e3] bg-[#f8fafd] p-3 dark:border-[#333537] dark:bg-[#141517]",
          className
        )}
      >
        <div className="flex items-center justify-between border-b border-[#e3e3e3] pb-2 text-xs font-medium text-muted-foreground dark:border-[#333537]">
          <div className="flex items-center gap-1.5">
            <ImageIcon className="h-3.5 w-3.5 text-[#1a73e8] dark:text-[#8ab4f8]" />
            <span>Generated Plots ({safeImages.length})</span>
          </div>
        </div>

        <div
          className={cn(
            "grid gap-3",
            safeImages.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2"
          )}
        >
          {safeImages.map((imgSrc, idx) => {
            const displaySrc = resolveDisplayImageSrc(imgSrc);
            const ext = getImageDownloadExtension(imgSrc);
            return (
              <div
                key={idx}
                className="group relative overflow-hidden rounded-lg border border-[#e3e3e3] bg-white p-1.5 shadow-sm dark:border-[#333537] dark:bg-black/40"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={displaySrc}
                  alt={`Generated Plot ${idx + 1}`}
                  loading="lazy"
                  decoding="async"
                  width={640}
                  height={360}
                  onClick={() => setLightboxImage(imgSrc)}
                  className="max-h-72 w-full aspect-video cursor-zoom-in rounded object-contain transition-transform duration-200 group-hover:scale-[1.01]"
                />

                <div className="absolute right-3 top-3 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => setLightboxImage(imgSrc)}
                    aria-label="View full size"
                    className="rounded-full bg-black/60 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                  <a
                    href={displaySrc}
                    download={`plot-${idx + 1}.${ext}`}
                    aria-label="Download plot"
                    className="rounded-full bg-black/60 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lightbox Zoom Modal */}
      {lightboxImage && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-150"
        >
          <div
            className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-2xl bg-white p-2 shadow-2xl dark:bg-[#1e1f20]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
              <a
                href={resolveDisplayImageSrc(lightboxImage)}
                download={`plot.${getImageDownloadExtension(lightboxImage)}`}
                aria-label="Download full plot"
                className="rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/80"
              >
                <Download className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                aria-label="Close lightbox"
                className="rounded-full bg-black/60 p-2 text-white transition-colors hover:bg-black/80"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveDisplayImageSrc(lightboxImage)}
              alt="Full size plot preview"
              className="max-h-[85vh] max-w-[85vw] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </>
  );
};
