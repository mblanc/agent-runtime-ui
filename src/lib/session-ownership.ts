import { AgentSession } from "@/types/agent";

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
