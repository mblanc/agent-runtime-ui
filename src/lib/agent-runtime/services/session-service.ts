import { AgentSession, AgentSessionEvent } from "@/types/agent";
import { VertexAiContext } from "./context";
import { VertexAiAgentService } from "./agent-service";
import {
  extractSessionIdFromResourceName,
  groupTurnSessionEvents,
  isLocalSessionId,
} from "../event-normalizer";

export class VertexAiSessionService {
  constructor(
    private context: VertexAiContext,
    private agentService: VertexAiAgentService
  ) {}

  async getSessionsBaseUrl(customEngineId?: string): Promise<string> {
    const resolved = await this.agentService.resolveEngineIdAsync(customEngineId);
    const targetEngine = resolved || this.context.reasoningEngineId;
    let loc = this.context.location;
    if (targetEngine.startsWith("projects/")) {
      const match = targetEngine.match(/^projects\/[^/]+\/locations\/([^/]+)\//);
      if (match && match[1]) loc = match[1];
    }
    return `https://${loc}-aiplatform.googleapis.com/v1beta1/${this.context.getNormalizedEngineResource(targetEngine, loc)}/sessions`;
  }

  async getSessionEndpoint(
    sessionId: string,
    subPath?: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<string> {
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
    const resolved = await this.agentService.resolveEngineIdAsync(customEngineId);
    const targetEngine = resolved || this.context.reasoningEngineId;
    let loc = customLocation || this.context.location;
    if (targetEngine.startsWith("projects/")) {
      const match = targetEngine.match(/^projects\/[^/]+\/locations\/([^/]+)\//);
      if (match && match[1]) loc = match[1];
    }
    const base = `https://${loc}-aiplatform.googleapis.com/v1beta1/${this.context.getNormalizedEngineResource(targetEngine, loc)}/sessions/${encodeURIComponent(cleanId)}`;
    return subPath ? `${base}/${subPath}` : base;
  }

  async listSessions(
    userId: string,
    userEmail?: string,
    reasoningEngineId?: string
  ): Promise<AgentSession[]> {
    try {
      const fetchSessionsByFilter = async (filterVal: string) => {
        const baseUrl = await this.getSessionsBaseUrl(reasoningEngineId);
        const url = new URL(baseUrl);
        if (filterVal) {
          url.searchParams.set("filter", `user_id="${filterVal}"`);
        }
        const response = await this.context.fetchWithAuth(url.toString());

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
        if (emailSessions.length > 0) rawSessions = emailSessions;
      }

      return rawSessions.map((raw) => {
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
      const baseUrl = await this.getSessionsBaseUrl(reasoningEngineId);
      const response = await this.context.fetchWithAuth(baseUrl, {
        method: "POST",
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
    if (isLocalSessionId(sessionId)) return null;

    try {
      const endpoint = await this.getSessionEndpoint(
        sessionId,
        undefined,
        customEngineId,
        customLocation
      );
      const response = await this.context.fetchWithAuth(endpoint);

      if (
        response.status === 404 &&
        !customEngineId &&
        !sessionId.startsWith("projects/")
      ) {
        const agentsResult = await this.agentService.listAgents().catch(() => ({
          agents: [],
          activeAgentId: "",
        }));
        for (const agent of agentsResult.agents) {
          if (agent.id === this.context.reasoningEngineId) continue;
          try {
            const fallbackEndpoint = await this.getSessionEndpoint(
              sessionId,
              undefined,
              agent.resourceName || agent.id,
              agent.location
            );
            const fallbackRes = await this.context.fetchWithAuth(fallbackEndpoint);
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
    if (isLocalSessionId(sessionId)) return;

    try {
      const endpoint = `${await this.getSessionEndpoint(
        sessionId,
        undefined,
        customEngineId,
        customLocation
      )}?updateMask=displayName`;
      const response = await this.context.fetchWithAuth(endpoint, {
        method: "PATCH",
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
    if (isLocalSessionId(sessionId)) return;

    try {
      const endpoint = await this.getSessionEndpoint(
        sessionId,
        undefined,
        customEngineId,
        customLocation
      );
      const response = await this.context.fetchWithAuth(endpoint, {
        method: "DELETE",
      });

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
    if (isLocalSessionId(sessionId)) return [];

    try {
      const endpoint = await this.getSessionEndpoint(
        sessionId,
        "events",
        customEngineId,
        customLocation
      );
      const response = await this.context.fetchWithAuth(endpoint);

      if (
        response.status === 404 &&
        !customEngineId &&
        !sessionId.startsWith("projects/")
      ) {
        const agentsResult = await this.agentService.listAgents().catch(() => ({
          agents: [],
          activeAgentId: "",
        }));
        for (const agent of agentsResult.agents) {
          if (agent.id === this.context.reasoningEngineId) continue;
          try {
            const fallbackEndpoint = await this.getSessionEndpoint(
              sessionId,
              "events",
              agent.resourceName || agent.id,
              agent.location
            );
            const fallbackRes = await this.context.fetchWithAuth(fallbackEndpoint);
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
}
