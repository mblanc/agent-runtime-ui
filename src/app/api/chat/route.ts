import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { createAgentRuntimeProvider } from "@/lib/agent-runtime/factory";
import { isSessionOwnedBy } from "@/lib/session-ownership";
import { ChatRequestBody } from "@/types/agent";
import { log } from "@/lib/logger";

export const runtime = "nodejs";

export const POST = withAuth(async (req, { userId, userEmail, requestId }) => {
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
  const provider = createAgentRuntimeProvider(customEngineId, customLocation);

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
    const sessionDetails = await provider.getSession(
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

  // Aborting this is what actually stops the upstream Vertex stream. Setting
  // `isCancelled` alone only ends our read loop: the generation kept running to
  // completion, billed, holding a Cloud Run request slot until it finished.
  const upstream = new AbortController();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const startedAt = Date.now();
      let eventCount = 0;
      let outcome: "complete" | "cancelled" | "error" = "complete";

      log.info({
        event: "chat.stream.start",
        requestId,
        sessionId: body.sessionId,
      });

      heartbeatInterval = setInterval(() => {
        if (isCancelled) return;
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          // Stream closed
        }
      }, 15000);

      try {
        for await (const event of provider.streamQuery(body, userId, upstream.signal)) {
          if (isCancelled) break;
          eventCount++;
          const chunk = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (err: unknown) {
        if (!isCancelled) {
          const errorMessage =
            err instanceof Error ? err.message : "Streaming error occurred";
          outcome = "error";
          log.error({
            event: "chat.stream.error",
            requestId,
            sessionId: body.sessionId,
            durationMs: Date.now() - startedAt,
            eventCount,
            message: errorMessage,
          });
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
        log.info({
          event: "chat.stream.end",
          requestId,
          sessionId: body.sessionId,
          durationMs: Date.now() - startedAt,
          eventCount,
          outcome: isCancelled ? "cancelled" : outcome,
        });
        try {
          controller.close();
        } catch {
          // Ignore close error if already closed
        }
      }
    },
    cancel(reason) {
      log.info({
        event: "chat.stream.cancelled",
        requestId,
        sessionId: body.sessionId,
        reason: String(reason ?? ""),
      });
      isCancelled = true;
      upstream.abort();
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
