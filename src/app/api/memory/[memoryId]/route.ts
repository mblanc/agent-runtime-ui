import { NextResponse } from "next/server";
import { withAuthDynamic } from "@/lib/api-handler";
import { createAgentRuntimeProvider } from "@/lib/agent-runtime/factory";

export const runtime = "nodejs";

interface MemoryParams extends Record<string, string> {
  memoryId: string;
}

export const PATCH = withAuthDynamic<MemoryParams>(async (req, { userId, params }) => {
  const memoryId = params?.memoryId;

  if (!memoryId) {
    return NextResponse.json({ error: "Memory ID is required" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const fact = body?.fact;
  const topic = body?.topic;

  if (fact !== undefined && (typeof fact !== "string" || !fact.trim())) {
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

  try {
    const provider = createAgentRuntimeProvider(agentId, location);
    const updated = await provider.updateMemory(
      userId,
      memoryId,
      fact ? fact.trim() : "",
      topic !== undefined ? String(topic).trim() : undefined,
      agentId,
      location
    );

    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to update memory";
    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    if (message.includes("Unauthorized")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    throw err;
  }
});

export const DELETE = withAuthDynamic<MemoryParams>(async (req, { userId, params }) => {
  const memoryId = params?.memoryId;

  if (!memoryId) {
    return NextResponse.json({ error: "Memory ID is required" }, { status: 400 });
  }

  const agentId =
    req.nextUrl.searchParams.get("agentId") ||
    req.nextUrl.searchParams.get("reasoningEngineId") ||
    undefined;
  const location = req.nextUrl.searchParams.get("location") || undefined;

  try {
    const provider = createAgentRuntimeProvider(agentId, location);
    await provider.deleteMemory(userId, memoryId, agentId, location);

    return NextResponse.json({
      success: true,
      deletedId: memoryId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to delete memory";
    if (message.includes("Unauthorized")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    throw err;
  }
});
