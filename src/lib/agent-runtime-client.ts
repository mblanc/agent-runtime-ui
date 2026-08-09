import { GoogleAuth } from "google-auth-library";
import {
  AgentFeedbackRequest,
  AgentFeedbackResponse,
  AgentSession,
  AgentSessionEvent,
  AgentStreamEvent,
  ChatRequestBody,
  ListAgentsResponse,
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
  private auth: GoogleAuth;
  private projectId: string;
  private location: string;
  private reasoningEngineId: string;

  constructor(overrideEngineId?: string, overrideLocation?: string) {
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT || "";
    this.location =
      overrideLocation || process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
    this.reasoningEngineId =
      overrideEngineId || process.env.GOOGLE_REASONING_ENGINE_ID || "";

    if (this.reasoningEngineId.startsWith("projects/")) {
      const match = this.reasoningEngineId.match(
        /^projects\/([^/]+)\/locations\/([^/]+)\/reasoningEngines\/([^/]+)$/
      );
      if (match) {
        if (match[1]) this.projectId = match[1];
        if (match[2]) this.location = match[2];
      }
    }

    const matchingMockAgent = mockAgentsStore.find(
      (a) => a.id === this.reasoningEngineId
    );
    if (matchingMockAgent) {
      this.location = matchingMockAgent.location;
    }

    this.auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });

    this.provider = createAgentRuntimeProvider(
      overrideEngineId,
      overrideLocation,
      () => this.getAccessToken()
    );
  }

  async getAccessToken(): Promise<string> {
    const client = await this.auth.getClient();
    const tokenResponse = await client.getAccessToken();
    if (!tokenResponse.token) {
      throw new Error("Failed to obtain Google Cloud IAM access token");
    }
    return tokenResponse.token;
  }

  getNormalizedEngineResource(customEngineId?: string): string {
    const targetEngine = customEngineId || this.reasoningEngineId;
    if (targetEngine.startsWith("projects/")) {
      return targetEngine;
    }
    return `projects/${this.projectId}/locations/${this.location}/reasoningEngines/${targetEngine}`;
  }

  getSessionsBaseUrl(customEngineId?: string): string {
    const targetEngine = customEngineId || this.reasoningEngineId;
    let loc = this.location;
    if (targetEngine.startsWith("projects/")) {
      const match = targetEngine.match(/^projects\/[^/]+\/locations\/([^/]+)\//);
      if (match && match[1]) loc = match[1];
    }
    return `https://${loc}-aiplatform.googleapis.com/v1beta1/${this.getNormalizedEngineResource(targetEngine)}/sessions`;
  }

  getFeedbackBaseUrl(): string {
    return `https://${this.location}-aiplatform.googleapis.com/v1beta1/${this.getNormalizedEngineResource()}/feedbackEntries`;
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
    return this.provider.listSessionEvents(
      sessionId,
      customEngineId,
      customLocation
    );
  }

  async submitFeedback(
    request: AgentFeedbackRequest,
    userId: string
  ): Promise<AgentFeedbackResponse> {
    return this.provider.submitFeedback(request, userId);
  }

  async *streamQuery(
    body: ChatRequestBody,
    userId: string
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    yield* this.provider.streamQuery(body, userId);
  }
}
