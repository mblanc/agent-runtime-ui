import {
  type AttachmentAdapter,
  type PendingAttachment,
  type CompleteAttachment,
  type Attachment,
  type ThreadUserMessagePart,
} from "@assistant-ui/react";
import type { PresignBatchResponse } from "@/types/agent";
import {
  defaultAttachmentStore,
  IAttachmentMetadataStore,
} from "../attachments/attachment-store";

export function createGcsAttachmentAdapter(
  store: IAttachmentMetadataStore = defaultAttachmentStore
): AttachmentAdapter {
  return {
    accept:
      "image/*,application/pdf,text/*,audio/*,video/*,application/json,application/xml",
    async *add({
      file,
    }: {
      file: File;
    }): AsyncGenerator<PendingAttachment, void, unknown> {
      const previewUrl =
        typeof URL !== "undefined" && URL.createObjectURL
          ? URL.createObjectURL(file)
          : "";
      const tempId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const isImage = file.type.startsWith("image/");
      const attachmentType = isImage ? "image" : "document";

      yield {
        id: tempId,
        type: attachmentType,
        name: file.name,
        contentType: file.type || "application/octet-stream",
        file,
        status: {
          type: "running",
          reason: "uploading",
          progress: 0,
        },
      };

      try {
        const presignRes = await fetch("/api/uploads/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            files: [
              {
                filename: file.name,
                contentType: file.type || "application/octet-stream",
                sizeBytes: file.size,
              },
            ],
          }),
        });

        if (!presignRes.ok) {
          const errText = await presignRes.text();
          throw new Error(`Failed to get upload URL (${presignRes.status}): ${errText}`);
        }

        const { uploads } = (await presignRes.json()) as PresignBatchResponse;
        const uploadItem = uploads?.[0];
        if (!uploadItem) {
          throw new Error("No upload data returned from server");
        }

        yield {
          id: uploadItem.fileId || tempId,
          type: attachmentType,
          name: file.name,
          contentType: file.type || "application/octet-stream",
          file,
          status: {
            type: "running",
            reason: "uploading",
            progress: 0.5,
          },
        };

        const uploadRes = await fetch(uploadItem.uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": file.type || "application/octet-stream",
          },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error(`Upload to storage failed with status ${uploadRes.status}`);
        }

        const finalId = uploadItem.fileId || tempId;
        store.set(finalId, {
          gcsUri: uploadItem.gcsUri,
          readUrl: uploadItem.readUrl || previewUrl,
          previewUrl,
          contentType: file.type || "application/octet-stream",
        });

        yield {
          id: finalId,
          type: attachmentType,
          name: file.name,
          contentType: file.type || "application/octet-stream",
          file,
          status: {
            type: "requires-action",
            reason: "composer-send",
          },
        };
        return;
      } catch (err: unknown) {
        if (previewUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
          try {
            URL.revokeObjectURL(previewUrl);
          } catch {
            // Ignore
          }
        }
        store.delete(tempId);

        const errorMsg = err instanceof Error ? err.message : "Upload failed";
        console.error("[createGcsAttachmentAdapter] Upload error:", errorMsg);
        yield {
          id: tempId,
          type: attachmentType,
          name: file.name,
          contentType: file.type || "application/octet-stream",
          file,
          status: {
            type: "incomplete",
            reason: "error",
            message: errorMsg,
          },
        };
        return;
      }
    },
    async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
      const meta = store.get(attachment.id);
      const isImage =
        attachment.file.type.startsWith("image/") || attachment.type === "image";
      const gcsUri =
        meta?.gcsUri ||
        `gs://mock-bucket/users/current/${attachment.id}-${attachment.name}`;
      const readUrl =
        meta?.readUrl ||
        meta?.previewUrl ||
        (typeof URL !== "undefined" && URL.createObjectURL
          ? URL.createObjectURL(attachment.file)
          : "");

      let content: ThreadUserMessagePart[];

      if (isImage) {
        content = [
          {
            type: "image",
            image: readUrl,
            filename: attachment.name,
          },
        ];
      } else {
        content = [
          {
            type: "file",
            data: gcsUri,
            mimeType:
              attachment.contentType ||
              attachment.file.type ||
              "application/octet-stream",
            filename: attachment.name,
            sourceType: "url",
          },
        ];
      }

      return {
        id: attachment.id,
        type: attachment.type,
        name: attachment.name,
        contentType: attachment.contentType,
        file: attachment.file,
        status: {
          type: "complete",
        },
        content,
      };
    },
    async remove(attachment: Attachment): Promise<void> {
      store.delete(attachment.id);
    },
  };
}

export const gcsAttachmentAdapter = createGcsAttachmentAdapter();
