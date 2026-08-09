import { NextRequest, NextResponse } from "next/server";
import { auth, AuthSession } from "@/lib/auth";

export interface AuthenticatedContext<TParams = Record<string, string>> {
  session: AuthSession;
  userId: string;
  userEmail: string;
  params?: TParams;
}

export type AuthenticatedRouteHandler<TParams = Record<string, string>> = (
  req: NextRequest,
  context: AuthenticatedContext<TParams>
) => Promise<Response>;

/**
 * Higher-order wrapper that enforces authentication for static Next.js App Router routes.
 * Takes (req: NextRequest) -> Promise<Response>.
 */
export function withAuth(handler: AuthenticatedRouteHandler<Record<string, never>>) {
  return async (req: NextRequest): Promise<Response> => {
    try {
      const session = await auth.api.getSession({
        headers: req.headers,
      });

      if (!session?.user?.id) {
        return NextResponse.json(
          { error: "Unauthorized. Please sign in." },
          { status: 401 }
        );
      }

      return await handler(req, {
        session,
        userId: session.user.id,
        userEmail: session.user.email || "",
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Internal server error";
      console.error(`[API Error] ${req.nextUrl?.pathname || "route"}:`, errorMessage);
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  };
}

/**
 * Higher-order wrapper that enforces authentication for dynamic Next.js App Router routes.
 * Takes (req: NextRequest, context: { params: Promise<TParams> }) -> Promise<Response>.
 */
export function withAuthDynamic<TParams extends Record<string, string>>(
  handler: AuthenticatedRouteHandler<TParams>
) {
  return async (
    req: NextRequest,
    context: { params: Promise<TParams> }
  ): Promise<Response> => {
    try {
      const session = await auth.api.getSession({
        headers: req.headers,
      });

      if (!session?.user?.id) {
        return NextResponse.json(
          { error: "Unauthorized. Please sign in." },
          { status: 401 }
        );
      }

      const params = await context.params;

      return await handler(req, {
        session,
        userId: session.user.id,
        userEmail: session.user.email || "",
        params,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Internal server error";
      console.error(`[API Error] ${req.nextUrl?.pathname || "route"}:`, errorMessage);
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  };
}
