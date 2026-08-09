import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { AgentRuntimeClient } from "@/lib/agent-runtime-client";

export const runtime = "nodejs";

export const GET = withAuth(async (req, { userId, userEmail }) => {
  const agentId =
    req.nextUrl.searchParams.get("agentId") ||
    req.nextUrl.searchParams.get("reasoningEngineId") ||
    undefined;

  const agentClient = new AgentRuntimeClient(agentId);
  const sessions = await agentClient.listSessions(userId, userEmail, agentId);

  return NextResponse.json(
    { sessions },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      },
    }
  );
});

export const POST = withAuth(async (req, { userId }) => {
  let title: string | undefined;
  let agentId: string | undefined;
  try {
    const body = await req.json();
    title = body?.title || body?.displayName;
    agentId = body?.agentId || body?.reasoningEngineId;
  } catch {
    // Body is optional
  }

  const agentClient = new AgentRuntimeClient(agentId);
  const newSession = await agentClient.createSession(userId, title, agentId);

  return NextResponse.json({ session: newSession }, { status: 201 });
});
