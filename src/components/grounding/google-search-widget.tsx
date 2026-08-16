"use client";

import { useEffect, useMemo, useRef } from "react";
import type { SearchEntryPoint } from "@/types/agent";
import DOMPurify from "isomorphic-dompurify";

interface GoogleSearchWidgetProps {
  searchEntryPoint?: SearchEntryPoint;
  className?: string;
}

/**
 * Sanitizes the HTML in searchEntryPoint.renderedContent.
 *
 * The widget renders inside a shadow root, so `<style>` survives DOMPurify's
 * body-fragment mode (which otherwise hoists style elements to <head> and drops
 * them) and the CSS is scoped to the shadow tree by construction.
 *
 * That scoping is what removed the previous hand-rolled CSS sanitizer: style
 * blocks used to be extracted before sanitising, scrubbed with three regexes for
 * expression()/javascript:/@import, then concatenated back onto the output. The
 * regexes were the only thing standing between Google's markup and page-wide
 * rules that could overlay or restyle the whole app. Scoping beats filtering.
 */
function sanitizeSearchWidgetHtml(rawHtml: string): string {
  if (!rawHtml) return "";

  return DOMPurify.sanitize(rawHtml, {
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
    // `style` is allowed through because the shadow root confines it. Script
    // execution is not reachable from CSS in modern browsers; the risk this
    // addresses is unscoped rules leaking into the host page.
    ADD_TAGS: ["style"],
    // Without this, DOMPurify's body-fragment mode hoists <style> into <head>
    // and drops it from the output — the exact behaviour that forced the old
    // extract-scrub-reattach workaround. FORCE_BODY keeps it in-band, and
    // unlike WHOLE_DOCUMENT it does not wrap the result in <html><head>.
    FORCE_BODY: true,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "meta", "link"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus"],
  });
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

  const hostRef = useRef<HTMLDivElement | null>(null);
  const shadowRef = useRef<ShadowRoot | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    if (!shadowRef.current) {
      // attachShadow throws if called twice on the same element, which React
      // will do across re-renders and in StrictMode's double-invoked effects.
      shadowRef.current = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    }
    shadowRef.current.innerHTML = sanitizedHtml;
  }, [sanitizedHtml]);

  if (!sanitizedHtml) {
    return null;
  }

  return <div ref={hostRef} className={className} />;
}
