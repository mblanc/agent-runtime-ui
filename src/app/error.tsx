"use client";

import { useEffect } from "react";
import { AlertCircle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log unexpected client runtime errors
    console.error("Application error:", error);
  }, [error]);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#fdfcfc] px-4 text-[#1f1f1f] dark:bg-[#0c0c0c] dark:text-[#e3e3e3]">
      {/* Background ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 h-[320px] w-[600px] max-w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-[160px] bg-[#f87171]/20 blur-[100px] dark:bg-[#991b1b]/20"
      />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center text-center">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)] dark:bg-[#1e1f20] dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.6)]">
          <AlertCircle className="h-7 w-7 text-red-500 dark:text-red-400" />
        </div>

        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-[#1f1f1f] dark:text-white">
          Something went wrong
        </h1>
        <p className="mb-8 text-sm text-[#444746] dark:text-[#c4c7c5]">
          An unexpected error occurred while rendering this conversation. You can try
          reloading the view or returning to the home screen.
        </p>

        <div className="flex w-full max-w-xs flex-col gap-3">
          <Button
            onClick={() => reset()}
            className="w-full gap-2 rounded-xl bg-[#1a73e8] text-white hover:bg-[#1557b0] dark:bg-[#8ab4f8] dark:text-[#202124] dark:hover:bg-[#a8c7fa]"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>

          <Button
            asChild
            variant="outline"
            className="w-full gap-2 rounded-xl border-border bg-card hover:bg-muted"
          >
            <Link href="/">
              <Home className="h-4 w-4" />
              Return Home
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
