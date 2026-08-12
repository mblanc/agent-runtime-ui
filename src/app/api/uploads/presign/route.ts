import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { Storage } from "@google-cloud/storage";
import { PresignBatchRequest, PresignedUploadItem } from "@/types/agent";
import { isSupportedMimeType, inferMimeType } from "@/lib/attachments/mime-types";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

let storageClient: Storage | null = null;
function getStorageClient(): Storage {
  if (!storageClient) {
    storageClient = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
    });
  }
  return storageClient;
}

export const POST = withAuth(async (req, { userId }) => {
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

    const resolvedMime = inferMimeType(file.filename, file.contentType);
    if (!isSupportedMimeType(resolvedMime)) {
      return NextResponse.json(
        {
          error: `File type "${file.contentType || file.filename}" is not supported. Supported types: images (PNG, JPEG, WebP, HEIC, HEIF), PDF, videos (MP4, WebM, MOV, MPEG, etc.), and audio (MP3, WAV, AAC, FLAC, M4A, OGG, etc.)`,
        },
        { status: 400 }
      );
    }
  }

  const bucketName =
    process.env.GCS_BUCKET_NAME ||
    (process.env.GOOGLE_CLOUD_PROJECT
      ? `${process.env.GOOGLE_CLOUD_PROJECT}-staging`
      : undefined);

  const isMock = process.env.MOCK_AGENT_RUNTIME === "true" || !bucketName;

  let uploads: PresignedUploadItem[] = [];

  if (isMock) {
    uploads = body.files.map((file, i) => {
      const fileId = `file-${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${i}`;
      const sanitizedFilename = file.filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
      const objectPath = `users/${userId}/${fileId}-${sanitizedFilename}`;
      const gcsUri = `gs://mock-bucket/${objectPath}`;
      const uploadUrl = `/api/uploads/mock-upload?fileId=${encodeURIComponent(fileId)}&userId=${encodeURIComponent(userId)}`;
      const readUrl = `/api/uploads/mock-upload?fileId=${encodeURIComponent(fileId)}&filename=${encodeURIComponent(sanitizedFilename)}`;
      const contentType = inferMimeType(file.filename, file.contentType);

      return {
        fileId,
        filename: file.filename,
        contentType,
        uploadUrl,
        readUrl,
        gcsUri,
      };
    });
  } else {
    const storage = getStorageClient();
    const bucket = storage.bucket(bucketName);

    uploads = await Promise.all(
      body.files.map(async (file, i) => {
        const fileId =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `file-${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${i}`;
        const sanitizedFilename = file.filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
        const objectPath = `users/${userId}/${fileId}-${sanitizedFilename}`;
        const gcsFile = bucket.file(objectPath);
        const contentType = inferMimeType(file.filename, file.contentType);

        const [[uploadUrl], [readUrl]] = await Promise.all([
          gcsFile.getSignedUrl({
            version: "v4",
            action: "write",
            expires: Date.now() + 5 * 60 * 1000, // 5 minutes
            contentType,
          }),
          gcsFile.getSignedUrl({
            version: "v4",
            action: "read",
            expires: Date.now() + 60 * 60 * 1000, // 60 minutes
          }),
        ]);

        return {
          fileId,
          filename: file.filename,
          contentType,
          uploadUrl,
          readUrl,
          gcsUri: `gs://${bucketName}/${objectPath}`,
        };
      })
    );
  }

  return NextResponse.json({ uploads });
});
