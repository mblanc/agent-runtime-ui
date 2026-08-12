import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryProvider, useMemory, useOptionalMemory } from "@/lib/memory-context";
import type { AgentMemory } from "@/types/agent";

const mockInitialMemories: AgentMemory[] = [
  {
    id: "mem-1",
    userId: "test-user",
    fact: "Prefers TypeScript with strict typing",
    topic: "coding_preferences",
    createTime: new Date().toISOString(),
    updateTime: new Date().toISOString(),
  },
  {
    id: "mem-2",
    userId: "test-user",
    fact: "Always uses Bun package manager",
    topic: "coding_preferences",
    createTime: new Date().toISOString(),
    updateTime: new Date().toISOString(),
  },
  {
    id: "mem-3",
    userId: "test-user",
    fact: "Project Lead for Cloud Migration",
    topic: "enterprise_context",
    createTime: new Date().toISOString(),
    updateTime: new Date().toISOString(),
  },
];

function TestConsumer() {
  const {
    memories,
    filteredMemories,
    topics,
    activeTopic,
    isDrawerOpen,
    setIsDrawerOpen,
    setTopic,
    setSearchQuery,
    createMemory,
    updateMemory,
    deleteMemory,
    isLoading,
  } = useMemory();

  if (isLoading) return <div>Loading memories...</div>;

  return (
    <div>
      <div data-testid="total-count">{memories.length}</div>
      <div data-testid="filtered-count">{filteredMemories.length}</div>
      <div data-testid="active-topic">{activeTopic}</div>
      <div data-testid="drawer-status">{isDrawerOpen ? "open" : "closed"}</div>
      <div data-testid="topics-list">
        {topics.map((t) => `${t.name}:${t.count}`).join(",")}
      </div>
      <ul>
        {filteredMemories.map((m) => (
          <li key={m.id} data-testid={`memory-item-${m.id}`}>
            {m.fact} ({m.topic})
          </li>
        ))}
      </ul>
      <button
        data-testid="toggle-drawer-btn"
        onClick={() => setIsDrawerOpen(!isDrawerOpen)}
      >
        Toggle Drawer
      </button>
      <button
        data-testid="filter-coding-btn"
        onClick={() => setTopic("coding_preferences")}
      >
        Filter Coding
      </button>
      <button data-testid="search-bun-btn" onClick={() => setSearchQuery("Bun")}>
        Search Bun
      </button>
      <button
        data-testid="add-memory-btn"
        onClick={() => createMemory("Prefers Tailwind CSS v3", "coding_preferences")}
      >
        Add Memory
      </button>
      <button
        data-testid="update-memory-btn"
        onClick={() =>
          updateMemory("mem-1", "Prefers TypeScript 5.8", "coding_preferences")
        }
      >
        Update Memory
      </button>
      <button data-testid="delete-memory-btn" onClick={() => deleteMemory("mem-2")}>
        Delete Memory
      </button>
    </div>
  );
}

