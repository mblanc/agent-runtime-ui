import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatAgentDisplayName(authorOrPath?: string): string {
  if (!authorOrPath) return "Assistant";
  const leaf = authorOrPath.split("/").pop() || authorOrPath;
  const clean = leaf.replace(/@\d+$/, "").replace(/[_-]/g, " ").trim();
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Sanitizes URLs to prevent javascript: or data: XSS vectors.
 */
export function sanitizeUrl(url?: string | null): string {
  if (!url) return "#";
  const trimmed = url.trim();
  if (trimmed.startsWith("#")) return trimmed;
  // A leading "/" is not enough to make a link same-origin: the WHATWG parser
  // folds "\" into "/", so "/\evil.com" resolves off-origin. Relative paths
  // must resolve back to the base to be returned as-is.
  if (trimmed.startsWith("/")) {
    try {
      const parsed = new URL(trimmed, "http://localhost");
      return parsed.origin === "http://localhost" ? trimmed : "#";
    } catch {
      return "#";
    }
  }
  try {
    const parsed = new URL(trimmed, "http://localhost");
    if (["http:", "https:", "mailto:", "tel:"].includes(parsed.protocol)) {
      return trimmed;
    }
  } catch {
    // Malformed URL
  }
  return "#";
}

/**
 * Safely copies text to the clipboard with fallback for non-secure / restricted contexts.
 */
export async function copyToClipboardSafe(text: string): Promise<boolean> {
  try {
    if (typeof window !== "undefined" && navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    if (typeof document !== "undefined") {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textarea);
      return success;
    }
    return false;
  } catch (err) {
    console.warn("[Clipboard] Copy failed:", err);
    return false;
  }
}
