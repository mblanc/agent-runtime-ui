import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as listMemories, POST as createMemory } from "@/app/api/memory/route";
import {
  PATCH as updateMemory,
  DELETE as deleteMemory,
} from "@/app/api/memory/[memoryId]/route";
import { POST as generateMemories } from "@/app/api/memory/generate/route";
import { auth } from "@/lib/auth";
import {
  mockMemoriesStore,
  mockSessionsStore,
} from "@/lib/agent-runtime/mock/mock-store";

describe("Memory Bank API Routes", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockMemoriesStore.clear();
    mockMemoriesStore.set("mem-test-1", {
      id: "mem-test-1",
      userId: "test-user",
      fact: "Prefers TypeScript with strict typing",
      topic: "coding_preferences",
      confidenceScore: 0.95,
      createTime: new Date().toISOString(),
      updateTime: new Date().toISOString(),
    });
    mockMemoriesStore.set("mem-other-user", {
      id: "mem-other-user",
      userId: "other-user-999",
      fact: "Different user fact",
      topic: "general",
      confidenceScore: 0.9,
      createTime: new Date().toISOString(),
      updateTime: new Date().toISOString(),
    });
  });

  describe("GET /api/memory", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/memory");
      const res = await listMemories(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Unauthorized");
    });

    it("returns memories for the authenticated user", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/memory");
      const res = await listMemories(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.memories).toHaveLength(1);
      expect(data.totalCount).toBe(1);
      expect(data.memories[0].id).toBe("mem-test-1");
    });

    it("filters memories by topic", async () => {
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
        "http://localhost:3000/api/memory?topic=coding_preferences"
      );
      const res = await listMemories(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.memories).toHaveLength(1);

      // Query with non-matching topic
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

      const emptyReq = new NextRequest(
        "http://localhost:3000/api/memory?topic=enterprise_context"
      );
      const emptyRes = await listMemories(emptyReq);
      const emptyData = await emptyRes.json();
      expect(emptyData.memories).toHaveLength(0);
    });
  });

  describe("POST /api/memory", () => {
    it("returns 400 if fact is missing or empty", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/memory", {
        method: "POST",
        body: JSON.stringify({ fact: "" }),
      });
      const res = await createMemory(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Validation error");
    });

    it("creates a new memory when authenticated with valid payload", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/memory", {
        method: "POST",
        body: JSON.stringify({
          fact: "Prefers concise code without boilerplate",
          topic: "communication_style",
        }),
      });
      const res = await createMemory(req);

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.id).toBeDefined();
      expect(data.fact).toBe("Prefers concise code without boilerplate");
      expect(data.topic).toBe("communication_style");
      expect(data.userId).toBe("test-user");
    });
  });

  describe("PATCH /api/memory/[memoryId]", () => {
    it("updates fact and topic for existing memory", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/memory/mem-test-1", {
        method: "PATCH",
        body: JSON.stringify({
          fact: "Prefers TypeScript 5.8 with ESLint 9",
          topic: "coding_preferences",
        }),
      });
      const res = await updateMemory(req, {
        params: Promise.resolve({ memoryId: "mem-test-1" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.fact).toBe("Prefers TypeScript 5.8 with ESLint 9");
    });

    it("returns 403 when attempting to update another user's memory (IDOR protection)", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/memory/mem-other-user", {
        method: "PATCH",
        body: JSON.stringify({
          fact: "Malicious update attempt",
        }),
      });
      const res = await updateMemory(req, {
        params: Promise.resolve({ memoryId: "mem-other-user" }),
      });

      expect(res.status).toBe(403);
    });

    it("returns 404 for non-existent memory ID", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/memory/nonexistent-id", {
        method: "PATCH",
        body: JSON.stringify({
          fact: "Updating something nonexistent",
        }),
      });
      const res = await updateMemory(req, {
        params: Promise.resolve({ memoryId: "nonexistent-id" }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/memory/[memoryId]", () => {
    it("deletes owned memory successfully", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/memory/mem-test-1", {
        method: "DELETE",
      });
      const res = await deleteMemory(req, {
        params: Promise.resolve({ memoryId: "mem-test-1" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.deletedId).toBe("mem-test-1");
      expect(mockMemoriesStore.has("mem-test-1")).toBe(false);
    });

    it("returns 403 when attempting to delete another user's memory", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/memory/mem-other-user", {
        method: "DELETE",
      });
      const res = await deleteMemory(req, {
        params: Promise.resolve({ memoryId: "mem-other-user" }),
      });

      expect(res.status).toBe(403);
      expect(mockMemoriesStore.has("mem-other-user")).toBe(true);
    });
  });

  describe("POST /api/memory/generate", () => {
    it("extracts memories from a session", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/memory/generate", {
        method: "POST",
        body: JSON.stringify({ sessionId: "1" }),
      });
      const res = await generateMemories(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.extractedCount).toBeGreaterThan(0);
      expect(Array.isArray(data.memories)).toBe(true);
    });

    it("returns 403 when attempting to generate memories from another user's session (IDOR protection)", async () => {
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

      mockSessionsStore.set("session-other-user", {
        id: "session-other-user",
        name: "projects/mock-project/locations/us-central1/reasoningEngines/mock-arch-advisor/sessions/session-other-user",
        userId: "other-user",
        title: "Private chat",
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString(),
      });

      const req = new NextRequest("http://localhost:3000/api/memory/generate", {
        method: "POST",
        body: JSON.stringify({ sessionId: "session-other-user" }),
      });
      const res = await generateMemories(req);

      expect(res.status).toBe(403);
      mockSessionsStore.delete("session-other-user");
    });

    it("returns 400 if sessionId is missing", async () => {
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

      const req = new NextRequest("http://localhost:3000/api/memory/generate", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const res = await generateMemories(req);

      expect(res.status).toBe(400);
    });
  });
});
