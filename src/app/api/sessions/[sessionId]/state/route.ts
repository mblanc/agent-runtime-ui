import { NextResponse } from "next/server";
import { withAuthDynamic } from "@/lib/api-handler";
import { AgentRuntimeClient } from "@/lib/agent-runtime-client";
import type { SessionStateMap } from "@/types/agent";

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
        { sessionId: sessionId || "", state: {} },
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

    if (
      sessionDetails.userId &&
      sessionDetails.userId !== userId &&
      sessionDetails.userId !== userEmail
    ) {
      return NextResponse.json(
        { error: "Forbidden. You do not own this session." },
        { status: 403 }
      );
    }

    const state = await agentClient.getSessionState(sessionId, agentId, location);

    return NextResponse.json(
      {
        sessionId,
        state,
        updateTime: sessionDetails.updateTime,
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
      return NextResponse.json({ sessionId: sessionId || "", state: {} });
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

    if (
      sessionDetails.userId &&
      sessionDetails.userId !== userId &&
      sessionDetails.userId !== userEmail
    ) {
      return NextResponse.json(
        { error: "Forbidden. You do not own this session." },
        { status: 403 }
      );
    }

    const rawState = body?.state;
    if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
      return NextResponse.json(
        { error: "Invalid state dictionary. An object map is required." },
        { status: 400 }
      );
    }

    const mode: "merge" | "replace" = body?.mode === "replace" ? "replace" : "merge";
    const updatedState = await agentClient.updateSessionState(
      sessionId,
      rawState as SessionStateMap,
      mode,
      agentId,
      location
    );

    return NextResponse.json({
      sessionId,
      state: updatedState,
      updateTime: new Date().toISOString(),
    });
  }
);
