import type { GroundingMetadata } from "./grounding";
import type { AgentActionsDelta, AgentNodeInfo, AgentUsageMetadata } from "./metadata";
import type { MemoryRetrievalItem } from "./memory";
import type {
  AgentCodeExecutionBlock,
  CodeExecutionResultData,
  ExecutableCodeData,
} from "./message-parts";
import type { ArtifactStreamPayload } from "./artifacts";

/**
 * A streaming event after normalisation, and the only stream shape that exists
 * downstream of the SSE boundary.
 *
 * Vertex AI spells its metadata in snake_case or camelCase depending on the
 * endpoint and the API version, and nests it under `config` or `raw_event` as
 * well as at the root. All of that is resolved in exactly one place —
 * `agent-runtime/sse-parser.ts`'s `normalizeEventMetadata`, which both the
 * `:streamQuery` parser and the `:query` fallback in
 * `agent-runtime/services/streaming-service.ts` go through, and which the mock
 * provider emits the shape of directly. Nothing after that point re-derives a
 * field from an alternative spelling; this interface declaring one spelling is
 * what keeps that true.
 *
 * The event carries these to the browser verbatim: `api/chat/route.ts`
 * `JSON.stringify`s whatever a provider yields, so the wire the chat adapter
 * reads is this type.
 *
 * `event_type` and the `agent_call` / `agent_response` / `tool_call` /
 * `tool_result` / `retrieved_memories` payload keys keep their snake_case
 * names. They are ours, not Vertex's — no second spelling ever existed for
 * them, so there is nothing to normalise.
 */
export interface AgentStreamEvent {
  event_type?:
    | "content"
    | "thought"
    | "agent_call"
    | "agent_response"
    | "tool_call"
    | "tool_result"
    | "executable_code"
    | "code_execution_result"
    | "artifact_created"
    | "artifact_updated"
    | "error"
    | "done";
  eventId?: string;
  author?: string;
  invocationId?: string;
  modelVersion?: string;
  content?: string;
  thought?: string;
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
  executable_code?: ExecutableCodeData;
  executableCode?: ExecutableCodeData;
  code_execution_result?: CodeExecutionResultData;
  codeExecutionResult?: CodeExecutionResultData;
  code_execution_block?: AgentCodeExecutionBlock;
  codeExecutionBlock?: AgentCodeExecutionBlock;
  retrieved_memories?: MemoryRetrievalItem[];
  groundingMetadata?: GroundingMetadata;
  artifact?: ArtifactStreamPayload;
  /**
   * Still dual-spelled *inside*: `AgentUsageMetadata` is shared with
   * `AgentSessionEvent`, which takes it straight from the Sessions REST API in
   * whichever spelling that API used. Which key an event carries it under is
   * normalised here; the token counts within it are not.
   */
  usageMetadata?: AgentUsageMetadata;
  avgLogprobs?: number;
  nodeInfo?: AgentNodeInfo;
  nodePath?: string;
  actions?: AgentActionsDelta;
  finishReason?: string;
  timestamp?: number | string;
  partial?: boolean;
  turnComplete?: boolean;
  interrupted?: boolean;
  error?: string;
}
