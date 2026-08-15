import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { AgentRuntimeClient } from "@/lib/agent-runtime-client";
import { isSessionOwnedBy } from "@/lib/session-ownership";
import { ChatRequestBody } from "@/types/agent";

export const runtime = "nodejs";

export const POST = withAuth(async (req, { userId, userEmail }) => {
  let body: ChatRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || !body.messages || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "Invalid messages array" }, { status: 400 });
  }

  const customEngineId =
    req.headers.get("x-reasoning-engine-id") || body.reasoningEngineId;
  const customLocation = req.headers.get("x-location") || body.location;
  const agentClient = new AgentRuntimeClient(customEngineId, customLocation);

  // Validate session ownership for non-local persisted sessions
  if (
    body.sessionId &&
    !body.sessionId.startsWith("__LOCALID_") &&
    !body.sessionId.startsWith("local-")
  ) {
    // A null result means the session does not exist upstream yet, which is the
    // legitimate new-session case and proceeds to streamQuery. A *thrown* error
    // is not: swallowing it let a transient failure of the ownership lookup
    // wave the request through unchecked, so it propagates to a 500 instead.
    const sessionDetails = await agentClient.getSession(
      body.sessionId,
      customEngineId,
      customLocation
    );
    if (sessionDetails && !isSessionOwnedBy(sessionDetails, userId, userEmail)) {
      return NextResponse.json(
        { error: "Forbidden. You do not own this session." },
        { status: 403 }
      );
    }
  }

  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let isCancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      console.log(
        "[/api/chat] Starting stream for sessionId:",
        body.sessionId,
        "user:",
        userId
      );

      heartbeatInterval = setInterval(() => {
        if (isCancelled) return;
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          // Stream closed
        }
      }, 15000);

      try {
        for await (const event of agentClient.streamQuery(body, userId)) {
          if (isCancelled) break;
          console.log("[/api/chat] Yielding event:", event.event_type);
          const chunk = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        }
        console.log("[/api/chat] Completed streamQuery loop normally");
      } catch (err: unknown) {
        if (!isCancelled) {
          const errorMessage =
            err instanceof Error ? err.message : "Streaming error occurred";
          console.error("[/api/chat] Stream error:", errorMessage);
          const errChunk = `data: ${JSON.stringify({
            event_type: "error",
            error: errorMessage,
          })}\n\n`;
          try {
            controller.enqueue(encoder.encode(errChunk));
          } catch {
            // Controller may already be closed
          }
        }
      } finally {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        console.log("[/api/chat] Controller closing stream");
        try {
          controller.close();
        } catch {
          // Ignore close error if already closed
        }
      }
    },
    cancel(reason) {
      console.log("[/api/chat] Client cancelled stream:", reason);
      isCancelled = true;
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
});
