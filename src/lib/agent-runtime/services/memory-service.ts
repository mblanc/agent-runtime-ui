import { AgentMemory, MemoryRetrievalItem } from "@/types/agent";
import { VertexAiContext } from "./context";
import { extractSessionIdFromResourceName } from "../event-normalizer";

export function buildVertexTopicsPayload(
  topic?: string
): Record<string, unknown> | undefined {
  if (!topic || topic === "all" || topic === "general") return undefined;
  const upper = topic.toUpperCase();
  const managedTopics = [
    "USER_PERSONAL_INFO",
    "USER_PREFERENCES",
    "KEY_CONVERSATION_DETAILS",
    "EXPLICIT_INSTRUCTIONS",
  ];
  if (managedTopics.includes(upper)) {
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

export function normalizeMemoryRecord(
  raw: Record<string, unknown>,
  fallbackUserId: string,
  fallbackFact = "",
  fallbackTopic = "general"
): AgentMemory {
  const mem = (raw.memory && typeof raw.memory === "object" ? raw.memory : raw) as Record<
    string,
    unknown
  >;

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

export class VertexAiMemoryService {
  constructor(private context: VertexAiContext) {}

  getMemoriesBaseUrl(customEngineId?: string, customLocation?: string): string {
    const targetEngine = customEngineId || this.context.reasoningEngineId;
    let loc = customLocation || this.context.location;
    if (targetEngine.startsWith("projects/")) {
      const match = targetEngine.match(/^projects\/[^/]+\/locations\/([^/]+)\//);
      if (match && match[1]) loc = match[1];
    }
    return `https://${loc}-aiplatform.googleapis.com/v1beta1/${this.context.getNormalizedEngineResource(targetEngine, loc)}/memories`;
  }

  getMemoryEndpoint(
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

  async listMemories(
    userId: string,
    topic?: string,
    agentId?: string,
    location?: string
  ): Promise<AgentMemory[]> {
    try {
      const memoriesBaseUrl = this.getMemoriesBaseUrl(agentId, location);

      // Strategy 1: Attempt Scope-based retrieve endpoint (POST :retrieve)
      try {
        const retrieveUrl = `${memoriesBaseUrl}:retrieve`;
        const retrieveRes = await this.context.fetchWithAuth(retrieveUrl, {
          method: "POST",
          body: JSON.stringify({
            scope: { user_id: userId },
          }),
        });

        if (retrieveRes.ok) {
          const data = await retrieveRes.json();
          const rawMemories = (data.retrievedMemories || data.memories || []) as Array<
            Record<string, unknown>
          >;
          if (rawMemories.length > 0) {
            let parsed = rawMemories.map((raw) => normalizeMemoryRecord(raw, userId));
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

      let response = await this.context.fetchWithAuth(url.toString());

      // Fallback: Try user_id filter
      if (!response.ok) {
        const fallbackUrl = new URL(memoriesBaseUrl);
        fallbackUrl.searchParams.set("filter", `user_id="${userId}"`);
        const fallbackRes = await this.context.fetchWithAuth(fallbackUrl.toString());
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
      return rawMemories.map((raw) => normalizeMemoryRecord(raw, userId));
    } catch (err: unknown) {
      console.error("Error listing memories from Vertex AI:", err);
      return [];
    }
  }

  async createMemory(
    userId: string,
    fact: string,
    topic?: string,
    agentId?: string,
    location?: string
  ): Promise<AgentMemory> {
    try {
      const endpoint = this.getMemoriesBaseUrl(agentId, location);
      const topicsPayload = buildVertexTopicsPayload(topic);

      const response = await this.context.fetchWithAuth(endpoint, {
        method: "POST",
        body: JSON.stringify({
          fact,
          scope: { user_id: userId },
          ...(topicsPayload ? { topics: topicsPayload } : {}),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to create memory (${response.status}): ${errText}`);
      }

      const raw = (await response.json()) as Record<string, unknown>;
      return normalizeMemoryRecord(raw, userId, fact, topic || "general");
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
      const endpointUrl = new URL(this.getMemoryEndpoint(memoryId, agentId, location));
      const topicsPayload = buildVertexTopicsPayload(topic);
      endpointUrl.searchParams.set("updateMask", topicsPayload ? "fact,topics" : "fact");

      const response = await this.context.fetchWithAuth(endpointUrl.toString(), {
        method: "PATCH",
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
      return normalizeMemoryRecord(raw, userId, fact, topic || "general");
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
      const endpoint = this.getMemoryEndpoint(memoryId, agentId, location);
      const response = await this.context.fetchWithAuth(endpoint, {
        method: "DELETE",
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
      const endpoint = `${this.getMemoriesBaseUrl(agentId, location)}:generate`;
      const cleanSessionId = extractSessionIdFromResourceName(sessionId);
      const response = await this.context.fetchWithAuth(endpoint, {
        method: "POST",
        body: JSON.stringify({
          userId,
          sessionId: cleanSessionId,
          scope: { user_id: userId },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`Memory generate failed (${response.status}): ${errText}`);
        return [];
      }

      const data = await response.json();
      const rawMemories = (data.memories || []) as Array<Record<string, unknown>>;
      return rawMemories.map((raw) => normalizeMemoryRecord(raw, userId));
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
      const endpoint = `${this.getMemoriesBaseUrl(agentId, location)}:retrieve`;
      const response = await this.context.fetchWithAuth(endpoint, {
        method: "POST",
        body: JSON.stringify({
          scope: { user_id: userId },
          similaritySearchParams: query ? { searchQuery: query, topK: 5 } : undefined,
          similarity_search_params: query ? { search_query: query, top_k: 5 } : undefined,
        }),
      });

      if (!response.ok) return [];

      const data = await response.json();
      const rawMemories = (data.retrievedMemories || data.memories || []) as Array<
        Record<string, unknown>
      >;
      return rawMemories.map((raw) => {
        const normalized = normalizeMemoryRecord(raw, userId);
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
}
