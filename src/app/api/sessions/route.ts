import { NextResponse } from "next/server";
import { NO_STORE_HEADERS, resolveAgentTarget, withAuth } from "@/lib/api-handler";
import { createAgentRuntimeProvider } from "@/lib/agent-runtime/factory";

export const runtime = "nodejs";

export const GET = withAuth(async (req, { userId, userEmail }) => {
  const { agentId, location } = resolveAgentTarget(req);

  const provider = createAgentRuntimeProvider(agentId, location);
  const sessions = await provider.listSessions(userId, userEmail, agentId);

  return NextResponse.json({ sessions }, { headers: NO_STORE_HEADERS });
});

// Body-only by design, so no `resolveAgentTarget`: this route has never read the
// target off the query string, and the title it parses out of the same body
// makes the parse worth keeping in one place.
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
