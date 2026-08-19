import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET as listArtifactsRoute } from "@/app/api/sessions/[sessionId]/artifacts/route";
import { GET as getArtifactRoute } from "@/app/api/sessions/[sessionId]/artifacts/[filename]/route";
import { auth } from "@/lib/auth";

describe("Artifacts API Routes (/api/sessions/[sessionId]/artifacts)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockAuthUser = {
    user: {
      id: "test-user",
      name: "Test User",
      email: "test@example.com",
    },
    session: {
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
  };

  describe("GET /api/sessions/[sessionId]/artifacts", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/sessions/1/artifacts");
      const res = await listArtifactsRoute(req, {
        params: Promise.resolve({ sessionId: "1" }),
      });

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toContain("Unauthorized");
    });

    it("returns artifact list when authenticated", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(mockAuthUser);

      const req = new NextRequest("http://localhost:3000/api/sessions/1/artifacts");
      const res = await listArtifactsRoute(req, {
        params: Promise.resolve({ sessionId: "1" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.artifacts)).toBe(true);
      expect(data.artifacts.length).toBeGreaterThanOrEqual(4);

      const htmlArt = data.artifacts.find(
        (a: { filename: string }) => a.filename === "sales_dashboard.html"
      );
      expect(htmlArt).toBeDefined();
      expect(htmlArt.mimeType).toBe("text/html");
      expect(htmlArt.versions.length).toBe(3);
    });

    it("returns empty array for local session IDs", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(mockAuthUser);

      const req = new NextRequest(
        "http://localhost:3000/api/sessions/local-12345/artifacts"
      );
      const res = await listArtifactsRoute(req, {
        params: Promise.resolve({ sessionId: "local-12345" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.artifacts).toEqual([]);
    });

    it("returns 404 when user does not own the session", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: {
          id: "other-user",
          name: "Other User",
          email: "other@example.com",
        },
        session: {
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      const req = new NextRequest("http://localhost:3000/api/sessions/1/artifacts");
      const res = await listArtifactsRoute(req, {
        params: Promise.resolve({ sessionId: "1" }),
      });

      expect(res.status).toBe(404);
    });
  });

  describe("GET /api/sessions/[sessionId]/artifacts/[filename]", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(null);

      const req = new NextRequest(
        "http://localhost:3000/api/sessions/1/artifacts/sales_dashboard.html"
      );
      const res = await getArtifactRoute(req, {
        params: Promise.resolve({ sessionId: "1", filename: "sales_dashboard.html" }),
      });

      expect(res.status).toBe(401);
    });

    it("returns latest artifact version when version parameter is omitted", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(mockAuthUser);

      const req = new NextRequest(
        "http://localhost:3000/api/sessions/1/artifacts/sales_dashboard.html"
      );
      const res = await getArtifactRoute(req, {
        params: Promise.resolve({ sessionId: "1", filename: "sales_dashboard.html" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.artifact.filename).toBe("sales_dashboard.html");
      expect(data.selectedVersion.version).toBe(2);
      expect(data.selectedVersion.content).toContain(
        "Enterprise Sales Performance Dashboard"
      );
    });

    it("returns specific version when ?version=0 is specified", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(mockAuthUser);

      const req = new NextRequest(
        "http://localhost:3000/api/sessions/1/artifacts/sales_dashboard.html?version=0"
      );
      const res = await getArtifactRoute(req, {
        params: Promise.resolve({ sessionId: "1", filename: "sales_dashboard.html" }),
      });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.selectedVersion.version).toBe(0);
      expect(data.selectedVersion.content).toContain("Sales Dashboard v0");
    });

    it("returns 400 for malformed version parameter", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(mockAuthUser);

      const req = new NextRequest(
        "http://localhost:3000/api/sessions/1/artifacts/sales_dashboard.html?version=invalid"
      );
      const res = await getArtifactRoute(req, {
        params: Promise.resolve({ sessionId: "1", filename: "sales_dashboard.html" }),
      });

      expect(res.status).toBe(400);
    });

    it("returns 404 for non-existent artifact or invalid version", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(mockAuthUser);

      const req1 = new NextRequest(
        "http://localhost:3000/api/sessions/1/artifacts/missing_file.html"
      );
      const res1 = await getArtifactRoute(req1, {
        params: Promise.resolve({ sessionId: "1", filename: "missing_file.html" }),
      });
      expect(res1.status).toBe(404);

      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce(mockAuthUser);
      const req2 = new NextRequest(
        "http://localhost:3000/api/sessions/1/artifacts/sales_dashboard.html?version=99"
      );
      const res2 = await getArtifactRoute(req2, {
        params: Promise.resolve({ sessionId: "1", filename: "sales_dashboard.html" }),
      });
      expect(res2.status).toBe(404);
    });
  });
});
