import { NextResponse } from "next/server";
import { NO_STORE_HEADERS, resolveAgentTarget, withAuthDynamic } from "@/lib/api-handler";
import { createAgentRuntimeProvider } from "@/lib/agent-runtime/factory";
import { isLocalSessionId } from "@/lib/agent-runtime/event-utils";
import { requireSessionOwner } from "@/lib/session-ownership";

export const runtime = "nodejs";

interface SessionParams extends Record<string, string> {
  sessionId: string;
}

export const GET = withAuthDynamic<SessionParams>(
  async (req, { userId, userEmail, params }) => {
    const sessionId = params?.sessionId;

    if (!sessionId || isLocalSessionId(sessionId)) {
      return NextResponse.json({ artifacts: [] }, { headers: NO_STORE_HEADERS });
    }

    const target = resolveAgentTarget(req);
    const provider = createAgentRuntimeProvider(target.agentId, target.location);

    const sessionDetails = await requireSessionOwner({
      provider,
      sessionId,
      target,
      userId,
      userEmail,
      onUnowned: "not-found",
    });
    if (sessionDetails instanceof NextResponse) return sessionDetails;

    const artifacts = await provider.listArtifacts(
      sessionId,
      userId,
      target.agentId,
      target.location
    );

    return NextResponse.json({ artifacts }, { headers: NO_STORE_HEADERS });
  }
);
