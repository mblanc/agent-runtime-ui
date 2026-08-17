import { NextResponse } from "next/server";
import { AgentSession, AgentTarget } from "@/types/agent";

/**
 * The single ownership rule for sessions, previously copy-pasted across six
 * route handlers as `if (s.userId && s.userId !== userId && ...)`. That shape
 * failed open: `getSession` defaulted an absent owner to `""`, so the guard
 * skipped the comparison entirely and any authenticated user could read,
 * retitle, delete and post into any session by id.
 *
 * This fails closed. A session whose owner the backend did not report is not
 * owned by anybody, and callers are denied rather than admitted.
 */
export function isSessionOwnedBy(
  session: Pick<AgentSession, "userId">,
  userId: string,
  userEmail?: string
): boolean {
  const owner = session.userId;

  if (!owner) {
    console.warn(
      "[session-ownership] Denying access: backend reported no owner for this session. " +
        "If this is happening for legitimate requests, the Vertex payload is not exposing " +
        "userId/user_id where getSession reads it."
    );
    return false;
  }

  return owner === userId || (Boolean(userEmail) && owner === userEmail);
}

/** The subset of a provider this guard needs, so tests can pass a stub. */
interface SessionReader {
  getSession(
    sessionId: string,
    agentId?: string,
    location?: string
  ): Promise<AgentSession | null>;
}

export interface SessionOwnershipRequest {
  provider: SessionReader;
  sessionId: string;
  target: AgentTarget;
  userId: string;
  userEmail: string;
  /**
   * How to answer a session the caller does not own. Deliberately not defaulted:
   * `GET /api/sessions/[sessionId]` answers 404 so the route cannot be used to
   * probe whether another user's session id exists, while the mutating routes
   * answer 403 because the id is already known to the caller. Every call site
   * states which it means.
   */
  onUnowned: "not-found" | "forbidden";
  /**
   * How to answer a session that does not exist upstream. `"allow"` yields
   * `null` and lets the route continue — the new-session case on `/api/chat`,
   * where the session is created by the very request being authorised.
   */
  onMissing?: "not-found" | "allow";
}

/**
 * Loads a session and asserts the caller owns it.
 *
 * Returns the session, or a `NextResponse` the route must return as-is. A
 * *thrown* error from `getSession` is not caught: swallowing it would let a
 * transient failure of the ownership lookup wave the request through.
 */
export async function requireSessionOwner(
  request: SessionOwnershipRequest & { onMissing: "allow" }
): Promise<AgentSession | null | NextResponse>;
export async function requireSessionOwner(
  request: SessionOwnershipRequest & { onMissing?: "not-found" }
): Promise<AgentSession | NextResponse>;
export async function requireSessionOwner({
  provider,
  sessionId,
  target,
  userId,
  userEmail,
  onUnowned,
  onMissing = "not-found",
}: SessionOwnershipRequest): Promise<AgentSession | null | NextResponse> {
  const session = await provider.getSession(sessionId, target.agentId, target.location);

  if (!session) {
    if (onMissing === "allow") return null;
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (!isSessionOwnedBy(session, userId, userEmail)) {
    return onUnowned === "not-found"
      ? NextResponse.json({ error: "Session not found" }, { status: 404 })
      : NextResponse.json(
          { error: "Forbidden. You do not own this session." },
          { status: 403 }
        );
  }

  return session;
}
