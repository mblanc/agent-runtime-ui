"use client";

import { useMemo } from "react";
import type { SearchEntryPoint } from "@/types/agent";
import DOMPurify from "isomorphic-dompurify";

interface GoogleSearchWidgetProps {
  searchEntryPoint?: SearchEntryPoint;
  className?: string;
}

/**
 * Sanitizes HTML and CSS provided in searchEntryPoint.renderedContent.
 *
 * DOMPurify in jsdom/browser body-fragment mode moves <style> elements into <head>
 * and strips them from the body output. To ensure Google's official search suggestion
 * styling and dark/light logo toggles work as intended without rendering stacked logos,
 * we extract and sanitize <style> blocks (preventing CSS expressions and external @imports)
 * and recombine them with DOMPurify-sanitized HTML elements.
 */
function sanitizeSearchWidgetHtml(rawHtml: string): string {
  if (!rawHtml) return "";

  // 1. Extract and sanitize <style> blocks
  const styleRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  const styleContents: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = styleRegex.exec(rawHtml)) !== null) {
    const cssBody = match[1];
    // Remove unsafe CSS patterns: expression(), javascript:, url(javascript:), @import
    const safeCss = cssBody
      .replace(/expression\s*\(.*?\)/gi, "")
      .replace(/javascript\s*:/gi, "")
      .replace(/@import/gi, "");
    styleContents.push(safeCss);
  }

  // 2. Sanitize the HTML without the <style> tags
  const htmlWithoutStyles = rawHtml.replace(styleRegex, "");

  const sanitizedBody = DOMPurify.sanitize(htmlWithoutStyles, {
    ALLOWED_TAGS: [
      "div",
      "span",
      "a",
      "svg",
      "circle",
      "path",
      "strong",
      "b",
      "i",
      "em",
      "p",
      "g",
      "line",
      "polygon",
      "polyline",
      "rect",
      "defs",
      "clipPath",
      "use",
      "title",
      "desc",
    ],
    ALLOWED_ATTR: [
      "class",
      "style",
      "href",
      "target",
      "rel",
      "viewBox",
      "width",
      "height",
      "fill",
      "stroke",
      "stroke-width",
      "stroke-linecap",
      "stroke-linejoin",
      "d",
      "cx",
      "cy",
      "r",
      "x1",
      "x2",
      "y1",
      "y2",
      "points",
      "aria-hidden",
      "aria-label",
      "id",
      "xmlns",
      "xlink:href",
      "transform",
      "fill-rule",
      "clip-rule",
      "opacity",
      "focusable",
      "role",
    ],
    ADD_ATTR: ["target", "rel"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "meta", "link"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus"],
  });

  // 3. Recombine sanitized styles and HTML body
  const combinedStyles =
    styleContents.length > 0 ? `<style>${styleContents.join("\n")}</style>` : "";

  return `${combinedStyles}${sanitizedBody}`;
}

/**
 * Renders the official Google Search Suggestion entry point exactly as provided in renderedContent
 * without any modifications to colors, typography, or styling.
 */
export function GoogleSearchWidget({
  searchEntryPoint,
  className,
}: GoogleSearchWidgetProps) {
  const rawHtml = searchEntryPoint?.renderedContent || searchEntryPoint?.rendered_content;

  const sanitizedHtml = useMemo(() => {
    if (!rawHtml || !rawHtml.trim()) {
      return "";
    }
    return sanitizeSearchWidgetHtml(rawHtml);
  }, [rawHtml]);

  if (!sanitizedHtml) {
    return null;
  }

  return (
    <div className={className} dangerouslySetInnerHTML={{ __html: sanitizedHtml }} />
  );
}
