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
