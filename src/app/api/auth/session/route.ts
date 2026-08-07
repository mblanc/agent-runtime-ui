import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session) {
      return NextResponse.json({ user: null, session: null });
    }

    return NextResponse.json(session);
  } catch (err: unknown) {
    console.error("Session lookup error:", err);
    return NextResponse.json({ user: null, session: null });
  }
}
