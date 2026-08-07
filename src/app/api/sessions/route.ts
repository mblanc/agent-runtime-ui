import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AgentRuntimeClient } from "@/lib/agent-runtime-client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to view sessions." },
        { status: 401 }
      );
    }

    const agentClient = new AgentRuntimeClient();
    const sessions = await agentClient.listSessions(session.user.id, session.user.email);

    return NextResponse.json(
      { sessions },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
        },
      }
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    console.error("Error in GET /api/sessions:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to create a session." },
        { status: 401 }
      );
    }

    let title: string | undefined;
    try {
      const body = await req.json();
      title = body?.title || body?.displayName;
    } catch {
      // Body is optional
    }

    const agentClient = new AgentRuntimeClient();
    const newSession = await agentClient.createSession(session.user.id, title);

    return NextResponse.json({ session: newSession }, { status: 201 });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    console.error("Error in POST /api/sessions:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
