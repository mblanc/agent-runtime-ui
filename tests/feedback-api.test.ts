import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as feedbackRoute } from "@/app/api/feedback/route";
import { auth } from "@/lib/auth";

describe("Feedback API Route (POST /api/feedback)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.MOCK_AGENT_RUNTIME = "true";
  });

  describe("Authentication & Authorization", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/feedback", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "1",
          feedbackType: "THUMBS_UP",
        }),
      });

      const res = await feedbackRoute(req);
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Unauthorized");
    });
  });

  describe("Input Validation", () => {
    beforeEach(() => {
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: {
          id: "test-user-id",
          name: "Test User",
          email: "test@example.com",
        },
        session: {
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      });
    });

    it("returns 400 when request body is invalid JSON", async () => {
      const req = new NextRequest("http://localhost:3000/api/feedback", {
        method: "POST",
        body: "not a json string",
      });

      const res = await feedbackRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("Invalid request payload");
    });

    it("returns 400 when sessionId is missing or empty", async () => {
      const req = new NextRequest("http://localhost:3000/api/feedback", {
        method: "POST",
        body: JSON.stringify({
          feedbackType: "THUMBS_UP",
        }),
      });

      const res = await feedbackRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("sessionId");
    });

    it("returns 400 when feedbackType is invalid or missing", async () => {
      const req = new NextRequest("http://localhost:3000/api/feedback", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "session-123",
          feedbackType: "INVALID_TYPE",
        }),
      });

      const res = await feedbackRoute(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain("feedbackType");
    });
  });

  describe("Mock Mode Submission", () => {
    beforeEach(() => {
      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: {
          id: "test-user-id",
          name: "Test User",
          email: "test@example.com",
        },
        session: {
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      });
    });

    it("submits THUMBS_UP feedback successfully in mock mode", async () => {
      const req = new NextRequest("http://localhost:3000/api/feedback", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "session-abc",
          eventId: "evt-123",
          feedbackType: "THUMBS_UP",
          feedbackText: "Great and accurate answer!",
          feedbackLabels: ["accurate", "concise"],
        }),
      });

      const res = await feedbackRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.feedbackType).toBe("THUMBS_UP");
      expect(data.name).toContain("feedbackEntries");
      expect(data.createTime).toBeDefined();
    });

    it("submits THUMBS_DOWN feedback successfully in mock mode", async () => {
      const req = new NextRequest("http://localhost:3000/api/feedback", {
        method: "POST",
        body: JSON.stringify({
          sessionId: "session-xyz",
          feedbackType: "THUMBS_DOWN",
        }),
      });

      const res = await feedbackRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.feedbackType).toBe("THUMBS_DOWN");
      expect(data.name).toContain("feedbackEntries");
      expect(data.createTime).toBeDefined();
    });
  });

  describe("GCP Vertex AI Proxying", () => {
    beforeEach(() => {
      process.env.MOCK_AGENT_RUNTIME = "false";
      process.env.GOOGLE_CLOUD_PROJECT = "test-project";
      process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
      process.env.GOOGLE_REASONING_ENGINE_ID = "test-engine-123";

      vi.spyOn(auth.api, "getSession").mockResolvedValue({
        user: {
          id: "test-user-id",
          name: "Test User",
          email: "test@example.com",
        },
        session: {
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      });
    });

    it("forwards feedback payload to Vertex AI Reasoning Engine REST API", async () => {
      const mockFetch = vi
        .fn()
        // First call: requireSessionOwner -> getSession
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            name: "projects/test-project/locations/us-central1/reasoningEngines/test-engine-123/sessions/session-456",
            userId: "test-user-id",
          }),
        })
        // Second call: submitFeedback
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            name: "projects/test-project/locations/us-central1/reasoningEngines/test-engine-123/feedbackEntries/fb-999",
            createTime: "2026-08-07T12:00:00Z",
            feedbackType: "THUMBS_UP",
          }),
        });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        mockFetch as unknown as typeof fetch
      );

      const { VertexAiContext } = await import("@/lib/agent-runtime/services/context");
      vi.spyOn(VertexAiContext.prototype, "getAccessToken").mockResolvedValue(
        "mock-gcp-bearer-token"
      );

      const req = new NextRequest("http://localhost:3000/api/feedback", {
        method: "POST",
        body: JSON.stringify({
          sessionId:
            "projects/test-project/locations/us-central1/reasoningEngines/test-engine-123/sessions/session-456",
          eventId: "evt-789",
          feedbackType: "THUMBS_UP",
          feedbackText: "Very helpful explanation.",
          feedbackLabels: ["helpful"],
        }),
      });

      const res = await feedbackRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.name).toBe(
        "projects/test-project/locations/us-central1/reasoningEngines/test-engine-123/feedbackEntries/fb-999"
      );
      expect(data.feedbackType).toBe("THUMBS_UP");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [calledUrl, calledOptions] = mockFetch.mock.calls[1];
      expect(calledUrl).toBe(
        "https://us-central1-aiplatform.googleapis.com/v1beta1/projects/test-project/locations/us-central1/reasoningEngines/test-engine-123/feedbackEntries"
      );
      expect(calledOptions.method).toBe("POST");
      expect(calledOptions.headers.Authorization).toBe("Bearer mock-gcp-bearer-token");
      const parsedBody = JSON.parse(calledOptions.body);
      expect(parsedBody.sessionId).toBe("session-456");
      expect(parsedBody.eventId).toBe("evt-789");
      expect(parsedBody.feedbackType).toBe("THUMBS_UP");
      expect(parsedBody.userId).toBe("test-user-id");
      expect(parsedBody.source).toBe("Agent Runtime UI");
      expect(parsedBody.feedbackText).toBe("Very helpful explanation.");
      expect(parsedBody.feedbackLabels).toEqual(["helpful"]);
      expect(parsedBody.config).toBeUndefined();
    });

    it("returns 403 when attempting to submit feedback on another user's session (IDOR protection)", async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          name: "projects/test-project/locations/us-central1/reasoningEngines/test-engine-123/sessions/session-other",
          userId: "other-user-id",
        }),
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        mockFetch as unknown as typeof fetch
      );

      const { VertexAiContext } = await import("@/lib/agent-runtime/services/context");
      vi.spyOn(VertexAiContext.prototype, "getAccessToken").mockResolvedValue(
        "mock-gcp-bearer-token"
      );

      const req = new NextRequest("http://localhost:3000/api/feedback", {
        method: "POST",
        body: JSON.stringify({
          sessionId:
            "projects/test-project/locations/us-central1/reasoningEngines/test-engine-123/sessions/session-other",
          feedbackType: "THUMBS_DOWN",
        }),
      });

      const res = await feedbackRoute(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain("Forbidden");
    });

    it("returns 500 when GCP Vertex AI responds with an error", async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            name: "projects/test-project/locations/us-central1/reasoningEngines/test-engine-123/sessions/session-1",
            userId: "test-user-id",
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: async () => "Service Unavailable",
        });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        mockFetch as unknown as typeof fetch
      );

      const { VertexAiContext } = await import("@/lib/agent-runtime/services/context");
      vi.spyOn(VertexAiContext.prototype, "getAccessToken").mockResolvedValue(
        "mock-gcp-bearer-token"
      );

      const req = new NextRequest("http://localhost:3000/api/feedback", {
        method: "POST",
        body: JSON.stringify({
          sessionId:
            "projects/test-project/locations/us-central1/reasoningEngines/test-engine-123/sessions/session-1",
          feedbackType: "THUMBS_DOWN",
        }),
      });

      const res = await feedbackRoute(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toContain("Failed to submit feedback to Vertex AI");
    });
  });
});
