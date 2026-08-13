import { DeployedAgent, ListAgentsResponse } from "@/types/agent";
import { VertexAiContext } from "./context";
import {
  extractReasoningEngineIdFromResourceName,
  formatAgentDisplayName,
} from "../event-normalizer";

export class VertexAiAgentService {
  constructor(private context: VertexAiContext) {}

  async resolveEngineIdAsync(engineId?: string): Promise<string> {
    const resolved = this.context.resolveEngineId(engineId);
    if (resolved && (resolved.startsWith("projects/") || /^\d+$/.test(resolved))) {
      return resolved;
    }

    try {
      await this.listAgents();
      return this.context.resolveEngineId(engineId);
    } catch (err) {
      console.warn(`[AgentRuntimeClient] Failed to resolve engine "${engineId}":`, err);
      return engineId || this.context.reasoningEngineId;
    }
  }

  async listAgents(locations?: string[]): Promise<ListAgentsResponse> {
    try {
      const envLocations = process.env.GOOGLE_CLOUD_LOCATIONS
        ? process.env.GOOGLE_CLOUD_LOCATIONS.split(",")
            .map((l) => l.trim())
            .filter(Boolean)
        : [this.context.location || "us-central1"];
      const targetLocations = locations?.length ? locations : envLocations;

      const fetchLocationEngines = async (loc: string): Promise<DeployedAgent[]> => {
        const url = `https://${loc}-aiplatform.googleapis.com/v1beta1/projects/${this.context.projectId}/locations/${loc}/reasoningEngines`;
        const response = await this.context.fetchWithAuth(url, {
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
          const spec = (raw.spec || {}) as Record<string, unknown>;

          return {
            id,
            resourceName,
            displayName,
            description: (raw.description as string) || undefined,
            location: loc,
            createTime:
              (raw.createTime as string) || (raw.create_time as string) || undefined,
            updateTime:
              (raw.updateTime as string) || (raw.update_time as string) || undefined,
            model: (spec.model as string) || (raw.model as string) || undefined,
          };
        });
      };

      const results = await Promise.allSettled(
        targetLocations.map((loc) => fetchLocationEngines(loc))
      );

      const engines: DeployedAgent[] = [];
      for (const res of results) {
        if (res.status === "fulfilled") {
          for (const agent of res.value) {
            engines.push(agent);
            if (agent.displayName && agent.id) {
              const lower = agent.displayName.toLowerCase();
              VertexAiContext.engineDisplayNameMap.set(lower, agent.id);
              VertexAiContext.engineDisplayNameMap.set(agent.displayName, agent.id);
              VertexAiContext.engineDisplayNameMap.set(
                lower.replace(/[\s_]+/g, "-"),
                agent.id
              );
              VertexAiContext.engineDisplayNameMap.set(
                lower.replace(/[\s-]+/g, "_"),
                agent.id
              );
              VertexAiContext.engineDisplayNameMap.set(
                lower.replace(/[-_]/g, " "),
                agent.id
              );
              VertexAiContext.engineDisplayNameMap.set(agent.id, agent.id);
            }
          }
        }
      }

      if (engines.length === 0) {
        const configuredId = this.context.reasoningEngineId || "default-agent";
        engines.push({
          id: configuredId,
          resourceName: this.context.getNormalizedEngineResource(),
          displayName: formatAgentDisplayName(configuredId) || "Deployed Agent",
          description: "Primary Vertex AI Reasoning Engine",
          location: this.context.location || "us-central1",
          isDefault: true,
        });
      }

      const defaultEngineId =
        this.context.reasoningEngineId ||
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
}
