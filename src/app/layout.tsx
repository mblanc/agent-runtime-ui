import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import "katex/dist/katex.min.css";
import "streamdown/styles.css";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme/theme-provider";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Agent Runtime UI — Gemini Interface for Google Cloud Agent Runtime",
  description:
    "Production Gemini-styled web interface connected to Google Cloud Agent Runtime (Vertex AI Reasoning Engines) with Google OAuth.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-screen font-sans bg-[#fdfcfc] text-[#1f1f1f] antialiased dark:bg-[#0c0c0c] dark:text-[#e3e3e3]">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
