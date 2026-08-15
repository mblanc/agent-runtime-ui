import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import {
  GET as getSessionState,
  PATCH as updateSessionState,
} from "@/app/api/sessions/[sessionId]/state/route";
import { auth } from "@/lib/auth";

describe("Session State API Route (/api/sessions/[sessionId]/state)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/sessions/[sessionId]/state", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/sessions/1/state");
      const res = await getSessionState(req, {
        params: Promise.resolve({ sessionId: "1" }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Unauthorized");
    });

    it("returns session state dictionary when authenticated", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/sessions/1/state");
      const res = await getSessionState(req, {
        params: Promise.resolve({ sessionId: "1" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.sessionId).toBe("1");
      expect(data.state).toBeDefined();
      expect(data.state.target_cluster).toBe("prod-europe-west1");
    });

    it("returns empty state for local session IDs without calling backend", async () => {
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

      const req = new NextRequest(
        "http://localhost:3000/api/sessions/__LOCALID_abc/state"
      );
      const res = await getSessionState(req, {
        params: Promise.resolve({ sessionId: "__LOCALID_abc" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.state).toEqual({});
    });

    it("returns 404 when session is not found", async () => {
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

      const req = new NextRequest(
        "http://localhost:3000/api/sessions/nonexistent-session-id/state"
      );
      const res = await getSessionState(req, {
        params: Promise.resolve({ sessionId: "nonexistent-session-id" }),
      });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toContain("Session not found");
    });
  });

  describe("PATCH /api/sessions/[sessionId]/state", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/sessions/1/state", {
        method: "PATCH",
        body: JSON.stringify({ state: { cluster: "test" } }),
      });
      const res = await updateSessionState(req, {
        params: Promise.resolve({ sessionId: "1" }),
      });

      expect(res.status).toBe(401);
    });

    it("updates session state successfully with merge mode", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/sessions/1/state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: {
            selected_region: "europe-west1",
            active_replicas: 4,
          },
          mode: "merge",
        }),
      });
      const res = await updateSessionState(req, {
        params: Promise.resolve({ sessionId: "1" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.sessionId).toBe("1");
      expect(data.state.selected_region).toBe("europe-west1");
      expect(data.state.active_replicas).toBe(4);
    });

    it("returns 400 when body state is invalid or missing", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/sessions/1/state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: "invalid-string-not-map" }),
      });
      const res = await updateSessionState(req, {
        params: Promise.resolve({ sessionId: "1" }),
      });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid state dictionary");
    });
  });
});
