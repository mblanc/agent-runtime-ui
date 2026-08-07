import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AgentRuntimeClient } from "@/lib/agent-runtime-client";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ sessionId: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to view this session." },
        { status: 401 }
      );
    }

    const { sessionId } = await context.params;

    if (
      !sessionId ||
      sessionId.startsWith("__LOCALID_") ||
      sessionId.startsWith("local-")
    ) {
      return NextResponse.json(
        { session: null, events: [] },
        {
          headers: {
            "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
          },
        }
      );
    }

    const agentClient = new AgentRuntimeClient();

    const sessionDetails = await agentClient.getSession(sessionId);
    if (!sessionDetails) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (
      sessionDetails.userId &&
      sessionDetails.userId !== session.user.id &&
      sessionDetails.userId !== session.user.email
    ) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const events = await agentClient.listSessionEvents(sessionId);

    // If session title is generic, derive smart title from first user message
    if (
      !sessionDetails.title ||
      sessionDetails.title === "New conversation" ||
      sessionDetails.title === "Untitled chat" ||
      /^Chat [a-zA-Z0-9_-]+$/i.test(sessionDetails.title)
    ) {
      const firstUserEvent = events.find((e) => e.role === "user" && e.content.trim());
      if (firstUserEvent) {
        const clean = firstUserEvent.content.trim();
        const cap = clean.charAt(0).toUpperCase() + clean.slice(1);
        const smartTitle = cap.length > 40 ? `${cap.substring(0, 37)}...` : cap;
        sessionDetails.title = smartTitle;
        agentClient
          .updateSessionTitle(sessionId, smartTitle, sessionDetails.userId)
          .catch(() => {});
      }
    }

    return NextResponse.json(
      {
        session: sessionDetails,
        events,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
        },
      }
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    console.error("Error in GET /api/sessions/[sessionId]:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to update this session." },
        { status: 401 }
      );
    }

    const { sessionId } = await context.params;

    if (
      !sessionId ||
      sessionId.startsWith("__LOCALID_") ||
      sessionId.startsWith("local-")
    ) {
      return NextResponse.json({ success: true, sessionId });
    }

    const agentClient = new AgentRuntimeClient();
    const sessionDetails = await agentClient.getSession(sessionId);

    if (!sessionDetails) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (
      sessionDetails.userId &&
      sessionDetails.userId !== session.user.id &&
      sessionDetails.userId !== session.user.email
    ) {
      return NextResponse.json(
        { error: "Forbidden. You do not own this session." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const title = body?.title || body?.displayName;

    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "Valid title is required" }, { status: 400 });
    }

    await agentClient.updateSessionTitle(sessionId, title.trim(), session.user.id);

    return NextResponse.json({
      success: true,
      sessionId,
      title: title.trim(),
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    console.error("Error in PATCH /api/sessions/[sessionId]:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to delete this session." },
        { status: 401 }
      );
    }

    const { sessionId } = await context.params;

    if (
      !sessionId ||
      sessionId.startsWith("__LOCALID_") ||
      sessionId.startsWith("local-")
    ) {
      return NextResponse.json({ success: true, deletedSessionId: sessionId });
    }

    const agentClient = new AgentRuntimeClient();
    const sessionDetails = await agentClient.getSession(sessionId);

    if (!sessionDetails) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (
      sessionDetails.userId &&
      sessionDetails.userId !== session.user.id &&
      sessionDetails.userId !== session.user.email
    ) {
      return NextResponse.json(
        { error: "Forbidden. You do not own this session." },
        { status: 403 }
      );
    }

    await agentClient.deleteSession(sessionId);

    return NextResponse.json({
      success: true,
      deletedSessionId: sessionId,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    console.error("Error in DELETE /api/sessions/[sessionId]:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
