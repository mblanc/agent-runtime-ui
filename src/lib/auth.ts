import {
  signSessionToken,
  verifySessionToken,
  generateRandomString,
  createPkceChallenge,
  SESSION_TTL_SECONDS,
} from "./jwt";

export const SESSION_COOKIE_NAME = "llm_session";
export const OAUTH_COOKIE_NAME = "llm_oauth_state";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export interface AuthSession {
  user: AuthUser;
  session: {
    expiresAt: string;
  };
}

export interface OAuthStatePayload extends Record<string, unknown> {
  state: string;
  codeVerifier: string;
  callbackURL: string;
}

function parseCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`));
  if (!match) return null;
  return decodeURIComponent(match.substring(name.length + 1));
}

/**
 * Reduces a caller-supplied callback to a same-origin path.
 *
 * Resolve-and-compare rather than pattern-match: the previous check rejected
 * `//` and `://` but not a backslash, and the WHATWG parser normalises `\` to
 * `/` for special schemes. `/\evil.com` therefore survived sanitising and
 * `new URL(target, origin)` in the OAuth callback resolved it to
 * https://evil.com/ — an off-origin redirect at the moment of highest trust,
 * immediately after a successful sign-in.
 */
export function sanitizeCallbackUrl(
  url?: string | null,
  origin = "http://localhost"
): string {
  if (!url || typeof url !== "string") return "/";
  try {
    const base = new URL(origin);
    const resolved = new URL(url.trim(), base);
    if (resolved.origin !== base.origin) return "/";
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return "/";
  }
}

export function getBaseUrl(requestUrl?: string): string {
  if (process.env.BETTER_AUTH_URL) {
    return process.env.BETTER_AUTH_URL.replace(/\/$/, "");
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (requestUrl) {
    try {
      const url = new URL(requestUrl);
      return url.origin;
    } catch {
      // fallback
    }
  }
  return "http://localhost:3000";
}

/**
 * Server-side authentication interface
 */
export const auth = {
  api: {
    /**
     * Extracts and validates the session from request headers (stateless signed cookie).
     */
    getSession: async ({
      headers,
    }: {
      headers: Headers;
    }): Promise<AuthSession | null> => {
      const cookieHeader = headers.get("cookie");
      const sessionToken = parseCookie(cookieHeader, SESSION_COOKIE_NAME);

      if (!sessionToken) {
        return null;
      }

      const payload = await verifySessionToken<{
        sub: string;
        name: string;
        email: string;
        image?: string | null;
        exp?: number;
      }>(sessionToken);

      if (!payload || !payload.sub) {
        return null;
      }

      return {
        user: {
          id: payload.sub,
          name: payload.name || payload.email.split("@")[0],
          email: payload.email,
          image: payload.image || null,
        },
        session: {
          expiresAt: payload.exp
            ? new Date(payload.exp * 1000).toISOString()
            : new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
        },
      };
    },
  },
};

/**
 * Initiates the Google OAuth authorization flow with PKCE
 */
export async function createGoogleOAuthUrl(options: {
  origin: string;
  callbackURL?: string;
}): Promise<{
  authUrl: string;
  stateCookieValue: string;
}> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured. Please set it in .env.local");
  }

  const state = generateRandomString(24);
  const codeVerifier = generateRandomString(32);
  const codeChallenge = await createPkceChallenge(codeVerifier);

  const redirectUri = `${options.origin}/api/auth/callback/google`;
  const callbackURL = sanitizeCallbackUrl(options.callbackURL, options.origin);

  const statePayload: OAuthStatePayload = {
    state,
    codeVerifier,
    callbackURL,
  };

  // Sign state cookie for 10 minutes
  const stateCookieValue = await signSessionToken(
    statePayload as unknown as Record<string, unknown>,
    undefined,
    10 * 60
  );

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    access_type: "online",
    prompt: "select_account",
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  return {
    authUrl,
    stateCookieValue,
  };
}

/**
 * Exchanges Google authorization code for user profile
 */
export async function exchangeGoogleOAuthCode(options: {
  code: string;
  codeVerifier: string;
  origin: string;
}): Promise<AuthUser> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured in .env.local"
    );
  }

  const redirectUri = `${options.origin}/api/auth/callback/google`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: options.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      code_verifier: options.codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error("Google token exchange failed:", errorText);
    throw new Error("Failed to exchange authorization code with Google");
  }

  const tokenData = await tokenResponse.json();
  const accessToken = tokenData.access_token;

  if (!accessToken) {
    throw new Error("No access token received from Google");
  }

  // Fetch Google User Profile
  const userinfoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!userinfoResponse.ok) {
    throw new Error("Failed to fetch user profile from Google");
  }

  const profile = await userinfoResponse.json();

  return {
    id: profile.sub,
    name: profile.name || profile.email.split("@")[0],
    email: profile.email,
    image: profile.picture || null,
  };
}
