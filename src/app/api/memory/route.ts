import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { AgentRuntimeClient } from "@/lib/agent-runtime-client";

export const runtime = "nodejs";

export const GET = withAuth(async (req, { userId }) => {
  const topic = req.nextUrl.searchParams.get("topic") || undefined;
  const agentId =
    req.nextUrl.searchParams.get("agentId") ||
    req.nextUrl.searchParams.get("reasoningEngineId") ||
    undefined;
  const location = req.nextUrl.searchParams.get("location") || undefined;

  const agentClient = new AgentRuntimeClient(agentId, location);
  const memories = await agentClient.listMemories(userId, topic, agentId, location);

  return NextResponse.json(
    {
      memories,
      totalCount: memories.length,
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      },
    }
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

  const agentId =
    req.nextUrl.searchParams.get("agentId") ||
    body?.agentId ||
    body?.reasoningEngineId ||
    undefined;
  const location =
    req.nextUrl.searchParams.get("location") || body?.location || undefined;

  const agentClient = new AgentRuntimeClient(agentId, location);
  const newMemory = await agentClient.createMemory(
    userId,
    fact.trim(),
    topic ? String(topic).trim() : undefined,
    agentId,
    location
  );

  return NextResponse.json(newMemory, { status: 201 });
});
