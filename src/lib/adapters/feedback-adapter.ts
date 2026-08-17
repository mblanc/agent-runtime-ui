import { type FeedbackAdapter } from "@assistant-ui/react";
import type { FeedbackType } from "@/types/agent";

export function createGeminiFeedbackAdapter(
  getSessionId?: () => string | undefined,
  getAgentId?: () => string | undefined,
  getLocation?: () => string | undefined
): FeedbackAdapter {
  return {
    submit: async ({ message, type }) => {
      const feedbackType: FeedbackType =
        type === "positive" ? "THUMBS_UP" : "THUMBS_DOWN";
      const sessionId = getSessionId?.() || "default";
      // Not `AgentTarget`/`withAgentTarget`: the feedback route reads the target
      // out of the typed `AgentFeedbackRequest` body, where the agent id is
      // spelled `reasoningEngineId`, and never off the query string.
      const reasoningEngineId = getAgentId?.();
      const location = getLocation?.();

      const customMeta = (message.metadata as Record<string, unknown> | undefined)
        ?.custom as Record<string, unknown> | undefined;
      const eventId =
        (typeof customMeta?.eventId === "string" ? customMeta.eventId : undefined) ||
        message.id;

      try {
        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            eventId,
            feedbackType,
            ...(reasoningEngineId ? { reasoningEngineId } : {}),
            ...(location ? { location } : {}),
          }),
        });

        // Logged, not thrown (so no `throwIfNotOk`): a lost thumbs-up must not
        // surface as an error in the thread the user was reading.
        if (!response.ok) {
          const errText = await response.text();
          console.error(
            `[createGeminiFeedbackAdapter] Feedback submission failed (${response.status}):`,
            errText
          );
        }
      } catch (err: unknown) {
        console.error(
          "[createGeminiFeedbackAdapter] Network error submitting feedback:",
          err
        );
      }
    },
  };
}

export const geminiFeedbackAdapter = createGeminiFeedbackAdapter();
