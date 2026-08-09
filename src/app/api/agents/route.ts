import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AgentRuntimeClient } from "@/lib/agent-runtime-client";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to list agents." },
        { status: 401 }
      );
    }

    const agentClient = new AgentRuntimeClient();
    const result = await agentClient.listReasoningEngines();

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
      },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    console.error("Error in GET /api/agents:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
