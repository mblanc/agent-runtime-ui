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
import {
  createAgentRuntimeProvider,
  IAgentRuntimeProvider,
  mockAgentsStore,
} from "./agent-runtime";

export * from "./agent-runtime";

/**
 * Backward-compatible facade for AgentRuntimeClient that delegates
 * to IAgentRuntimeProvider implementation via strategy pattern.
 */
export class AgentRuntimeClient {
  private provider: IAgentRuntimeProvider;
  private location: string;
  private reasoningEngineId: string;

  constructor(overrideEngineId?: string, overrideLocation?: string) {
    this.location =
      overrideLocation || process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
    this.reasoningEngineId =
      overrideEngineId || process.env.GOOGLE_REASONING_ENGINE_ID || "";

    if (this.reasoningEngineId.startsWith("projects/")) {
      const match = this.reasoningEngineId.match(
        /^projects\/([^/]+)\/locations\/([^/]+)\/reasoningEngines\/([^/]+)$/
      );
      if (match) {
        if (match[2]) this.location = match[2];
      }
    }

    const matchingMockAgent = mockAgentsStore.find(
      (a) => a.id === this.reasoningEngineId
    );
    if (matchingMockAgent) {
      this.location = matchingMockAgent.location;
    }

    // No tokenGetter: the provider's VertexAiContext owns its own GoogleAuth,
    // and google-auth-library caches access tokens per instance. Passing one
    // from here also defeated the provider cache, which deliberately refuses to
    // share a provider built with caller-supplied credentials — so every one of
    // the 15 routes was getting an uncached provider and a fresh GoogleAuth.
    this.provider = createAgentRuntimeProvider(overrideEngineId, overrideLocation);
  }

  async listReasoningEngines(locations?: string[]): Promise<ListAgentsResponse> {
    return this.provider.listAgents(locations);
  }

  async listSessions(
    userId: string,
    userEmail?: string,
    reasoningEngineId?: string
  ): Promise<AgentSession[]> {
    return this.provider.listSessions(userId, userEmail, reasoningEngineId);
  }

  async createSession(
    userId: string,
    title?: string,
    reasoningEngineId?: string
  ): Promise<AgentSession> {
    return this.provider.createSession(userId, title, reasoningEngineId);
  }

  async getSession(
    sessionId: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<AgentSession | null> {
    return this.provider.getSession(sessionId, customEngineId, customLocation);
  }

  async getSessionState(
    sessionId: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<SessionStateMap> {
    return this.provider.getSessionState(sessionId, customEngineId, customLocation);
  }

  async updateSessionState(
    sessionId: string,
    state: SessionStateMap,
    mode: "merge" | "replace" = "merge",
    customEngineId?: string,
    customLocation?: string
  ): Promise<SessionStateMap> {
    return this.provider.updateSessionState(
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
    return this.provider.updateSessionTitle(
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
    return this.provider.deleteSession(sessionId, customEngineId, customLocation);
  }

  async listSessionEvents(
    sessionId: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<AgentSessionEvent[]> {
    return this.provider.listSessionEvents(sessionId, customEngineId, customLocation);
  }

  async submitFeedback(
    request: AgentFeedbackRequest,
    userId: string
  ): Promise<AgentFeedbackResponse> {
    return this.provider.submitFeedback(request, userId);
  }

  async listMemories(
    userId: string,
    topic?: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<AgentMemory[]> {
    return this.provider.listMemories(
      userId,
      topic,
      customEngineId || this.reasoningEngineId,
      customLocation || this.location
    );
  }

  async createMemory(
    userId: string,
    fact: string,
    topic?: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<AgentMemory> {
    return this.provider.createMemory(
      userId,
      fact,
      topic,
      customEngineId || this.reasoningEngineId,
      customLocation || this.location
    );
  }

  async updateMemory(
    userId: string,
    memoryId: string,
    fact: string,
    topic?: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<AgentMemory> {
    return this.provider.updateMemory(
      userId,
      memoryId,
      fact,
      topic,
      customEngineId || this.reasoningEngineId,
      customLocation || this.location
    );
  }

  async deleteMemory(
    userId: string,
    memoryId: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<void> {
    return this.provider.deleteMemory(
      userId,
      memoryId,
      customEngineId || this.reasoningEngineId,
      customLocation || this.location
    );
  }

  async generateMemories(
    userId: string,
    sessionId: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<AgentMemory[]> {
    return this.provider.generateMemories(
      userId,
      sessionId,
      customEngineId || this.reasoningEngineId,
      customLocation || this.location
    );
  }

  async retrieveMemories(
    userId: string,
    query: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<MemoryRetrievalItem[]> {
    return this.provider.retrieveMemories(
      userId,
      query,
      customEngineId || this.reasoningEngineId,
      customLocation || this.location
    );
  }

  async *streamQuery(
    body: ChatRequestBody,
    userId: string,
    signal?: AbortSignal
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    yield* this.provider.streamQuery(body, userId, signal);
  }
}
