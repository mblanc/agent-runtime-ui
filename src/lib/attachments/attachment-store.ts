export interface AttachmentMetadata {
  gcsUri: string;
  readUrl: string;
  previewUrl: string;
  contentType: string;
}

export interface IAttachmentMetadataStore {
  get(id: string): AttachmentMetadata | undefined;
  getByUrl?(url: string): AttachmentMetadata | undefined;
  getByFilename?(filename: string): AttachmentMetadata | undefined;
  findByAny?(query: string): AttachmentMetadata | undefined;
  set(id: string, meta: AttachmentMetadata): void;
  has(id: string): boolean;
  delete(id: string): void;
  clear(): void;
  readonly size: number;
}

/**
 * Scoped in-memory attachment metadata store that automatically manages
 * URL.revokeObjectURL lifecycle when attachments are deleted or cleared.
 */
export class SessionAttachmentStore implements IAttachmentMetadataStore {
  private store = new Map<string, AttachmentMetadata>();

  get(id: string): AttachmentMetadata | undefined {
    return this.store.get(id);
  }

  getByUrl(url: string): AttachmentMetadata | undefined {
    if (!url) return undefined;
    for (const meta of this.store.values()) {
      if (meta.readUrl === url || meta.previewUrl === url || meta.gcsUri === url) {
        return meta;
      }
    }
    return undefined;
  }

  getByFilename(filename: string): AttachmentMetadata | undefined {
    if (!filename) return undefined;
    for (const meta of this.store.values()) {
      if (
        meta.gcsUri.endsWith(`/${filename}`) ||
        meta.gcsUri.endsWith(`-${filename}`) ||
        meta.gcsUri.includes(filename)
      ) {
        return meta;
      }
    }
    return undefined;
  }

  findByAny(query: string): AttachmentMetadata | undefined {
    if (!query) return undefined;
    if (this.store.has(query)) return this.store.get(query);
    return this.getByUrl(query) || this.getByFilename(query);
  }

  set(id: string, meta: AttachmentMetadata): void {
    this.store.set(id, meta);
  }

  has(id: string): boolean {
    return this.store.has(id);
  }

  delete(id: string): void {
    const existing = this.store.get(id);
    if (existing?.previewUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
      try {
        URL.revokeObjectURL(existing.previewUrl);
      } catch {
        // Ignore revocation errors in test/server environments
      }
    }
    this.store.delete(id);
  }

  clear(): void {
    if (typeof URL !== "undefined" && URL.revokeObjectURL) {
      for (const meta of this.store.values()) {
        if (meta.previewUrl) {
          try {
            URL.revokeObjectURL(meta.previewUrl);
          } catch {
            // Ignore revocation errors
          }
        }
      }
    }
    this.store.clear();
  }

  get size(): number {
    return this.store.size;
  }

  values(): IterableIterator<AttachmentMetadata> {
    return this.store.values();
  }

  keys(): IterableIterator<string> {
    return this.store.keys();
  }

  entries(): IterableIterator<[string, AttachmentMetadata]> {
    return this.store.entries();
  }

  forEach(
    callbackfn: (
      value: AttachmentMetadata,
      key: string,
      map: Map<string, AttachmentMetadata>
    ) => void
  ): void {
    this.store.forEach(callbackfn);
  }
}

export const defaultAttachmentStore = new SessionAttachmentStore();
