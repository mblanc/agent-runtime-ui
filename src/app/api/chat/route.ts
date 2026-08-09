import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { AgentRuntimeClient } from "@/lib/agent-runtime-client";
import { ChatRequestBody } from "@/types/agent";

export const runtime = "nodejs";

export const POST = withAuth(async (req, { userId }) => {
  const body: ChatRequestBody = await req.json();

  if (!body.messages || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "Invalid messages array" }, { status: 400 });
  }

  const customEngineId =
    req.headers.get("x-reasoning-engine-id") || body.reasoningEngineId;
  const customLocation = req.headers.get("x-location") || body.location;
  const agentClient = new AgentRuntimeClient(customEngineId, customLocation);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      console.log(
        "[/api/chat] Starting stream for sessionId:",
        body.sessionId,
        "user:",
        userId
      );

      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          // Stream closed
        }
      }, 2000);

      try {
        for await (const event of agentClient.streamQuery(body, userId)) {
          console.log("[/api/chat] Yielding event:", event.event_type);
          const chunk = `data: ${JSON.stringify(event)}\n\n`;
          controller.enqueue(encoder.encode(chunk));
        }
        console.log("[/api/chat] Completed streamQuery loop normally");
      } catch (err: unknown) {
        const errorMessage =
          err instanceof Error ? err.message : "Streaming error occurred";
        console.error("[/api/chat] Stream error:", errorMessage);
        const errChunk = `data: ${JSON.stringify({
          event_type: "error",
          error: errorMessage,
        })}\n\n`;
        controller.enqueue(encoder.encode(errChunk));
      } finally {
        clearInterval(heartbeatInterval);
        console.log("[/api/chat] Controller closing stream");
        controller.close();
      }
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
