import { beforeEach, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  ThreadPrimitive,
  type PendingAttachment,
  type ChatModelRunResult,
  type ChatModelRunOptions,
} from "@assistant-ui/react";
import { createGcsAttachmentAdapter } from "@/lib/adapters/gcs-attachment-adapter";
import { createGeminiChatAdapter } from "@/lib/adapters/chat-adapter";
import { defaultAttachmentStore } from "@/lib/attachments/attachment-store";
import { GeminiComposer } from "@/components/assistant-ui/gemini-composer";
import { ChatMessage } from "@/components/assistant-ui/gemini-message";
import React from "react";

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollTo = () => {};
  HTMLElement.prototype.scrollTo = () => {};
});

function TestRuntimeWrapper({ children }: { children: React.ReactNode }) {
  const attachmentAdapter = React.useMemo(() => createGcsAttachmentAdapter(), []);
  const runtime = useLocalRuntime(
    {
      async *run() {
        yield { content: [{ type: "text", text: "Response" }] };
      },
    },
    {
      adapters: {
        attachments: attachmentAdapter,
      },
    }
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root>
        <ThreadPrimitive.Viewport>
          <ThreadPrimitive.Messages>{() => <ChatMessage />}</ThreadPrimitive.Messages>
        </ThreadPrimitive.Viewport>
        {children}
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

describe("Multimodal Attachments & GCS Adapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    defaultAttachmentStore.clear();
  });

  describe("GCS Attachment Adapter", () => {
    it("has valid accept MIME types covering images, documents, audio, and video", () => {
      const adapter = createGcsAttachmentAdapter();
      expect(adapter.accept).toContain("image/png");
      expect(adapter.accept).toContain("application/pdf");
      expect(adapter.accept).toContain("video/mp4");
      expect(adapter.accept).toContain("audio/mp3");
    });

    it("performs presign request and PUT upload in add() generator", async () => {
      const mockFetch = vi
        .fn()
        // 1. POST /api/uploads/presign
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            uploads: [
              {
                fileId: "file-xyz-123",
                filename: "diagram.png",
                contentType: "image/png",
                uploadUrl: "https://storage.googleapis.com/upload-url",
                readUrl: "https://storage.googleapis.com/read-url",
                gcsUri: "gs://bucket/users/user-1/file-xyz-123-diagram.png",
              },
            ],
          }),
        })
        // 2. PUT upload to GCS uploadUrl
        .mockResolvedValueOnce({
          ok: true,
        });

      vi.spyOn(globalThis, "fetch").mockImplementation(
        mockFetch as unknown as typeof fetch
      );

      const adapter = createGcsAttachmentAdapter();
      const mockFile = new File(["fake-image-bytes"], "diagram.png", {
        type: "image/png",
      });

      const gen = adapter.add({ file: mockFile }) as AsyncGenerator<
        PendingAttachment,
        void
      >;

      const yieldedStates: PendingAttachment[] = [];
      for await (const state of gen) {
        yieldedStates.push(state);
      }

      expect(yieldedStates.length).toBeGreaterThanOrEqual(1);
      expect(yieldedStates[0].status.type).toBe("running");

      const finalResult = yieldedStates[yieldedStates.length - 1];
      expect(finalResult).toBeDefined();
      expect(finalResult.id).toBe(yieldedStates[0].id);
      expect(finalResult.status.type).toBe("requires-action");
      expect(finalResult.status.reason).toBe("composer-send");

      // Verify metadata cache maps both stable ID and fileId
      expect(defaultAttachmentStore.has(finalResult.id)).toBe(true);
      expect(defaultAttachmentStore.has("file-xyz-123")).toBe(true);
      const meta = defaultAttachmentStore.get(finalResult.id);
      expect(meta?.gcsUri).toBe("gs://bucket/users/user-1/file-xyz-123-diagram.png");
      expect(meta?.readUrl).toBe("https://storage.googleapis.com/read-url");

      // Verify fetch calls
      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [presignUrl, presignOpts] = mockFetch.mock.calls[0];
      expect(presignUrl).toBe("/api/uploads/presign");
      expect(JSON.parse(presignOpts.body).files[0].filename).toBe("diagram.png");

      const [putUrl, putOpts] = mockFetch.mock.calls[1];
      expect(putUrl).toBe("https://storage.googleapis.com/upload-url");
      expect(putOpts.method).toBe("PUT");
    });

    it("handles upload failure gracefully in add()", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => "Internal GCS Error",
      } as Response);

      const adapter = createGcsAttachmentAdapter();
      const mockFile = new File(["data"], "failed.pdf", {
        type: "application/pdf",
      });

      const gen = adapter.add({ file: mockFile }) as AsyncGenerator<
        PendingAttachment,
        void
      >;
      const yieldedStates: PendingAttachment[] = [];
      for await (const state of gen) {
        yieldedStates.push(state);
      }

      const finalResult = yieldedStates[yieldedStates.length - 1];
      expect(finalResult).toBeDefined();
      expect(finalResult.status.type).toBe("incomplete");
      if (finalResult.status.type === "incomplete") {
        expect(finalResult.status.reason).toBe("error");
        expect(finalResult.status.message).toContain("Failed to get upload URL");
      }
    });

    it("converts pending image attachment to complete attachment on send()", async () => {
      const adapter = createGcsAttachmentAdapter();
      const mockFile = new File(["img-bytes"], "chart.png", { type: "image/png" });

      defaultAttachmentStore.set("att-img-1", {
        gcsUri: "gs://bucket/users/user-1/att-img-1-chart.png",
        readUrl: "https://storage.googleapis.com/read-chart.png",
        previewUrl: "blob:http://localhost/blob-1",
        contentType: "image/png",
      });

      const complete = await adapter.send({
        id: "att-img-1",
        type: "image",
        name: "chart.png",
        contentType: "image/png",
        file: mockFile,
        status: { type: "requires-action", reason: "composer-send" },
      });

      expect(complete.status.type).toBe("complete");
      expect(complete.content).toHaveLength(1);
      expect(complete.content[0].type).toBe("image");
      expect((complete.content[0] as { image: string }).image).toBe(
        "https://storage.googleapis.com/read-chart.png"
      );
    });

    it("converts pending document attachment to complete attachment on send()", async () => {
      const adapter = createGcsAttachmentAdapter();
      const mockFile = new File(["doc-bytes"], "contract.pdf", {
        type: "application/pdf",
      });

      defaultAttachmentStore.set("att-doc-1", {
        gcsUri: "gs://bucket/users/user-1/att-doc-1-contract.pdf",
        readUrl: "https://storage.googleapis.com/read-contract.pdf",
        previewUrl: "blob:http://localhost/blob-2",
        contentType: "application/pdf",
      });

      const complete = await adapter.send({
        id: "att-doc-1",
        type: "document",
        name: "contract.pdf",
        contentType: "application/pdf",
        file: mockFile,
        status: { type: "requires-action", reason: "composer-send" },
      });

      expect(complete.status.type).toBe("complete");
      expect(complete.content).toHaveLength(1);
      expect(complete.content[0].type).toBe("file");
      const filePart = complete.content[0] as {
        data: string;
        mimeType: string;
        filename?: string;
      };
      expect(filePart.data).toBe("gs://bucket/users/user-1/att-doc-1-contract.pdf");
      expect(filePart.mimeType).toBe("application/pdf");
      expect(filePart.filename).toBe("contract.pdf");
    });

    it("removes attachment metadata on remove()", async () => {
      const adapter = createGcsAttachmentAdapter();
      const mockFile = new File(["bytes"], "temp.png", { type: "image/png" });

      defaultAttachmentStore.set("att-temp", {
        gcsUri: "gs://bucket/temp.png",
        readUrl: "https://read.url",
        previewUrl: "blob:http://localhost/blob-temp",
        contentType: "image/png",
      });

      expect(defaultAttachmentStore.has("att-temp")).toBe(true);
      await adapter.remove({
        id: "att-temp",
        type: "image",
        name: "temp.png",
        file: mockFile,
        status: { type: "complete" },
        content: [],
      });
      expect(defaultAttachmentStore.has("att-temp")).toBe(false);
    });
  });

  describe("Chat Adapter Multimodal Formatting", () => {
    it("maps image and file parts with GCS URIs into file_data parts for /api/chat payload", async () => {
      defaultAttachmentStore.set("att-1", {
        gcsUri: "gs://my-bucket/users/u1/doc.pdf",
        readUrl: "https://storage.googleapis.com/doc.pdf",
        previewUrl: "blob:preview-url",
        contentType: "application/pdf",
      });

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"event_type":"content","content":"Analysis complete."}\n\ndata: [DONE]\n\n'
              )
            );
            controller.close();
          },
        }),
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        mockFetch as unknown as typeof fetch
      );

      const chatAdapter = createGeminiChatAdapter(() => "session-123");
      const runGen = chatAdapter.run({
        messages: [
          {
            id: "msg-1",
            createdAt: new Date(),
            role: "user",
            content: [
              { type: "text", text: "Please review this document" },
              {
                type: "file",
                data: "gs://my-bucket/users/u1/doc.pdf",
                mimeType: "application/pdf",
                filename: "doc.pdf",
              },
            ],
            attachments: [],
            metadata: { custom: {} },
          },
        ],
        runConfig: { custom: {} },
        abortSignal: new AbortController().signal,
        context: {} as unknown as ChatModelRunOptions["context"],
        unstable_getMessage: () =>
          undefined as unknown as ReturnType<ChatModelRunOptions["unstable_getMessage"]>,
      }) as AsyncGenerator<ChatModelRunResult, void>;

      const results = [];
      for await (const chunk of runGen) {
        results.push(chunk);
      }

      expect(results.length).toBeGreaterThan(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [, reqOpts] = mockFetch.mock.calls[0];
      const parsedBody = JSON.parse(reqOpts.body);
      expect(parsedBody.sessionId).toBe("session-123");
      expect(parsedBody.messages).toHaveLength(1);

      const userMsg = parsedBody.messages[0];
      expect(userMsg.content).toBe("Please review this document");
      expect(userMsg.parts).toBeDefined();
      expect(userMsg.parts).toHaveLength(2);
      expect(userMsg.parts[0]).toEqual({ text: "Please review this document" });
      expect(userMsg.parts[1].file_data).toEqual({
        file_uri: "gs://my-bucket/users/u1/doc.pdf",
        mime_type: "application/pdf",
      });
    });
  });

  describe("Composer Attachments UI", () => {
    it("renders drag and drop dropzone and Plus menu attachment trigger", () => {
      render(
        <TestRuntimeWrapper>
          <GeminiComposer />
        </TestRuntimeWrapper>
      );

      expect(screen.getByText(/drop photos & files to attach/i)).toBeDefined();
      expect(screen.getByRole("button", { name: /add files and tools/i })).toBeDefined();
      expect(screen.getByPlaceholderText("Ask Gemini")).toBeDefined();
    });
  });
});
