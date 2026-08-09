import type {
  AgentFeedbackRequest,
  AgentFeedbackResponse,
  AgentSession,
  AgentSessionEvent,
  AgentStreamEvent,
  ChatRequestBody,
  ListAgentsResponse,
} from "@/types/agent";

export interface IAgentRuntimeProvider {
  listAgents(locations?: string[]): Promise<ListAgentsResponse>;
  listSessions(userId: string, userEmail?: string, agentId?: string): Promise<AgentSession[]>;
  createSession(userId: string, title?: string, agentId?: string): Promise<AgentSession>;
  getSession(sessionId: string, agentId?: string, location?: string): Promise<AgentSession | null>;
  updateSessionTitle(
    sessionId: string,
    title: string,
    userId?: string,
    agentId?: string,
    location?: string
  ): Promise<void>;
  deleteSession(sessionId: string, agentId?: string, location?: string): Promise<void>;
  listSessionEvents(sessionId: string, agentId?: string, location?: string): Promise<AgentSessionEvent[]>;
  submitFeedback(request: AgentFeedbackRequest, userId: string): Promise<AgentFeedbackResponse>;
  streamQuery(request: ChatRequestBody, userId: string): AsyncGenerator<AgentStreamEvent, void, unknown>;
}

export interface FormattedSessionThreadMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  subAgents?: Array<{
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
  }>;
  toolCalls?: Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
  toolResults?: Array<{
    name: string;
    result: Record<string, unknown>;
  }>;
  toolCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  toolResult?: {
    name: string;
    result: Record<string, unknown>;
  };
  thought?: string;
}
