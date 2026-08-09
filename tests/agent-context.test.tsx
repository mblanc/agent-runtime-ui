import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AgentProvider, useActiveAgent } from "@/lib/agent-context";
import type { DeployedAgent } from "@/types/agent";

const mockAgents: DeployedAgent[] = [
  {
    id: "mock-arch-advisor",
    resourceName:
      "projects/mock-project/locations/us-central1/reasoningEngines/mock-arch-advisor",
    displayName: "ADK Architecture Advisor",
    description: "Specialized in cloud architecture patterns and security",
    location: "us-central1",
    isDefault: true,
  },
  {
    id: "mock-code-reviewer",
    resourceName:
      "projects/mock-project/locations/europe-west4/reasoningEngines/mock-code-reviewer",
    displayName: "Code Reviewer & Auditor",
    description: "Automated code review and security audits",
    location: "europe-west4",
    isDefault: false,
  },
];

function TestConsumer() {
  const { activeAgent, availableAgents, setActiveAgent, isLoading, error } =
    useActiveAgent();

  if (isLoading) return <div>Loading agents...</div>;
  if (error) return <div>Error: {error}</div>;

  return (
    <div>
      <div data-testid="active-agent-name">{activeAgent?.displayName}</div>
      <div data-testid="active-agent-id">{activeAgent?.id}</div>
      <div data-testid="active-agent-location">{activeAgent?.location}</div>
      <div data-testid="available-count">{availableAgents.length}</div>
      <button
        onClick={() => setActiveAgent("mock-code-reviewer")}
        data-testid="switch-to-code-reviewer"
      >
        Switch to Code Reviewer
      </button>
    </div>
  );
}

const mockLocalStorageStore: Record<string, string> = {};
const mockLocalStorage = {
  getItem: (key: string) => mockLocalStorageStore[key] ?? null,
  setItem: (key: string, value: string) => {
    mockLocalStorageStore[key] = String(value);
  },
  removeItem: (key: string) => {
    delete mockLocalStorageStore[key];
  },
  clear: () => {
    for (const key of Object.keys(mockLocalStorageStore)) {
      delete mockLocalStorageStore[key];
    }
  },
};

if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", {
    value: mockLocalStorage,
    writable: true,
  });
}
(globalThis as unknown as { localStorage: typeof mockLocalStorage }).localStorage =
  mockLocalStorage;

describe("ActiveAgentContext & AgentProvider", () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    mockLocalStorage.clear();
  });

  it("throws error when useActiveAgent is used outside AgentProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      "useActiveAgent must be used within an AgentProvider"
    );
    consoleError.mockRestore();
  });

  it("initializes with provided initialAgents and selects default agent", () => {
    render(
      <AgentProvider initialAgents={mockAgents}>
        <TestConsumer />
      </AgentProvider>
    );

    expect(screen.getByTestId("active-agent-name").textContent).toBe(
      "ADK Architecture Advisor"
    );
    expect(screen.getByTestId("active-agent-id").textContent).toBe("mock-arch-advisor");
    expect(screen.getByTestId("active-agent-location").textContent).toBe("us-central1");
    expect(screen.getByTestId("available-count").textContent).toBe("2");
  });

  it("fetches agents from /api/agents when initialAgents not provided", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        agents: mockAgents,
        activeAgentId: "mock-code-reviewer",
      }),
    } as Response);

    render(
      <AgentProvider>
        <TestConsumer />
      </AgentProvider>
    );

    expect(screen.getByText("Loading agents...")).toBeDefined();

    await waitFor(() => {
      expect(screen.getByTestId("active-agent-name").textContent).toBe(
        "Code Reviewer & Auditor"
      );
    });

    expect(screen.getByTestId("active-agent-id").textContent).toBe("mock-code-reviewer");
    expect(screen.getByTestId("active-agent-location").textContent).toBe("europe-west4");
  });

  it("switches active agent and persists choice to localStorage", async () => {
    render(
      <AgentProvider initialAgents={mockAgents}>
        <TestConsumer />
      </AgentProvider>
    );

    expect(screen.getByTestId("active-agent-id").textContent).toBe("mock-arch-advisor");

    fireEvent.click(screen.getByTestId("switch-to-code-reviewer"));

    expect(screen.getByTestId("active-agent-id").textContent).toBe("mock-code-reviewer");
    expect(screen.getByTestId("active-agent-name").textContent).toBe(
      "Code Reviewer & Auditor"
    );
    expect(mockLocalStorage.getItem("agent_runtime_active_agent_id")).toBe(
      "mock-code-reviewer"
    );
  });

  it("restores active agent from localStorage if valid", async () => {
    mockLocalStorage.setItem("agent_runtime_active_agent_id", "mock-code-reviewer");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        agents: mockAgents,
        activeAgentId: "mock-arch-advisor",
      }),
    } as Response);

    render(
      <AgentProvider>
        <TestConsumer />
      </AgentProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("active-agent-id").textContent).toBe(
        "mock-code-reviewer"
      );
    });
  });

  it("falls back to default agent when localStorage contains non-existent agent ID", async () => {
    mockLocalStorage.setItem("agent_runtime_active_agent_id", "invalid-deleted-agent");

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        agents: mockAgents,
        activeAgentId: "mock-arch-advisor",
      }),
    } as Response);

    render(
      <AgentProvider>
        <TestConsumer />
      </AgentProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("active-agent-id").textContent).toBe("mock-arch-advisor");
    });
  });

  it("useOptionalActiveAgent returns undefined when outside provider", async () => {
    const { useOptionalActiveAgent } = await import("@/lib/agent-context");
    const { renderHook } = await import("@testing-library/react");

    const { result } = renderHook(() => useOptionalActiveAgent());
    expect(result.current).toBeUndefined();
  });

  it("handles fetch error from /api/agents gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as Response);

    render(
      <AgentProvider>
        <TestConsumer />
      </AgentProvider>
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to fetch agents/i)).toBeDefined();
    });
  });
});
