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

    const body: ChatRequestBody = await req.json();

    if (!body.messages || !Array.isArray(body.messages)) {
      return new Response(JSON.stringify({ error: "Invalid messages array" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const userId = session?.user?.id || "anonymous-dev-user";
    const agentClient = new AgentRuntimeClient();

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          for await (const event of agentClient.streamQuery(body, userId)) {
            const chunk = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (err: unknown) {
          const errorMessage =
            err instanceof Error ? err.message : "Streaming error occurred";
          const errChunk = `data: ${JSON.stringify({
            event_type: "error",
            error: errorMessage,
          })}\n\n`;
          controller.enqueue(encoder.encode(errChunk));
        } finally {
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
