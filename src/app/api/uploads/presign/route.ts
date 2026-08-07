import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { Storage } from "@google-cloud/storage";
import { PresignBatchRequest, PresignedUploadItem } from "@/types/agent";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

const ALLOWED_MIME_PATTERNS = [
  /^image\//i,
  /^audio\//i,
  /^video\//i,
  /^text\//i,
  /^application\/pdf$/i,
  /^application\/json$/i,
  /^application\/xml$/i,
  /^application\/octet-stream$/i,
  /^application\/zip$/i,
  /^application\/msword$/i,
  /^application\/vnd\.openxmlformats-officedocument\./i,
];

function isMimeTypeAllowed(mimeType: string): boolean {
  if (!mimeType) return true; // Default fallback allowed
  return ALLOWED_MIME_PATTERNS.some((pattern) => pattern.test(mimeType));
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to upload files." },
        { status: 401 }
      );
    }

    let body: PresignBatchRequest;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
    }

    if (!body?.files || !Array.isArray(body.files) || body.files.length === 0) {
      return NextResponse.json(
        { error: "No files provided for presigning" },
        { status: 400 }
      );
    }

    // Validate size and mime types
    for (const file of body.files) {
      if (!file.filename || typeof file.filename !== "string") {
        return NextResponse.json(
          { error: "Filename is required for each file" },
          { status: 400 }
        );
      }

      if (
        typeof file.sizeBytes !== "number" ||
        file.sizeBytes <= 0 ||
        file.sizeBytes > MAX_FILE_SIZE
      ) {
        return NextResponse.json(
          {
            error: `File "${file.filename}" exceeds the maximum allowed size of 50MB`,
          },
          { status: 400 }
        );
      }

      if (file.contentType && !isMimeTypeAllowed(file.contentType)) {
        return NextResponse.json(
          { error: `File type "${file.contentType}" is not supported` },
          { status: 400 }
        );
      }
    }

    const isMock =
      process.env.MOCK_AGENT_RUNTIME === "true" || !process.env.GCS_BUCKET_NAME;

    const uploads: PresignedUploadItem[] = [];

    if (isMock) {
      for (let i = 0; i < body.files.length; i++) {
        const file = body.files[i];
        const fileId = `file-${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${i}`;
        const sanitizedFilename = file.filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
        const objectPath = `users/${session.user.id}/${fileId}-${sanitizedFilename}`;
        const gcsUri = `gs://mock-bucket/${objectPath}`;
        const uploadUrl = `/api/uploads/mock-upload?fileId=${encodeURIComponent(fileId)}&userId=${encodeURIComponent(session.user.id)}`;
        const readUrl = `/api/uploads/mock-upload?fileId=${encodeURIComponent(fileId)}&filename=${encodeURIComponent(sanitizedFilename)}`;

        uploads.push({
          fileId,
          filename: file.filename,
          contentType: file.contentType || "application/octet-stream",
          uploadUrl,
          readUrl,
          gcsUri,
        });
      }
    } else {
      const bucketName = process.env.GCS_BUCKET_NAME!;
      const storage = new Storage({
        projectId: process.env.GOOGLE_CLOUD_PROJECT,
      });
      const bucket = storage.bucket(bucketName);

      for (let i = 0; i < body.files.length; i++) {
        const file = body.files[i];
        const fileId =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `file-${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${i}`;
        const sanitizedFilename = file.filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
        const objectPath = `users/${session.user.id}/${fileId}-${sanitizedFilename}`;
        const gcsFile = bucket.file(objectPath);

        const contentType = file.contentType || "application/octet-stream";

        const [uploadUrl] = await gcsFile.getSignedUrl({
          version: "v4",
          action: "write",
          expires: Date.now() + 5 * 60 * 1000, // 5 minutes
          contentType,
        });

        const [readUrl] = await gcsFile.getSignedUrl({
          version: "v4",
          action: "read",
          expires: Date.now() + 60 * 60 * 1000, // 60 minutes
        });

        uploads.push({
          fileId,
          filename: file.filename,
          contentType,
          uploadUrl,
          readUrl,
          gcsUri: `gs://${bucketName}/${objectPath}`,
        });
      }
    }

    return NextResponse.json({ uploads });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    console.error("Error in POST /api/uploads/presign:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
