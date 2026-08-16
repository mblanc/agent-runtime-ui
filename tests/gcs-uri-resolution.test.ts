import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGeminiChatAdapter } from "@/lib/adapters/chat-adapter";
import { defaultAttachmentStore } from "@/lib/attachments/attachment-store";

/**
 * Characterisation tests for attachment -> GCS URI resolution.
 *
 * chat-adapter resolved this in three separate places (image parts, file parts,
 * message attachments), each with its own near-identical strategy ladder. They
 * had already drifted: only the image path honoured a `?gcsUri=` query param,
 * only image and file parsed a storage.googleapis.com URL, and the file path
 * passed its unresolved input into getByUrl where the image path passed the
 * source URL.
 *
 * These assert what the outbound request actually carries, so the extraction of
 * a single resolveGcsUri() is visible as behaviour rather than as a diff.
 */

interface FileDataPart {
  file_data?: { file_uri?: string; mime_type?: string };
  file?: { data?: string; mime_type?: string };
  text?: string;
}

/** Runs a turn and returns the parts of the last outbound user message. */
async function outboundParts(message: Record<string, unknown>): Promise<FileDataPart[]> {
  let captured: Record<string, unknown> | undefined;

  global.fetch = vi.fn().mockImplementation(async (_url, init) => {
    captured = JSON.parse(String((init as RequestInit).body));
    return {
      ok: true,
      body: new ReadableStream({
        pull(c) {
          c.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
          c.close();
        },
      }),
    };
  }) as unknown as typeof fetch;

  const adapter = createGeminiChatAdapter();
  const run = adapter.run({
    messages: [message],
    abortSignal: new AbortController().signal,
  } as unknown as Parameters<typeof adapter.run>[0]);

  if (Symbol.asyncIterator in run) {
    // Drain the generator so the outbound request is actually issued.
    for await (const chunk of run as AsyncGenerator<unknown>) {
      void chunk;
    }
  }

  const messages = (captured?.messages || []) as Array<{ parts?: FileDataPart[] }>;
  return messages[messages.length - 1]?.parts || [];
}

function userMessage(content: unknown[], attachments: unknown[] = []) {
  return {
    id: "m1",
    role: "user",
    content,
    attachments,
    status: { type: "complete", reason: "unknown" },
    createdAt: new Date(),
    metadata: { custom: {} },
  };
}

const uriOf = (parts: FileDataPart[]) =>
  parts.find((p) => p.file_data)?.file_data?.file_uri;
const mimeOf = (parts: FileDataPart[]) =>
  parts.find((p) => p.file_data)?.file_data?.mime_type;

beforeEach(() => {
  vi.restoreAllMocks();
  defaultAttachmentStore.clear();
});

describe("image parts", () => {
  it("passes through a gs:// uri unchanged", async () => {
    const parts = await outboundParts(
      userMessage([
        { type: "image", image: "gs://b/users/u/photo.png", filename: "photo.png" },
      ])
    );
    expect(uriOf(parts)).toBe("gs://b/users/u/photo.png");
  });

  it("resolves via the attachment store by url", async () => {
    defaultAttachmentStore.set("att-1", {
      gcsUri: "gs://b/users/u/from-store.png",
      contentType: "image/png",
      readUrl: "",
      previewUrl: "",
    });
    const parts = await outboundParts(
      userMessage(
        [{ type: "image", image: "blob:http://localhost/xyz", filename: "p.png" }],
        [{ id: "att-1", type: "image", name: "p.png" }]
      )
    );
    expect(uriOf(parts)).toBe("gs://b/users/u/from-store.png");
    expect(mimeOf(parts)).toBe("image/png");
  });

  it("extracts a gcsUri query parameter", async () => {
    const url =
      "http://localhost/api/uploads/mock-upload?gcsUri=" +
      encodeURIComponent("gs://b/users/u/q.png");
    const parts = await outboundParts(
      userMessage([{ type: "image", image: url, filename: "q.png" }])
    );
    expect(uriOf(parts)).toBe("gs://b/users/u/q.png");
  });

  it("parses a storage.googleapis.com url into a gs:// uri", async () => {
    const parts = await outboundParts(
      userMessage([
        {
          type: "image",
          image: "https://storage.googleapis.com/mybucket/users/u/signed.png?X-Goog=1",
          filename: "signed.png",
        },
      ])
    );
    expect(uriOf(parts)).toBe("gs://mybucket/users/u/signed.png");
  });
});