describe("Memory Context & Provider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("throws error when useMemory is used outside MemoryProvider", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<TestConsumer />)).toThrow(
      "useMemory must be used within a MemoryProvider"
    );
    consoleError.mockRestore();
  });

  it("returns undefined when useOptionalMemory is used outside provider", () => {
    function OptionalConsumer() {
      const ctx = useOptionalMemory();
      return <div data-testid="is-defined">{ctx ? "yes" : "no"}</div>;
    }
    render(<OptionalConsumer />);
    expect(screen.getByTestId("is-defined").textContent).toBe("no");
  });

  it("initializes with initialMemories and computes topic counts", () => {
    render(
      <MemoryProvider initialMemories={mockInitialMemories}>
        <TestConsumer />
      </MemoryProvider>
    );

    expect(screen.getByTestId("total-count").textContent).toBe("3");
    expect(screen.getByTestId("filtered-count").textContent).toBe("3");
    expect(screen.getByTestId("topics-list").textContent).toContain(
      "coding_preferences:2"
    );
    expect(screen.getByTestId("topics-list").textContent).toContain(
      "enterprise_context:1"
    );
  });

  it("filters memories by topic", () => {
    render(
      <MemoryProvider initialMemories={mockInitialMemories}>
        <TestConsumer />
      </MemoryProvider>
    );

    fireEvent.click(screen.getByTestId("filter-coding-btn"));
    expect(screen.getByTestId("active-topic").textContent).toBe("coding_preferences");
    expect(screen.getByTestId("filtered-count").textContent).toBe("2");
    expect(screen.queryByTestId("memory-item-mem-3")).toBeNull();
  });

  it("filters memories by search query", () => {
    render(
      <MemoryProvider initialMemories={mockInitialMemories}>
        <TestConsumer />
      </MemoryProvider>
    );

    fireEvent.click(screen.getByTestId("search-bun-btn"));
    expect(screen.getByTestId("filtered-count").textContent).toBe("1");
    expect(screen.getByTestId("memory-item-mem-2")).toBeDefined();
    expect(screen.queryByTestId("memory-item-mem-1")).toBeNull();
  });

  it("toggles drawer open state", () => {
    render(
      <MemoryProvider initialMemories={mockInitialMemories}>
        <TestConsumer />
      </MemoryProvider>
    );

    expect(screen.getByTestId("drawer-status").textContent).toBe("closed");
    fireEvent.click(screen.getByTestId("toggle-drawer-btn"));
    expect(screen.getByTestId("drawer-status").textContent).toBe("open");
  });

  it("optimistically adds, updates, and deletes memories with mock API", async () => {
    global.fetch = vi.fn().mockImplementation((url: string, opts?: RequestInit) => {
      if (url === "/api/memory" && opts?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "mem-new-1",
              userId: "test-user",
              fact: "Prefers Tailwind CSS v3",
              topic: "coding_preferences",
              createTime: new Date().toISOString(),
              updateTime: new Date().toISOString(),
            }),
        });
      }
      if (url.includes("/api/memory/mem-1") && opts?.method === "PATCH") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              id: "mem-1",
              userId: "test-user",
              fact: "Prefers TypeScript 5.8",
              topic: "coding_preferences",
              createTime: new Date().toISOString(),
              updateTime: new Date().toISOString(),
            }),
        });
      }
      if (url.includes("/api/memory/mem-2") && opts?.method === "DELETE") {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, deletedId: "mem-2" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ memories: mockInitialMemories, totalCount: 3 }),
      });
    }) as unknown as typeof fetch;

    render(
      <MemoryProvider initialMemories={mockInitialMemories}>
        <TestConsumer />
      </MemoryProvider>
    );

    // Create memory
    fireEvent.click(screen.getByTestId("add-memory-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("total-count").textContent).toBe("4");
    });

    // Update memory
    fireEvent.click(screen.getByTestId("update-memory-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("memory-item-mem-1").textContent).toContain(
        "TypeScript 5.8"
      );
    });

    // Delete memory
    fireEvent.click(screen.getByTestId("delete-memory-btn"));
    await waitFor(() => {
      expect(screen.getByTestId("total-count").textContent).toBe("3");
      expect(screen.queryByTestId("memory-item-mem-2")).toBeNull();
    });
  });

  it("fetches memories scoped with activeAgent parameters from AgentProvider", async () => {
    let capturedUrl = "";
    global.fetch = vi.fn().mockImplementation((url: string) => {
      capturedUrl = url;
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            memories: [
              {
                id: "mem-iw-1",
                userId: "107197175468507396372",
                fact: "Follows semiconductor quarterly earnings",
                topic: "enterprise_context",
                createTime: new Date().toISOString(),
                updateTime: new Date().toISOString(),
              },
            ],
            totalCount: 1,
          }),
      });
    }) as unknown as typeof fetch;

    const { AgentProvider } = await import("@/lib/agent-context");

    render(
      <AgentProvider
        initialAgents={[
          {
            id: "industry-watch",
            resourceName:
              "projects/test-proj/locations/us-central1/reasoningEngines/industry-watch",
            displayName: "Industry Watch Agent",
            description: "Monitors tech & chip trends",
            location: "us-central1",
            isDefault: true,
          },
        ]}
      >
        <MemoryProvider>
          <TestConsumer />
        </MemoryProvider>
      </AgentProvider>
    );

    await waitFor(() => {
      expect(capturedUrl).toContain("agentId=industry-watch");
      expect(capturedUrl).toContain("location=us-central1");
      expect(screen.getByTestId("total-count").textContent).toBe("1");
      expect(screen.getByTestId("memory-item-mem-iw-1").textContent).toContain(
        "semiconductor quarterly earnings"
      );
    });
  });
});
