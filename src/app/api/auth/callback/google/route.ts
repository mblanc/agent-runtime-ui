import { NextRequest, NextResponse } from "next/server";
import {
  exchangeGoogleOAuthCode,
  getBaseUrl,
  OAUTH_COOKIE_NAME,
  OAuthStatePayload,
  sanitizeCallbackUrl,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { signSessionToken, verifySessionToken, SESSION_TTL_SECONDS } from "@/lib/jwt";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const origin = getBaseUrl(req.url);

  const error = searchParams.get("error");
  if (error) {
    console.error("Google OAuth returned error:", error);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error)}`, origin)
    );
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");

  if (!code || !state) {
    return NextResponse.redirect(new URL("/login?error=missing_code_or_state", origin));
  }

  const stateCookie = req.cookies.get(OAUTH_COOKIE_NAME)?.value;
  if (!stateCookie) {
    console.error("OAuth state cookie missing");
    return NextResponse.redirect(new URL("/login?error=state_cookie_missing", origin));
  }

  const statePayload = await verifySessionToken<OAuthStatePayload>(stateCookie);
  if (!statePayload || statePayload.state !== state) {
    console.error("OAuth state mismatch or expired");
    return NextResponse.redirect(new URL("/login?error=state_mismatch", origin));
  }

  try {
    const user = await exchangeGoogleOAuthCode({
      code,
      codeVerifier: statePayload.codeVerifier,
      origin,
    });

    // Create signed session token for 30 days
    const sessionToken = await signSessionToken({
      sub: user.id,
      name: user.name,
      email: user.email,
      image: user.image || null,
    });

    const isProduction = process.env.NODE_ENV === "production";
    const redirectTarget = sanitizeCallbackUrl(statePayload.callbackURL, origin);
    const response = NextResponse.redirect(new URL(redirectTarget, origin));

    // Set persistent session cookie
    response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_TTL_SECONDS,
    });

    // Clear temporary OAuth state cookie
    response.cookies.set(OAUTH_COOKIE_NAME, "", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Authentication failed";
    console.error("OAuth callback exchange failed:", message);
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(message)}`, origin)
    );
  }
}
