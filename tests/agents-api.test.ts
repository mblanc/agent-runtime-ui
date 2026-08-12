import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as listAgents } from "@/app/api/agents/route";
import { auth } from "@/lib/auth";

describe("Agents API Route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.MOCK_AGENT_RUNTIME = "true";
  });

  it("returns 401 when unauthenticated", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost:3000/api/agents");
    const res = await listAgents(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("Unauthorized");
  });

  it("returns list of available reasoning engines when authenticated", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: {
        id: "test-user",
        name: "Test User",
        email: "test@example.com",
      },
      session: {
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
    });

    const req = new NextRequest("http://localhost:3000/api/agents");
    const res = await listAgents(req);

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data).toHaveProperty("agents");
    expect(data).toHaveProperty("activeAgentId");
    expect(Array.isArray(data.agents)).toBe(true);
    expect(data.agents.length).toBe(4);

    const archAgent = data.agents.find(
      (a: { id: string }) => a.id === "mock-arch-advisor"
    );
    expect(archAgent).toBeDefined();
    expect(archAgent.displayName).toBe("ADK Architecture Advisor");
    expect(archAgent.location).toBe("us-central1");

    const codeAgent = data.agents.find(
      (a: { id: string }) => a.id === "mock-code-reviewer"
    );
    expect(codeAgent).toBeDefined();
    expect(codeAgent.displayName).toBe("Code Reviewer & Auditor");
    expect(codeAgent.location).toBe("europe-west4");

    const opsAgent = data.agents.find((a: { id: string }) => a.id === "mock-cloud-ops");
    expect(opsAgent).toBeDefined();
    expect(opsAgent.displayName).toBe("Cloud Ops Assistant");
    expect(opsAgent.location).toBe("us-central1");

    const genericAgent = data.agents.find((a: { id: string }) => a.id === "generic-agent");
    expect(genericAgent).toBeDefined();
    expect(genericAgent.displayName).toBe("Generic Agent");
    expect(genericAgent.location).toBe("us-central1");
  });

  it("sets proper cache headers on agents response", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: {
        id: "test-user",
        name: "Test User",
        email: "test@example.com",
      },
      session: {
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
    });

    const req = new NextRequest("http://localhost:3000/api/agents");
    const res = await listAgents(req);

    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("returns 500 when AgentRuntimeClient fails to list reasoning engines", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: {
        id: "test-user",
        name: "Test User",
        email: "test@example.com",
      },
      session: {
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
      },
    });

    const { AgentRuntimeClient } = await import("@/lib/agent-runtime-client");
    vi.spyOn(AgentRuntimeClient.prototype, "listReasoningEngines").mockRejectedValueOnce(
      new Error("GCP Discovery Service Unavailable")
    );

    const req = new NextRequest("http://localhost:3000/api/agents");
    const res = await listAgents(req);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toContain("GCP Discovery Service Unavailable");
  });
});
