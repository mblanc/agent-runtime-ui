import { describe, it, expect } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { NO_STORE_HEADERS, resolveAgentTarget } from "@/lib/api-handler";
import { requireSessionOwner } from "@/lib/session-ownership";
import { isLocalSessionId } from "@/lib/agent-runtime/event-utils";
import { withAgentTarget } from "@/lib/api-client";
import type { AgentSession } from "@/types/agent";

/**
 * The route-level ladders these helpers replace were written out per route, and
 * each spelling drifted: one caller dropped `location`, another never accepted
 * the `reasoningEngineId` query alias. These tests pin the single ladder, the
 * one local-session predicate, and the 404-vs-403 split that the ownership
 * guard must keep expressing differently per route.
 */

function get(url: string): NextRequest {
  return new NextRequest(url);
}

describe("resolveAgentTarget", () => {
  it("prefers the agentId query param over every other source", () => {
    const req = get(
      "http://localhost:3000/api/x?agentId=from-query&reasoningEngineId=alias-query"
    );
    const target = resolveAgentTarget(req, {
      agentId: "from-body",
      reasoningEngineId: "alias-body",
    });

    expect(target.agentId).toBe("from-query");
  });

  it("falls through query alias, then body, then body alias", () => {
    const aliasQuery = resolveAgentTarget(
      get("http://localhost:3000/api/x?reasoningEngineId=alias-query"),
      { agentId: "from-body" }
    );
    expect(aliasQuery.agentId).toBe("alias-query");

    const bodyField = resolveAgentTarget(get("http://localhost:3000/api/x"), {
      agentId: "from-body",
      reasoningEngineId: "alias-body",
    });
    expect(bodyField.agentId).toBe("from-body");

    const bodyAlias = resolveAgentTarget(get("http://localhost:3000/api/x"), {
      reasoningEngineId: "alias-body",
    });
    expect(bodyAlias.agentId).toBe("alias-body");
  });

  it("prefers the location query param over the body and returns undefined for neither", () => {
    expect(
      resolveAgentTarget(get("http://localhost:3000/api/x?location=europe-west4"), {
        location: "us-east4",
      }).location
    ).toBe("europe-west4");

    expect(
      resolveAgentTarget(get("http://localhost:3000/api/x"), { location: "us-east4" })
        .location
    ).toBe("us-east4");

    expect(
      resolveAgentTarget(get("http://localhost:3000/api/x")).location
    ).toBeUndefined();
  });

  it("reads only the query string when no body is supplied", () => {
    // What GET and DELETE routes do: the same ladder minus the rungs a request
    // without a body cannot have.
    const target = resolveAgentTarget(
      get("http://localhost:3000/api/x?agentId=a1&location=europe-west4")
    );
    expect(target).toEqual({ agentId: "a1", location: "europe-west4" });
  });

  it("ignores the reasoningEngineId query alias when the route never accepted it", () => {
    // The memory routes' narrower ladder, preserved rather than widened.
    const target = resolveAgentTarget(
      get("http://localhost:3000/api/x?reasoningEngineId=alias-query"),
      { agentId: "from-body" },
      { legacyQueryAlias: false }
    );
    expect(target.agentId).toBe("from-body");
  });

  it("survives a body that is not an object", () => {
    expect(
      resolveAgentTarget(get("http://localhost:3000/api/x"), "not-json-object")
    ).toEqual({ agentId: undefined, location: undefined });
    expect(resolveAgentTarget(get("http://localhost:3000/api/x"), null)).toEqual({
      agentId: undefined,
      location: undefined,
    });
  });

  it("treats empty values as absent so a blank param cannot mask a real one", () => {
    const target = resolveAgentTarget(get("http://localhost:3000/api/x?agentId="), {
      agentId: "from-body",
    });
    expect(target.agentId).toBe("from-body");
  });
});

describe("local session guard", () => {
  it("recognises both local id prefixes and a missing id", () => {
    // The routes' early return keys on exactly this, and used to spell it out
    // per handler.
    expect(isLocalSessionId("__LOCALID_abc")).toBe(true);
    expect(isLocalSessionId("local-abc")).toBe(true);
    expect(isLocalSessionId(undefined)).toBe(true);
    expect(isLocalSessionId("")).toBe(true);
    expect(isLocalSessionId("1234567890")).toBe(false);
    expect(isLocalSessionId("session-1")).toBe(false);
  });
});

