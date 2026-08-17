import { NextResponse } from "next/server";
import { NO_STORE_HEADERS, resolveAgentTarget, withAuth } from "@/lib/api-handler";
import { createAgentRuntimeProvider } from "@/lib/agent-runtime/factory";

export const runtime = "nodejs";

export const GET = withAuth(async (req, { userId }) => {
  const topic = req.nextUrl.searchParams.get("topic") || undefined;
  const { agentId, location } = resolveAgentTarget(req);

  const provider = createAgentRuntimeProvider(agentId, location);
  const memories = await provider.listMemories(userId, topic, agentId, location);

  return NextResponse.json(
    {
      memories,
      totalCount: memories.length,
    },
    { headers: NO_STORE_HEADERS }
  );
});

export const POST = withAuth(async (req, { userId }) => {
  const body = await req.json().catch(() => ({}));
  const fact = body?.fact;
  const topic = body?.topic;

  if (!fact || typeof fact !== "string" || !fact.trim()) {
    return NextResponse.json(
      { error: "Validation error: 'fact' must be a non-empty string" },
      { status: 400 }
    );
  }

  // `legacyQueryAlias: false` preserves this route's narrower ladder: it has
  // never accepted `?reasoningEngineId=`, only the body field of that name.
  const { agentId, location } = resolveAgentTarget(req, body, {
    legacyQueryAlias: false,
  });

  const provider = createAgentRuntimeProvider(agentId, location);
  const newMemory = await provider.createMemory(
    userId,
    fact.trim(),
    topic ? String(topic).trim() : undefined,
    agentId,
    location
  );

  return NextResponse.json(newMemory, { status: 201 });
});
