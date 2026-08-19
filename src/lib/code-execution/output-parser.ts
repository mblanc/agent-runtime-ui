/**
 * Pure parsing utilities for Vertex AI Python code execution output payloads.
 */

export interface ParsedExecutionOutput {
  stdout: string;
  images: string[];
  savedArtifacts: string[];
}

const BASE64_IMAGE_REGEX =
  /data:image\/(?:png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+/gi;
const GCS_IMAGE_REGEX = /gs:\/\/[a-z0-9._-]+\/[^\s)]+\.(?:png|jpg|jpeg|svg|webp)/gi;
const HTTPS_GCS_IMAGE_REGEX =
  /https:\/\/storage\.googleapis\.com\/[a-z0-9._-]+\/[^\s)]+\.(?:png|jpg|jpeg|svg|webp)/gi;
const RAW_PNG_BASE64_REGEX =
  /(?:^|[\s"'`([])(iVBORw0KGgo[A-Za-z0-9+/=]{40,})(?:[\s"'`)\],]|$)/g;

/**
 * Extracts stdout text and any generated image URLs / data URLs from raw execution output.
 */
export function parseCodeExecutionOutput(rawOutput?: string): ParsedExecutionOutput {
  if (!rawOutput || typeof rawOutput !== "string") {
    return { stdout: "", images: [], savedArtifacts: [] };
  }

  const images: string[] = [];
  const savedArtifacts: string[] = [];

  // 1. Data URLs
  const base64Matches = rawOutput.match(BASE64_IMAGE_REGEX) || [];
  for (const m of base64Matches) {
    images.push(m);
  }

  // 2. GCS and storage URLs
  const gcsMatches = rawOutput.match(GCS_IMAGE_REGEX) || [];
  for (const m of gcsMatches) {
    images.push(m);
  }

  const httpsGcsMatches = rawOutput.match(HTTPS_GCS_IMAGE_REGEX) || [];
  for (const m of httpsGcsMatches) {
    images.push(m);
  }

  // 3. Raw PNG Base64 without data URI prefix (starts with PNG header 'iVBORw0KGgo')
  let rawPngMatch: RegExpExecArray | null;
  const rawRegex = new RegExp(RAW_PNG_BASE64_REGEX);
  while ((rawPngMatch = rawRegex.exec(rawOutput)) !== null) {
    const b64Data = rawPngMatch[1];
    if (b64Data && !images.some((img) => img.includes(b64Data))) {
      images.push(`data:image/png;base64,${b64Data}`);
    }
  }

  // 4. Saved artifacts (e.g. "Saved artifacts:\noutput_2026-08-18-13-50-21-330452.png")
  const lines = rawOutput.split(/\r?\n/);
  let capturingArtifacts = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^Saved artifacts?:/i.test(trimmed)) {
      capturingArtifacts = true;
      const afterColon = trimmed.replace(/^Saved artifacts?:\s*/i, "").trim();
      const fileMatch = afterColon.match(/^`?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)`?$/);
      if (fileMatch) {
        savedArtifacts.push(fileMatch[1]);
      }
      continue;
    }

    if (capturingArtifacts) {
      const fileMatch = trimmed.match(/^`?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)`?$/);
      if (fileMatch) {
        savedArtifacts.push(fileMatch[1]);
      } else if (trimmed) {
        capturingArtifacts = false;
      }
    } else {
      const singleMatch = trimmed.match(
        /(?:Saved artifact|Saved file|Saved plot|Saved figure):\s*`?([a-zA-Z0-9_\-./]+\.[a-zA-Z0-9]+)`?/i
      );
      if (singleMatch) {
        savedArtifacts.push(singleMatch[1]);
      }
    }
  }

  const uniqueImages = Array.from(new Set(images));
  const uniqueArtifacts = Array.from(new Set(savedArtifacts));

  // Clean stdout by removing matched image payloads and giant base64 chunks
  const cleanStdout = rawOutput
    .replace(BASE64_IMAGE_REGEX, "")
    .replace(GCS_IMAGE_REGEX, "")
    .replace(HTTPS_GCS_IMAGE_REGEX, "")
    .replace(RAW_PNG_BASE64_REGEX, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  return {
    stdout: cleanStdout,
    images: uniqueImages,
    savedArtifacts: uniqueArtifacts,
  };
}
