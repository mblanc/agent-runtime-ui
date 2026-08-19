import { describe, it, expect } from "vitest";
import { MockAgentRuntimeProvider } from "@/lib/agent-runtime/mock/mock-provider";
import { mockArtifactsStore } from "@/lib/agent-runtime/mock/mock-store";
import type { AgentStreamEvent, ChatRequestBody } from "@/types/agent";

describe("Artifacts Store & Mock Provider", () => {
  const provider = new MockAgentRuntimeProvider();

  it("lists all session artifacts for a given session", async () => {
    const artifacts = await provider.listArtifacts("1", "test-user");
    expect(artifacts.length).toBeGreaterThanOrEqual(4);

    const filenames = artifacts.map((a) => a.filename);
    expect(filenames).toContain("sales_dashboard.html");
    expect(filenames).toContain("quarterly_revenue.csv");
    expect(filenames).toContain("system_architecture.svg");
    expect(filenames).toContain("pipeline_analysis.py");
  });

  it("retrieves the latest version of an artifact when version is omitted", async () => {
    const res = await provider.getArtifact(
      "1",
      "sales_dashboard.html",
      undefined,
      "test-user"
    );
    expect(res).not.toBeNull();
    expect(res?.artifact.filename).toBe("sales_dashboard.html");
    expect(res?.selectedVersion.version).toBe(2);
    expect(res?.selectedVersion.content).toContain(
      "Enterprise Sales Performance Dashboard"
    );
  });

  it("retrieves a specific version when version parameter is provided", async () => {
    const v0Res = await provider.getArtifact("1", "sales_dashboard.html", 0, "test-user");
    expect(v0Res).not.toBeNull();
    expect(v0Res?.selectedVersion.version).toBe(0);
    expect(v0Res?.selectedVersion.content).toContain("Sales Dashboard v0");

    const v1Res = await provider.getArtifact("1", "sales_dashboard.html", 1, "test-user");
    expect(v1Res).not.toBeNull();
    expect(v1Res?.selectedVersion.version).toBe(1);
    expect(v1Res?.selectedVersion.content).toContain("Sales Dashboard v1");
  });

  it("returns null for non-existent artifact or invalid version", async () => {
    const notFound = await provider.getArtifact(
      "1",
      "non_existent.html",
      undefined,
      "test-user"
    );
    expect(notFound).toBeNull();

    const invalidVersion = await provider.getArtifact(
      "1",
      "sales_dashboard.html",
      99,
      "test-user"
    );
    expect(invalidVersion).toBeNull();
  });

  it("includes user-scoped artifacts across sessions", async () => {
    // Inject a user-scoped artifact in another session
    const existing = mockArtifactsStore.get("test-user-session") || [];
    mockArtifactsStore.set("test-user-session", [
      ...existing,
      {
        id: "user_preferences.json",
        sessionId: "test-user-session",
        userId: "test-user",
        filename: "user_preferences.json",
        title: "User Global Settings",
        mimeType: "application/json",
        currentVersion: 0,
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString(),
        scope: "user",
        versions: [
          {
            version: 0,
            content: `{"theme": "dark", "layout": "split"}`,
            createTime: new Date().toISOString(),
            sizeBytes: 36,
            mimeType: "application/json",
          },
        ],
      },
    ]);

    const artifacts = await provider.listArtifacts("1", "test-user");
    const userPref = artifacts.find((a) => a.filename === "user_preferences.json");
    expect(userPref).toBeDefined();
    expect(userPref?.scope).toBe("user");
  });

  it("streams artifact_created and artifact_updated events for artifact prompts", async () => {
    const requestBody: ChatRequestBody = {
      messages: [
        {
          role: "user",
          content: "Build a sales dashboard",
        },
      ],
    };

    const events: AgentStreamEvent[] = [];
    for await (const evt of provider.streamQuery(requestBody, "test-user")) {
      events.push(evt);
    }

    const createdEvent = events.find((e) => e.event_type === "artifact_created");
    expect(createdEvent).toBeDefined();
    expect(createdEvent?.artifact?.filename).toBe("sales_dashboard.html");
    expect(createdEvent?.artifact?.version).toBe(0);

    const updatedEvent = events.find((e) => e.event_type === "artifact_updated");
    expect(updatedEvent).toBeDefined();
    expect(updatedEvent?.artifact?.filename).toBe("sales_dashboard.html");
    expect(updatedEvent?.artifact?.version).toBe(1);

    const contentEvents = events.filter((e) => e.event_type === "content");
    const fullText = contentEvents.map((e) => e.content || "").join("");
    expect(fullText).toContain("sales_dashboard.html");
  });

  it("streams CSV artifacts when prompted for data tables or CSV", async () => {
    const requestBody: ChatRequestBody = {
      messages: [
        {
          role: "user",
          content: "Export quarterly revenue as a CSV data table",
        },
      ],
    };

    const events: AgentStreamEvent[] = [];
    for await (const evt of provider.streamQuery(requestBody, "test-user")) {
      events.push(evt);
    }

    const createdEvent = events.find((e) => e.event_type === "artifact_created");
    expect(createdEvent).toBeDefined();
    expect(createdEvent?.artifact?.filename).toBe("quarterly_revenue.csv");
    expect(createdEvent?.artifact?.mimeType).toBe("text/csv");
  });
});
