import { NextResponse } from "next/server";
import { NO_STORE_HEADERS, withAuth } from "@/lib/api-handler";
import { createAgentRuntimeProvider } from "@/lib/agent-runtime/factory";

export const runtime = "nodejs";

export const GET = withAuth(async () => {
  const provider = createAgentRuntimeProvider();
  const result = await provider.listAgents();

  return NextResponse.json(result, { headers: NO_STORE_HEADERS });
});
