import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LoginButton } from "@/components/auth/login-button";
import { signIn } from "@/lib/auth-client";
import {
  signSessionToken,
  verifySessionToken,
  generateRandomString,
  createPkceChallenge,
  getJwtSecret,
} from "@/lib/jwt";
import { auth, SESSION_COOKIE_NAME } from "@/lib/auth";

vi.mock("@/lib/auth-client", () => {
  return {
    signIn: {
      social: vi.fn(),
    },
    useSession: vi.fn(() => ({ data: null, isPending: false })),
  };
});

process.env.BETTER_AUTH_SECRET = "test_environment_secret_key_32_characters_minimum";

describe("Stateless JWT & Session Security", () => {
  const testSecret = "test_super_secret_key_32_characters_long_jwt_token";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signs and verifies session tokens correctly", async () => {
    const payload = {
      sub: "google-user-12345",
      name: "Gemini Tester",
      email: "tester@example.com",
    };

    const token = await signSessionToken(payload, testSecret, 3600);
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);

    const verified = await verifySessionToken<typeof payload>(token, testSecret);
    expect(verified).toBeDefined();
    expect(verified?.sub).toBe("google-user-12345");
    expect(verified?.email).toBe("tester@example.com");
    expect(verified?.name).toBe("Gemini Tester");
  });

  it("rejects tampered tokens", async () => {
    const payload = { sub: "user-1" };
    const token = await signSessionToken(payload, testSecret, 3600);
    const tampered = token.slice(0, -4) + "XXXX";

    const verified = await verifySessionToken(tampered, testSecret);
    expect(verified).toBeNull();
  });

  it("rejects expired tokens", async () => {
    const payload = { sub: "user-expired" };
    // Token with -10 seconds expiry
    const token = await signSessionToken(payload, testSecret, -10);

    const verified = await verifySessionToken(token, testSecret);
    expect(verified).toBeNull();
  });

  it("generates valid PKCE code challenges", async () => {
    const verifier = generateRandomString(32);
    expect(verifier.length).toBeGreaterThan(30);

    const challenge = await createPkceChallenge(verifier);
    expect(challenge.length).toBeGreaterThan(20);
  });

  it("throws an error if AUTH_SECRET or BETTER_AUTH_SECRET is missing", () => {
    const origBetter = process.env.BETTER_AUTH_SECRET;
    const origAuth = process.env.AUTH_SECRET;

    delete process.env.BETTER_AUTH_SECRET;
    delete process.env.AUTH_SECRET;

    try {
      expect(() => getJwtSecret()).toThrow(
        /AUTH_SECRET or BETTER_AUTH_SECRET environment variable is missing/
      );
    } finally {
      if (origBetter) process.env.BETTER_AUTH_SECRET = origBetter;
      if (origAuth) process.env.AUTH_SECRET = origAuth;
    }
  });

  it("extracts session from request headers via auth.api.getSession", async () => {
    const token = await signSessionToken({
      sub: "user-gcp-42",
      name: "Cloud Run User",
      email: "run@google.com",
    });

    const headers = new Headers();
    headers.set("cookie", `${SESSION_COOKIE_NAME}=${token}`);

    const session = await auth.api.getSession({ headers });
    expect(session).toBeDefined();
    expect(session?.user.id).toBe("user-gcp-42");
    expect(session?.user.email).toBe("run@google.com");
    expect(session?.user.name).toBe("Cloud Run User");
  });

  it("returns null session when cookie is absent", async () => {
    const headers = new Headers();
    const session = await auth.api.getSession({ headers });
    expect(session).toBeNull();
  });
});

describe("LoginButton Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders LoginButton with Google branding", () => {
    render(<LoginButton />);
    const button = screen.getByRole("button", { name: /continue with google/i });
    expect(button).toBeDefined();
  });

  it("handles sign in error gracefully without crashing", async () => {
    vi.mocked(signIn.social).mockResolvedValueOnce({
      data: null,
      error: {
        message: "Failed to connect to Google Identity Provider",
      },
    });

    render(<LoginButton />);
    const button = screen.getByRole("button", { name: /continue with google/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(
        screen.getByText(/Failed to connect to Google Identity Provider/i)
      ).toBeDefined();
    });
  });
});

