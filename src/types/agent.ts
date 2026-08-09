export interface GcsFileDataPart {
  file_data: {
    file_uri: string;
    mime_type: string;
  };
}

export interface AgentMessagePart {
  text?: string;
  thought?: boolean;
  file_data?: {
    file_uri: string;
    mime_type: string;
  };
  fileData?: {
    file_uri?: string;
    fileUri?: string;
    mime_type?: string;
    mimeType?: string;
  };
  image?: string;
  file?: {
    filename?: string;
    data: string;
    mimeType: string;
  };
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  functionResponse?: {
    id?: string;
    name: string;
    response: Record<string, unknown>;
  };
  function_call?: {
    id?: string;
    name: string;
    args: Record<string, unknown>;
  };
  function_response?: {
    id?: string;
    name: string;
    response: Record<string, unknown>;
  };
}

export interface PresignFileRequest {
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface PresignBatchRequest {
  files: PresignFileRequest[];
}

export interface PresignedUploadItem {
  fileId: string;
  filename: string;
  contentType: string;
  uploadUrl: string; // HTTP PUT signed URL (Expires in 5m)
  readUrl: string; // HTTP GET signed URL for UI rendering
  gcsUri: string; // gs://bucket/users/{userId}/{fileId}-{filename}
}

export interface PresignBatchResponse {
  uploads: PresignedUploadItem[];
}

export interface SignedReadResponse {
  readUrl: string;
}

export interface AgentMessage {
  role: "user" | "model" | "assistant" | "system";
  parts: AgentMessagePart[];
}

export interface SubAgentExecution {
  id: string;
  agentName: string;
  displayName: string;
  role?: string;
  status: "running" | "complete" | "error";
  callInput?: string | Record<string, unknown>;
  content?: string;
  thought?: string;
  timestamp?: string;
  nodePath?: string;
  durationSeconds?: number;
}

export interface AgentStreamEvent {
  event_type?:
    | "content"
    | "thought"
    | "agent_call"
    | "agent_response"
    | "tool_call"
    | "tool_result"
    | "error"
    | "done";
  author?: string;
  content?: string;
  thought?: string;
  agent_call?: {
    agent: string;
    displayName?: string;
    input?: unknown;
  };
  agent_response?: {
    agent: string;
    displayName?: string;
    response: string;
  };
  tool_call?: {
    id?: string;
    name: string;
    args: Record<string, unknown>;
    status?: "running" | "complete" | "incomplete" | "requires-action";
    requires_confirmation?: boolean;
    requires_action?: boolean;
  };
  tool_result?: {
    id?: string;
    name: string;
    result: Record<string, unknown>;
  };
  error?: string;
}

export interface AgentSession {
  id: string;
  name: string;
  userId: string;
  title: string;
  createTime: string;
  updateTime: string;
  expireTime?: string;
  ttl?: string;
}

export interface AgentSessionEvent {
  id: string;
  name?: string;
  sessionId: string;
  createTime: string;
  role: "user" | "assistant" | "model" | "system";
  author?: string;
  invocationId?: string;
  content: string;
  thought?: string;
  subAgents?: SubAgentExecution[];
  tool_calls?: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
  tool_results?: Array<{
    name: string;
    result: Record<string, unknown>;
  }>;
  tool_call?: {
    name: string;
    args: Record<string, unknown>;
  };
  tool_result?: {
    name: string;
    result: Record<string, unknown>;
  };
  rawEvent?: Record<string, unknown>;
}

export interface DeployedAgent {
  id: string; // e.g. "4567890123456789012" or "mock-arch-advisor"
  resourceName: string; // "projects/{project}/locations/{location}/reasoningEngines/{id}"
  displayName: string; // e.g. "ADK Architecture Advisor"
  description?: string; // e.g. "Specialized in cloud architecture patterns and security"
  location: string; // e.g. "us-central1", "europe-west4"
  createTime?: string;
  updateTime?: string;
  model?: string; // e.g. "gemini-2.5-flash", "gemini-2.5-pro"
  isDefault?: boolean;
}

export interface ListAgentsResponse {
  agents: DeployedAgent[];
  activeAgentId: string;
}

export type GeminiModelTier = "flash" | "pro";

export interface ChatRequestBody {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    parts?: AgentMessagePart[];
  }>;
  sessionId?: string;
  modelTier?: GeminiModelTier;
  reasoningEngineId?: string;
  location?: string;
}

export type FeedbackType = "THUMBS_UP" | "THUMBS_DOWN" | "FEEDBACK_TYPE_UNSPECIFIED";

export interface AgentFeedbackRequest {
  sessionId: string;
  eventId?: string;
  feedbackType: FeedbackType;
  feedbackText?: string;
  feedbackLabels?: string[];
}

export interface AgentFeedbackResponse {
  name: string;
  createTime: string;
  feedbackType: FeedbackType;
}
