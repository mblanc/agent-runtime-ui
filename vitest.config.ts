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
    setupFiles: ["./tests/setup.ts"],
    env: {
      // The provider factory mocks on intent rather than on NODE_ENV, so the
      // suite has to declare it. Individual tests still override this to
      // exercise the live-config path.
      MOCK_AGENT_RUNTIME: "true",
    },
    // Import time dominates this suite (200s+ of module loading), so the budget
    // is spent on parallel loading rather than in the test body. Raised from 15s
    // once the suite grew past ~450 tests and components.test.tsx began timing
    // out at ~16s under full-suite contention while passing 16/16 in isolation.
    testTimeout: 30000,
    exclude: ["node_modules", "tests/e2e/**"],
    server: {
      deps: {
        inline: ["react-shiki"],
      },
    },
  },
});
