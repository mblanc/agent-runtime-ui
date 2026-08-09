import { describe, it, expect, vi, beforeEach } from "vitest";
import { SessionAttachmentStore } from "@/lib/attachments/attachment-store";

describe("SessionAttachmentStore", () => {
  let store: SessionAttachmentStore;
  const mockRevokeObjectURL = vi.fn();

  beforeEach(() => {
    store = new SessionAttachmentStore();
    mockRevokeObjectURL.mockClear();
    globalThis.URL.revokeObjectURL = mockRevokeObjectURL;
  });

  it("stores and retrieves attachment metadata correctly", () => {
    store.set("att-1", {
      gcsUri: "gs://bucket/users/user-1/file-1.png",
      readUrl: "https://storage.googleapis.com/read-1",
      previewUrl: "blob:http://localhost:3000/preview-1",
      contentType: "image/png",
    });

    expect(store.has("att-1")).toBe(true);
    expect(store.size).toBe(1);

    const meta = store.get("att-1");
    expect(meta?.gcsUri).toBe("gs://bucket/users/user-1/file-1.png");
    expect(meta?.contentType).toBe("image/png");
  });

  it("revokes object URL when an attachment is deleted", () => {
    store.set("att-2", {
      gcsUri: "gs://bucket/users/user-1/file-2.pdf",
      readUrl: "https://storage.googleapis.com/read-2",
      previewUrl: "blob:http://localhost:3000/preview-2",
      contentType: "application/pdf",
    });

    expect(store.has("att-2")).toBe(true);

    store.delete("att-2");

    expect(store.has("att-2")).toBe(false);
    expect(store.size).toBe(0);
    expect(mockRevokeObjectURL).toHaveBeenCalledWith(
      "blob:http://localhost:3000/preview-2"
    );
  });

  it("revokes all object URLs when clear() is invoked", () => {
    store.set("att-3", {
      gcsUri: "gs://bucket/users/user-1/file-3.png",
      readUrl: "https://storage.googleapis.com/read-3",
      previewUrl: "blob:http://localhost:3000/preview-3",
      contentType: "image/png",
    });
    store.set("att-4", {
      gcsUri: "gs://bucket/users/user-1/file-4.png",
      readUrl: "https://storage.googleapis.com/read-4",
      previewUrl: "blob:http://localhost:3000/preview-4",
      contentType: "image/png",
    });

    expect(store.size).toBe(2);

    store.clear();

    expect(store.size).toBe(0);
    expect(mockRevokeObjectURL).toHaveBeenCalledTimes(2);
    expect(mockRevokeObjectURL).toHaveBeenCalledWith(
      "blob:http://localhost:3000/preview-3"
    );
    expect(mockRevokeObjectURL).toHaveBeenCalledWith(
      "blob:http://localhost:3000/preview-4"
    );
  });

  it("supports iteration with values, keys, entries, and forEach", () => {
    store.set("a", {
      gcsUri: "gs://b/a",
      readUrl: "url-a",
      previewUrl: "",
      contentType: "text/plain",
    });
    store.set("b", {
      gcsUri: "gs://b/b",
      readUrl: "url-b",
      previewUrl: "",
      contentType: "text/plain",
    });

    expect(Array.from(store.keys())).toEqual(["a", "b"]);
    expect(Array.from(store.values()).length).toBe(2);
    expect(Array.from(store.entries()).length).toBe(2);

    const visited: string[] = [];
    store.forEach((_val, key) => {
      visited.push(key);
    });
    expect(visited).toEqual(["a", "b"]);
  });
});
