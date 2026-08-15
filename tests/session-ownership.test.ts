import { beforeEach, describe, expect, it, vi } from "vitest";
import { isSessionOwnedBy } from "@/lib/session-ownership";
import { VertexAiContext } from "@/lib/agent-runtime/services/context";
import { VertexAiSessionService } from "@/lib/agent-runtime/services/session-service";
import { VertexAiAgentService } from "@/lib/agent-runtime/services/agent-service";

/**
 * Regression tests for the fail-open session ownership check: getSession
 * defaulted an absent owner to "", and every route guard was written
 * `if (s.userId && s.userId !== userId && ...)`, so the empty string skipped
 * the comparison and admitted anybody.
 */

const OWNER = "user-owner";
const OWNER_EMAIL = "owner@example.com";
const ATTACKER = "user-attacker";

describe("isSessionOwnedBy", () => {
  it("admits the owner by id and by email", () => {
    expect(isSessionOwnedBy({ userId: OWNER }, OWNER, OWNER_EMAIL)).toBe(true);
    expect(isSessionOwnedBy({ userId: OWNER_EMAIL }, OWNER, OWNER_EMAIL)).toBe(true);
  });

  it("denies a different user", () => {
    expect(isSessionOwnedBy({ userId: OWNER }, ATTACKER, "a@example.com")).toBe(false);
  });

  it("denies rather than admits when the owner is absent", () => {
    // This is the whole bug: each of these previously skipped the comparison.
    expect(isSessionOwnedBy({ userId: null }, ATTACKER)).toBe(false);
    expect(isSessionOwnedBy({ userId: "" }, ATTACKER)).toBe(false);
    expect(isSessionOwnedBy({ userId: undefined as unknown as null }, ATTACKER)).toBe(
      false
    );
  });

  it("does not admit an unowned session even for a caller with no email", () => {
    expect(isSessionOwnedBy({ userId: null }, OWNER, undefined)).toBe(false);
  });

  it("does not treat an empty caller email as a wildcard", () => {
    expect(isSessionOwnedBy({ userId: "" }, "", "")).toBe(false);
  });
});

describe("getSession owner normalisation", () => {
  function makeService() {
    process.env.GOOGLE_CLOUD_PROJECT = "test-project";
    process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
    process.env.GOOGLE_REASONING_ENGINE_ID = "123456";
    const ctx = new VertexAiContext("123456", undefined, async () => "fake-token");
    return new VertexAiSessionService(ctx, new VertexAiAgentService(ctx));
  }

  function mockSessionPayload(payload: Record<string, unknown>) {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(payload), { status: 200 })
    );
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const NAME = "projects/p/locations/us-central1/reasoningEngines/123456/sessions/sess-1";

  it("reads the camelCase spelling", async () => {
    mockSessionPayload({ name: NAME, userId: OWNER });
    const s = await makeService().getSession("sess-1");
    expect(s?.userId).toBe(OWNER);
  });

  it("reads the snake_case spelling", async () => {
    mockSessionPayload({ name: NAME, user_id: OWNER });
    const s = await makeService().getSession("sess-1");
    expect(s?.userId).toBe(OWNER);
  });

  it("reads through the `response` envelope, as createSession and listSessions do", async () => {
    mockSessionPayload({ response: { name: NAME, user_id: OWNER } });
    const s = await makeService().getSession("sess-1");
    expect(s?.userId).toBe(OWNER);
  });

  it("reports a genuinely absent owner as null, not an empty string", async () => {
    mockSessionPayload({ name: NAME });
    const s = await makeService().getSession("sess-1");
    expect(s?.userId).toBeNull();
  });

  it("end to end: a session Vertex returns under snake_case is not accessible to a stranger", async () => {
    mockSessionPayload({ name: NAME, user_id: OWNER });
    const s = await makeService().getSession("sess-1");

    expect(isSessionOwnedBy(s!, OWNER)).toBe(true);
    expect(isSessionOwnedBy(s!, ATTACKER, "a@example.com")).toBe(false);
  });

  it("end to end: an owner-less session is denied to everyone", async () => {
    mockSessionPayload({ name: NAME });
    const s = await makeService().getSession("sess-1");

    expect(isSessionOwnedBy(s!, OWNER, OWNER_EMAIL)).toBe(false);
    expect(isSessionOwnedBy(s!, ATTACKER)).toBe(false);
  });
});
