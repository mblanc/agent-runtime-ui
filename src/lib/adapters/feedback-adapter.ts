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
