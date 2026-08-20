import Link from "next/link";
import { Sparkles, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#fdfcfc] px-4 text-[#1f1f1f] dark:bg-[#0c0c0c] dark:text-[#e3e3e3]">
      {/* Background ambient glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 h-[320px] w-[600px] max-w-[90%] -translate-x-1/2 -translate-y-1/2 rounded-[160px] bg-[#a9d1fb]/60 blur-[100px] dark:bg-[#1b2f9c]/50"
      />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center text-center">
        <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-[0_4px_20px_-4px_rgba(0,0,0,0.15)] dark:bg-[#1e1f20] dark:shadow-[0_4px_20px_-4px_rgba(0,0,0,0.6)]">
          <Sparkles className="h-7 w-7 text-[#1a73e8] dark:text-[#8ab4f8]" />
        </div>

        <h1 className="mb-2 text-3xl font-semibold tracking-tight text-[#1f1f1f] dark:text-white">
          404 - Page Not Found
        </h1>
        <p className="mb-8 text-sm text-[#444746] dark:text-[#c4c7c5]">
          The conversation, session, or page you are looking for does not exist or has
          been moved.
        </p>

        <Button
          asChild
          className="gap-2 rounded-xl bg-[#1a73e8] text-white hover:bg-[#1557b0] dark:bg-[#8ab4f8] dark:text-[#202124] dark:hover:bg-[#a8c7fa]"
        >
          <Link href="/">
            <Home className="h-4 w-4" />
            Return Home
          </Link>
        </Button>
      </div>
    </main>
  );
}
