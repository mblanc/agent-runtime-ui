import { describe, expect, it } from "vitest";
import { sanitizeCallbackUrl } from "@/lib/auth";
import { sanitizeUrl } from "@/lib/utils";
import {
  GCS_CONTENT_LENGTH_RANGE,
  MAX_UPLOAD_SIZE_BYTES,
} from "@/lib/attachments/mime-types";

const ORIGIN = "https://app.example.com";

describe("sanitizeCallbackUrl", () => {
  it("rejects backslash payloads that the WHATWG parser folds into //", () => {
    // Each of these previously survived sanitising and resolved off-origin.
    for (const evil of [
      "/\\evil.com",
      "/\\\\evil.com",
      "/\\/evil.com",
      "\\/evil.com",
      "/\t/evil.com",
    ]) {
      const sanitized = sanitizeCallbackUrl(evil, ORIGIN);
      const resolved = new URL(sanitized, ORIGIN);
      expect(resolved.origin).toBe(ORIGIN);
    }
  });

  it("still rejects the cases the old check caught", () => {
    expect(sanitizeCallbackUrl("//evil.com", ORIGIN)).toBe("/");
    expect(sanitizeCallbackUrl("https://evil.com/x", ORIGIN)).toBe("/");
    expect(sanitizeCallbackUrl("javascript:alert(1)", ORIGIN)).toBe("/");
    expect(sanitizeCallbackUrl(null, ORIGIN)).toBe("/");
    expect(sanitizeCallbackUrl("", ORIGIN)).toBe("/");
  });

  it("preserves legitimate same-origin paths, including query and hash", () => {
    expect(sanitizeCallbackUrl("/dashboard", ORIGIN)).toBe("/dashboard");
    expect(sanitizeCallbackUrl("/chat?id=42", ORIGIN)).toBe("/chat?id=42");
    expect(sanitizeCallbackUrl("/chat#section", ORIGIN)).toBe("/chat#section");
  });

  it("accepts an absolute URL on the app's own origin", () => {
    expect(sanitizeCallbackUrl(`${ORIGIN}/dashboard`, ORIGIN)).toBe("/dashboard");
  });

  it("never returns something that resolves off-origin", () => {
    const payloads = [
      "/\\evil.com",
      "//evil.com",
      "https://evil.com",
      "/\\/\\evil.com",
      "\\\\evil.com",
    ];
    for (const p of payloads) {
      const resolved = new URL(sanitizeCallbackUrl(p, ORIGIN), ORIGIN);
      expect(resolved.hostname).toBe("app.example.com");
    }
  });
});

describe("sanitizeUrl (markdown hrefs)", () => {
  it("rejects the same backslash bypass", () => {
    expect(sanitizeUrl("/\\evil.com")).toBe("#");
    expect(sanitizeUrl("/\\/evil.com")).toBe("#");
  });

  it("still allows ordinary relative and absolute links", () => {
    expect(sanitizeUrl("/docs/page")).toBe("/docs/page");
    expect(sanitizeUrl("#anchor")).toBe("#anchor");
    expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
    expect(sanitizeUrl("mailto:a@b.com")).toBe("mailto:a@b.com");
  });

  it("still blocks script-bearing schemes", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBe("#");
    expect(sanitizeUrl("data:text/html,<script>")).toBe("#");
  });
});

describe("upload size binding", () => {
  it("expresses the range in the form GCS expects", () => {
    expect(GCS_CONTENT_LENGTH_RANGE).toBe(`0,${MAX_UPLOAD_SIZE_BYTES}`);
    expect(GCS_CONTENT_LENGTH_RANGE).toMatch(/^0,\d+$/);
  });

  it("is the 50MB cap the presign route advertises", () => {
    expect(MAX_UPLOAD_SIZE_BYTES).toBe(50 * 1024 * 1024);
  });
});
