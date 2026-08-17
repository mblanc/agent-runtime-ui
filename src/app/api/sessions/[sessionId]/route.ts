import { NextResponse } from "next/server";
import { NO_STORE_HEADERS, resolveAgentTarget, withAuthDynamic } from "@/lib/api-handler";
import { createAgentRuntimeProvider } from "@/lib/agent-runtime/factory";
import { formatSessionEventsToThreadMessages } from "@/lib/agent-runtime/to-thread-messages";
import { requireSessionOwner } from "@/lib/session-ownership";
import {
  isLocalSessionId,
  PLACEHOLDER_SESSION_TITLE_RE,
} from "@/lib/agent-runtime/event-utils";

export const runtime = "nodejs";

interface SessionParams extends Record<string, string> {
  sessionId: string;
}

export const GET = withAuthDynamic<SessionParams>(
  async (req, { userId, userEmail, params }) => {
    const sessionId = params?.sessionId;

    if (!sessionId || isLocalSessionId(sessionId)) {
      return NextResponse.json(
        { session: null, events: [] },
        { headers: NO_STORE_HEADERS }
      );
    }

    const target = resolveAgentTarget(req);
    const provider = createAgentRuntimeProvider(target.agentId, target.location);

    // 404 rather than 403 on a session owned by somebody else: this route would
    // otherwise confirm that a guessed session id exists.
    const sessionDetails = await requireSessionOwner({
      provider,
      sessionId,
      target,
      userId,
      userEmail,
      onUnowned: "not-found",
    });
    if (sessionDetails instanceof NextResponse) return sessionDetails;

    const events = await provider.listSessionEvents(
      sessionId,
      target.agentId,
      target.location
    );

    // Derive smart title in-memory without mutating external backend on GET (CQS principle)
    if (
      !sessionDetails.title ||
      sessionDetails.title === "New conversation" ||
      sessionDetails.title === "Untitled chat" ||
      PLACEHOLDER_SESSION_TITLE_RE.test(sessionDetails.title)
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
      { headers: NO_STORE_HEADERS }
    );
  }
);

export const PATCH = withAuthDynamic<SessionParams>(
  async (req, { userId, userEmail, params }) => {
    const sessionId = params?.sessionId;

    if (!sessionId || isLocalSessionId(sessionId)) {
      return NextResponse.json({ success: true, sessionId });
    }

    const body = await req.json().catch(() => ({}));
    const target = resolveAgentTarget(req, body);
    const provider = createAgentRuntimeProvider(target.agentId, target.location);

    const sessionDetails = await requireSessionOwner({
      provider,
      sessionId,
      target,
      userId,
      userEmail,
      onUnowned: "forbidden",
    });
    if (sessionDetails instanceof NextResponse) return sessionDetails;

    const title = body?.title || body?.displayName;

    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "Valid title is required" }, { status: 400 });
    }

    await provider.updateSessionTitle(
      sessionId,
      title.trim(),
      userId,
      target.agentId,
      target.location
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

    if (!sessionId || isLocalSessionId(sessionId)) {
      return NextResponse.json({ success: true, deletedSessionId: sessionId });
    }

    const target = resolveAgentTarget(req);
    const provider = createAgentRuntimeProvider(target.agentId, target.location);

    const sessionDetails = await requireSessionOwner({
      provider,
      sessionId,
      target,
      userId,
      userEmail,
      onUnowned: "forbidden",
    });
    if (sessionDetails instanceof NextResponse) return sessionDetails;

    await provider.deleteSession(sessionId, target.agentId, target.location);

    return NextResponse.json({
      success: true,
      deletedSessionId: sessionId,
    });
  }
);
