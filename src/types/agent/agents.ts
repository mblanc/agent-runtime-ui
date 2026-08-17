import type { AgentMessagePart } from "./message-parts";
import type { ReasoningTraceEntry, SubAgentExecution } from "./messages";
import type { GroundingMetadata } from "./grounding";
import type { AgentActionsDelta, AgentNodeInfo, AgentUsageMetadata } from "./metadata";

/**
 * Which agent, in which region, a request is addressed to.
 *
 * Both halves travel together everywhere: an agent id that is a bare id rather
 * than a full `projects/.../locations/.../reasoningEngines/...` resource carries
 * no region, so dropping `location` silently routes the call to the default
 * region's host. Keeping them in one value is what stops a caller from
 * remembering one and forgetting the other.
 */
export interface AgentTarget {
  agentId?: string;
  location?: string;
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
