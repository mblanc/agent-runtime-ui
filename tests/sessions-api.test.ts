import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as listSessions, POST as createSession } from "@/app/api/sessions/route";
import {
  GET as getSessionDetail,
  DELETE as deleteSession,
} from "@/app/api/sessions/[sessionId]/route";
import { auth } from "@/lib/auth";

describe("Sessions API Routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/sessions", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/sessions");
      const res = await listSessions(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Unauthorized");
    });

    it("returns user sessions when authenticated", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/sessions");
      const res = await listSessions(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.sessions)).toBe(true);
      expect(data.sessions.length).toBeGreaterThanOrEqual(1);
      expect(data.sessions[0]).toHaveProperty("id");
      expect(data.sessions[0]).toHaveProperty("title");
    });
  });

  describe("POST /api/sessions", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/sessions", {
        method: "POST",
        body: JSON.stringify({ title: "New Chat" }),
      });
      const res = await createSession(req);

      expect(res.status).toBe(401);
    });

    it("creates a new session when authenticated", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/sessions", {
        method: "POST",
        body: JSON.stringify({ title: "BFF Test Thread" }),
      });
      const res = await createSession(req);

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.session).toBeDefined();
      expect(data.session.title).toBe("BFF Test Thread");
      expect(data.session.userId).toBe("test-user");
    });
  });

  describe("GET /api/sessions/[sessionId]", () => {
    it("returns session details and event history", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/sessions/1");
      const res = await getSessionDetail(req, {
        params: Promise.resolve({ sessionId: "1" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.session).toBeDefined();
      expect(data.session.id).toBe("1");
      expect(Array.isArray(data.events)).toBe(true);
      expect(data.events.length).toBeGreaterThanOrEqual(2);
    });

    it("returns 404 for non-existent session", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/sessions/non-existent-123");
      const res = await getSessionDetail(req, {
        params: Promise.resolve({ sessionId: "non-existent-123" }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/sessions/[sessionId]", () => {
    it("deletes a session successfully", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: {
          id: "test-user",
          name: "Test User",
          email: "test@example.com",
        },
        session: {
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      // Create one first
      const createReq = new NextRequest("http://localhost:3000/api/sessions", {
        method: "POST",
        body: JSON.stringify({ title: "Delete Me" }),
      });
      const createRes = await createSession(createReq);
      const { session } = await createRes.json();

      // Delete it
      const deleteReq = new NextRequest(
        `http://localhost:3000/api/sessions/${session.id}`,
        {
          method: "DELETE",
        }
      );
      const deleteRes = await deleteSession(deleteReq, {
        params: Promise.resolve({ sessionId: session.id }),
      });

      expect(deleteRes.status).toBe(200);
      const deleteData = await deleteRes.json();
      expect(deleteData.success).toBe(true);
      expect(deleteData.deletedSessionId).toBe(session.id);
    });
  });

  describe("PATCH /api/sessions/[sessionId]", () => {
    it("updates session title successfully", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: {
          id: "test-user",
          name: "Test User",
          email: "test@example.com",
        },
        session: {
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      // Create session
      const createReq = new NextRequest("http://localhost:3000/api/sessions", {
        method: "POST",
        body: JSON.stringify({ title: "Original Title" }),
      });
      const createRes = await createSession(createReq);
      const { session } = await createRes.json();

      // Patch title
      const { PATCH: patchSession } =
        await import("@/app/api/sessions/[sessionId]/route");
      const patchReq = new NextRequest(
        `http://localhost:3000/api/sessions/${session.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ title: "Updated Watchlist Discussion" }),
        }
      );
      const patchRes = await patchSession(patchReq, {
        params: Promise.resolve({ sessionId: session.id }),
      });

      expect(patchRes.status).toBe(200);
      const patchData = await patchRes.json();
      expect(patchData.success).toBe(true);
      expect(patchData.title).toBe("Updated Watchlist Discussion");
    });
  });

  describe("Cross-User Ownership Authorization (IDOR Security)", () => {
    it("returns 404 when requesting another user's session via GET", async () => {
      // User A creates a session
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: { id: "user-A", name: "User A", email: "usera@example.com" },
        session: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
      });

      const createReq = new NextRequest("http://localhost:3000/api/sessions", {
        method: "POST",
        body: JSON.stringify({ title: "User A Private Chat" }),
      });
      const createRes = await createSession(createReq);
      const { session } = await createRes.json();

      // User B attempts to GET User A's session
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: { id: "user-B", name: "User B", email: "userb@example.com" },
        session: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
      });

      const getReq = new NextRequest(`http://localhost:3000/api/sessions/${session.id}`);
      const getRes = await getSessionDetail(getReq, {
        params: Promise.resolve({ sessionId: session.id }),
      });

      expect(getRes.status).toBe(404);
    });

    it("returns 403 when updating another user's session via PATCH", async () => {
      // User A creates a session
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: { id: "user-A", name: "User A", email: "usera@example.com" },
        session: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
      });

      const createReq = new NextRequest("http://localhost:3000/api/sessions", {
        method: "POST",
        body: JSON.stringify({ title: "User A Private Chat" }),
      });
      const createRes = await createSession(createReq);
      const { session } = await createRes.json();

      // User B attempts to PATCH User A's session
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: { id: "user-B", name: "User B", email: "userb@example.com" },
        session: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
      });

      const { PATCH: patchSession } =
        await import("@/app/api/sessions/[sessionId]/route");
      const patchReq = new NextRequest(
        `http://localhost:3000/api/sessions/${session.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ title: "Hacked Title" }),
        }
      );
      const patchRes = await patchSession(patchReq, {
        params: Promise.resolve({ sessionId: session.id }),
      });

      expect(patchRes.status).toBe(403);
    });

    it("returns 403 when deleting another user's session via DELETE", async () => {
      // User A creates a session
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: { id: "user-A", name: "User A", email: "usera@example.com" },
        session: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
      });

      const createReq = new NextRequest("http://localhost:3000/api/sessions", {
        method: "POST",
        body: JSON.stringify({ title: "User A Private Chat" }),
      });
      const createRes = await createSession(createReq);
      const { session } = await createRes.json();

      // User B attempts to DELETE User A's session
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: { id: "user-B", name: "User B", email: "userb@example.com" },
        session: { expiresAt: new Date(Date.now() + 86400000).toISOString() },
      });

      const deleteReq = new NextRequest(
        `http://localhost:3000/api/sessions/${session.id}`,
        {
          method: "DELETE",
        }
      );
      const deleteRes = await deleteSession(deleteReq, {
        params: Promise.resolve({ sessionId: session.id }),
      });

      expect(deleteRes.status).toBe(403);
    });
  });
});
