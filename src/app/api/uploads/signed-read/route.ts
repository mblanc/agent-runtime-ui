import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { Storage } from "@google-cloud/storage";

export const runtime = "nodejs";

export const GET = withAuth(async (req, { userId }) => {
  const { searchParams } = new URL(req.url);
  const gcsUri = searchParams.get("gcsUri");

  if (!gcsUri) {
    return NextResponse.json(
      { error: "Missing gcsUri query parameter" },
      { status: 400 }
    );
  }

  if (!gcsUri.startsWith("gs://")) {
    return NextResponse.json(
      { error: "Invalid GCS URI scheme. Expected gs://..." },
      { status: 400 }
    );
  }

  const match = gcsUri.match(/^gs:\/\/([^/]+)\/(.+)$/);
  if (!match) {
    return NextResponse.json({ error: "Invalid GCS URI format" }, { status: 400 });
  }

  const [, bucketName, objectPath] = match;

  // User identity scoping: enforce that the resource belongs to the requesting user
  const expectedUserPrefix = `users/${userId}/`;
  const isAgentArtifact =
    (objectPath.startsWith(`app/`) || objectPath.startsWith(`sessions/`)) &&
    (objectPath.includes(userId) || !userId);
  const isUserUpload = objectPath.startsWith(expectedUserPrefix);

  if (!isUserUpload && !isAgentArtifact) {
    return NextResponse.json(
      { error: "Forbidden. You do not have access to this resource." },
      { status: 403 }
    );
  }

  const isMock =
    process.env.MOCK_AGENT_RUNTIME === "true" || !process.env.GCS_BUCKET_NAME;

  if (isMock) {
    const mockUrl = `/api/uploads/mock-upload?gcsUri=${encodeURIComponent(gcsUri)}`;
    if (searchParams.get("redirect") === "true") {
      return NextResponse.redirect(new URL(mockUrl, req.url));
    }
    return NextResponse.json({
      readUrl: mockUrl,
    });
  }

  // Only allow buckets explicitly configured in environment
  const allowedBuckets = new Set(
    [
      process.env.GCS_BUCKET_NAME,
      process.env.AGENT_GCS_BUCKET_NAME,
      process.env.VERTEX_AI_BUCKET_NAME,
      process.env.VERTEX_AI_LOGS_BUCKET_NAME,
    ].filter(Boolean)
  );

  if (allowedBuckets.size > 0 && !allowedBuckets.has(bucketName)) {
    return NextResponse.json(
      { error: "Forbidden. You do not have access to this resource." },
      { status: 403 }
    );
  }

  const storage = new Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT,
  });

  const [readUrl] = await storage
    .bucket(bucketName)
    .file(objectPath)
    .getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + 60 * 60 * 1000, // 60 minutes
    });

  if (searchParams.get("redirect") === "true") {
    return NextResponse.redirect(readUrl);
  }

  return NextResponse.json({ readUrl });
});
