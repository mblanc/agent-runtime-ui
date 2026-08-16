import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { createAgentRuntimeProvider } from "@/lib/agent-runtime/factory";

export const runtime = "nodejs";

export const GET = withAuth(async (req, { userId, userEmail }) => {
  const agentId =
    req.nextUrl.searchParams.get("agentId") ||
    req.nextUrl.searchParams.get("reasoningEngineId") ||
    undefined;
  const location = req.nextUrl.searchParams.get("location") || undefined;

  const provider = createAgentRuntimeProvider(agentId, location);
  const sessions = await provider.listSessions(userId, userEmail, agentId);

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
  let location: string | undefined;
  try {
    const body = await req.json();
    title = body?.title || body?.displayName;
    agentId = body?.agentId || body?.reasoningEngineId;
    location = body?.location;
  } catch {
    // Body is optional
  }

  const provider = createAgentRuntimeProvider(agentId, location);
  const newSession = await provider.createSession(userId, title, agentId);

  return NextResponse.json({ session: newSession }, { status: 201 });
});