describe("file parts", () => {
  it("passes through a gs:// uri unchanged", async () => {
    const parts = await outboundParts(
      userMessage([
        {
          type: "file",
          data: "gs://b/users/u/doc.pdf",
          mimeType: "application/pdf",
          filename: "doc.pdf",
        },
      ])
    );
    expect(uriOf(parts)).toBe("gs://b/users/u/doc.pdf");
  });

  it("resolves via the attachment store by filename", async () => {
    defaultAttachmentStore.set("att-2", {
      gcsUri: "gs://b/users/u/resolved.pdf",
      contentType: "application/pdf",
      readUrl: "",
      previewUrl: "",
    });
    const parts = await outboundParts(
      userMessage(
        [{ type: "file", data: "local-only", filename: "resolved.pdf" }],
        [{ id: "att-2", type: "document", name: "resolved.pdf" }]
      )
    );
    expect(uriOf(parts)).toBe("gs://b/users/u/resolved.pdf");
  });

  it("parses a storage.googleapis.com url into a gs:// uri", async () => {
    const parts = await outboundParts(
      userMessage([
        {
          type: "file",
          data: "https://storage.googleapis.com/mybucket/users/u/report.pdf?sig=1",
          filename: "report.pdf",
        },
      ])
    );
    expect(uriOf(parts)).toBe("gs://mybucket/users/u/report.pdf");
  });

  it("falls back to an inline file part when nothing resolves", async () => {
    const parts = await outboundParts(
      userMessage([{ type: "file", data: "not-a-uri", filename: "x.pdf" }])
    );
    expect(parts.find((p) => p.file)?.file?.data).toBe("not-a-uri");
  });
});

describe("message attachments", () => {
  it("resolves from the store by attachment id", async () => {
    defaultAttachmentStore.set("att-3", {
      gcsUri: "gs://b/users/u/att.png",
      contentType: "image/png",
      readUrl: "",
      previewUrl: "",
    });
    const parts = await outboundParts(
      userMessage(
        [{ type: "text", text: "hi" }],
        [{ id: "att-3", type: "image", name: "att.png" }]
      )
    );
    expect(uriOf(parts)).toBe("gs://b/users/u/att.png");
  });

  it("takes a gs:// uri directly from attachment content parts", async () => {
    const parts = await outboundParts(
      userMessage(
        [{ type: "text", text: "hi" }],
        [
          {
            id: "att-4",
            type: "image",
            name: "inline.png",
            content: [{ type: "image", image: "gs://b/users/u/inline.png" }],
          },
        ]
      )
    );
    expect(uriOf(parts)).toBe("gs://b/users/u/inline.png");
  });

  it("does not duplicate a uri already contributed by a content part", async () => {
    defaultAttachmentStore.set("att-5", {
      gcsUri: "gs://b/users/u/same.png",
      contentType: "image/png",
      readUrl: "",
      previewUrl: "",
    });
    const parts = await outboundParts(
      userMessage(
        [{ type: "image", image: "gs://b/users/u/same.png", filename: "same.png" }],
        [{ id: "att-5", type: "image", name: "same.png" }]
      )
    );
    const uris = parts.filter((p) => p.file_data).map((p) => p.file_data!.file_uri);
    expect(uris).toEqual(["gs://b/users/u/same.png"]);
  });
});
