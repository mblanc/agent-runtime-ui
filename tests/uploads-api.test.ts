import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as presignUploads } from "@/app/api/uploads/presign/route";
import { GET as signedRead } from "@/app/api/uploads/signed-read/route";
import {
  PUT as mockUploadPut,
  GET as mockUploadGet,
} from "@/app/api/uploads/mock-upload/route";
import { auth } from "@/lib/auth";

// Mock @google-cloud/storage
const { mockBucket } = vi.hoisted(() => {
  const mockGetSignedUrl = vi
    .fn()
    .mockImplementation(() =>
      Promise.resolve(["https://storage.googleapis.com/signed-url-test"])
    );
  const mockFile = vi.fn().mockImplementation((_path: string) => ({
    getSignedUrl: mockGetSignedUrl,
  }));
  const mockBucket = vi.fn().mockImplementation((_name: string) => ({
    file: mockFile,
  }));

  return { mockBucket };
});

vi.mock("@google-cloud/storage", () => {
  class MockStorage {
    bucket(name: string) {
      return mockBucket(name);
    }
  }
  return {
    Storage: MockStorage,
    default: MockStorage,
  };
});

describe("Uploads API Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MOCK_AGENT_RUNTIME = "true";
  });

  describe("POST /api/uploads/presign", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/uploads/presign", {
        method: "POST",
        body: JSON.stringify({
          files: [
            {
              filename: "sample.png",
              contentType: "image/png",
              sizeBytes: 1024,
            },
          ],
        }),
      });

      const res = await presignUploads(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Unauthorized");
    });

    it("returns 400 on empty files list", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: { id: "test-user", name: "Test User", email: "test@example.com" },
        session: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
      });

      const req = new NextRequest("http://localhost:3000/api/uploads/presign", {
        method: "POST",
        body: JSON.stringify({ files: [] }),
      });

      const res = await presignUploads(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("No files provided");
    });

    it("returns 400 when file size exceeds 50MB", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: { id: "test-user", name: "Test User", email: "test@example.com" },
        session: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
      });

      const req = new NextRequest("http://localhost:3000/api/uploads/presign", {
        method: "POST",
        body: JSON.stringify({
          files: [
            {
              filename: "oversized.pdf",
              contentType: "application/pdf",
              sizeBytes: 55 * 1024 * 1024, // 55 MB
            },
          ],
        }),
      });

      const res = await presignUploads(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("exceeds the maximum allowed size");
    });

    it("returns 400 when file size is zero or negative", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: { id: "test-user", name: "Test User", email: "test@example.com" },
        session: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
      });

      const req = new NextRequest("http://localhost:3000/api/uploads/presign", {
        method: "POST",
        body: JSON.stringify({
          files: [
            {
              filename: "empty.png",
              contentType: "image/png",
              sizeBytes: 0,
            },
          ],
        }),
      });

      const res = await presignUploads(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("exceeds the maximum allowed size");
    });

    it("returns 400 when file type is disallowed", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: { id: "test-user", name: "Test User", email: "test@example.com" },
        session: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
      });

      const req = new NextRequest("http://localhost:3000/api/uploads/presign", {
        method: "POST",
        body: JSON.stringify({
          files: [
            {
              filename: "malicious.exe",
              contentType: "application/x-msdownload",
              sizeBytes: 1024,
            },
          ],
        }),
      });

      const res = await presignUploads(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("is not supported");
    });

    it("generates presigned items in mock mode scoped to user ID", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: { id: "user-abc-123", name: "Alice", email: "alice@example.com" },
        session: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
      });

      const req = new NextRequest("http://localhost:3000/api/uploads/presign", {
        method: "POST",
        body: JSON.stringify({
          files: [
            {
              filename: "chart design.png",
              contentType: "image/png",
              sizeBytes: 2048,
            },
            {
              filename: "annual_report.pdf",
              contentType: "application/pdf",
              sizeBytes: 1048576,
            },
          ],
        }),
      });

      const res = await presignUploads(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.uploads).toHaveLength(2);
      const first = data.uploads[0];
      expect(first.filename).toBe("chart design.png");
      expect(first.contentType).toBe("image/png");
      expect(first.gcsUri).toContain("gs://mock-bucket/users/user-abc-123/");
      expect(first.gcsUri).toContain("chart_design.png");
      expect(first.uploadUrl).toContain("/api/uploads/mock-upload");
      expect(first.readUrl).toContain("/api/uploads/mock-upload");
    });

    it("generates signed URLs using @google-cloud/storage in live mode", async () => {
      process.env.MOCK_AGENT_RUNTIME = "false";
      process.env.GCS_BUCKET_NAME = "my-production-bucket";
      process.env.GOOGLE_CLOUD_PROJECT = "my-gcp-project";

      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: { id: "user-prod-1", name: "Bob", email: "bob@example.com" },
        session: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
      });

      const req = new NextRequest("http://localhost:3000/api/uploads/presign", {
        method: "POST",
        body: JSON.stringify({
          files: [
            {
              filename: "document.pdf",
              contentType: "application/pdf",
              sizeBytes: 4096,
            },
          ],
        }),
      });

      const res = await presignUploads(req);
      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.uploads).toHaveLength(1);
      const item = data.uploads[0];
      expect(item.gcsUri).toContain("gs://my-production-bucket/users/user-prod-1/");
      expect(item.uploadUrl).toBe("https://storage.googleapis.com/signed-url-test");
      expect(item.readUrl).toBe("https://storage.googleapis.com/signed-url-test");
      expect(mockBucket).toHaveBeenCalledWith("my-production-bucket");
    });
  });

  describe("GET /api/uploads/signed-read", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(null);

      const req = new NextRequest(
        "http://localhost:3000/api/uploads/signed-read?gcsUri=gs://bucket/users/user-1/file.png"
      );
      const res = await signedRead(req);
      expect(res.status).toBe(401);
    });

    it("returns 400 when gcsUri is missing", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: { id: "user-1", name: "User 1", email: "u1@example.com" },
        session: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
      });

      const req = new NextRequest("http://localhost:3000/api/uploads/signed-read");
      const res = await signedRead(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Missing gcsUri");
    });

    it("returns 400 when gcsUri is not a gs:// scheme", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: { id: "user-1", name: "User 1", email: "u1@example.com" },
        session: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
      });

      const req = new NextRequest(
        "http://localhost:3000/api/uploads/signed-read?gcsUri=https://storage.googleapis.com/file.png"
      );
      const res = await signedRead(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid GCS URI");
    });

    it("returns 403 when gcsUri does not belong to requesting user", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: { id: "user-alice", name: "Alice", email: "alice@example.com" },
        session: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
      });

      const req = new NextRequest(
        "http://localhost:3000/api/uploads/signed-read?gcsUri=gs://bucket/users/user-bob/secret.pdf"
      );
      const res = await signedRead(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Forbidden");
    });

    it("returns mock readUrl when valid and user matches in mock mode", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: { id: "user-alice", name: "Alice", email: "alice@example.com" },
        session: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
      });

      const gcsUri = "gs://mock-bucket/users/user-alice/doc-123-chart.png";
      const req = new NextRequest(
        `http://localhost:3000/api/uploads/signed-read?gcsUri=${encodeURIComponent(gcsUri)}`
      );
      const res = await signedRead(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.readUrl).toContain("/api/uploads/mock-upload");
      expect(data.readUrl).toContain(encodeURIComponent(gcsUri));
    });

    it("returns live signed GET URL when bucket configured in live mode", async () => {
      process.env.MOCK_AGENT_RUNTIME = "false";
      process.env.GCS_BUCKET_NAME = "my-prod-bucket";

      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: { id: "user-prod", name: "Prod User", email: "prod@example.com" },
        session: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
      });

      const gcsUri = "gs://my-prod-bucket/users/user-prod/file-999-report.pdf";
      const req = new NextRequest(
        `http://localhost:3000/api/uploads/signed-read?gcsUri=${encodeURIComponent(gcsUri)}`
      );
      const res = await signedRead(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.readUrl).toBe("https://storage.googleapis.com/signed-url-test");
    });

    it("refuses to sign a read for a bucket other than the configured one", async () => {
      // The object path guard passes here — the attacker's own user prefix —
      // so only the bucket check stands between the caller and a signed URL
      // for any bucket the service account can read.
      process.env.MOCK_AGENT_RUNTIME = "false";
      process.env.GCS_BUCKET_NAME = "my-prod-bucket";

      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: { id: "user-prod", name: "Prod User", email: "prod@example.com" },
        session: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
      });

      const gcsUri = "gs://some-other-bucket/users/user-prod/stolen.pdf";
      const req = new NextRequest(
        `http://localhost:3000/api/uploads/signed-read?gcsUri=${encodeURIComponent(gcsUri)}`
      );
      const res = await signedRead(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Forbidden");
    });
  });

  describe("Mock Upload Handler", () => {
    it("handles PUT uploads with status 200", async () => {
      const req = new NextRequest("http://localhost:3000/api/uploads/mock-upload", {
        method: "PUT",
        body: "dummy data",
      });
      const res = await mockUploadPut(req);
      expect(res.status).toBe(200);
    });

    it("serves mock image GET with image/png content type", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/uploads/mock-upload?filename=photo.png"
      );
      const res = await mockUploadGet(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("image/png");
    });

    it("serves mock document GET with application/pdf content type", async () => {
      const req = new NextRequest(
        "http://localhost:3000/api/uploads/mock-upload?filename=notes.pdf"
      );
      const res = await mockUploadGet(req);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/pdf");
    });
  });
});
