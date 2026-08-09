import { type FeedbackAdapter } from "@assistant-ui/react";
import type { FeedbackType } from "@/types/agent";

export function createGeminiFeedbackAdapter(
  getSessionId?: () => string | undefined
): FeedbackAdapter {
  return {
    submit: async ({ message, type }) => {
      const feedbackType: FeedbackType =
        type === "positive" ? "THUMBS_UP" : "THUMBS_DOWN";
      const sessionId = getSessionId?.() || "default";

      try {
        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            eventId: message.id,
            feedbackType,
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
