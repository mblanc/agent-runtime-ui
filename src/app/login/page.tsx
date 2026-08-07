"use client";

import { LoginButton } from "@/components/auth/login-button";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Sparkles } from "lucide-react";

export default function LoginPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (!isPending && session?.user) {
      router.push("/");
    }
  }, [session, isPending, router]);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#fdfcfc] px-4 text-[#1f1f1f] dark:bg-[#0c0c0c] dark:text-[#e3e3e3]">
      {/* Background ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 h-[320px] w-[600px] max-w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-[160px] bg-[#a9d1fb]/60 blur-[100px] dark:bg-[#1b2f9c]/50"
      />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center text-center">
        {/* Gemini Sparkle Logo */}
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)] dark:bg-[#1e1f20] dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.6)]">
          <Sparkles className="h-7 w-7 text-[#1a73e8] dark:text-[#8ab4f8]" />
        </div>

        <h1 className="mb-2 text-3xl font-semibold tracking-tight text-[#1f1f1f] dark:text-white">
          Welcome to Agent Runtime UI
        </h1>
        <p className="mb-8 text-sm text-[#444746] dark:text-[#c4c7c5]">
          Sign in with your Google identity to access your ADK agent powered by Google
          Cloud Agent Runtime.
        </p>

        <div className="w-full max-w-sm rounded-3xl bg-white/80 p-6 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.08)] backdrop-blur-md dark:bg-[#1e1f20]/80 dark:shadow-[0_4px_24px_-4px_rgba(0,0,0,0.4)]">
          <LoginButton />

          <div className="mt-4 text-xs text-[#575b5f] dark:text-[#9aa0a6]">
            Secure Google SSO with Google Workspace and Gmail
          </div>
        </div>
      </div>
    </main>
  );
}
