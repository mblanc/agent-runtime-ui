import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { createAgentRuntimeProvider } from "@/lib/agent-runtime/factory";
import { isLocalSessionId } from "@/lib/agent-runtime/event-utils";
import { requireSessionOwner } from "@/lib/session-ownership";
import { AgentFeedbackRequest, AgentTarget, FeedbackType } from "@/types/agent";

export const runtime = "nodejs";

const VALID_FEEDBACK_TYPES: Set<FeedbackType> = new Set([
  "THUMBS_UP",
  "THUMBS_DOWN",
  "FEEDBACK_TYPE_UNSPECIFIED",
]);

export const POST = withAuth(async (req, { userId, userEmail }) => {
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
    ...(body.reasoningEngineId && typeof body.reasoningEngineId === "string"
      ? { reasoningEngineId: body.reasoningEngineId.trim() }
      : {}),
    ...(body.location && typeof body.location === "string"
      ? { location: body.location.trim() }
      : {}),
  };

  const target: AgentTarget = {
    agentId: feedbackRequest.reasoningEngineId,
    location: feedbackRequest.location,
  };
  const provider = createAgentRuntimeProvider(target.agentId, target.location);

  if (feedbackRequest.sessionId && !isLocalSessionId(feedbackRequest.sessionId)) {
    const ownership = await requireSessionOwner({
      provider,
      sessionId: feedbackRequest.sessionId,
      target,
      userId,
      userEmail,
      onUnowned: "forbidden",
      onMissing: "allow",
    });
    if (ownership instanceof NextResponse) return ownership;
  }

  const result = await provider.submitFeedback(feedbackRequest, userId);

  return NextResponse.json(result, { status: 200 });
});
