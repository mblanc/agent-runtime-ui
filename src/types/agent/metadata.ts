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
