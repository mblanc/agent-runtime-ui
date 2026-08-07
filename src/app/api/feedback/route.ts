import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { AgentRuntimeClient } from "@/lib/agent-runtime-client";
import { AgentFeedbackRequest, FeedbackType } from "@/types/agent";

export const runtime = "nodejs";

const VALID_FEEDBACK_TYPES: Set<FeedbackType> = new Set([
  "THUMBS_UP",
  "THUMBS_DOWN",
  "FEEDBACK_TYPE_UNSPECIFIED",
]);

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to submit feedback." },
        { status: 401 }
      );
    }

    let body: Partial<AgentFeedbackRequest>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid request payload. Expected JSON body." },
        { status: 400 }
      );
    }

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Invalid request payload. Expected JSON object." },
        { status: 400 }
      );
    }

    if (!body.sessionId || typeof body.sessionId !== "string" || !body.sessionId.trim()) {
      return NextResponse.json(
        { error: "Missing or invalid required field: sessionId." },
        { status: 400 }
      );
    }

    if (
      !body.feedbackType ||
      !VALID_FEEDBACK_TYPES.has(body.feedbackType as FeedbackType)
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid feedbackType. Expected THUMBS_UP, THUMBS_DOWN, or FEEDBACK_TYPE_UNSPECIFIED.",
        },
        { status: 400 }
      );
    }

    const feedbackRequest: AgentFeedbackRequest = {
      sessionId: body.sessionId.trim(),
      feedbackType: body.feedbackType as FeedbackType,
      ...(body.eventId && typeof body.eventId === "string"
        ? { eventId: body.eventId.trim() }
        : {}),
      ...(body.feedbackText && typeof body.feedbackText === "string"
        ? { feedbackText: body.feedbackText.trim() }
        : {}),
      ...(Array.isArray(body.feedbackLabels)
        ? { feedbackLabels: body.feedbackLabels.filter((l) => typeof l === "string") }
        : {}),
    };

    const agentClient = new AgentRuntimeClient();
    const result = await agentClient.submitFeedback(feedbackRequest, session.user.id);

    return NextResponse.json(result, { status: 200 });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Internal server error";
    console.error("Error in POST /api/feedback:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
