import { GoogleAuth } from "google-auth-library";
import {
  AgentFeedbackRequest,
  AgentFeedbackResponse,
  AgentMemory,
  AgentSession,
  AgentSessionEvent,
  AgentStreamEvent,
  ChatRequestBody,
  DeployedAgent,
  FeedbackType,
  ListAgentsResponse,
  MemoryRetrievalItem,
} from "@/types/agent";
import { IAgentRuntimeProvider } from "./types";
import {
  extractReasoningEngineIdFromResourceName,
  extractSessionIdFromResourceName,
  extractTextFromQueryOutput,
  formatAgentDisplayName,
  groupTurnSessionEvents,
  isLocalSessionId,
} from "./event-normalizer";
import { parseSseStream } from "./sse-parser";

export class VertexAiReasoningEngineProvider implements IAgentRuntimeProvider {
  private auth: GoogleAuth;
  private projectId: string;
  private location: string;
  private reasoningEngineId: string;

  private tokenGetter?: () => Promise<string>;

  constructor(
    overrideEngineId?: string,
    overrideLocation?: string,
    tokenGetter?: () => Promise<string>
  ) {
    this.tokenGetter = tokenGetter;
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

    this.auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
  }

  async getAccessToken(): Promise<string> {
    if (this.tokenGetter) {
      return this.tokenGetter();
    }
    const client = await this.auth.getClient();
    const tokenResponse = await client.getAccessToken();
    if (!tokenResponse.token) {
      throw new Error("Failed to obtain Google Cloud IAM access token");
    }
    return tokenResponse.token;
  }

  private getNormalizedEngineResource(
    customEngineId?: string,
    customLocation?: string
  ): string {
    const targetEngine = customEngineId || this.reasoningEngineId;
    if (targetEngine.startsWith("projects/")) {
      return targetEngine;
    }
    const loc = customLocation || this.location;
    return `projects/${this.projectId}/locations/${loc}/reasoningEngines/${targetEngine}`;
  }

