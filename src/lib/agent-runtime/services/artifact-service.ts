import type { AgentArtifact, ArtifactVersion } from "@/types/agent";
import { VertexAiContext } from "./context";
import { VertexAiSessionService } from "./session-service";
import { VertexAiAgentService } from "./agent-service";
import { extractSessionIdFromResourceName } from "../event-normalizer";
import { extractArtifactsFromSessionEvent } from "@/lib/artifacts/artifact-extractor";

export class VertexAiArtifactService {
  constructor(
    private context: VertexAiContext,
    private sessions: VertexAiSessionService,
    private agents: VertexAiAgentService
  ) {}

  async listArtifacts(
    sessionId: string,
    userId: string,
    agentId?: string,
    location?: string
  ): Promise<AgentArtifact[]> {
    const cleanSessionId = extractSessionIdFromResourceName(sessionId);
    if (!cleanSessionId) return [];

    try {
      const events = await this.sessions.listSessionEvents(
        cleanSessionId,
        agentId,
        location
      );
      const artifactsMap = new Map<string, AgentArtifact>();

      for (const evt of events) {
        const extracted = extractArtifactsFromSessionEvent(evt);

        for (const artifactPayload of extracted) {
          const filename = artifactPayload.filename || "artifact.txt";
          const version =
            typeof artifactPayload.version === "number" ? artifactPayload.version : 0;
          const mimeType = artifactPayload.mimeType || "text/plain";
          const content = artifactPayload.content || "";
          const title = artifactPayload.title || filename;

          const existing = artifactsMap.get(filename);
          const versionObj: ArtifactVersion = {
            version,
            content,
            createTime: evt.createTime || new Date().toISOString(),
            sizeBytes: new TextEncoder().encode(content).length,
            mimeType: mimeType as AgentArtifact["mimeType"],
            gcsUri: artifactPayload.gcsUri as string | undefined,
          };

          if (existing) {
            const alreadyHasVersion = existing.versions.some(
              (v) => v.version === version
            );
            if (!alreadyHasVersion) {
              existing.versions.push(versionObj);
            }
            existing.currentVersion = Math.max(existing.currentVersion, version);
            existing.updateTime = evt.createTime || existing.updateTime;
          } else {
            artifactsMap.set(filename, {
              id: filename,
              sessionId: cleanSessionId,
              userId,
              filename,
              title,
              mimeType: mimeType as AgentArtifact["mimeType"],
              currentVersion: version,
              versions: [versionObj],
              createTime: evt.createTime || new Date().toISOString(),
              updateTime: evt.createTime || new Date().toISOString(),
              scope: "session",
            });
          }
        }
      }

      return Array.from(artifactsMap.values());
    } catch {
      return [];
    }
  }

  async getArtifact(
    sessionId: string,
    filename: string,
    version?: number,
    userId?: string,
    agentId?: string,
    location?: string
  ): Promise<{ artifact: AgentArtifact; selectedVersion: ArtifactVersion } | null> {
    const artifacts = await this.listArtifacts(
      sessionId,
      userId || "",
      agentId,
      location
    );
    const cleanFilename = decodeURIComponent(filename);
    const artifact = artifacts.find(
      (a) => a.filename === cleanFilename || a.id === cleanFilename
    );
    if (!artifact) return null;

    const selectedVersion =
      version !== undefined
        ? artifact.versions.find((v) => v.version === version)
        : artifact.versions.find((v) => v.version === artifact.currentVersion) ||
          artifact.versions[artifact.versions.length - 1];

    if (!selectedVersion) return null;

    return {
      artifact,
      selectedVersion,
    };
  }
}