describe("Edge Middleware Route Protection", () => {
  it("redirects unauthenticated user accessing / to /login", async () => {
    const { middleware } = await import("@/middleware");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost:3000/");
    const res = await middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("returns 401 Unauthorized for unauthenticated requests to protected API /api/chat", async () => {
    const { middleware } = await import("@/middleware");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost:3000/api/chat", {
      method: "POST",
    });
    const res = await middleware(req);

    expect(res.status).toBe(401);
  });

  it("allows public access to /login and /api/auth/session without redirect", async () => {
    const { middleware } = await import("@/middleware");
    const { NextRequest } = await import("next/server");

    const reqLogin = new NextRequest("http://localhost:3000/login");
    const resLogin = await middleware(reqLogin);
    expect(resLogin.headers.get("location")).toBeNull();

    const reqAuth = new NextRequest("http://localhost:3000/api/auth/session");
    const resAuth = await middleware(reqAuth);
    expect(resAuth.headers.get("location")).toBeNull();
  });

  it("redirects authenticated user visiting /login to /", async () => {
    const { middleware } = await import("@/middleware");
    const { NextRequest } = await import("next/server");

    const token = await signSessionToken({
      sub: "user-test-authenticated",
      email: "user@test.com",
    });

    const req = new NextRequest("http://localhost:3000/login", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
    });

    const res = await middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("allows authenticated user accessing / to pass through", async () => {
    const { middleware } = await import("@/middleware");
    const { NextRequest } = await import("next/server");

    const token = await signSessionToken({
      sub: "user-test-authenticated",
      email: "user@test.com",
    });

    const req = new NextRequest("http://localhost:3000/", {
      headers: {
        cookie: `${SESSION_COOKIE_NAME}=${token}`,
      },
    });

    const res = await middleware(req);
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("UserAvatarMenu Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders user first and last name and small email next to profile image when logged in", async () => {
    const { UserAvatarMenu } = await import("@/components/auth/user-avatar-menu");
    const { useSession } = await import("@/lib/auth-client");

    vi.mocked(useSession).mockReturnValue({
      data: {
        user: {
          id: "google-123",
          name: "Ada Lovelace",
          email: "ada.lovelace@google.com",
          image: "https://lh3.googleusercontent.com/a/test-photo",
        },
        session: {
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      },
      isPending: false,
      refetch: vi.fn(),
    });

    render(<UserAvatarMenu showName={true} />);

    expect(screen.getByText("Ada Lovelace")).toBeDefined();
    expect(screen.getByText("ada.lovelace@google.com")).toBeDefined();
    expect(screen.getByText("AL")).toBeDefined();
  });

  it("hides name and email when showName is false (collapsed sidebar)", async () => {
    const { UserAvatarMenu } = await import("@/components/auth/user-avatar-menu");
    const { useSession } = await import("@/lib/auth-client");

    vi.mocked(useSession).mockReturnValue({
      data: {
        user: {
          id: "google-123",
          name: "Ada Lovelace",
          email: "ada.lovelace@google.com",
          image: "https://lh3.googleusercontent.com/a/test-photo",
        },
        session: {
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      },
      isPending: false,
      refetch: vi.fn(),
    });

    render(<UserAvatarMenu showName={false} />);

    expect(screen.queryByText("Ada Lovelace")).toBeNull();
    expect(screen.queryByText("ada.lovelace@google.com")).toBeNull();
  });
});

describe("Auth API Endpoints", () => {
  it("GET /api/auth/session returns null user/session when unauthenticated", async () => {
    const { GET: getSessionRoute } = await import("@/app/api/auth/session/route");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost:3000/api/auth/session");
    const res = await getSessionRoute(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user).toBeNull();
    expect(data.session).toBeNull();
  });

  it("POST /api/auth/sign-out clears session and oauth cookies with maxAge 0", async () => {
    const { POST: signOutRoute } = await import("@/app/api/auth/sign-out/route");

    const res = await signOutRoute();
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);

    const cookies = res.cookies;
    expect(cookies.get(SESSION_COOKIE_NAME)?.value).toBe("");
    expect(cookies.get(SESSION_COOKIE_NAME)?.maxAge).toBe(0);
  });

  it("sanitizeCallbackUrl prevents open redirect vulnerabilities by falling back to / for external URLs", async () => {
    const { sanitizeCallbackUrl } = await import("@/lib/auth");

    expect(sanitizeCallbackUrl("/dashboard")).toBe("/dashboard");
    expect(sanitizeCallbackUrl("/chat/session-123")).toBe("/chat/session-123");
    expect(sanitizeCallbackUrl("https://attacker-site.com")).toBe("/");
    expect(sanitizeCallbackUrl("//attacker-site.com")).toBe("/");
    expect(sanitizeCallbackUrl("javascript:alert(1)")).toBe("/");
    expect(sanitizeCallbackUrl(null)).toBe("/");
    expect(sanitizeCallbackUrl(undefined)).toBe("/");
  });

  it("POST /api/auth/sign-in/google sanitizes external callbackURL to /", async () => {
    const originalClientId = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";

    try {
      const { POST: signInGoogleRoute } =
        await import("@/app/api/auth/sign-in/google/route");
      const { NextRequest } = await import("next/server");

      const req = new NextRequest("http://localhost:3000/api/auth/sign-in/google", {
        method: "POST",
        body: JSON.stringify({ callbackURL: "https://evil-phishing.com/stolen" }),
      });

      const res = await signInGoogleRoute(req);
      expect(res.status).toBe(200);

      const oauthCookie = res.cookies.get("llm_oauth_state");
      expect(oauthCookie).toBeDefined();

      const payload = await verifySessionToken<{ callbackURL: string }>(
        oauthCookie!.value
      );
      expect(payload?.callbackURL).toBe("/");
    } finally {
      process.env.GOOGLE_CLIENT_ID = originalClientId;
    }
  });

  it("POST /api/auth/sign-in/google returns auth URL and sets oauth state cookie", async () => {
    const originalClientId = process.env.GOOGLE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = "test-google-client-id.apps.googleusercontent.com";

    try {
      const { POST: signInGoogleRoute } =
        await import("@/app/api/auth/sign-in/google/route");
      const { NextRequest } = await import("next/server");

      const req = new NextRequest("http://localhost:3000/api/auth/sign-in/google", {
        method: "POST",
        body: JSON.stringify({ callbackURL: "/dashboard" }),
      });

      const res = await signInGoogleRoute(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.redirect).toBe(true);
      expect(typeof data.url).toBe("string");
      expect(data.url).toContain("test-google-client-id.apps.googleusercontent.com");

      const oauthCookie = res.cookies.get("llm_oauth_state");
      expect(oauthCookie).toBeDefined();
      expect(oauthCookie?.value).toBeTruthy();
    } finally {
      process.env.GOOGLE_CLIENT_ID = originalClientId;
    }
  });

  it("GET /api/auth/callback/google handles missing code/state cleanly", async () => {
    const { GET: callbackRoute } = await import("@/app/api/auth/callback/google/route");
    const { NextRequest } = await import("next/server");

    const req = new NextRequest("http://localhost:3000/api/auth/callback/google");
    const res = await callbackRoute(req);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login?error=missing_code_or_state");
  });

  it("GET /api/auth/callback/google exchanges code and sets 30-day session cookie", async () => {
    const originalClientId = process.env.GOOGLE_CLIENT_ID;
    const originalClientSecret = process.env.GOOGLE_CLIENT_SECRET;
    process.env.GOOGLE_CLIENT_ID = "test-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation((url) => {
      const u = url.toString();
      if (u.includes("oauth2.googleapis.com/token")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ access_token: "mock-google-access-token" }),
        } as Response);
      }
      if (u.includes("googleapis.com/oauth2/v3/userinfo")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            sub: "google-sub-999",
            name: "OAuth Tester",
            email: "oauth.tester@example.com",
            picture: "https://example.com/avatar.jpg",
          }),
        } as Response);
      }
      return Promise.resolve({ ok: false } as Response);
    });

    try {
      const statePayload = {
        state: "valid-state-123",
        codeVerifier: "verifier-456",
        callbackURL: "/",
      };
      const signedStateToken = await signSessionToken(statePayload, undefined, 600);

      const { GET: callbackRoute } = await import("@/app/api/auth/callback/google/route");
      const { NextRequest } = await import("next/server");

      const req = new NextRequest(
        "http://localhost:3000/api/auth/callback/google?code=valid-code-789&state=valid-state-123",
        {
          headers: {
            cookie: `llm_oauth_state=${signedStateToken}`,
          },
        }
      );

      const res = await callbackRoute(req);

      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("http://localhost:3000/");

      const sessionCookie = res.cookies.get(SESSION_COOKIE_NAME);
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie?.value).toBeTruthy();

      const payload = await verifySessionToken<{ sub: string; name: string }>(
        sessionCookie!.value
      );
      expect(payload?.sub).toBe("google-sub-999");
      expect(payload?.name).toBe("OAuth Tester");
    } finally {
      fetchSpy.mockRestore();
      process.env.GOOGLE_CLIENT_ID = originalClientId;
      process.env.GOOGLE_CLIENT_SECRET = originalClientSecret;
    }
  });
});
