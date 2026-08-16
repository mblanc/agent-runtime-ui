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
  grounding_metadata?: GroundingMetadata;
  groundingMetadata?: GroundingMetadata;
  thought_signature?: string;
  thoughtSignature?: string;
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

/**
 * One entry of an assistant turn's thinking trace, as data.
 *
 * The trace is produced twice — live in `adapters/chat-adapter.ts` and on
 * history replay in `agent-runtime/group-turns.ts` — and consumed once, by
 * `components/assistant-ui/reasoning.tsx`. It used to travel between them as a
 * `:::tool[name]{status="..."}` markdown string that the consumer regex-parsed
 * back into blocks. That round-trip is why model-supplied names and bodies had
 * to be escaped at all: a `]` in a name or a line of `:::` in a tool result
 * could close a block early. Carrying the entries themselves removes the parse,
 * and with it the entire class of bug.
 *
 * The string form still exists — see `agent-runtime/reasoning-directives.ts` —
 * because sessions persisted before this type did contain only the string, and
 * because the presence of a `reasoning` content part is what makes assistant-ui
 * render the Thinking Process panel at all. The consumer prefers the array when
 * it has one and parses the string when it does not.
 *
 * `argsJson`/`resultJson` are pre-serialised rather than raw values: what the
 * UI shows is pretty-printed JSON, and both producers already had it in that
 * form. Keeping them as strings avoids re-deciding formatting in the renderer.
 */
export type ReasoningTraceEntry =
  | { type: "thought"; text: string }
  | {
      type: "tool";
      /**
       * The id the tool-call panel pairs on. The trace used to be keyed by tool
       * name alone, so two parallel calls to one tool had both results land on
       * whichever block was pushed last. It is also the render key, so a block
       * keeps its identity across streaming yields.
       */
      toolCallId: string;
      toolName: string;
      /** Pretty-printed JSON; absent for a result that arrived without its call. */
      argsJson?: string;
      resultJson?: string;
      status: "running" | "requires-action" | "complete";
    }
  | {
      type: "subagent";
      agentName: string;
      displayName: string;
      /** Pretty-printed JSON input; absent on the history-replay path. */
      input?: string;
      response?: string;
      status: "running" | "complete";
      /** Source event id, present only on history replay. */
      id?: string;
    };

export interface WebGroundingChunk {
  uri: string; // e.g. "https://vertexaisearch.cloud.google.com/..."
  title: string; // e.g. "Google Cloud Documentation"
  domain?: string; // extracted e.g. "cloud.google.com"
}

export interface RetrievedContextChunk {
  uri: string; // e.g. "gs://my-corp-bucket/policies/q3-security.pdf"
  title: string;
  text?: string;
  ragCorpusId?: string;
  confidenceScore?: number;
}

export interface GroundingChunk {
  web?: WebGroundingChunk;
  retrievedContext?: RetrievedContextChunk;
}

export interface GroundingSupport {
  groundingChunkIndices: number[];
  confidenceScores?: number[];
  segment?: {
    startIndex: number;
    endIndex: number;
    text: string;
  };
}

export interface SearchEntryPoint {
  renderedContent?: string; // HTML and CSS snippet provided by Google Search Grounding API
  rendered_content?: string;
  sdkBlob?: string;
  sdk_blob?: string;
}

export interface GroundingMetadata {
  webSearchQueries?: string[];
  groundingChunks?: GroundingChunk[];
  groundingSupports?: GroundingSupport[];
  searchEntryPoint?: SearchEntryPoint;
  retrievalQueries?: string[];
}

export interface UsageMetadataTokenDetail {
  modality: string;
  token_count?: number;
  tokenCount?: number;
}

export type TokenModalityDetail = UsageMetadataTokenDetail;

export interface ContextCacheSavingsMetrics {
  cachedTokens: number;
  promptTokens: number;
  totalTokens: number;
  cacheHitRatio: number; // e.g. 0.75 for 75%
  estimatedCostReductionPercent: number; // e.g. 75% for Gemini Flash cache discount
  isCached: boolean;
}

export type SessionStateValue =
  | string
  | number
  | boolean
  | null
  | SessionStateValue[]
  | { [key: string]: SessionStateValue };

export type SessionStateMap = Record<string, SessionStateValue>;

export interface SessionStateDeltaItem {
  key: string;
  previousValue?: SessionStateValue;
  newValue: SessionStateValue;
  action: "added" | "updated" | "deleted";
}

export interface SessionStateResponse {
  sessionId: string;
  state: SessionStateMap;
  updateTime?: string;
}

export interface UpdateSessionStateRequest {
  state: SessionStateMap;
  mode?: "merge" | "replace";
}

