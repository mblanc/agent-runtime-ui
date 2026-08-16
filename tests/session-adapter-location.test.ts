import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

// The history adapter reads the active thread's remoteId off the assistant-ui
// store. Stub it so the adapter can be exercised outside a runtime provider.
vi.mock("@assistant-ui/store", () => ({
  useAui: () => ({
    threadListItem: { getState: () => ({ remoteId: "session-history-1" }) },
    thread: { getState: () => ({ messages: [], isRunning: false }) },
  }),
}));

import {
  useSessionThreadHistoryAdapter,
  useSessionThreadListAdapter,
} from "@/lib/session-adapter";

const AGENT_ID = "1234567890";
const LOCATION = "europe-west4";

function okJson(body: unknown) {
  return { ok: true, json: async () => body } as Response;
}

function requestedUrl(spy: ReturnType<typeof vi.spyOn>, call = 0): string {
  return String((spy.mock.calls[call] as unknown[])[0]);
}

describe("session-adapter threads the agent location into session API requests", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("list sends agentId and location", async () => {
    fetchSpy.mockResolvedValue(okJson({ sessions: [] }));

    const { result } = renderHook(() =>
      useSessionThreadListAdapter("user-1", AGENT_ID, LOCATION)
    );
    await result.current.list();

    const url = new URL(requestedUrl(fetchSpy));
    expect(url.pathname).toBe("/api/sessions");
    expect(url.searchParams.get("userId")).toBe("user-1");
    expect(url.searchParams.get("agentId")).toBe(AGENT_ID);
    expect(url.searchParams.get("location")).toBe(LOCATION);
  });

  it("fetch sends agentId and location", async () => {
    fetchSpy.mockResolvedValue(okJson({ session: { id: "s-1", title: "t" } }));

    const { result } = renderHook(() =>
      useSessionThreadListAdapter("user-1", AGENT_ID, LOCATION)
    );
    await result.current.fetch("s-1");

    const url = new URL(requestedUrl(fetchSpy));
    expect(url.pathname).toBe("/api/sessions/s-1");
    expect(url.searchParams.get("agentId")).toBe(AGENT_ID);
    expect(url.searchParams.get("location")).toBe(LOCATION);
  });

  it("delete sends agentId and location", async () => {
    fetchSpy.mockResolvedValue(okJson({ success: true }));

    const { result } = renderHook(() =>
      useSessionThreadListAdapter("user-1", AGENT_ID, LOCATION)
    );
    await result.current.delete("s-2");

    const url = new URL(requestedUrl(fetchSpy));
    expect(url.pathname).toBe("/api/sessions/s-2");
    expect(url.searchParams.get("agentId")).toBe(AGENT_ID);
    expect(url.searchParams.get("location")).toBe(LOCATION);
  });

  it("rename sends agentId and location", async () => {
    fetchSpy.mockResolvedValue(okJson({ success: true }));

    const { result } = renderHook(() =>
      useSessionThreadListAdapter("user-1", AGENT_ID, LOCATION)
    );
    await result.current.rename("s-3", "Renamed");

    const url = new URL(requestedUrl(fetchSpy));
    expect(url.pathname).toBe("/api/sessions/s-3");
    expect(url.searchParams.get("agentId")).toBe(AGENT_ID);
    expect(url.searchParams.get("location")).toBe(LOCATION);
  });

  it("initialize sends agentId and location in the POST body", async () => {
    fetchSpy.mockResolvedValue(okJson({ session: { id: "s-4" } }));

    const { result } = renderHook(() =>
      useSessionThreadListAdapter("user-1", AGENT_ID, LOCATION)
    );
    await result.current.initialize("local-1");

    const init = (fetchSpy.mock.calls[0] as unknown[])[1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      agentId: AGENT_ID,
      location: LOCATION,
    });
  });

  it("history load sends agentId and location", async () => {
    fetchSpy.mockResolvedValue(okJson({ messages: [] }));

    const { result } = renderHook(() =>
      useSessionThreadHistoryAdapter(AGENT_ID, LOCATION)
    );
    await result.current.load();

    const url = new URL(requestedUrl(fetchSpy));
    expect(url.pathname).toBe("/api/sessions/session-history-1");
    expect(url.searchParams.get("agentId")).toBe(AGENT_ID);
    expect(url.searchParams.get("location")).toBe(LOCATION);
  });

  it("history load picks up a location change without a new adapter identity", async () => {
    fetchSpy.mockResolvedValue(okJson({ messages: [] }));

    const { result, rerender } = renderHook(
      ({ location }: { location: string }) =>
        useSessionThreadHistoryAdapter(AGENT_ID, location),
      { initialProps: { location: LOCATION } }
    );
    const firstAdapter = result.current;

    rerender({ location: "us-east4" });
    // The adapter object identity is deliberately stable across renders; the new
    // location must still reach the request via the ref.
    expect(result.current).toBe(firstAdapter);

    await result.current.load();
    const url = new URL(requestedUrl(fetchSpy));
    expect(url.searchParams.get("location")).toBe("us-east4");
  });

  it("omits the query string entirely when no agent is active", async () => {
    fetchSpy.mockResolvedValue(okJson({ session: { id: "s-5", title: "t" } }));

    const { result } = renderHook(() => useSessionThreadListAdapter("user-1"));
    await result.current.fetch("s-5");

    expect(requestedUrl(fetchSpy)).toMatch(/\/api\/sessions\/s-5$/);
  });
});
