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
