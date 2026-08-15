import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    env: {
      // The provider factory mocks on intent rather than on NODE_ENV, so the
      // suite has to declare it. Individual tests still override this to
      // exercise the live-config path.
      MOCK_AGENT_RUNTIME: "true",
    },
    // Import time dominates this suite (~60s of module loading across 39 files),
    // so the 5s default is spent on parallel loading rather than the test body.
    testTimeout: 15000,
    exclude: ["node_modules", "tests/e2e/**"],
    server: {
      deps: {
        inline: ["react-shiki"],
      },
    },
  },
});
