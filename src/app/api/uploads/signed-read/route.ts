import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { Storage } from "@google-cloud/storage";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to access files." },
        { status: 401 }
      );
    }

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
    const expectedUserPrefix = `users/${session.user.id}/`;
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
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    console.error("Error in GET /api/uploads/signed-read:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
