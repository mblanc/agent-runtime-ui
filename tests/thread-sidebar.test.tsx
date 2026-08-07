import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useRemoteThreadListRuntime,
} from "@assistant-ui/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThreadSidebar } from "@/components/assistant-ui/thread-sidebar";
import { useSessionThreadListAdapter } from "@/lib/session-adapter";

// Mock auth-client session
vi.mock("@/lib/auth-client", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "test-user",
        name: "Test Developer",
        email: "dev@example.com",
      },
    },
    isPending: false,
  }),
  signOut: vi.fn(),
}));

// Mock settings storage
vi.mock("@/lib/utils", async () => {
  const actual = await vi.importActual("@/lib/utils");
  return {
    ...actual,
    getStoredSettings: () => ({
      modelTier: "pro",
      temperature: 0.7,
      maxOutputTokens: 2048,
    }),
    saveStoredSettings: vi.fn(),
  };
});

function TestSidebarWrapper() {
  const adapter = useSessionThreadListAdapter();
  const runtime = useRemoteThreadListRuntime({
    runtimeHook: function useTestRuntime() {
      return useLocalRuntime({
        async *run() {
          yield { content: [{ type: "text", text: "ok" }] };
        },
      });
    },
    adapter,
  });

  return (
    <TooltipProvider>
      <AssistantRuntimeProvider runtime={runtime}>
        <ThreadSidebar />
      </AssistantRuntimeProvider>
    </TooltipProvider>
  );
}

describe("ThreadSidebar Component", () => {
  it("renders expanded sidebar with header, new chat button, and recent chats section", () => {
    render(<TestSidebarWrapper />);

    expect(screen.getByText("Agent Runtime UI")).toBeDefined();
    expect(screen.getByText("New chat")).toBeDefined();
    expect(screen.getByText("Recent")).toBeDefined();
  });

  it("toggles collapse state when clicking the panel toggle button", () => {
    render(<TestSidebarWrapper />);

    const toggleBtn = screen.getByRole("button", { name: /collapse sidebar/i });
    expect(toggleBtn).toBeDefined();

    // Click to collapse
    fireEvent.click(toggleBtn);

    // Header label should no longer be visible
    expect(screen.queryByText("Agent Runtime UI")).toBeNull();

    // Toggle button should now show expand label
    const expandBtn = screen.getByRole("button", { name: /expand sidebar/i });
    expect(expandBtn).toBeDefined();

    // Click to expand again
    fireEvent.click(expandBtn);
    expect(screen.getByText("Agent Runtime UI")).toBeDefined();
  });

  it("renders sessions list and allows selecting a thread", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const urlStr = url.toString();
      if (urlStr.includes("/api/sessions/1")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            session: { id: "1", title: "ADK Agent Architecture" },
            events: [
              {
                id: "evt-1",
                role: "user",
                content: "How does ADK multi-agent orchestration work?",
                createTime: new Date().toISOString(),
              },
              {
                id: "evt-2",
                role: "assistant",
                content: "ADK provides hierarchical agent orchestration.",
                thought: "Analyzing ADK architecture...",
                createTime: new Date().toISOString(),
              },
            ],
            messages: [
              {
                id: "evt-1",
                role: "user",
                content: "How does ADK multi-agent orchestration work?",
              },
              {
                id: "evt-2",
                role: "assistant",
                content: [
                  {
                    type: "reasoning",
                    text: "Analyzing ADK architecture...",
                  },
                  {
                    type: "text",
                    text: "ADK provides hierarchical agent orchestration.",
                  },
                ],
              },
            ],
          }),
        } as Response);
      }

      if (urlStr.includes("/api/sessions")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            sessions: [
              {
                id: "1",
                title: "ADK Agent Architecture",
                createTime: new Date().toISOString(),
                updateTime: new Date().toISOString(),
              },
              {
                id: "2",
                title: "Architecture Review",
                createTime: new Date().toISOString(),
                updateTime: new Date().toISOString(),
              },
            ],
          }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({}),
      } as Response);
    });

    try {
      render(<TestSidebarWrapper />);

      // Wait for thread items to render
      const item1 = await screen.findByText("ADK Agent Architecture");
      const item2 = await screen.findByText("Architecture Review");
      expect(item1).toBeDefined();
      expect(item2).toBeDefined();

      // Click on session 1
      fireEvent.click(item1);

      // Click on session 2
      fireEvent.click(item2);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("exports unstable_Provider in useSessionThreadListAdapter", async () => {
    const { renderHook } = await import("@testing-library/react");
    const { result } = renderHook(() => useSessionThreadListAdapter("test-user"));
    expect(result.current.unstable_Provider).toBeDefined();
    expect(typeof result.current.unstable_Provider).toBe("function");
  });
});

describe("useSessionThreadListAdapter Direct Unit Tests", () => {
  it("initialize calls POST /api/sessions and returns new remoteId", async () => {
    const { renderHook } = await import("@testing-library/react");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        session: { id: "new-session-id-100", title: "New conversation" },
      }),
    } as Response);

    try {
      const { result } = renderHook(() => useSessionThreadListAdapter("user-123"));
      const res = await result.current.initialize("local-1");

      expect(res.remoteId).toBe("new-session-id-100");
      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/sessions"),
        expect.objectContaining({ method: "POST" })
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("rename calls PATCH /api/sessions/:id with new title", async () => {
    const { renderHook } = await import("@testing-library/react");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, title: "Renamed Thread" }),
    } as Response);

    try {
      const { result } = renderHook(() => useSessionThreadListAdapter());
      await result.current.rename("session-555", "Renamed Thread");

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/sessions/session-555"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ title: "Renamed Thread" }),
        })
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("delete calls DELETE /api/sessions/:id", async () => {
    const { renderHook } = await import("@testing-library/react");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, deletedSessionId: "session-555" }),
    } as Response);

    try {
      const { result } = renderHook(() => useSessionThreadListAdapter());
      await result.current.delete("session-555");

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/sessions/session-555"),
        expect.objectContaining({ method: "DELETE" })
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("generateTitle extracts first user message, capitalizes, truncates, and PATCHes session title", async () => {
    const { renderHook } = await import("@testing-library/react");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    try {
      const { result } = renderHook(() => useSessionThreadListAdapter());

      const mockMessages = [
        {
          id: "m1",
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: "what is the status of semiconductor supply chain in q3 2026?",
            },
          ],
          createdAt: new Date(),
        },
      ] as unknown as Parameters<
        NonNullable<ReturnType<typeof useSessionThreadListAdapter>["generateTitle"]>
      >[1];

      const stream = await result.current.generateTitle("session-777", mockMessages);
      expect(stream).toBeDefined();

      expect(fetchSpy).toHaveBeenCalledWith(
        expect.stringContaining("/api/sessions/session-777"),
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            title: "What is the status of semiconductor s...",
          }),
        })
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
