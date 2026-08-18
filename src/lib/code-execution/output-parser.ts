/**
 * Pure parsing utilities for Vertex AI Python code execution output payloads.
 */

export interface ParsedExecutionOutput {
  stdout: string;
  images: string[];
}

const BASE64_IMAGE_REGEX =
  /data:image\/(?:png|jpeg|jpg|webp|svg\+xml);base64,[A-Za-z0-9+/=]+/gi;
const GCS_IMAGE_REGEX = /gs:\/\/[a-z0-9._-]+\/[^\s]+\.(?:png|jpg|jpeg|svg|webp)/gi;

/**
 * Extracts stdout text and any generated image URLs / data URLs from raw execution output.
 */
export function parseCodeExecutionOutput(rawOutput?: string): ParsedExecutionOutput {
  if (!rawOutput || typeof rawOutput !== "string") {
    return { stdout: "", images: [] };
  }

  const base64Matches = rawOutput.match(BASE64_IMAGE_REGEX) || [];
  const gcsMatches = rawOutput.match(GCS_IMAGE_REGEX) || [];
  const images = Array.from(new Set([...base64Matches, ...gcsMatches]));

  // Clean stdout by removing matched image payloads
  const cleanStdout = rawOutput
    .replace(BASE64_IMAGE_REGEX, "")
    .replace(GCS_IMAGE_REGEX, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim();

  return {
    stdout: cleanStdout,
    images,
  };
}
