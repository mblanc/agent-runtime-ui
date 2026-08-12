import { describe, it, expect } from "vitest";
import {
  isSupportedMimeType,
  inferMimeType,
  getAttachmentCategory,
  SUPPORTED_IMAGE_MIME_TYPES,
  SUPPORTED_DOCUMENT_MIME_TYPES,
  SUPPORTED_VIDEO_MIME_TYPES,
  SUPPORTED_AUDIO_MIME_TYPES,
  SUPPORTED_MIME_TYPES,
  SUPPORTED_ACCEPT_STRING,
} from "../src/lib/attachments/mime-types";

describe("Supported MIME Types Suite", () => {
  describe("isSupportedMimeType", () => {
    it("recognizes all supported image MIME types", () => {
      expect(SUPPORTED_IMAGE_MIME_TYPES).toEqual([
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/heic",
        "image/heif",
      ]);

      for (const mime of SUPPORTED_IMAGE_MIME_TYPES) {
        expect(isSupportedMimeType(mime)).toBe(true);
        expect(isSupportedMimeType(`${mime}; charset=utf-8`)).toBe(true);
      }
    });

    it("recognizes supported document MIME types", () => {
      expect(SUPPORTED_DOCUMENT_MIME_TYPES).toEqual(["application/pdf"]);
      expect(isSupportedMimeType("application/pdf")).toBe(true);
    });

    it("recognizes all supported video MIME types", () => {
      expect(SUPPORTED_VIDEO_MIME_TYPES).toEqual([
        "video/x-flv",
        "video/quicktime",
        "video/mpeg",
        "video/mpegs",
        "video/mpg",
        "video/mp4",
        "video/webm",
        "video/wmv",
        "video/3gpp",
      ]);

      for (const mime of SUPPORTED_VIDEO_MIME_TYPES) {
        expect(isSupportedMimeType(mime)).toBe(true);
      }
    });

    it("recognizes all supported audio MIME types", () => {
      expect(SUPPORTED_AUDIO_MIME_TYPES).toEqual([
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
      ]);

      for (const mime of SUPPORTED_AUDIO_MIME_TYPES) {
        expect(isSupportedMimeType(mime)).toBe(true);
      }
    });

    it("rejects unsupported MIME types", () => {
      expect(isSupportedMimeType("text/plain")).toBe(false);
      expect(isSupportedMimeType("application/zip")).toBe(false);
      expect(isSupportedMimeType("application/msword")).toBe(false);
      expect(isSupportedMimeType("image/gif")).toBe(false);
      expect(isSupportedMimeType("image/bmp")).toBe(false);
      expect(isSupportedMimeType("image/svg+xml")).toBe(false);
      expect(isSupportedMimeType("video/avi")).toBe(false);
      expect(isSupportedMimeType("")).toBe(false);
    });
  });

  describe("inferMimeType", () => {
    it("infers image mime types from filenames", () => {
      expect(inferMimeType("photo.png")).toBe("image/png");
      expect(inferMimeType("photo.jpg")).toBe("image/jpeg");
      expect(inferMimeType("photo.jpeg")).toBe("image/jpeg");
      expect(inferMimeType("photo.webp")).toBe("image/webp");
      expect(inferMimeType("photo.heic")).toBe("image/heic");
      expect(inferMimeType("photo.heif")).toBe("image/heif");
    });

    it("infers document mime types from filenames", () => {
      expect(inferMimeType("document.pdf")).toBe("application/pdf");
    });

    it("infers video mime types from filenames", () => {
      expect(inferMimeType("clip.flv")).toBe("video/x-flv");
      expect(inferMimeType("clip.mov")).toBe("video/quicktime");
      expect(inferMimeType("clip.qt")).toBe("video/quicktime");
      expect(inferMimeType("clip.mpeg")).toBe("video/mpeg");
      expect(inferMimeType("clip.mpegs")).toBe("video/mpegs");
      expect(inferMimeType("clip.mpg")).toBe("video/mpg");
      expect(inferMimeType("clip.mp4")).toBe("video/mp4");
      expect(inferMimeType("clip.webm")).toBe("video/webm");
      expect(inferMimeType("clip.wmv")).toBe("video/wmv");
      expect(inferMimeType("clip.3gp")).toBe("video/3gpp");
      expect(inferMimeType("clip.3gpp")).toBe("video/3gpp");
    });

    it("infers audio mime types from filenames", () => {
      expect(inferMimeType("recording.aac")).toBe("audio/x-aac");
      expect(inferMimeType("recording.flac")).toBe("audio/flac");
      expect(inferMimeType("recording.mp3")).toBe("audio/mp3");
      expect(inferMimeType("recording.m4a")).toBe("audio/m4a");
      expect(inferMimeType("recording.mpga")).toBe("audio/mpga");
      expect(inferMimeType("recording.ogg")).toBe("audio/ogg");
      expect(inferMimeType("recording.pcm")).toBe("audio/pcm");
      expect(inferMimeType("recording.wav")).toBe("audio/wav");
      expect(inferMimeType("recording.weba")).toBe("audio/webm");
    });
  });

  describe("getAttachmentCategory", () => {
    it("correctly categorizes MIME types", () => {
      expect(getAttachmentCategory("image/png")).toBe("image");
      expect(getAttachmentCategory("image/heic")).toBe("image");
      expect(getAttachmentCategory("video/mp4")).toBe("video");
      expect(getAttachmentCategory("video/quicktime")).toBe("video");
      expect(getAttachmentCategory("audio/mp3")).toBe("audio");
      expect(getAttachmentCategory("audio/wav")).toBe("audio");
      expect(getAttachmentCategory("application/pdf")).toBe("document");
    });
  });

  describe("SUPPORTED_ACCEPT_STRING", () => {
    it("contains all supported MIME types and extensions", () => {
      for (const mime of SUPPORTED_MIME_TYPES) {
        expect(SUPPORTED_ACCEPT_STRING).toContain(mime);
      }
      expect(SUPPORTED_ACCEPT_STRING).toContain(".png");
      expect(SUPPORTED_ACCEPT_STRING).toContain(".pdf");
      expect(SUPPORTED_ACCEPT_STRING).toContain(".mp4");
      expect(SUPPORTED_ACCEPT_STRING).toContain(".mp3");
    });
  });
});
