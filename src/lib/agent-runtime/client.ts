import {
  AgentFeedbackRequest,
  AgentFeedbackResponse,
  AgentMemory,
  AgentSession,
  AgentSessionEvent,
  AgentStreamEvent,
  ChatRequestBody,
  ListAgentsResponse,
  MemoryRetrievalItem,
  SessionStateMap,
} from "@/types/agent";
import { IAgentRuntimeProvider } from "./types";
import {
  VertexAiAgentService,
  VertexAiContext,
  VertexAiFeedbackService,
  VertexAiMemoryService,
  VertexAiSessionService,
  VertexAiStreamingService,
} from "./services";

export * from "./services";

/**
 * Orchestrator implementing IAgentRuntimeProvider by delegating
 * to domain-specific Vertex AI sub-services.
 */
export class VertexAiReasoningEngineProvider implements IAgentRuntimeProvider {
  private context: VertexAiContext;
  private agents: VertexAiAgentService;
  private sessions: VertexAiSessionService;
  private memories: VertexAiMemoryService;
  private feedback: VertexAiFeedbackService;
  private streaming: VertexAiStreamingService;

  constructor(
    overrideEngineId?: string,
    overrideLocation?: string,
    tokenGetter?: () => Promise<string>
  ) {
    this.context = new VertexAiContext(overrideEngineId, overrideLocation, tokenGetter);
    this.agents = new VertexAiAgentService(this.context);
    this.sessions = new VertexAiSessionService(this.context, this.agents);
    this.memories = new VertexAiMemoryService(this.context);
    this.feedback = new VertexAiFeedbackService(this.context, this.sessions);
    this.streaming = new VertexAiStreamingService(this.context);
  }

  // --- Auth & Resource Identifiers ---

  async getAccessToken(): Promise<string> {
    return this.context.getAccessToken();
  }

  getNormalizedEngineResource(customEngineId?: string, customLocation?: string): string {
    return this.context.getNormalizedEngineResource(customEngineId, customLocation);
  }

  // --- Endpoint Resolvers ---

  async getSessionsBaseUrl(customEngineId?: string): Promise<string> {
    return this.sessions.getSessionsBaseUrl(customEngineId);
  }

  getFeedbackBaseUrl(
    sessionId?: string,
    customEngineId?: string,
    customLocation?: string
  ): string {
    return this.feedback.getFeedbackBaseUrl(sessionId, customEngineId, customLocation);
  }

  async getSessionEndpoint(
    sessionId: string,
    subPath?: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<string> {
    return this.sessions.getSessionEndpoint(
      sessionId,
      subPath,
      customEngineId,
      customLocation
    );
  }

  getMemoriesBaseUrl(customEngineId?: string, customLocation?: string): string {
    return this.memories.getMemoriesBaseUrl(customEngineId, customLocation);
  }

  getMemoryEndpoint(
    memoryId: string,
    customEngineId?: string,
    customLocation?: string
  ): string {
    return this.memories.getMemoryEndpoint(memoryId, customEngineId, customLocation);
  }

  // --- Domain: Agent Fleet Discovery ---

  async listAgents(locations?: string[]): Promise<ListAgentsResponse> {
    return this.agents.listAgents(locations);
  }

  // --- Domain: Sessions & Events ---

  async listSessions(
    userId: string,
    userEmail?: string,
    reasoningEngineId?: string
  ): Promise<AgentSession[]> {
    return this.sessions.listSessions(userId, userEmail, reasoningEngineId);
  }

  async createSession(
    userId: string,
    title?: string,
    reasoningEngineId?: string
  ): Promise<AgentSession> {
    return this.sessions.createSession(userId, title, reasoningEngineId);
  }

  async getSession(
    sessionId: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<AgentSession | null> {
    return this.sessions.getSession(sessionId, customEngineId, customLocation);
  }

  async getSessionState(
    sessionId: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<SessionStateMap> {
    return this.sessions.getSessionState(sessionId, customEngineId, customLocation);
  }

  async updateSessionState(
    sessionId: string,
    state: SessionStateMap,
    mode: "merge" | "replace" = "merge",
    customEngineId?: string,
    customLocation?: string
  ): Promise<SessionStateMap> {
    return this.sessions.updateSessionState(
      sessionId,
      state,
      mode,
      customEngineId,
      customLocation
    );
  }

  async updateSessionTitle(
    sessionId: string,
    title: string,
    userId?: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<void> {
    return this.sessions.updateSessionTitle(
      sessionId,
      title,
      userId,
      customEngineId,
      customLocation
    );
  }

  async deleteSession(
    sessionId: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<void> {
    return this.sessions.deleteSession(sessionId, customEngineId, customLocation);
  }

  async listSessionEvents(
    sessionId: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<AgentSessionEvent[]> {
    return this.sessions.listSessionEvents(sessionId, customEngineId, customLocation);
  }

  // --- Domain: Human Feedback ---

  async submitFeedback(
    request: AgentFeedbackRequest,
    userId: string
  ): Promise<AgentFeedbackResponse> {
    return this.feedback.submitFeedback(request, userId);
  }

  // --- Domain: Memory Bank ---

  async listMemories(
    userId: string,
    topic?: string,
    agentId?: string,
    location?: string
  ): Promise<AgentMemory[]> {
    return this.memories.listMemories(userId, topic, agentId, location);
  }

  async createMemory(
    userId: string,
    fact: string,
    topic?: string,
    agentId?: string,
    location?: string
  ): Promise<AgentMemory> {
    return this.memories.createMemory(userId, fact, topic, agentId, location);
  }

  async updateMemory(
    userId: string,
    memoryId: string,
    fact: string,
    topic?: string,
    agentId?: string,
    location?: string
  ): Promise<AgentMemory> {
    return this.memories.updateMemory(userId, memoryId, fact, topic, agentId, location);
  }

  async deleteMemory(
    userId: string,
    memoryId: string,
    agentId?: string,
    location?: string
  ): Promise<void> {
    return this.memories.deleteMemory(userId, memoryId, agentId, location);
  }

  async generateMemories(
    userId: string,
    sessionId: string,
    agentId?: string,
    location?: string
  ): Promise<AgentMemory[]> {
    return this.memories.generateMemories(userId, sessionId, agentId, location);
  }

  async retrieveMemories(
    userId: string,
    query: string,
    agentId?: string,
    location?: string
  ): Promise<MemoryRetrievalItem[]> {
    return this.memories.retrieveMemories(userId, query, agentId, location);
  }

  // --- Domain: Query Streaming ---

  async *streamQuery(
    body: ChatRequestBody,
    userId: string
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    yield* this.streaming.streamQuery(body, userId);
  }
}