  private getSessionsBaseUrl(customEngineId?: string): string {
    const targetEngine = customEngineId || this.reasoningEngineId;
    let loc = this.location;
    if (targetEngine.startsWith("projects/")) {
      const match = targetEngine.match(/^projects\/[^/]+\/locations\/([^/]+)\//);
      if (match && match[1]) loc = match[1];
    }
    return `https://${loc}-aiplatform.googleapis.com/v1beta1/${this.getNormalizedEngineResource(targetEngine, loc)}/sessions`;
  }

  private getFeedbackBaseUrl(
    sessionId?: string,
    customEngineId?: string,
    customLocation?: string
  ): string {
    if (sessionId && sessionId.startsWith("projects/")) {
      const match = sessionId.match(
        /^projects\/([^/]+)\/locations\/([^/]+)\/reasoningEngines\/([^/]+)/
      );
      if (match) {
        const [, proj, loc, engine] = match;
        return `https://${loc}-aiplatform.googleapis.com/v1beta1/projects/${proj}/locations/${loc}/reasoningEngines/${engine}/feedbackEntries`;
      }
    }

    const targetEngine = customEngineId || this.reasoningEngineId;
    let loc = customLocation || this.location;
    if (targetEngine.startsWith("projects/")) {
      const match = targetEngine.match(/^projects\/[^/]+\/locations\/([^/]+)\//);
      if (match && match[1]) loc = match[1];
    }
    return `https://${loc}-aiplatform.googleapis.com/v1beta1/${this.getNormalizedEngineResource(targetEngine, loc)}/feedbackEntries`;
  }

  private getSessionEndpoint(
    sessionId: string,
    subPath?: string,
    customEngineId?: string,
    customLocation?: string
  ): string {
    if (sessionId.startsWith("projects/")) {
      const match = sessionId.match(
        /^projects\/([^/]+)\/locations\/([^/]+)\/reasoningEngines\/([^/]+)\/sessions\/([^/]+)/
      );
      if (match) {
        const [, proj, loc, engine, sId] = match;
        const base = `https://${loc}-aiplatform.googleapis.com/v1beta1/projects/${proj}/locations/${loc}/reasoningEngines/${engine}/sessions/${encodeURIComponent(sId)}`;
        return subPath ? `${base}/${subPath}` : base;
      }
    }

    const cleanId = extractSessionIdFromResourceName(sessionId);
    const targetEngine = customEngineId || this.reasoningEngineId;
    let loc = customLocation || this.location;
    if (targetEngine.startsWith("projects/")) {
      const match = targetEngine.match(/^projects\/[^/]+\/locations\/([^/]+)\//);
      if (match && match[1]) loc = match[1];
    }
    const base = `https://${loc}-aiplatform.googleapis.com/v1beta1/${this.getNormalizedEngineResource(targetEngine, loc)}/sessions/${encodeURIComponent(cleanId)}`;
    return subPath ? `${base}/${subPath}` : base;
  }

  private getMemoriesBaseUrl(customEngineId?: string, customLocation?: string): string {
    const targetEngine = customEngineId || this.reasoningEngineId;
    let loc = customLocation || this.location;
    if (targetEngine.startsWith("projects/")) {
      const match = targetEngine.match(/^projects\/[^/]+\/locations\/([^/]+)\//);
      if (match && match[1]) loc = match[1];
    }
    return `https://${loc}-aiplatform.googleapis.com/v1beta1/${this.getNormalizedEngineResource(targetEngine, loc)}/memories`;
  }

  private getMemoryEndpoint(
    memoryId: string,
    customEngineId?: string,
    customLocation?: string
  ): string {
    if (memoryId.startsWith("projects/")) {
      const match = memoryId.match(
        /^projects\/([^/]+)\/locations\/([^/]+)\/reasoningEngines\/([^/]+)\/memories\/([^/]+)/
      );
      if (match) {
        const [, proj, loc, engine, mId] = match;
        return `https://${loc}-aiplatform.googleapis.com/v1beta1/projects/${proj}/locations/${loc}/reasoningEngines/${engine}/memories/${encodeURIComponent(mId)}`;
      }
    }
    return `${this.getMemoriesBaseUrl(customEngineId, customLocation)}/${encodeURIComponent(memoryId)}`;
  }

  async listAgents(locations?: string[]): Promise<ListAgentsResponse> {
    try {
      const accessToken = await this.getAccessToken();
      const envLocations = process.env.GOOGLE_CLOUD_LOCATIONS
        ? process.env.GOOGLE_CLOUD_LOCATIONS.split(",")
            .map((l) => l.trim())
            .filter(Boolean)
        : [this.location || "us-central1"];
      const targetLocations =
        locations && locations.length > 0 ? locations : envLocations;

      const fetchLocationEngines = async (loc: string): Promise<DeployedAgent[]> => {
        const url = `https://${loc}-aiplatform.googleapis.com/v1beta1/projects/${this.projectId}/locations/${loc}/reasoningEngines`;
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn(
            `Reasoning Engines query for location ${loc} returned ${response.status}: ${errText}`
          );
          return [];
        }

        const data = await response.json();
        const rawEngines = (data.reasoningEngines || []) as Array<
          Record<string, unknown>
        >;

        return rawEngines.map((raw) => {
          const resourceName = (raw.name as string) || "";
          const id =
            extractReasoningEngineIdFromResourceName(resourceName) || resourceName;
          const displayName =
            (raw.displayName as string) ||
            (raw.display_name as string) ||
            formatAgentDisplayName(id) ||
            `Agent ${id.substring(0, 8)}`;
          const description = (raw.description as string) || undefined;
          const createTime =
            (raw.createTime as string) || (raw.create_time as string) || undefined;
          const updateTime =
            (raw.updateTime as string) || (raw.update_time as string) || undefined;
          const spec = (raw.spec || {}) as Record<string, unknown>;
          const model = (spec.model as string) || (raw.model as string) || undefined;

          return {
            id,
            resourceName,
            displayName,
            description,
            location: loc,
            createTime,
            updateTime,
            model,
          };
        });
      };

      const results = await Promise.allSettled(
        targetLocations.map((loc) => fetchLocationEngines(loc))
      );

      const engines: DeployedAgent[] = [];
      for (const res of results) {
        if (res.status === "fulfilled") {
          engines.push(...res.value);
        }
      }

      if (engines.length === 0) {
        const configuredId = this.reasoningEngineId || "default-agent";
        engines.push({
          id: configuredId,
          resourceName: this.getNormalizedEngineResource(),
          displayName: formatAgentDisplayName(configuredId) || "Deployed Agent",
          description: "Primary Vertex AI Reasoning Engine",
          location: this.location || "us-central1",
          isDefault: true,
        });
      }

      const defaultEngineId =
        this.reasoningEngineId ||
        process.env.GOOGLE_REASONING_ENGINE_ID ||
        engines[0]?.id;
      const activeAgent =
        engines.find(
          (e) => e.id === defaultEngineId || e.resourceName === defaultEngineId
        ) || engines[0];
      const activeAgentId = activeAgent?.id || engines[0]?.id;

      return {
        agents: engines.map((e) => ({
          ...e,
          isDefault: e.id === activeAgentId,
        })),
        activeAgentId,
      };
    } catch (err: unknown) {
      console.error("Error listing reasoning engines from Vertex AI:", err);
      throw err;
    }
  }

  async listSessions(
    userId: string,
    userEmail?: string,
    reasoningEngineId?: string
  ): Promise<AgentSession[]> {
    try {
      const accessToken = await this.getAccessToken();

      const fetchSessionsByFilter = async (filterVal: string) => {
        const url = new URL(this.getSessionsBaseUrl(reasoningEngineId));
        if (filterVal) {
          url.searchParams.set("filter", `user_id="${filterVal}"`);
        }
        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn(
            `Sessions query for filter ${filterVal} returned ${response.status}: ${errText}`
          );
          return [];
        }

        const data = await response.json();
        return (data.sessions || []) as Array<Record<string, unknown>>;
      };

      let rawSessions = await fetchSessionsByFilter(userId);

      if (rawSessions.length === 0 && userEmail && userEmail !== userId) {
        const emailSessions = await fetchSessionsByFilter(userEmail);
        if (emailSessions.length > 0) {
          rawSessions = emailSessions;
        }
      }

      const mappedSessions: AgentSession[] = rawSessions.map((raw) => {
        const sessionObj = ((raw.response as Record<string, unknown>) || raw) as Record<
          string,
          unknown
        >;
        const nameStr = (sessionObj.name as string) || (raw.name as string) || "";
        const id = extractSessionIdFromResourceName(nameStr) || String(Math.random());
        const rawTitle =
          (sessionObj.displayName as string) ||
          (raw.displayName as string) ||
          (sessionObj.title as string) ||
          (raw.title as string);
        const displayName =
          rawTitle &&
          rawTitle !== "New conversation" &&
          rawTitle !== "Untitled chat" &&
          !/^Chat [a-zA-Z0-9_-]+$/i.test(rawTitle)
            ? rawTitle
            : `Chat ${id.substring(0, 8)}`;

        return {
          id,
          name: nameStr,
          userId:
            (sessionObj.userId as string) ||
            (raw.userId as string) ||
            (raw.user_id as string) ||
            userId,
          title: displayName,
          createTime:
            (sessionObj.createTime as string) ||
            (raw.createTime as string) ||
            new Date().toISOString(),
          updateTime:
            (sessionObj.updateTime as string) ||
            (raw.updateTime as string) ||
            new Date().toISOString(),
          expireTime: (sessionObj.expireTime as string) || (raw.expireTime as string),
        };
      });

      return mappedSessions;
    } catch (err: unknown) {
      console.error("Error listing sessions from Agent Runtime:", err);
      throw err;
    }
  }

  async createSession(
    userId: string,
    title?: string,
    reasoningEngineId?: string
  ): Promise<AgentSession> {
    try {
      const accessToken = await this.getAccessToken();
      const response = await fetch(this.getSessionsBaseUrl(reasoningEngineId), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          user_id: userId,
          ...(title ? { displayName: title } : {}),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to create session (${response.status}): ${errText}`);
      }

      const raw = (await response.json()) as Record<string, unknown>;
      const sessionObj = ((raw.response as Record<string, unknown>) || raw) as Record<
        string,
        unknown
      >;
      const nameStr = (sessionObj.name as string) || (raw.name as string) || "";
      const id = extractSessionIdFromResourceName(nameStr) || `session-${Date.now()}`;

      return {
        id,
        name: nameStr,
        userId,
        title:
          (sessionObj.displayName as string) ||
          (raw.displayName as string) ||
          title ||
          "New conversation",
        createTime:
          (sessionObj.createTime as string) ||
          (raw.createTime as string) ||
          new Date().toISOString(),
        updateTime:
          (sessionObj.updateTime as string) ||
          (raw.updateTime as string) ||
          new Date().toISOString(),
        expireTime: (sessionObj.expireTime as string) || (raw.expireTime as string),
      };
    } catch (err: unknown) {
      console.error("Error creating session on Agent Runtime:", err);
      throw err;
    }
  }

  async getSession(
    sessionId: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<AgentSession | null> {
    if (isLocalSessionId(sessionId)) {
      return null;
    }

    try {
      const accessToken = await this.getAccessToken();
      const endpoint = this.getSessionEndpoint(
        sessionId,
        undefined,
        customEngineId,
        customLocation
      );
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (
        response.status === 404 &&
        !customEngineId &&
        !sessionId.startsWith("projects/")
      ) {
        const agentsResult = await this.listAgents().catch(() => ({
          agents: [],
          activeAgentId: "",
        }));
        for (const agent of agentsResult.agents) {
          if (agent.id === this.reasoningEngineId) continue;
          try {
            const fallbackEndpoint = this.getSessionEndpoint(
              sessionId,
              undefined,
              agent.resourceName || agent.id,
              agent.location
            );
            const fallbackRes = await fetch(fallbackEndpoint, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            });
            if (fallbackRes.ok) {
              const raw = (await fallbackRes.json()) as Record<string, unknown>;
              const nameStr = (raw.name as string) || "";
              const parts = nameStr.split("/");
              const id = parts[parts.length - 1] || sessionId;
              return {
                id,
                name: nameStr,
                userId: (raw.userId as string) || "",
                title:
                  (raw.displayName as string) ||
                  (raw.title as string) ||
                  `Chat ${id.substring(0, 8)}`,
                createTime: (raw.createTime as string) || new Date().toISOString(),
                updateTime: (raw.updateTime as string) || new Date().toISOString(),
              };
            }
          } catch {
            // try next
          }
        }
        return null;
      }

      if (response.status === 404) return null;
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to get session (${response.status}): ${errText}`);
      }

      const raw = (await response.json()) as Record<string, unknown>;
      const nameStr = (raw.name as string) || "";
      const parts = nameStr.split("/");
      const id = parts[parts.length - 1] || sessionId;

      return {
        id,
        name: nameStr,
        userId: (raw.userId as string) || "",
        title:
          (raw.displayName as string) ||
          (raw.title as string) ||
          `Chat ${id.substring(0, 8)}`,
        createTime: (raw.createTime as string) || new Date().toISOString(),
        updateTime: (raw.updateTime as string) || new Date().toISOString(),
      };
    } catch (err: unknown) {
      console.error("Error getting session from Agent Runtime:", err);
      throw err;
    }
  }

  async updateSessionTitle(
    sessionId: string,
    title: string,
    userId?: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<void> {
    if (isLocalSessionId(sessionId)) {
      return;
    }

    try {
      const accessToken = await this.getAccessToken();
      const endpoint = `${this.getSessionEndpoint(
        sessionId,
        undefined,
        customEngineId,
        customLocation
      )}?updateMask=displayName`;
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: title,
          ...(userId ? { userId, user_id: userId } : {}),
        }),
      });

