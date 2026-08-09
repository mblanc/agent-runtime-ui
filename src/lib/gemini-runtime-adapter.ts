import { defaultAttachmentStore } from "./attachments/attachment-store";

export * from "./adapters";
export * from "./attachments/attachment-store";

/**
 * Backward-compatible export for legacy attachmentMetadataMap references.
 */
export const attachmentMetadataMap = defaultAttachmentStore;
