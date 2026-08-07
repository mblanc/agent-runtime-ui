import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken } from "./lib/jwt";
import { SESSION_COOKIE_NAME } from "./lib/auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isPublicAuthRoute = pathname.startsWith("/api/auth");
  const isLoginPage = pathname === "/login";

  const sessionCookie = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  // 1. If no session cookie exists, allow public routes or reject/redirect immediately without crypto ops
  if (!sessionCookie) {
    if (isPublicAuthRoute || isLoginPage) {
      return NextResponse.next();
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to continue." },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  // 2. Cryptographic token verification runs ONLY when a cookie exists
  const session = await verifySessionToken(sessionCookie);
  const isAuthenticated = !!session?.sub;

  // 3. Authenticated user visiting /login -> redirect to /
  if (isLoginPage && isAuthenticated) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // 4. Invalid token handling
  if (!isAuthenticated) {
    if (isPublicAuthRoute || isLoginPage) {
      return NextResponse.next();
    }
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized. Please sign in to continue." },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static image/font files (.svg, .png, .jpg, .jpeg, .gif, .webp, .woff, .woff2)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2)$).*)",
  ],
};
