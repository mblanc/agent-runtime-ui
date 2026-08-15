import { AgentFeedbackRequest, AgentFeedbackResponse, FeedbackType } from "@/types/agent";
import { VertexAiContext } from "./context";
import { VertexAiSessionService } from "./session-service";
import { extractSessionIdFromResourceName } from "../event-normalizer";

export class VertexAiFeedbackService {
  constructor(
    private context: VertexAiContext,
    private sessionService: VertexAiSessionService
  ) {}

  getFeedbackBaseUrl(
    sessionId?: string,
    customEngineId?: string,
    customLocation?: string
  ): string {
    if (sessionId?.startsWith("projects/")) {
      const match = sessionId.match(
        /^projects\/([^/]+)\/locations\/([^/]+)\/reasoningEngines\/([^/]+)/
      );
      if (match) {
        const [, proj, rawLoc, engine] = match;
        // `sessionId` is client-supplied, so its location segment reaches the host.
        const loc = this.context.resolveLocation(rawLoc);
        return `https://${loc}-aiplatform.googleapis.com/v1beta1/projects/${proj}/locations/${loc}/reasoningEngines/${engine}/feedbackEntries`;
      }
    }

    const targetEngine = customEngineId || this.context.reasoningEngineId;
    let loc = this.context.resolveLocation(customLocation);
    if (targetEngine.startsWith("projects/")) {
      const match = targetEngine.match(/^projects\/[^/]+\/locations\/([^/]+)\//);
      if (match && match[1]) loc = this.context.resolveLocation(match[1]);
    }
    return `https://${loc}-aiplatform.googleapis.com/v1beta1/${this.context.getNormalizedEngineResource(targetEngine, loc)}/feedbackEntries`;
  }

  async submitFeedback(
    request: AgentFeedbackRequest,
    userId: string
  ): Promise<AgentFeedbackResponse> {
    try {
      const endpoint = this.getFeedbackBaseUrl(
        request.sessionId,
        request.reasoningEngineId,
        request.location
      );
      const cleanSessionId =
        extractSessionIdFromResourceName(request.sessionId) || request.sessionId;

      let resolvedEventId = request.eventId;
      const isPlaceholder =
        resolvedEventId &&
        (/^\d+$/.test(resolvedEventId) ||
          resolvedEventId.startsWith("m-") ||
          resolvedEventId.startsWith("msg-") ||
          resolvedEventId.startsWith("local-"));

      if (isPlaceholder && cleanSessionId) {
        try {
          const events = await this.sessionService.listSessionEvents(
            cleanSessionId,
            request.reasoningEngineId,
            request.location
          );
          const matchBySegment = events.find(
            (e) =>
              e.name?.endsWith(`/${resolvedEventId}`) ||
              e.name?.includes(`/events/${resolvedEventId}`)
          );
          if (matchBySegment?.id) {
            resolvedEventId = matchBySegment.id;
          } else {
            const assistantTurns = events.filter(
              (e) => e.role === "assistant" && e.id && !/^\d+$/.test(e.id)
            );
            if (assistantTurns.length > 0) {
              resolvedEventId = assistantTurns[assistantTurns.length - 1].id;
            }
          }
        } catch {
          // continue with original ID
        }
      }

      const payload: Record<string, unknown> = {
        sessionId: cleanSessionId,
        feedbackType: request.feedbackType,
        userId: userId,
        source: "Agent Runtime UI",
        ...(resolvedEventId ? { eventId: resolvedEventId } : {}),
        ...(request.feedbackText ? { feedbackText: request.feedbackText } : {}),
        ...(request.feedbackLabels?.length
          ? { feedbackLabels: request.feedbackLabels }
          : {}),
      };

      const response = await this.context.fetchWithAuth(endpoint, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(
          `Failed to submit feedback to Vertex AI (${response.status}): ${errText}`
        );
      }

      const raw = (await response.json()) as Record<string, unknown>;
      return {
        name:
          (raw.name as string) ||
          `projects/${this.context.projectId}/locations/${this.context.location}/reasoningEngines/${this.context.reasoningEngineId}/feedbackEntries/feedback-${Date.now()}`,
        createTime:
          (raw.createTime as string) ||
          (raw.create_time as string) ||
          new Date().toISOString(),
        feedbackType:
          (raw.feedbackType as FeedbackType) ||
          (raw.feedback_type as FeedbackType) ||
          request.feedbackType,
      };
    } catch (err: unknown) {
      console.error("Error submitting feedback to Agent Runtime:", err);
      throw err;
    }
  }
}