      if (!response.ok && response.status !== 404) {
        const errText = await response.text();
        console.warn(
          `Could not update session title on Vertex AI (${response.status}): ${errText}`
        );
      }
    } catch (err: unknown) {
      console.warn("Could not update session title on Agent Runtime:", err);
    }
  }

  async deleteSession(
    sessionId: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<void> {
    if (isLocalSessionId(sessionId)) {
      return;
    }

    try {
      const accessToken = await this.getAccessToken();
      const response = await fetch(
        this.getSessionEndpoint(sessionId, undefined, customEngineId, customLocation),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok && response.status !== 404) {
        const errText = await response.text();
        throw new Error(`Failed to delete session (${response.status}): ${errText}`);
      }
    } catch (err: unknown) {
      console.error("Error deleting session on Agent Runtime:", err);
      throw err;
    }
  }

  async listSessionEvents(
    sessionId: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<AgentSessionEvent[]> {
    if (isLocalSessionId(sessionId)) {
      return [];
    }

    try {
      const accessToken = await this.getAccessToken();
      const endpoint = this.getSessionEndpoint(
        sessionId,
        "events",
        customEngineId,
        customLocation
      );
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (
        response.status === 404 &&
        !customEngineId &&
        !sessionId.startsWith("projects/")
      ) {
        const agentsResult = await this.listAgents().catch(() => ({
          agents: [],
          activeAgentId: "",
        }));
        for (const agent of agentsResult.agents) {
          if (agent.id === this.reasoningEngineId) continue;
          try {
            const fallbackEndpoint = this.getSessionEndpoint(
              sessionId,
              "events",
              agent.resourceName || agent.id,
              agent.location
            );
            const fallbackRes = await fetch(fallbackEndpoint, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            });
            if (fallbackRes.ok) {
              const data = await fallbackRes.json();
              const rawEvents = (
                data.sessionEvents && data.sessionEvents.length > 0
                  ? data.sessionEvents
                  : data.events || []
              ) as Array<Record<string, unknown>>;
              return groupTurnSessionEvents(rawEvents, sessionId);
            }
          } catch {
            // try next
          }
        }
        return [];
      }

      if (response.status === 404) return [];
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to list session events (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const rawEvents = (
        data.sessionEvents && data.sessionEvents.length > 0
          ? data.sessionEvents
          : data.events || []
      ) as Array<Record<string, unknown>>;

      return groupTurnSessionEvents(rawEvents, sessionId);
    } catch (err: unknown) {
      console.error("Error listing session events from Agent Runtime:", err);
      throw err;
    }
  }

  async submitFeedback(
    request: AgentFeedbackRequest,
    userId: string
  ): Promise<AgentFeedbackResponse> {
    try {
      const accessToken = await this.getAccessToken();
      const endpoint = this.getFeedbackBaseUrl(
        request.sessionId,
        request.reasoningEngineId,
        request.location
      );

      const cleanSessionId =
        extractSessionIdFromResourceName(request.sessionId) || request.sessionId;

      let resolvedEventId = request.eventId;
      const isNumericalOrPlaceholder =
        resolvedEventId &&
        (/^\d+$/.test(resolvedEventId) ||
          resolvedEventId.startsWith("m-") ||
          resolvedEventId.startsWith("msg-") ||
          resolvedEventId.startsWith("local-"));

      if (isNumericalOrPlaceholder && cleanSessionId) {
        try {
          const events = await this.listSessionEvents(
            cleanSessionId,
            request.reasoningEngineId,
            request.location
          );
          const matchBySegment = events.find(
            (e) =>
              e.name?.endsWith(`/${resolvedEventId}`) ||
              e.name?.includes(`/events/${resolvedEventId}`)
          );
          if (matchBySegment?.id) {
            resolvedEventId = matchBySegment.id;
          } else {
            const assistantTurns = events.filter(
              (e) => e.role === "assistant" && e.id && !/^\d+$/.test(e.id)
            );
            if (assistantTurns.length > 0) {
              resolvedEventId = assistantTurns[assistantTurns.length - 1].id;
            }
          }
        } catch {
          // If session event lookup fails, continue with original eventId
        }
      }

      const payload: Record<string, unknown> = {
        sessionId: cleanSessionId,
        feedbackType: request.feedbackType,
        userId: userId,
        source: "Agent Runtime UI",
      };

      if (resolvedEventId) {
        payload.eventId = resolvedEventId;
      }
      if (request.feedbackText) {
        payload.feedbackText = request.feedbackText;
      }
      if (request.feedbackLabels && request.feedbackLabels.length > 0) {
        payload.feedbackLabels = request.feedbackLabels;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(
          `Failed to submit feedback to Vertex AI (${response.status}): ${errText}`
        );
      }

      const raw = (await response.json()) as Record<string, unknown>;
      return {
        name:
          (raw.name as string) ||
          `projects/${this.projectId}/locations/${this.location}/reasoningEngines/${this.reasoningEngineId}/feedbackEntries/feedback-${Date.now()}`,
        createTime:
          (raw.createTime as string) ||
          (raw.create_time as string) ||
          new Date().toISOString(),
        feedbackType:
          (raw.feedbackType as FeedbackType) ||
          (raw.feedback_type as FeedbackType) ||
          request.feedbackType,
      };
    } catch (err: unknown) {
      console.error("Error submitting feedback to Agent Runtime:", err);
      throw err;
    }
  }

  private normalizeMemoryRecord(
    raw: Record<string, unknown>,
    fallbackUserId: string,
    fallbackFact = "",
    fallbackTopic = "general"
  ): AgentMemory {
    const mem = (
      raw.memory && typeof raw.memory === "object" ? raw.memory : raw
    ) as Record<string, unknown>;

    let id = (mem.id as string) || (mem.name as string) || "";
    if (id.startsWith("projects/")) {
      const match = id.match(/memories\/([^/]+)$/);
      if (match && match[1]) id = match[1];
    }
    if (!id) id = `mem-${Date.now()}`;

    const scope = (mem.scope && typeof mem.scope === "object" ? mem.scope : {}) as Record<
      string,
      string
    >;
    const userId =
      scope.user_id ||
      scope.userId ||
      (mem.userId as string) ||
      (mem.user_id as string) ||
      fallbackUserId;

    const fact = (mem.fact as string) || (mem.content as string) || fallbackFact;

    let topic = fallbackTopic;
    if (typeof mem.topic === "string" && mem.topic) {
      topic = mem.topic;
    } else if (mem.topics && typeof mem.topics === "object") {
      const topicsObj = mem.topics as Record<string, string>;
      topic =
        topicsObj.custom_memory_topic_label ||
        topicsObj.customMemoryTopicLabel ||
        topicsObj.managed_memory_topic ||
        topicsObj.managedMemoryTopic ||
        "general";
    }

    let confidenceScore: number | undefined = undefined;
    if (typeof raw.confidenceScore === "number") {
      confidenceScore = raw.confidenceScore;
    } else if (typeof mem.confidenceScore === "number") {
      confidenceScore = mem.confidenceScore;
    } else if (typeof raw.distance === "number") {
      confidenceScore = Math.max(0, Math.min(1, 1 - raw.distance));
    }

    return {
      id,
      userId,
      fact,
      topic: topic.toLowerCase().replace(/[\s-]+/g, "_"),
      createTime:
        (mem.createTime as string) ||
        (mem.create_time as string) ||
        new Date().toISOString(),
      updateTime:
        (mem.updateTime as string) ||
        (mem.update_time as string) ||
        new Date().toISOString(),
      confidenceScore,
      lastUsedTime:
        (mem.lastUsedTime as string) || (mem.last_used_time as string) || undefined,
      sourceSessionId:
        (mem.sourceSessionId as string) || (mem.source_session_id as string) || undefined,
    };
  }

  async listMemories(
    userId: string,
    topic?: string,
    agentId?: string,
    location?: string
  ): Promise<AgentMemory[]> {
    try {
      const accessToken = await this.getAccessToken();
      const memoriesBaseUrl = this.getMemoriesBaseUrl(agentId, location);

      // Strategy 1: Attempt Scope-based retrieve endpoint (POST :retrieve)
      try {
        const retrieveUrl = `${memoriesBaseUrl}:retrieve`;
        const retrieveRes = await fetch(retrieveUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            scope: {
              user_id: userId,
            },
          }),
        });

        if (retrieveRes.ok) {
          const data = await retrieveRes.json();
          const rawMemories = (data.retrievedMemories || data.memories || []) as Array<
            Record<string, unknown>
          >;
          if (rawMemories.length > 0) {
            let parsed = rawMemories.map((raw) =>
              this.normalizeMemoryRecord(raw, userId)
            );
            if (topic && topic !== "all") {
              const lowerTopic = topic.toLowerCase();
              parsed = parsed.filter((m) => (m.topic || "").toLowerCase() === lowerTopic);
            }
            return parsed;
          }
        }
      } catch (e) {
        console.debug("Retrieve endpoint attempt error, trying list endpoint:", e);
      }

      // Strategy 2: Attempt standard list endpoint with AIP-160 scope filter
      const url = new URL(memoriesBaseUrl);
      url.searchParams.set("filter", `scope.user_id="${userId}"`);
      if (topic && topic !== "all") {
        url.searchParams.set("topic", topic);
      }

      let response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      // Fallback: If scope.user_id filter returned an error, try user_id filter
      if (!response.ok) {
        const fallbackUrl = new URL(memoriesBaseUrl);
        fallbackUrl.searchParams.set("filter", `user_id="${userId}"`);
        const fallbackRes = await fetch(fallbackUrl.toString(), {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });
        if (fallbackRes.ok) {
          response = fallbackRes;
        }
      }

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`Memory query returned ${response.status}: ${errText}`);
        return [];
      }

      const data = await response.json();
      const rawMemories = (data.memories || []) as Array<Record<string, unknown>>;
      return rawMemories.map((raw) => this.normalizeMemoryRecord(raw, userId));
    } catch (err: unknown) {
      console.error("Error listing memories from Vertex AI:", err);
      return [];
    }
  }

  private buildVertexTopicsPayload(topic?: string): Record<string, unknown> | undefined {
    if (!topic || topic === "all" || topic === "general") return undefined;
    const upper = topic.toUpperCase();
    if (
      upper === "USER_PERSONAL_INFO" ||
      upper === "USER_PREFERENCES" ||
      upper === "KEY_CONVERSATION_DETAILS" ||
      upper === "EXPLICIT_INSTRUCTIONS"
    ) {
      return {
        managed_memory_topic: {
          managed_topic_enum: upper,
        },
      };
    }
    return {
      custom_memory_topic_label: topic,
    };
  }

  async createMemory(
    userId: string,
    fact: string,
    topic?: string,
    agentId?: string,
    location?: string
  ): Promise<AgentMemory> {
    try {
      const accessToken = await this.getAccessToken();
      const endpoint = this.getMemoriesBaseUrl(agentId, location);
      const topicsPayload = this.buildVertexTopicsPayload(topic);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fact,
          scope: {
            user_id: userId,
          },
          ...(topicsPayload ? { topics: topicsPayload } : {}),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to create memory (${response.status}): ${errText}`);
      }

      const raw = (await response.json()) as Record<string, unknown>;
      return this.normalizeMemoryRecord(raw, userId, fact, topic || "general");
    } catch (err: unknown) {
      console.error("Error creating memory on Vertex AI:", err);
      throw err;
    }
  }

  async updateMemory(
    userId: string,
    memoryId: string,
    fact: string,
    topic?: string,
    agentId?: string,
    location?: string
  ): Promise<AgentMemory> {
    try {
      const accessToken = await this.getAccessToken();
      const endpointUrl = new URL(this.getMemoryEndpoint(memoryId, agentId, location));
      const topicsPayload = this.buildVertexTopicsPayload(topic);

      // On Vertex AI PATCH, scope is immutable. updateMask specifies updated fields.
      endpointUrl.searchParams.set("updateMask", topicsPayload ? "fact,topics" : "fact");

      const response = await fetch(endpointUrl.toString(), {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fact,
          ...(topicsPayload ? { topics: topicsPayload } : {}),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to update memory (${response.status}): ${errText}`);
      }

      const raw = (await response.json()) as Record<string, unknown>;
      return this.normalizeMemoryRecord(raw, userId, fact, topic || "general");
    } catch (err: unknown) {
      console.error("Error updating memory on Vertex AI:", err);
      throw err;
    }
  }

  async deleteMemory(
    _userId: string,
    memoryId: string,
    agentId?: string,
    location?: string
  ): Promise<void> {
    try {
      const accessToken = await this.getAccessToken();
      const endpoint = this.getMemoryEndpoint(memoryId, agentId, location);
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok && response.status !== 404) {
        const errText = await response.text();
        throw new Error(`Failed to delete memory (${response.status}): ${errText}`);
      }
    } catch (err: unknown) {
      console.error("Error deleting memory on Vertex AI:", err);
      throw err;
    }
  }

  async generateMemories(
    userId: string,
    sessionId: string,
    agentId?: string,
    location?: string
  ): Promise<AgentMemory[]> {
    try {
      const accessToken = await this.getAccessToken();
      const endpoint = `${this.getMemoriesBaseUrl(agentId, location)}:generate`;
      const cleanSessionId = extractSessionIdFromResourceName(sessionId);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          sessionId: cleanSessionId,
          scope: {
            user_id: userId,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`Memory generate failed (${response.status}): ${errText}`);
        return [];
      }

      const data = await response.json();
      const rawMemories = (data.memories || []) as Array<Record<string, unknown>>;
      return rawMemories.map((raw) => this.normalizeMemoryRecord(raw, userId));
    } catch (err: unknown) {
      console.error("Error generating memories on Vertex AI:", err);
      return [];
    }
  }

  async retrieveMemories(
    userId: string,
    query: string,
    agentId?: string,
    location?: string
  ): Promise<MemoryRetrievalItem[]> {
    try {
      const accessToken = await this.getAccessToken();
      const endpoint = `${this.getMemoriesBaseUrl(agentId, location)}:retrieve`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scope: {
            user_id: userId,
          },
          similaritySearchParams: query
            ? {
                searchQuery: query,
                topK: 5,
              }
            : undefined,
          similarity_search_params: query
            ? {
                search_query: query,
                top_k: 5,
              }
            : undefined,
        }),
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      const rawMemories = (data.retrievedMemories || data.memories || []) as Array<
        Record<string, unknown>
      >;
      return rawMemories.map((raw) => {
        const normalized = this.normalizeMemoryRecord(raw, userId);
        let relevanceScore = 0.9;
        if (typeof raw.distance === "number") {
          relevanceScore = Math.max(0, Math.min(1, 1 - raw.distance));
        } else if (normalized.confidenceScore !== undefined) {
          relevanceScore = normalized.confidenceScore;
        }
        return {
          id: normalized.id,
          fact: normalized.fact,
          topic: normalized.topic,
          relevanceScore,
        };
      });
    } catch {
      return [];
    }
  }

  async *streamQuery(
    body: ChatRequestBody,
    userId: string
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    try {
      const accessToken = await this.getAccessToken();
      const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/${this.getNormalizedEngineResource()}:streamQuery`;

      const lastUserMsgObj = [...body.messages].reverse().find((m) => m.role === "user");
      const lastUserMessage = lastUserMsgObj?.content || "";
      const fnResponsePart = lastUserMsgObj?.parts?.find(
        (p) => p.function_response || p.functionResponse
      );

      const cleanSessionId =
        body.sessionId && !isLocalSessionId(body.sessionId)
          ? extractSessionIdFromResourceName(body.sessionId)
          : undefined;

      const resolvedRunConfig: Record<string, unknown> = {
        streaming_mode:
          body.streamingMode ||
          body.runConfig?.streaming_mode ||
          body.runConfig?.streamingMode ||
          "sse",
        ...(body.runConfig || {}),
      };

      const inputPayload: Record<string, unknown> = {
        message: lastUserMessage,
        user_id: userId,
        ...(cleanSessionId ? { session_id: cleanSessionId } : {}),
        run_config: resolvedRunConfig,
      };

      const nonTextParts = lastUserMsgObj?.parts?.filter(
        (p) =>
          p.file_data ||
          p.fileData ||
          p.image ||
          p.file ||
          p.function_response ||
          p.functionResponse ||
          p.function_call ||
          p.functionCall
      );

      if (nonTextParts && nonTextParts.length > 0 && lastUserMsgObj?.parts) {
        inputPayload.parts = lastUserMsgObj.parts.map((p) => {
          if (p.file_data) {
            return {
              file_data: {
                file_uri: p.file_data.file_uri,
                mime_type: p.file_data.mime_type,
              },
            };
          }
          if (p.fileData) {
            return {
              file_data: {
                file_uri: p.fileData.file_uri || p.fileData.fileUri || "",
                mime_type: p.fileData.mime_type || p.fileData.mimeType || "",
              },
            };
          }
          if (p.function_response || p.functionResponse) {
            return {
              function_response: p.function_response || p.functionResponse,
            };
          }
          if (p.function_call || p.functionCall) {
            return {
              function_call: p.function_call || p.functionCall,
            };
          }
          return { text: p.text || "" };
        });
      }

      if (fnResponsePart) {
        const fnResp =
          fnResponsePart.function_response || fnResponsePart.functionResponse;
        inputPayload.function_response = fnResp;
        inputPayload.functionResponse = fnResp;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          class_method: "async_stream_query",
          input: inputPayload,
        }),
      });

      if (!response.ok) {
        const queryEndpoint = `https://${this.location}-aiplatform.googleapis.com/v1/${this.getNormalizedEngineResource()}:query`;
        const queryResponse = await fetch(queryEndpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            class_method: "query",
            input: inputPayload,
          }),
        });

        if (queryResponse.ok) {
          const result = await queryResponse.json();
          const parsed = extractTextFromQueryOutput(result);

          if (parsed.thoughts.length > 0) {
            yield {
              event_type: "thought",
              thought: parsed.thoughts.join("\n\n"),
            };
          }

          if (parsed.text) {
            yield {
              event_type: "content",
              content: parsed.text,
            };
          }

          yield { event_type: "done" };
          return;
        } else {
          const streamErrText = await response.text().catch(() => "");
          const queryErrText = await queryResponse.text().catch(() => "");
          throw new Error(
            `Agent Runtime error (${queryResponse.status}): ${queryErrText || streamErrText || response.statusText}`
          );
        }
      }

      if (!response.body) {
        throw new Error("Empty response body from Agent Runtime");
      }

      yield* parseSseStream(response.body);
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to stream from Agent Runtime";
      console.error("Agent Runtime stream error:", errorMessage);
      yield {
        event_type: "error",
        error: errorMessage,
      };
    }
  }
}
