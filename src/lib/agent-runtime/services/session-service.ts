import { AgentSession, AgentSessionEvent, SessionStateMap } from "@/types/agent";
import { VertexAiContext } from "./context";
import { VertexAiAgentService } from "./agent-service";
import {
  PLACEHOLDER_SESSION_TITLE_RE,
  extractSessionIdFromResourceName,
  groupTurnSessionEvents,
  isLocalSessionId,
} from "../event-normalizer";

/**
 * Maps a raw Vertex session payload to AgentSession.
 *
 * Two normalisations that `getSession` previously skipped, though its siblings
 * did not: `createSession` and `listSessions` both unwrap the `response`
 * envelope before reading fields, and `listSessions` reads both the camelCase
 * and snake_case spellings of the owner. Reading only `raw.userId` yielded
 * undefined whenever Vertex used either shape, which the old `|| ""` default
 * then turned into a silently unowned session.
 *
 * The owner is null when genuinely absent — never the empty string, and never
 * the caller's own id.
 */
function mapRawSession(
  rawPayload: Record<string, unknown>,
  fallbackSessionId: string
): AgentSession {
  const raw = ((rawPayload.response as Record<string, unknown>) || rawPayload) as Record<
    string,
    unknown
  >;

  const nameStr = (raw.name as string) || (rawPayload.name as string) || "";
  const parts = nameStr.split("/");
  const id = parts[parts.length - 1] || fallbackSessionId;

  const owner =
    (raw.userId as string) ||
    (raw.user_id as string) ||
    (rawPayload.userId as string) ||
    (rawPayload.user_id as string) ||
    null;

  return {
    id,
    name: nameStr,
    userId: owner,
    title:
      (raw.displayName as string) ||
      (raw.title as string) ||
      `Chat ${id.substring(0, 8)}`,
    createTime: (raw.createTime as string) || new Date().toISOString(),
    updateTime: (raw.updateTime as string) || new Date().toISOString(),
  };
}

export class VertexAiSessionService {
  constructor(
    private context: VertexAiContext,
    private agentService: VertexAiAgentService
  ) {}

