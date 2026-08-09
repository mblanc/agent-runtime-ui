import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { AgentRuntimeClient } from "@/lib/agent-runtime-client";

export const runtime = "nodejs";

export const GET = withAuth(async () => {
  const agentClient = new AgentRuntimeClient();
  const result = await agentClient.listReasoningEngines();

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
    },
  });
});
