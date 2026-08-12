export interface GcsFileDataPart {
  file_data: {
    file_uri: string;
    mime_type: string;
  };
}

export interface BaseAgentMessagePart {
  type?:
    | "text"
    | "reasoning"
    | "file_data"
    | "image"
    | "file"
    | "function_call"
    | "function_response";
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
  filename?: string;
  file?: {
    filename?: string;
    data: string;
    mimeType?: string;
    mime_type?: string;
  };
  functionCall?: {
    id?: string;
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

export interface AgentTextPart extends BaseAgentMessagePart {
  type?: "text";
  text: string;
}

export interface AgentReasoningPart extends BaseAgentMessagePart {
  type?: "reasoning";
  text: string;
  thought: boolean;
}

export interface AgentFileDataPart extends BaseAgentMessagePart {
  type?: "file_data";
  file_data: {
    file_uri: string;
    mime_type: string;
  };
}

export interface AgentImagePart extends BaseAgentMessagePart {
  type?: "image";
  image: string;
}

export interface AgentFileBlobPart extends BaseAgentMessagePart {
  type?: "file";
  file: {
    filename?: string;
    data: string;
    mimeType?: string;
    mime_type?: string;
  };
}

export interface AgentFunctionCallPart extends BaseAgentMessagePart {
  type?: "function_call";
  function_call: {
    id?: string;
    name: string;
    args: Record<string, unknown>;
  };
}

export interface AgentFunctionResponsePart extends BaseAgentMessagePart {
  type?: "function_response";
  function_response: {
    id?: string;
    name: string;
    response: Record<string, unknown>;
  };
}

export type AgentMessagePart = BaseAgentMessagePart;

export function isTextPart(part: AgentMessagePart): part is AgentTextPart {
  return typeof part.text === "string" && !part.thought;
}

export function isReasoningPart(part: AgentMessagePart): part is AgentReasoningPart {
  return part.thought === true;
}

export function isFileDataPart(part: AgentMessagePart): part is AgentFileDataPart {
  return Boolean(part.file_data || part.fileData);
}

export function isImagePart(part: AgentMessagePart): part is AgentImagePart {
  return typeof part.image === "string";
}

export function isFunctionCallPart(
  part: AgentMessagePart
): part is AgentFunctionCallPart {
  return Boolean(part.function_call || part.functionCall);
}

export function isFunctionResponsePart(
  part: AgentMessagePart
): part is AgentFunctionResponsePart {
  return Boolean(part.function_response || part.functionResponse);
}

export function normalizeAgentMessagePart(
  raw: Record<string, unknown>
): AgentMessagePart {
  if (
    typeof raw.text === "string" &&
    !raw.function_call &&
    !raw.functionCall &&
    !raw.file_data &&
    !raw.fileData
  ) {
    if (raw.thought === true) {
      return { type: "reasoning", text: raw.text, thought: true };
    }
    return { type: "text", text: raw.text };
  }

  const fnCall = (raw.function_call || raw.functionCall) as
    Record<string, unknown> | undefined;
  if (fnCall) {
    const callData = {
      id: (fnCall.id as string) || (raw.id as string),
      name: String(fnCall.name || "tool"),
      args: (fnCall.args as Record<string, unknown>) || {},
    };
    return {
      type: "function_call",
      function_call: callData,
      functionCall: callData,
    };
  }

  const fnResp = (raw.function_response || raw.functionResponse) as
    Record<string, unknown> | undefined;
  if (fnResp) {
    const respData = {
      id: (fnResp.id as string) || (raw.id as string),
      name: String(fnResp.name || "tool"),
      response: (fnResp.response as Record<string, unknown>) || {},
    };
    return {
      type: "function_response",
      function_response: respData,
      functionResponse: respData,
    };
  }

  const fileData = (raw.file_data || raw.fileData) as Record<string, unknown> | undefined;
  if (fileData) {
    const file_uri = String(fileData.file_uri || fileData.fileUri || "");
    const mime_type = String(
      fileData.mime_type || fileData.mimeType || "application/octet-stream"
    );
    return {
      type: "file_data",
      file_data: { file_uri, mime_type },
    };
  }

  if (typeof raw.image === "string") {
    return { type: "image", image: raw.image };
  }

  return { type: "text", text: String(raw.text || JSON.stringify(raw)) };
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
  content?: string;
  parts?: AgentMessagePart[];
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
  eventId?: string;
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
  retrieved_memories?: MemoryRetrievalItem[];
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

export interface AgentRunConfig {
  streaming_mode?: "sse" | "none" | "bidi" | string;
  streamingMode?: "sse" | "none" | "bidi" | string;
  max_llm_calls?: number;
  support_cfc?: boolean;
  [key: string]: unknown;
}

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
  streamingMode?: "sse" | "none" | "bidi";
  runConfig?: AgentRunConfig;
}

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

export type MemoryTopic =
  | "user_preferences"
  | "user_personal_info"
  | "key_conversation_details"
  | "explicit_instructions"
  | "coding_preferences"
  | "enterprise_context"
  | "communication_style"
  | "general"
  | (string & {});

export interface AgentMemory {
  id: string; // e.g. "mem-1" or "projects/.../locations/.../reasoningEngines/.../memories/1"
  userId: string;
  fact: string;
  topic?: MemoryTopic;
  createTime: string;
  updateTime: string;
  lastUsedTime?: string;
  confidenceScore?: number;
  sourceSessionId?: string;
}

export interface MemoryRetrievalItem {
  id: string;
  fact: string;
  topic?: string;
  relevanceScore: number;
}

export interface AgentMemoryListResponse {
  memories: AgentMemory[];
  totalCount: number;
}

export interface CreateMemoryRequest {
  fact: string;
  topic?: string;
}

export interface UpdateMemoryRequest {
  fact: string;
  topic?: string;
}

export interface GenerateMemoriesRequest {
  sessionId: string;
}

export interface GenerateMemoriesResponse {
  extractedCount: number;
  memories: AgentMemory[];
}
