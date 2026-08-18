/**
 * Safe conversion of terminal ANSI color and style escape sequences to HTML with Tailwind CSS classes.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const ANSI_COLOR_MAP: Record<number, string> = {
  1: "font-bold",
  2: "opacity-70",
  3: "italic",
  4: "underline",
  30: "text-zinc-500",
  31: "text-rose-400 font-medium",
  32: "text-emerald-400 font-medium",
  33: "text-amber-400 font-medium",
  34: "text-sky-400 font-medium",
  35: "text-purple-400 font-medium",
  36: "text-cyan-400 font-medium",
  37: "text-zinc-100 font-medium",
  90: "text-zinc-400",
  91: "text-rose-300 font-medium",
  92: "text-emerald-300 font-medium",
  93: "text-amber-300 font-medium",
  94: "text-sky-300 font-medium",
  95: "text-purple-300 font-medium",
  96: "text-cyan-300 font-medium",
  97: "text-white font-medium",
};

const MAX_OPEN_SPANS = 20;

/**
 * Converts terminal ANSI escape codes to formatted HTML.
 * Escapes HTML entities first to prevent XSS vulnerabilities.
 */
export function ansiToHtml(input?: string): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  // 1. Escape HTML
  const safeText = escapeHtml(input);

  // 2. Process ANSI sequences: \x1b[...m or \u001b[...m
  const ansiRegex = /\x1b\[([0-9;]*)m/g;

  let result = "";
  let lastIndex = 0;
  let openSpanCount = 0;

  let match: RegExpExecArray | null;
  while ((match = ansiRegex.exec(safeText)) !== null) {
    // Append text prior to match
    result += safeText.slice(lastIndex, match.index);
    lastIndex = ansiRegex.lastIndex;

    const rawCodes = match[1] ? match[1].split(";").map((c) => parseInt(c, 10)) : [0];

    for (const code of rawCodes) {
      if (code === 0 || isNaN(code)) {
        // Reset all open spans
        result += "</span>".repeat(openSpanCount);
        openSpanCount = 0;
      } else if (ANSI_COLOR_MAP[code]) {
        if (openSpanCount < MAX_OPEN_SPANS) {
          result += `<span class="${ANSI_COLOR_MAP[code]}">`;
          openSpanCount++;
        }
      }
    }
  }

  // Append remaining text
  result += safeText.slice(lastIndex);

  // Close any leftover open spans
  if (openSpanCount > 0) {
    result += "</span>".repeat(openSpanCount);
  }

  return result;
}
