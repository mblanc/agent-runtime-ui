import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST as chatRoute } from "@/app/api/chat/route";
import { auth } from "@/lib/auth";

describe("POST /api/chat Route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(null);

    const req = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "latest news for INTC and MU?" }],
      }),
    });

    const res = await chatRoute(req);
    expect(res.status).toBe(401);
  });

  it("streams events cleanly when authenticated", async () => {
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

    const req = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
      body: JSON.stringify({
        messages: [{ role: "user", content: "latest news for INTC and MU?" }],
        sessionId: "1",
      }),
    });

    const res = await chatRoute(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("text/event-stream");

    const reader = res.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const { done, value } = await reader!.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }

    expect(text).toContain("data: ");
    expect(text).toContain("thought");
    expect(text).toContain("content");
  });
});
