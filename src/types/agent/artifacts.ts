/**
 * Artifacts domain types for the Agent Platform Artifacts Service.
 *
 * Provides contracts for multi-version digital assets (interactive HTML web apps,
 * CSV datasets, SVG diagrams, syntax-highlighted code files, and Markdown documents)
 * created by agents during execution or hydrated via the REST API.
 */

export type ArtifactMimeType =
  | "text/html"
  | "text/csv"
  | "text/markdown"
  | "text/plain"
  | "text/x-python"
  | "application/javascript"
  | "application/typescript"
  | "application/json"
  | "image/svg+xml"
  | "image/png"
  | "application/pdf"
  | (string & {});

export interface ArtifactVersion {
  version: number;
  content: string;
  createTime: string;
  sizeBytes: number;
  mimeType: ArtifactMimeType;
  gcsUri?: string;
  readUrl?: string;
}

export interface AgentArtifact {
  id: string; // e.g. "sales_dashboard.html" or "user:config.json"
  sessionId: string;
  userId: string;
  filename: string;
  title: string;
  mimeType: ArtifactMimeType;
  currentVersion: number;
  versions: ArtifactVersion[];
  createTime: string;
  updateTime: string;
  scope: "session" | "user";
}

export interface ArtifactStreamPayload {
  filename: string;
  title?: string;
  mimeType: ArtifactMimeType;
  content: string;
  version: number;
  isComplete?: boolean;
  gcsUri?: string;
}

export interface AgentArtifactListResponse {
  artifacts: AgentArtifact[];
}

export interface AgentArtifactResponse {
  artifact: AgentArtifact;
  selectedVersion: ArtifactVersion;
}
