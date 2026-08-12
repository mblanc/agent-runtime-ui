/**
 * Supported MIME Types and Utilities for Agent Runtime UI
 *
 * Supported categories:
 * - Images: image/png, image/jpeg, image/webp, image/heic, image/heif
 * - Documents: application/pdf
 * - Videos: video/x-flv, video/quicktime, video/mpeg, video/mpegs, video/mpg, video/mp4, video/webm, video/wmv, video/3gpp
 * - Audio: audio/x-aac, audio/flac, audio/mp3, audio/m4a, audio/mpeg, audio/mpga, audio/mp4, audio/ogg, audio/pcm, audio/wav, audio/webm
 */

export const SUPPORTED_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export const SUPPORTED_DOCUMENT_MIME_TYPES = ["application/pdf"] as const;

export const SUPPORTED_VIDEO_MIME_TYPES = [
  "video/x-flv",
  "video/quicktime",
  "video/mpeg",
  "video/mpegs",
  "video/mpg",
  "video/mp4",
  "video/webm",
  "video/wmv",
  "video/3gpp",
] as const;

export const SUPPORTED_AUDIO_MIME_TYPES = [
  "audio/x-aac",
  "audio/flac",
  "audio/mp3",
  "audio/m4a",
  "audio/mpeg",
  "audio/mpga",
  "audio/mp4",
  "audio/ogg",
  "audio/pcm",
  "audio/wav",
  "audio/webm",
] as const;

export const SUPPORTED_MIME_TYPES: readonly string[] = [
  ...SUPPORTED_IMAGE_MIME_TYPES,
  ...SUPPORTED_DOCUMENT_MIME_TYPES,
  ...SUPPORTED_VIDEO_MIME_TYPES,
  ...SUPPORTED_AUDIO_MIME_TYPES,
];

const SUPPORTED_MIME_SET = new Set<string>(SUPPORTED_MIME_TYPES);

export const EXTENSION_TO_MIME_MAP: Readonly<Record<string, string>> = {
  // Images
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",

  // Documents
  pdf: "application/pdf",

  // Videos
  flv: "video/x-flv",
  mov: "video/quicktime",
  qt: "video/quicktime",
  mpeg: "video/mpeg",
  m1v: "video/mpeg",
  m2v: "video/mpeg",
  mpegs: "video/mpegs",
  mpg: "video/mpg",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  wmv: "video/wmv",
  "3gp": "video/3gpp",
  "3gpp": "video/3gpp",

  // Audio
  aac: "audio/x-aac",
  flac: "audio/flac",
  mp3: "audio/mp3",
  m4a: "audio/m4a",
  mpga: "audio/mpga",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  pcm: "audio/pcm",
  wav: "audio/wav",
  weba: "audio/webm",
};

export const SUPPORTED_EXTENSIONS = Object.keys(EXTENSION_TO_MIME_MAP);

export const SUPPORTED_ACCEPT_STRING = [
  ...SUPPORTED_MIME_TYPES,
  ...SUPPORTED_EXTENSIONS.map((ext) => `.${ext}`),
].join(",");

/**
 * Checks whether a given MIME type is supported by the application.
 */
export function isSupportedMimeType(mimeType: string): boolean {
  if (!mimeType) return false;
  const normalized = mimeType.toLowerCase().trim().split(";")[0].trim();
  return SUPPORTED_MIME_SET.has(normalized);
}

/**
 * Infers the supported MIME type from a filename and/or existing declared MIME type.
 */
export function inferMimeType(filename?: string, declaredType?: string): string {
  if (declaredType && isSupportedMimeType(declaredType)) {
    return declaredType.toLowerCase().trim().split(";")[0].trim();
  }

  if (filename) {
    const ext = filename.split(".").pop()?.toLowerCase() || "";
    if (ext && EXTENSION_TO_MIME_MAP[ext]) {
      return EXTENSION_TO_MIME_MAP[ext];
    }
  }

  if (declaredType) {
    const normalized = declaredType.toLowerCase().trim().split(";")[0].trim();
    if (normalized === "image/jpg") return "image/jpeg";
    if (normalized === "audio/x-wav") return "audio/wav";
    if (normalized === "audio/x-flac") return "audio/flac";
    if (normalized === "audio/x-m4a") return "audio/m4a";
    if (normalized.startsWith("video/")) return "video/mp4";
    if (normalized.startsWith("audio/")) return "audio/mp3";
    if (normalized.startsWith("image/")) return "image/png";
    return normalized;
  }

  return "application/octet-stream";
}

/**
 * Determines whether a MIME type is an image, video, audio, or document.
 */
export function getAttachmentCategory(
  mimeType: string
): "image" | "video" | "audio" | "document" {
  const normalized = mimeType.toLowerCase().trim().split(";")[0].trim();
  if (normalized.startsWith("image/")) return "image";
  if (normalized.startsWith("video/")) return "video";
  if (normalized.startsWith("audio/")) return "audio";
  return "document";
}
