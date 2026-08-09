import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { withAuth, withAuthDynamic } from "@/lib/api-handler";
import { auth } from "@/lib/auth";

describe("BFF Route Middleware (withAuth)", () => {
  it("returns 401 Unauthorized when session is missing", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(null);

    const handler = withAuth(async () => {
      return new Response("OK");
    });

    const req = new NextRequest("http://localhost:3000/api/test");
    const res = await handler(req);

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toContain("Unauthorized");
  });

  it("passes AuthenticatedContext with userId and userEmail when session is valid", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
      },
      session: {
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    });

    let receivedUserId = "";
    let receivedUserEmail = "";

    const handler = withAuth(async (_req, { userId, userEmail }) => {
      receivedUserId = userId;
      receivedUserEmail = userEmail;
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    });

    const req = new NextRequest("http://localhost:3000/api/test");
    const res = await handler(req);

    expect(res.status).toBe(200);
    expect(receivedUserId).toBe("user-123");
    expect(receivedUserEmail).toBe("test@example.com");
  });

  it("handles unhandled errors by returning 500 JSON response", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
      },
      session: {
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    });

    const handler = withAuth(async () => {
      throw new Error("Database query failed");
    });

    const req = new NextRequest("http://localhost:3000/api/test");
    const res = await handler(req);

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe("Database query failed");
  });

  it("resolves dynamic route params with withAuthDynamic", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
      user: {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
      },
      session: {
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      },
    });

    let capturedSessionId = "";

    const handler = withAuthDynamic<{ sessionId: string }>(async (_req, { params }) => {
      capturedSessionId = params?.sessionId || "";
      return new Response(JSON.stringify({ sessionId: params?.sessionId }), {
        headers: { "Content-Type": "application/json" },
      });
    });

    const req = new NextRequest("http://localhost:3000/api/sessions/session-999");
    const res = await handler(req, {
      params: Promise.resolve({ sessionId: "session-999" }),
    });

    expect(res.status).toBe(200);
    expect(capturedSessionId).toBe("session-999");
  });
});