  async getSessionsBaseUrl(customEngineId?: string): Promise<string> {
    const resolved = await this.agentService.resolveEngineIdAsync(customEngineId);
    const targetEngine = resolved || this.context.reasoningEngineId;
    const loc = this.context.resolveLocationForResource(targetEngine);
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
        const [, proj, rawLoc, engine, sId] = match;
        // `sessionId` is client-supplied, so its location segment reaches the host.
        const loc = this.context.resolveLocation(rawLoc);
        const base = `https://${loc}-aiplatform.googleapis.com/v1beta1/projects/${proj}/locations/${loc}/reasoningEngines/${engine}/sessions/${encodeURIComponent(sId)}`;
        return subPath ? `${base}/${subPath}` : base;
      }
    }

    const cleanId = extractSessionIdFromResourceName(sessionId);
    const resolved = await this.agentService.resolveEngineIdAsync(customEngineId);
    const targetEngine = resolved || this.context.reasoningEngineId;
    const loc = this.context.resolveLocationForResource(targetEngine, customLocation);
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
          !PLACEHOLDER_SESSION_TITLE_RE.test(rawTitle)
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
        // Probe every other agent concurrently. Awaiting these serially cost
        // one round trip per deployed agent on a stale session id, and with no
        // timeout on those calls a single slow agent stalled the whole chain.
        const probes = await Promise.allSettled(
          agentsResult.agents
            .filter((agent) => agent.id !== this.context.reasoningEngineId)
            .map(async (agent) => {
              const fallbackEndpoint = await this.getSessionEndpoint(
                sessionId,
                undefined,
                agent.resourceName || agent.id,
                agent.location
              );
              const fallbackRes = await this.context.fetchWithAuth(fallbackEndpoint);
              if (!fallbackRes.ok) return null;
              const raw = (await fallbackRes.json()) as Record<string, unknown>;
              return mapRawSession(raw, sessionId);
            })
        );

        for (const probe of probes) {
          if (probe.status === "fulfilled" && probe.value) return probe.value;
        }
        return null;
      }

      if (response.status === 404) return null;
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to get session (${response.status}): ${errText}`);
      }

      const raw = (await response.json()) as Record<string, unknown>;
      return mapRawSession(raw, sessionId);
    } catch (err: unknown) {
      console.error("Error getting session from Agent Runtime:", err);
      throw err;
    }
  }

  async getSessionState(
    sessionId: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<SessionStateMap> {
    if (isLocalSessionId(sessionId)) return {};

    try {
      const endpoint = await this.getSessionEndpoint(
        sessionId,
        undefined,
        customEngineId,
        customLocation
      );
      const response = await this.context.fetchWithAuth(endpoint);

      if (!response.ok) {
        if (response.status === 404) return {};
        const errText = await response.text();
        throw new Error(`Failed to get session state (${response.status}): ${errText}`);
      }

      const raw = (await response.json()) as Record<string, unknown>;
      const sessionObj = ((raw.response as Record<string, unknown>) || raw) as Record<
        string,
        unknown
      >;
      const rawState =
        sessionObj.state ||
        sessionObj.sessionState ||
        sessionObj.session_state ||
        raw.state ||
        raw.sessionState ||
        raw.session_state ||
        {};

      return (
        typeof rawState === "object" && rawState !== null ? rawState : {}
      ) as SessionStateMap;
    } catch (err: unknown) {
      console.error("Error getting session state from Agent Runtime:", err);
      throw err;
    }
  }

  async updateSessionState(
    sessionId: string,
    state: SessionStateMap,
    mode: "merge" | "replace" = "merge",
    customEngineId?: string,
    customLocation?: string
  ): Promise<SessionStateMap> {
    if (isLocalSessionId(sessionId)) return state;

    try {
      if (mode === "merge") {
        // Send only the changed keys and let the server apply them. The previous
        // implementation read the whole state, merged locally and PATCHed the
        // result back, which is a read-modify-write with no concurrency control:
        // the Session resource has no etag (unlike Artifact in the same API), so
        // two writers interleaving silently discarded the earlier write — and
        // because updateMask=sessionState replaces the whole map, what was lost
        // was the entire state object, not just the contested key.
        //
        // appendEvent is the documented mechanism for this. It applies the delta
        // server-side and serialises concurrent updates to the same session.
        await this.appendStateDelta(sessionId, state, customEngineId, customLocation);

        // Read back so callers get the authoritative merged state rather than an
        // optimistic guess. This is a read-after-write, not a read-modify-write,
        // so a concurrent update cannot be lost by it.
        return await this.getSessionState(sessionId, customEngineId, customLocation);
      }

      // "replace" is last-writer-wins by definition, so a whole-map PATCH is the
      // correct expression of it and there is nothing to lose.
      const endpoint = `${await this.getSessionEndpoint(
        sessionId,
        undefined,
        customEngineId,
        customLocation
      )}?updateMask=sessionState`;

      const response = await this.context.fetchWithAuth(endpoint, {
        method: "PATCH",
        body: JSON.stringify({
          sessionState: state,
          state,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(
          `Failed to update session state (${response.status}): ${errText}`
        );
      }

      return state;
    } catch (err: unknown) {
      console.error("Error updating session state on Agent Runtime:", err);
      throw err;
    }
  }

  /**
   * Appends a state-only event so the server applies `delta` to sessionState.
   *
   * Body is a SessionEvent: author, invocationId and timestamp are all required
   * by the API even for an event that carries no content.
   */
  private async appendStateDelta(
    sessionId: string,
    delta: SessionStateMap,
    customEngineId?: string,
    customLocation?: string
  ): Promise<void> {
    const base = await this.getSessionEndpoint(
      sessionId,
      undefined,
      customEngineId,
      customLocation
    );

    const response = await this.context.fetchWithAuth(`${base}:appendEvent`, {
      method: "POST",
      body: JSON.stringify({
        author: "user",
        invocationId: `state-update-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        actions: { stateDelta: delta },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(
        `Failed to append session state delta (${response.status}): ${errText}`
      );
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
        // Concurrent for the same reason as the getSession fallback above.
        const probes = await Promise.allSettled(
          agentsResult.agents
            .filter((agent) => agent.id !== this.context.reasoningEngineId)
            .map(async (agent) => {
              const fallbackEndpoint = await this.getSessionEndpoint(
                sessionId,
                "events",
                agent.resourceName || agent.id,
                agent.location
              );
              const fallbackRes = await this.context.fetchWithAuth(fallbackEndpoint);
              if (!fallbackRes.ok) return null;
              const data = await fallbackRes.json();
              return (
                data.sessionEvents && data.sessionEvents.length > 0
                  ? data.sessionEvents
                  : data.events || []
              ) as Array<Record<string, unknown>>;
            })
        );

        for (const probe of probes) {
          if (probe.status === "fulfilled" && probe.value) {
            return groupTurnSessionEvents(probe.value, sessionId);
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
