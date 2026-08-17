export type FeedbackType = "THUMBS_UP" | "THUMBS_DOWN" | "FEEDBACK_TYPE_UNSPECIFIED";

export interface AgentFeedbackRequest {
  sessionId: string;
  eventId?: string;
  feedbackType: FeedbackType;
  feedbackText?: string;
  feedbackLabels?: string[];
  reasoningEngineId?: string;
  location?: string;
}

export interface AgentFeedbackResponse {
  name: string;
  createTime: string;
  feedbackType: FeedbackType;
}
