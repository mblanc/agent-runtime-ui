import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { AgentRuntimeClient } from "@/lib/agent-runtime-client";
import { ChatRequestBody } from "@/types/agent";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized. Please sign in to use Agent Runtime UI.",
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const body: ChatRequestBody = await req.json();

    if (!body.messages || !Array.isArray(body.messages)) {
      return new Response(JSON.stringify({ error: "Invalid messages array" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userId = session.user.id;
    const customEngineId =
      req.headers.get("x-reasoning-engine-id") || body.reasoningEngineId;
    const agentClient = new AgentRuntimeClient(customEngineId);

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
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    console.error("API Chat route error:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
