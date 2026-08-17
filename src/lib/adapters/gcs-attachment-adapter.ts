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
import {
  SUPPORTED_ACCEPT_STRING,
  inferMimeType,
  getAttachmentCategory,
  GCS_CONTENT_LENGTH_RANGE,
} from "../attachments/mime-types";

export function createGcsAttachmentAdapter(
  store: IAttachmentMetadataStore = defaultAttachmentStore
): AttachmentAdapter {
  return {
    accept: SUPPORTED_ACCEPT_STRING,
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
      const resolvedMime = inferMimeType(file.name, file.type);
      const category = getAttachmentCategory(resolvedMime);
      const attachmentType = category === "image" ? "image" : "document";

      yield {
        id: tempId,
        type: attachmentType,
        name: file.name,
        contentType: resolvedMime,
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
                contentType: resolvedMime,
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
          id: tempId,
          type: attachmentType,
          name: file.name,
          contentType: resolvedMime,
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
            "Content-Type": resolvedMime,
            // Bound into the signed URL by the presign route. It must be sent
            // verbatim or GCS rejects the PUT with a signature mismatch.
            "x-goog-content-length-range": GCS_CONTENT_LENGTH_RANGE,
          },
          body: file,
        });

        if (!uploadRes.ok) {
          throw new Error(`Upload to storage failed with status ${uploadRes.status}`);
        }

        const metadata = {
          gcsUri: uploadItem.gcsUri,
          readUrl: uploadItem.readUrl || previewUrl,
          previewUrl,
          contentType: resolvedMime,
        };
        store.set(tempId, metadata);
        if (uploadItem.fileId && uploadItem.fileId !== tempId) {
          store.set(uploadItem.fileId, metadata);
        }

        yield {
          id: tempId,
          type: attachmentType,
          name: file.name,
          contentType: resolvedMime,
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
          contentType: resolvedMime,
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
      const meta =
        store.get(attachment.id) ||
        store.findByAny?.(attachment.id) ||
        store.getByFilename?.(attachment.name);
      const resolvedMime = inferMimeType(
        attachment.name,
        meta?.contentType || attachment.contentType || attachment.file.type
      );
      const category = getAttachmentCategory(resolvedMime);
      const isImage = category === "image";
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
            mimeType: resolvedMime,
            filename: attachment.name,
            sourceType: "url",
          },
        ];
      }

      return {
        id: attachment.id,
        type: isImage ? "image" : "document",
        name: attachment.name,
        contentType: resolvedMime,
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
