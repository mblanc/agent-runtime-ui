import { NextResponse } from "next/server";
import { NO_STORE_HEADERS, resolveAgentTarget, withAuthDynamic } from "@/lib/api-handler";
import { createAgentRuntimeProvider } from "@/lib/agent-runtime/factory";
import { isLocalSessionId } from "@/lib/agent-runtime/event-utils";
import { requireSessionOwner } from "@/lib/session-ownership";
import type { SessionStateMap } from "@/types/agent";

export const runtime = "nodejs";

interface SessionParams extends Record<string, string> {
  sessionId: string;
}

export const GET = withAuthDynamic<SessionParams>(
  async (req, { userId, userEmail, params }) => {
    const sessionId = params?.sessionId;

    if (!sessionId || isLocalSessionId(sessionId)) {
      return NextResponse.json(
        { sessionId: sessionId || "", state: {} },
        { headers: NO_STORE_HEADERS }
      );
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

    const state = await provider.getSessionState(
      sessionId,
      target.agentId,
      target.location
    );

    return NextResponse.json(
      {
        sessionId,
        state,
        updateTime: sessionDetails.updateTime,
      },
      { headers: NO_STORE_HEADERS }
    );
  }
);

export const PATCH = withAuthDynamic<SessionParams>(
  async (req, { userId, userEmail, params }) => {
    const sessionId = params?.sessionId;

    if (!sessionId || isLocalSessionId(sessionId)) {
      return NextResponse.json({ sessionId: sessionId || "", state: {} });
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

    const rawState = body?.state;
    if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
      return NextResponse.json(
        { error: "Invalid state dictionary. An object map is required." },
        { status: 400 }
      );
    }

    const mode: "merge" | "replace" = body?.mode === "replace" ? "replace" : "merge";
    const updatedState = await provider.updateSessionState(
      sessionId,
      rawState as SessionStateMap,
      mode,
      target.agentId,
      target.location
    );

    return NextResponse.json({
      sessionId,
      state: updatedState,
      updateTime: new Date().toISOString(),
    });
  }
);
