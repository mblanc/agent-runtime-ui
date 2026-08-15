import { NextResponse } from "next/server";
import { withAuthDynamic } from "@/lib/api-handler";
import {
  AgentRuntimeClient,
  formatSessionEventsToThreadMessages,
} from "@/lib/agent-runtime-client";
import { isSessionOwnedBy } from "@/lib/session-ownership";

export const runtime = "nodejs";

interface SessionParams extends Record<string, string> {
  sessionId: string;
}

export const GET = withAuthDynamic<SessionParams>(
  async (req, { userId, userEmail, params }) => {
    const sessionId = params?.sessionId;

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

    const agentId =
      req.nextUrl.searchParams.get("agentId") ||
      req.nextUrl.searchParams.get("reasoningEngineId") ||
      undefined;
    const location = req.nextUrl.searchParams.get("location") || undefined;

    const agentClient = new AgentRuntimeClient(agentId, location);
    const sessionDetails = await agentClient.getSession(sessionId, agentId, location);

    if (!sessionDetails) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (!isSessionOwnedBy(sessionDetails, userId, userEmail)) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const events = await agentClient.listSessionEvents(sessionId, agentId, location);

    // Derive smart title in-memory without mutating external backend on GET (CQS principle)
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
        sessionDetails.title = cap.length > 40 ? `${cap.substring(0, 37)}...` : cap;
      }
    }

    const messages = formatSessionEventsToThreadMessages(events);

    return NextResponse.json(
      {
        session: sessionDetails,
        events,
        messages,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
        },
      }
    );
  }
);

export const PATCH = withAuthDynamic<SessionParams>(
  async (req, { userId, userEmail, params }) => {
    const sessionId = params?.sessionId;

    if (
      !sessionId ||
      sessionId.startsWith("__LOCALID_") ||
      sessionId.startsWith("local-")
    ) {
      return NextResponse.json({ success: true, sessionId });
    }

    const body = await req.json().catch(() => ({}));
    const agentId =
      req.nextUrl.searchParams.get("agentId") ||
      req.nextUrl.searchParams.get("reasoningEngineId") ||
      body?.agentId ||
      body?.reasoningEngineId ||
      undefined;
    const location =
      req.nextUrl.searchParams.get("location") || body?.location || undefined;

    const agentClient = new AgentRuntimeClient(agentId, location);
    const sessionDetails = await agentClient.getSession(sessionId, agentId, location);

    if (!sessionDetails) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (!isSessionOwnedBy(sessionDetails, userId, userEmail)) {
      return NextResponse.json(
        { error: "Forbidden. You do not own this session." },
        { status: 403 }
      );
    }

    const title = body?.title || body?.displayName;

    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "Valid title is required" }, { status: 400 });
    }

    await agentClient.updateSessionTitle(
      sessionId,
      title.trim(),
      userId,
      agentId,
      location
    );

    return NextResponse.json({
      success: true,
      sessionId,
      title: title.trim(),
    });
  }
);

export const DELETE = withAuthDynamic<SessionParams>(
  async (req, { userId, userEmail, params }) => {
    const sessionId = params?.sessionId;

    if (
      !sessionId ||
      sessionId.startsWith("__LOCALID_") ||
      sessionId.startsWith("local-")
    ) {
      return NextResponse.json({ success: true, deletedSessionId: sessionId });
    }

    const agentId =
      req.nextUrl.searchParams.get("agentId") ||
      req.nextUrl.searchParams.get("reasoningEngineId") ||
      undefined;
    const location = req.nextUrl.searchParams.get("location") || undefined;

    const agentClient = new AgentRuntimeClient(agentId, location);
    const sessionDetails = await agentClient.getSession(sessionId, agentId, location);

    if (!sessionDetails) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    if (!isSessionOwnedBy(sessionDetails, userId, userEmail)) {
      return NextResponse.json(
        { error: "Forbidden. You do not own this session." },
        { status: 403 }
      );
    }

    await agentClient.deleteSession(sessionId, agentId, location);

    return NextResponse.json({
      success: true,
      deletedSessionId: sessionId,
    });
  }
);