export interface AgentUsageMetadata {
  prompt_token_count?: number;
  promptTokenCount?: number;
  candidates_token_count?: number;
  candidatesTokenCount?: number;
  thoughts_token_count?: number;
  thoughtsTokenCount?: number;
  cached_content_token_count?: number;
  cachedContentTokenCount?: number;
  cached_token_count?: number;
  cachedTokenCount?: number;
  total_token_count?: number;
  totalTokenCount?: number;
  traffic_type?: "ON_DEMAND" | "PROVISIONED" | string;
  trafficType?: "ON_DEMAND" | "PROVISIONED" | string;
  prompt_tokens_details?: UsageMetadataTokenDetail[];
  promptTokensDetails?: UsageMetadataTokenDetail[];
  candidates_tokens_details?: UsageMetadataTokenDetail[];
  candidatesTokensDetails?: UsageMetadataTokenDetail[];
  cached_tokens_details?: UsageMetadataTokenDetail[];
  cachedTokensDetails?: UsageMetadataTokenDetail[];
}

export type UsageMetadata = AgentUsageMetadata;

export interface AgentNodeInfo {
  path?: string;
  output_for?: string | string[];
  outputFor?: string | string[];
  [key: string]: unknown;
}

export interface AgentActionsDelta {
  state_delta?: SessionStateMap;
  stateDelta?: SessionStateMap;
  artifact_delta?: Record<string, unknown>;
  artifactDelta?: Record<string, unknown>;
  requested_auth_configs?: Record<string, unknown>;
  requestedAuthConfigs?: Record<string, unknown>;
  requested_tool_confirmations?: Record<string, unknown>;
  requestedToolConfirmations?: Record<string, unknown>;
}

export interface AgentMessageInfoMetadata {
  eventId?: string;
  event_id?: string;
  id?: string;
  invocationId?: string;
  invocation_id?: string;
  modelVersion?: string;
  model_version?: string;
  usageMetadata?: AgentUsageMetadata;
  usage_metadata?: AgentUsageMetadata;
  avgLogprobs?: number;
  avg_logprobs?: number;
  nodeInfo?: AgentNodeInfo;
  node_info?: AgentNodeInfo;
  nodePath?: string;
  node_path?: string;
  thoughtSignature?: string;
  thought_signature?: string;
  actions?: AgentActionsDelta;
  finishReason?: string;
  finish_reason?: string;
  timestamp?: number | string;
  [key: string]: unknown;
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
  invocation_id?: string;
  invocationId?: string;
  model_version?: string;
  modelVersion?: string;
  content?: string;
  thought?: string;
  thought_signature?: string;
  thoughtSignature?: string;
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
  grounding_metadata?: GroundingMetadata;
  groundingMetadata?: GroundingMetadata;
  usage_metadata?: AgentUsageMetadata;
  usageMetadata?: AgentUsageMetadata;
  avg_logprobs?: number;
  avgLogprobs?: number;
  node_info?: AgentNodeInfo;
  nodeInfo?: AgentNodeInfo;
  node_path?: string;
  nodePath?: string;
  actions?: AgentActionsDelta;
  finish_reason?: string;
  finishReason?: string;
  timestamp?: number | string;
  partial?: boolean;
  turn_complete?: boolean;
  turnComplete?: boolean;
  interrupted?: boolean;
  error?: string;
}

export interface AgentSession {
  id: string;
  name: string;
  /**
   * The owner, or null when the backend did not report one. Null must never be
   * read as "owned by the caller" — see `isSessionOwnedBy`, which denies it.
   */
  userId: string | null;
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
  invocation_id?: string;
  modelVersion?: string;
  model_version?: string;
  content: string;
  thought?: string;
  /**
   * The same trace as `thought`, as data rather than directive markdown. Both
   * are emitted: `thought` for clients that only know the string form, this for
   * the renderer, which parses nothing when it is present.
   */
  reasoningTrace?: ReasoningTraceEntry[];
  thoughtSignature?: string;
  thought_signature?: string;
  subAgents?: SubAgentExecution[];
  tool_calls?: Array<{
    id?: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  tool_results?: Array<{
    id?: string;
    name: string;
    result: Record<string, unknown>;
  }>;
  // `id` mirrors the plural `tool_calls`/`tool_results` above. Omitting it here
  // left the union returned by getEventToolCalls/getEventToolResults without an
  // id, which is why replay could only pair calls to results by name.
  tool_call?: {
    id?: string;
    name: string;
    args: Record<string, unknown>;
  };
  tool_result?: {
    id?: string;
    name: string;
    result: Record<string, unknown>;
  };
  grounding_metadata?: GroundingMetadata;
  groundingMetadata?: GroundingMetadata;
  usageMetadata?: AgentUsageMetadata;
  usage_metadata?: AgentUsageMetadata;
  avgLogprobs?: number;
  avg_logprobs?: number;
  nodeInfo?: AgentNodeInfo;
  node_info?: AgentNodeInfo;
  nodePath?: string;
  node_path?: string;
  actions?: AgentActionsDelta;
  finishReason?: string;
  finish_reason?: string;
  timestamp?: number | string;
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
