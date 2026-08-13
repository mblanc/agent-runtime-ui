import { GoogleAuth } from "google-auth-library";

export class VertexAiContext {
  public auth: GoogleAuth;
  public projectId: string;
  public location: string;
  public reasoningEngineId: string;
  public tokenGetter?: () => Promise<string>;
  public static engineDisplayNameMap = new Map<string, string>();

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

  async fetchWithAuth(url: string, init?: RequestInit): Promise<Response> {
    const token = await this.getAccessToken();
    return fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  }

  resolveEngineId(engineId?: string): string {
    const id = engineId || this.reasoningEngineId;
    if (!id) return "";
    if (id.startsWith("projects/") || /^\d+$/.test(id)) {
      return id;
    }
    const mapped =
      VertexAiContext.engineDisplayNameMap.get(id.toLowerCase()) ||
      VertexAiContext.engineDisplayNameMap.get(id);
    return mapped || id;
  }

  getNormalizedEngineResource(customEngineId?: string, customLocation?: string): string {
    const targetEngine = this.resolveEngineId(customEngineId) || this.reasoningEngineId;
    if (targetEngine.startsWith("projects/")) {
      return targetEngine;
    }
    const loc = customLocation || this.location;
    return `projects/${this.projectId}/locations/${loc}/reasoningEngines/${targetEngine}`;
  }
}
