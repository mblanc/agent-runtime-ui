import { describe, expect, it } from "vitest";
import { StreamAccumulator } from "@/lib/adapters/stream-accumulator";
import type { AgentStreamEvent, ArtifactStreamPayload } from "@/types/agent";

describe("StreamAccumulator Artifact Ingestion", () => {
  it("ingests artifact_created and yields snapshot with artifact metadata", () => {
    const accumulator = new StreamAccumulator();

    const artifactPayload: ArtifactStreamPayload = {
      filename: "dashboard.html",
      title: "Interactive Sales Dashboard",
      mimeType: "text/html",
      version: 0,
      content: "<h1>Hello World</h1>",
      isComplete: false,
    };

    const event: AgentStreamEvent = {
      event_type: "artifact_created",
      artifact: artifactPayload,
    };

    const outcome = accumulator.handle(event);
    expect(outcome).toBe("yield");

    const snapshot = accumulator.snapshot();
    const customMeta = snapshot.metadata?.custom as Record<string, unknown>;
    expect(customMeta).toBeDefined();
    expect(customMeta.artifacts).toBeDefined();
    expect((customMeta.artifacts as ArtifactStreamPayload[]).length).toBe(1);
    expect((customMeta.artifacts as ArtifactStreamPayload[])[0].filename).toBe(
      "dashboard.html"
    );
    expect((customMeta.artifacts as ArtifactStreamPayload[])[0].version).toBe(0);
    expect(customMeta.artifactEvent).toEqual(artifactPayload);
  });

  it("ingests artifact_updated and updates artifact in accumulator map", () => {
    const accumulator = new StreamAccumulator();

    accumulator.handle({
      event_type: "artifact_created",
      artifact: {
        filename: "dashboard.html",
        title: "Sales Dashboard",
        mimeType: "text/html",
        version: 0,
        content: "<h1>v0</h1>",
        isComplete: false,
      },
    });

    const updatedPayload: ArtifactStreamPayload = {
      filename: "dashboard.html",
      title: "Sales Dashboard",
      mimeType: "text/html",
      version: 1,
      content: "<h1>v1</h1>",
      isComplete: true,
    };

    const outcome = accumulator.handle({
      event_type: "artifact_updated",
      artifact: updatedPayload,
    });
    expect(outcome).toBe("yield");

    const snapshot = accumulator.snapshot();
    const customMeta = snapshot.metadata?.custom as Record<string, unknown>;
    const artifacts = customMeta.artifacts as ArtifactStreamPayload[];
    expect(artifacts.length).toBe(1);
    expect(artifacts[0].version).toBe(1);
    expect(artifacts[0].content).toBe("<h1>v1</h1>");
    expect(customMeta.artifactEvent).toEqual(updatedPayload);
  });

  it("accumulates multiple distinct artifacts", () => {
    const accumulator = new StreamAccumulator();

    accumulator.handle({
      event_type: "artifact_created",
      artifact: {
        filename: "data.csv",
        title: "Sales Data",
        mimeType: "text/csv",
        version: 0,
        content: "a,b,c",
      },
    });

    accumulator.handle({
      event_type: "artifact_created",
      artifact: {
        filename: "chart.svg",
        title: "Sales Chart",
        mimeType: "image/svg+xml",
        version: 0,
        content: "<svg></svg>",
      },
    });

    const snapshot = accumulator.snapshot();
    const customMeta = snapshot.metadata?.custom as Record<string, unknown>;
    const artifacts = customMeta.artifacts as ArtifactStreamPayload[];
    expect(artifacts.length).toBe(2);
    expect(artifacts.map((a) => a.filename)).toEqual(["data.csv", "chart.svg"]);
  });
});
