import { NextRequest, NextResponse } from "next/server";
import { auth, AuthSession } from "@/lib/auth";
import { InvalidRoutingParameterError } from "@/lib/agent-runtime/services/context";
import { log, requestIdFrom } from "@/lib/logger";

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
