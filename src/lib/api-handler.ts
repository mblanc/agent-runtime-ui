import { NextRequest, NextResponse } from "next/server";
import { auth, AuthSession } from "@/lib/auth";
import { InvalidRoutingParameterError } from "@/lib/agent-runtime/services/context";
import { log, requestIdFrom } from "@/lib/logger";
import type { AgentTarget } from "@/types/agent";

/**
 * Every route that answers with per-user state sends this. Spelled out once so a
 * route cannot ship with a subtly weaker directive than its siblings.
 */
export const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
} as const;

export const STALE_WHILE_REVALIDATE_CACHE_HEADERS = {
  "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
} as const;

export interface ResolveAgentTargetOptions {
  /**
   * Accept `?reasoningEngineId=` as an alias for `?agentId=` in the query
   * string. The memory routes that read a body have never accepted it — only
   * the body alias — and widening them here would be a behaviour change, so
   * they opt out instead of being quietly unified.
   */
  legacyQueryAlias?: boolean;
}

/**
 * Picks the first truthy candidate, reproducing the `a || b || c || undefined`
 * ladders these helpers replace. The values come off a query string or an
 * unvalidated JSON body, so they are `unknown` until this narrows them; the cast
 * is the same one the ladders made implicitly.
 */
function firstNonEmpty(...candidates: unknown[]): string | undefined {
  for (const candidate of candidates) {
    if (candidate) return candidate as string;
  }
  return undefined;
}

/**
 * Resolves the agent and region a request is addressed to, from the query string
 * first and then the parsed body.
 *
 * `reasoningEngineId` is the legacy alias for `agentId`. Routes without a body
 * (GET, DELETE) simply omit `body`, which is what makes their narrower ladder
 * the same rule rather than a different one — the divergence that let
 * `location` go missing from one caller and stay missing for a release.
 */
export function resolveAgentTarget(
  req: NextRequest,
  body?: unknown,
  options?: ResolveAgentTargetOptions
): AgentTarget {
  const query = req.nextUrl.searchParams;
  const fields = body as Record<string, unknown> | null | undefined;
  const legacyQueryAlias = options?.legacyQueryAlias ?? true;

  return {
    agentId: firstNonEmpty(
      query.get("agentId"),
      legacyQueryAlias ? query.get("reasoningEngineId") : undefined,
      fields?.agentId,
      fields?.reasoningEngineId
    ),
    location: firstNonEmpty(query.get("location"), fields?.location),
  };
}

export interface AuthenticatedContext<TParams = Record<string, string>> {
  session: AuthSession;
  userId: string;
  userEmail: string;
  params?: TParams;
  /** Correlates every log line emitted while serving this request. */
  requestId: string;
}

export type AuthenticatedRouteHandler<TParams = Record<string, string>> = (
  req: NextRequest,
  context: AuthenticatedContext<TParams>
) => Promise<Response>;

async function authenticateRequest(
  req: NextRequest
): Promise<{ session: AuthSession; userId: string; userEmail: string } | NextResponse> {
  const session = await auth.api.getSession({
    headers: req.headers,
  });

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized. Please sign in." }, { status: 401 });
  }

  return {
    session,
    userId: session.user.id,
    userEmail: session.user.email || "",
  };
}

function handleApiError(req: NextRequest, err: unknown, requestId: string): NextResponse {
  const errorMessage = err instanceof Error ? err.message : "Internal server error";

  // Client-supplied routing parameters that fail validation are a bad request,
  // not a server fault, and the message is safe to return verbatim.
  if (err instanceof InvalidRoutingParameterError) {
    return NextResponse.json({ error: errorMessage }, { status: 400 });
  }

  log.error({
    event: "api.error",
    requestId,
    path: req.nextUrl?.pathname || "route",
    message: errorMessage,
    stack: err instanceof Error ? err.stack : undefined,
  });
  const clientMessage =
    process.env.NODE_ENV === "production"
      ? "An internal server error occurred. Please try again later."
      : errorMessage;
  return NextResponse.json({ error: clientMessage }, { status: 500 });
}

/**
 * Higher-order wrapper that enforces authentication for static Next.js App Router routes.
 */
export function withAuth(handler: AuthenticatedRouteHandler<Record<string, never>>) {
  return async (req: NextRequest): Promise<Response> => {
    const requestId = requestIdFrom(req.headers);
    try {
      const authResult = await authenticateRequest(req);
      if (authResult instanceof NextResponse) return authResult;

      return await handler(req, { ...authResult, requestId });
    } catch (err: unknown) {
      return handleApiError(req, err, requestId);
    }
  };
}

/**
 * Higher-order wrapper that enforces authentication for dynamic Next.js App Router routes.
 */
export function withAuthDynamic<TParams extends Record<string, string>>(
  handler: AuthenticatedRouteHandler<TParams>
) {
  return async (
    req: NextRequest,
    context: { params: Promise<TParams> }
  ): Promise<Response> => {
    const requestId = requestIdFrom(req.headers);
    try {
      const authResult = await authenticateRequest(req);
      if (authResult instanceof NextResponse) return authResult;

      const params = await context.params;
      return await handler(req, { ...authResult, params, requestId });
    } catch (err: unknown) {
      return handleApiError(req, err, requestId);
    }
  };
}
