import { NextRequest, NextResponse } from "next/server";
import { createGoogleOAuthUrl, getBaseUrl, OAUTH_COOKIE_NAME } from "@/lib/auth";

export const runtime = "nodejs";

async function handleSignIn(req: NextRequest) {
  try {
    const origin = getBaseUrl(req.url);
    let callbackURL = "/";

    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body.callbackURL) callbackURL = body.callbackURL;
      } catch {
        // body optional
      }
    } else {
      const searchParams = req.nextUrl.searchParams;
      const cb = searchParams.get("callbackURL");
      if (cb) callbackURL = cb;
    }

    const { authUrl, stateCookieValue } = await createGoogleOAuthUrl({
      origin,
      callbackURL,
    });

    const isProduction = process.env.NODE_ENV === "production";
    const response = NextResponse.json({ url: authUrl, redirect: true });

    // Set signed state cookie for PKCE verification
    response.cookies.set(OAUTH_COOKIE_NAME, stateCookieValue, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60, // 10 minutes
    });

    return response;
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Failed to initiate Google sign-in";
    console.error("Sign-in initialization error:", message);
    return NextResponse.json({ error: { message } }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handleSignIn(req);
}

export async function GET(req: NextRequest) {
  return handleSignIn(req);
}
