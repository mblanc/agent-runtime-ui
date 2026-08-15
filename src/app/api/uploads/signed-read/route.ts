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
  if (!objectPath.startsWith(expectedUserPrefix)) {
    return NextResponse.json(
      { error: "Forbidden. You do not have access to this resource." },
      { status: 403 }
    );
  }

  const isMock =
    process.env.MOCK_AGENT_RUNTIME === "true" || !process.env.GCS_BUCKET_NAME;

  if (isMock) {
    return NextResponse.json({
      readUrl: `/api/uploads/mock-upload?gcsUri=${encodeURIComponent(gcsUri)}`,
    });
  }

  // The bucket comes from the caller's gcsUri too. Without this, any bucket the
  // service account can read is reachable through this endpoint, as long as the
  // object happens to sit under a users/<id>/ prefix. Only the bucket presign
  // writes to is ever legitimate. Checked after the mock branch, which signs
  // nothing and uses a placeholder bucket name.
  if (bucketName !== process.env.GCS_BUCKET_NAME) {
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

  return NextResponse.json({ readUrl });
});
