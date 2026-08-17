import type { AgentTarget } from "@/types/agent";

/**
 * Appends the active agent target to an API path.
 *
 * Four callers used to hand-build this query string, and one of them simply
 * forgot `location` — session requests for an agent outside the default region
 * were routed to the wrong regional host until someone noticed. There is one
 * spelling now, so a caller can only pass the target or not pass it at all.
 *
 * Extra params come first so the produced URL keeps the order it always had.
 * A path with no params keeps its bare form — no trailing `?`.
 */
export function withAgentTarget(
  path: string,
  target: AgentTarget,
  extraParams?: Record<string, string | undefined>
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ ...extraParams, ...target })) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Turns a failed response into the error the optimistic-update callers roll back
 * on, with the server's body attached — `${what} (404): {"error":"..."}`.
 */
export async function throwIfNotOk(res: Response, what: string): Promise<void> {
  if (res.ok) return;
  const errText = await res.text();
  throw new Error(`${what} (${res.status}): ${errText}`);
}