describe("requireSessionOwner", () => {
  const OWNED: AgentSession = {
    id: "s-1",
    name: "sessions/s-1",
    userId: "user-1",
    title: "T",
    createTime: "2026-01-01T00:00:00Z",
    updateTime: "2026-01-01T00:00:00Z",
  };

  function providerReturning(session: AgentSession | null) {
    const calls: Array<[string, string | undefined, string | undefined]> = [];
    return {
      calls,
      getSession: async (
        sessionId: string,
        agentId?: string,
        location?: string
      ): Promise<AgentSession | null> => {
        calls.push([sessionId, agentId, location]);
        return session;
      },
    };
  }

  const CALLER = { userId: "user-1", userEmail: "user-1@example.com" };
  const OTHER = { userId: "attacker", userEmail: "attacker@example.com" };

  it("returns the session to its owner and forwards the agent target", async () => {
    const provider = providerReturning(OWNED);

    const result = await requireSessionOwner({
      provider,
      sessionId: "s-1",
      target: { agentId: "a1", location: "europe-west4" },
      ...CALLER,
      onUnowned: "forbidden",
    });

    expect(result).toBe(OWNED);
    expect(provider.calls).toEqual([["s-1", "a1", "europe-west4"]]);
  });

  it("answers 404 for a session owned by somebody else when told to hide it", async () => {
    // GET /api/sessions/[sessionId]: a 403 would confirm that a guessed id exists.
    const result = await requireSessionOwner({
      provider: providerReturning(OWNED),
      sessionId: "s-1",
      target: {},
      ...OTHER,
      onUnowned: "not-found",
    });

    expect(result).toBeInstanceOf(NextResponse);
    const res = result as NextResponse;
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Session not found");
  });

  it("answers 403 for a session owned by somebody else on the mutating routes", async () => {
    const result = await requireSessionOwner({
      provider: providerReturning(OWNED),
      sessionId: "s-1",
      target: {},
      ...OTHER,
      onUnowned: "forbidden",
    });

    expect(result).toBeInstanceOf(NextResponse);
    const res = result as NextResponse;
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Forbidden. You do not own this session.");
  });

  it("answers 404 for a session that does not exist", async () => {
    const result = await requireSessionOwner({
      provider: providerReturning(null),
      sessionId: "s-1",
      target: {},
      ...CALLER,
      onUnowned: "forbidden",
    });

    expect(result).toBeInstanceOf(NextResponse);
    const res = result as NextResponse;
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Session not found");
  });

  it("lets a missing session through when the route creates it", async () => {
    // /api/chat: the session is created by the very request being authorised.
    const result = await requireSessionOwner({
      provider: providerReturning(null),
      sessionId: "s-1",
      target: {},
      ...CALLER,
      onUnowned: "forbidden",
      onMissing: "allow",
    });

    expect(result).toBeNull();
  });

  it("still denies an unowned session when missing sessions are allowed", async () => {
    const result = await requireSessionOwner({
      provider: providerReturning(OWNED),
      sessionId: "s-1",
      target: {},
      ...OTHER,
      onUnowned: "forbidden",
      onMissing: "allow",
    });

    expect((result as NextResponse).status).toBe(403);
  });

  it("denies rather than admits when the backend reports no owner", async () => {
    const unowned = { ...OWNED, userId: null };
    const result = await requireSessionOwner({
      provider: providerReturning(unowned),
      sessionId: "s-1",
      target: {},
      ...CALLER,
      onUnowned: "forbidden",
    });

    expect((result as NextResponse).status).toBe(403);
  });

  it("propagates a lookup failure instead of waving the request through", async () => {
    await expect(
      requireSessionOwner({
        provider: {
          getSession: async () => {
            throw new Error("upstream down");
          },
        },
        sessionId: "s-1",
        target: {},
        ...CALLER,
        onUnowned: "forbidden",
      })
    ).rejects.toThrow("upstream down");
  });
});

describe("NO_STORE_HEADERS", () => {
  it("is the directive every per-user route sent by hand", () => {
    expect(NO_STORE_HEADERS["Cache-Control"]).toBe(
      "no-store, no-cache, max-age=0, must-revalidate"
    );
  });
});

describe("withAgentTarget", () => {
  it("appends agentId and location, in that order", () => {
    expect(
      withAgentTarget("/api/sessions/s-1", {
        agentId: "a1",
        location: "europe-west4",
      })
    ).toBe("/api/sessions/s-1?agentId=a1&location=europe-west4");
  });

  it("keeps the bare path when no agent is active", () => {
    expect(withAgentTarget("/api/memory", {})).toBe("/api/memory");
    expect(withAgentTarget("/api/memory", { agentId: undefined })).toBe("/api/memory");
  });

  it("carries location even when the agent id is absent", () => {
    // The shipped bug was the mirror image: an agentId with no location.
    expect(withAgentTarget("/api/memory", { location: "europe-west4" })).toBe(
      "/api/memory?location=europe-west4"
    );
  });

  it("puts extra params before the target so URLs keep their existing order", () => {
    expect(
      withAgentTarget(
        "/api/sessions",
        { agentId: "a1", location: "europe-west4" },
        { userId: "user-1" }
      )
    ).toBe("/api/sessions?userId=user-1&agentId=a1&location=europe-west4");
  });

  it("encodes values that would otherwise break out of the query string", () => {
    expect(withAgentTarget("/api/memory", { location: "evil.com/x#" })).toBe(
      "/api/memory?location=evil.com%2Fx%23"
    );
  });
});
