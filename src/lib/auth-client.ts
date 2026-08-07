"use client";

import { useEffect, useState, useCallback } from "react";

export interface User {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export interface SessionData {
  user: User;
  session: {
    expiresAt: string;
  };
}

export interface SignInSocialOptions {
  provider: "google";
  callbackURL?: string;
}

export interface SignInResult {
  data: { url: string } | null;
  error: { message: string } | null;
}

/**
 * Hook to retrieve and subscribe to the active authenticated session.
 */
export function useSession() {
  const [data, setData] = useState<SessionData | null>(null);
  const [isPending, setIsPending] = useState(true);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/session");
      if (res.ok) {
        const json = await res.json();
        if (json && json.user) {
          setData(json);
        } else {
          setData(null);
        }
      } else {
        setData(null);
      }
    } catch {
      setData(null);
    } finally {
      setIsPending(false);
    }
  }, []);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  return { data, isPending, refetch: fetchSession };
}

export const signIn = {
  social: async ({
    provider,
    callbackURL = "/",
  }: SignInSocialOptions): Promise<SignInResult> => {
    if (provider !== "google") {
      return {
        data: null,
        error: { message: `Unsupported provider: ${provider}` },
      };
    }

    try {
      const res = await fetch("/api/auth/sign-in/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callbackURL }),
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        return {
          data: null,
          error: data.error || { message: "Sign in failed" },
        };
      }

      if (data.url) {
        window.location.href = data.url;
        return { data: { url: data.url }, error: null };
      }

      return {
        data: null,
        error: { message: "No redirect URL received from server" },
      };
    } catch (err: unknown) {
      return {
        data: null,
        error: {
          message:
            err instanceof Error
              ? err.message
              : "Failed to communicate with authentication server",
        },
      };
    }
  },
};

export const signOut = async () => {
  try {
    await fetch("/api/auth/sign-out", { method: "POST" });
  } finally {
    window.location.href = "/login";
  }
};

export const authClient = {
  signIn,
  signOut,
  useSession,
};
