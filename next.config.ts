import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ["google-auth-library"],
  experimental: {
    devtoolSegmentExplorer: false,
    optimizePackageImports: [
      "lucide-react",
      "@assistant-ui/react",
      "@assistant-ui/react-streamdown",
      "@streamdown/code",
      "@streamdown/math",
      "@streamdown/mermaid",
      "@radix-ui/react-tooltip",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-dialog",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/favicon.ico",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' blob: data: https://lh3.googleusercontent.com https://storage.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self' https://*.googleapis.com https://accounts.google.com; frame-src 'none'; object-src 'none'; base-uri 'self'; form-action 'self' https://accounts.google.com;",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin-allow-popups",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
