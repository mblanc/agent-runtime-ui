"use client";

import { useEffect, useState } from "react";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function LoginButton({ className }: { className?: string }) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const errorParam = params.get("error");
      if (errorParam) {
        setErrorMessage(`Authentication error: ${decodeURIComponent(errorParam)}`);
      }
    }
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const res = await signIn.social({
        provider: "google",
        callbackURL: "/",
      });

      if (res?.error) {
        console.error("Sign in failed:", res.error);
        setErrorMessage(
          res.error.message || "Failed to initiate Google sign-in. Please try again."
        );
        setIsLoading(false);
      }
    } catch (err: unknown) {
      console.error("Sign in error:", err);
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred during sign-in."
      );
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full space-y-3">
      <Button
        variant="outline"
        onClick={handleGoogleSignIn}
        disabled={isLoading}
        className={`h-11 w-full gap-3 rounded-full border-border/80 bg-white px-6 text-sm font-medium text-foreground shadow-sm hover:bg-muted/60 dark:bg-[#1e1f20] dark:hover:bg-[#282a2c] ${className || ""}`}
      >
        <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        <span>{isLoading ? "Signing in..." : "Continue with Google"}</span>
      </Button>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-3.5 py-2.5 text-xs text-destructive dark:border-destructive/40 dark:bg-destructive/20"
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
}
