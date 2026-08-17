import { NextResponse } from "next/server";
import { resolveAgentTarget, withAuth } from "@/lib/api-handler";
import { createAgentRuntimeProvider } from "@/lib/agent-runtime/factory";

export const runtime = "nodejs";

export const POST = withAuth(async (req, { userId }) => {
  const body = await req.json().catch(() => ({}));
  const sessionId = body?.sessionId;

  if (!sessionId || typeof sessionId !== "string" || !sessionId.trim()) {
    return NextResponse.json(
      { error: "Validation error: 'sessionId' is required" },
      { status: 400 }
    );
  }

  // See the memory collection route: `?reasoningEngineId=` has never been an
  // accepted alias here, only the body field.
  const { agentId, location } = resolveAgentTarget(req, body, {
    legacyQueryAlias: false,
  });

  const provider = createAgentRuntimeProvider(agentId, location);
  const memories = await provider.generateMemories(
    userId,
    sessionId.trim(),
    agentId,
    location
  );

  return NextResponse.json({
    extractedCount: memories.length,
    memories,
  });
});
