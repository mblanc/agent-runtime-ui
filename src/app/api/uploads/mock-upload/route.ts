import { NextRequest, NextResponse } from "next/server";
import { inferMimeType } from "@/lib/attachments/mime-types";

export const runtime = "nodejs";

// Minimal transparent 1x1 PNG data
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

export async function PUT(_req: NextRequest) {
  // In mock mode, acknowledge the file upload
  return new Response(null, { status: 200 });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get("filename") || "";
  const mimeType = inferMimeType(filename);

  if (mimeType.startsWith("image/")) {
    return new Response(TRANSPARENT_PNG, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  }

  return new NextResponse("Mock uploaded file content", {
    status: 200,
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
