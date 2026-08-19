import { NextResponse } from "next/server";
import { NO_STORE_HEADERS, resolveAgentTarget, withAuthDynamic } from "@/lib/api-handler";
import { createAgentRuntimeProvider } from "@/lib/agent-runtime/factory";
import { isLocalSessionId } from "@/lib/agent-runtime/event-utils";
import { requireSessionOwner } from "@/lib/session-ownership";

export const runtime = "nodejs";

interface ArtifactParams extends Record<string, string> {
  sessionId: string;
  filename: string;
}

export const GET = withAuthDynamic<ArtifactParams>(
  async (req, { userId, userEmail, params }) => {
    const sessionId = params?.sessionId;
    const filename = params?.filename;

    if (!sessionId || isLocalSessionId(sessionId) || !filename) {
      return NextResponse.json(
        { error: "Artifact not found" },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    const versionParam = req.nextUrl.searchParams.get("version");
    const version = versionParam !== null ? parseInt(versionParam, 10) : undefined;

    if (version !== undefined && isNaN(version)) {
      return NextResponse.json(
        { error: "Invalid version number" },
        { status: 400, headers: NO_STORE_HEADERS }
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
      onUnowned: "not-found",
    });
    if (sessionDetails instanceof NextResponse) return sessionDetails;

    const result = await provider.getArtifact(
      sessionId,
      filename,
      version,
      userId,
      target.agentId,
      target.location
    );

    if (!result) {
      return NextResponse.json(
        { error: "Artifact or specified version not found" },
        { status: 404, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  }
);
