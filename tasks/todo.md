# Tasks: LLM Council UI Implementation

- [x] Task 1: Project Scaffolding & Tooling (Bun, ESLint, Prettier, Preflight)
  - Acceptance: Next.js 15 project configured with Bun runtime, TypeScript, Tailwind CSS, `@assistant-ui/react`, `better-auth`, `google-auth-library`, `eslint`, `prettier`, `concurrently`, and preflight script (`"preflight": "bun run format && concurrently --kill-others-on-fail -n check,lint,test \"bun run check\" \"bun run lint\" \"bun run test\""`).
  - Verify: `bun run preflight` and `bun run build` succeed.
  - Files: `package.json`, `tsconfig.json`, `.eslintrc.json` (or `eslint.config.mjs`), `.prettierrc`, `next.config.ts`, `tailwind.config.ts`, `src/app/globals.css`, `src/app/layout.tsx`.

- [ ] Task 2: better-auth Authentication Setup
  - Acceptance: Server auth configuration, Google OAuth provider setup, SQLite adapter, `/api/auth/[...all]` handler, and client auth hooks implemented.
  - Verify: Sign-in redirect and session retrieval hooks function.
  - Files: `src/lib/auth.ts`, `src/lib/auth-client.ts`, `src/app/api/auth/[...all]/route.ts`.

- [ ] Task 3: Login Page & Auth Guard
  - Acceptance: Dedicated Gemini-styled login page with Google SSO button and auth guard protecting the root chat view.
  - Verify: Navigating to `/` when unauthenticated redirects to `/login`, logging in redirects back to `/`.
  - Files: `src/app/login/page.tsx`, `src/components/auth/login-button.tsx`, `src/components/auth/user-avatar-menu.tsx`.

- [ ] Task 4: assistant-ui Gemini Components
  - Acceptance: Centered headline with ambient radial glow, single-row pill composer with tools menu & model picker, avatar-free markdown replies, and collapsible reasoning blocks.
  - Verify: Empty state transitions into active chat thread smoothly with full visual fidelity.
  - Files: `src/components/assistant-ui/gemini-thread.tsx`, `src/components/assistant-ui/gemini-composer.tsx`, `src/components/assistant-ui/gemini-message.tsx`, `src/components/assistant-ui/gemini-tools.tsx`, `src/components/assistant-ui/thread-sidebar.tsx`.

- [ ] Task 5: Agent Runtime Streaming Proxy (BFF)
  - Acceptance: Server-side route `/api/chat` with Google Cloud ADC authentication, stream query dispatcher to Vertex AI Reasoning Engine / `/run_sse`, mock development fallback mode, and SSE translation for assistant-ui.
  - Verify: Streaming response renders incremental tokens, thought traces, and tool call status badges in the UI.
  - Files: `src/lib/agent-runtime-client.ts`, `src/app/api/chat/route.ts`, `src/types/agent.ts`.

- [ ] Task 6: Cloud Run Dockerfile & Documentation
  - Acceptance: Multi-stage Dockerfile for Cloud Run, `.env.example`, and comprehensive README with deployment instructions.
  - Verify: Container builds and runs locally with `docker build` and `npm run build`.
  - Files: `Dockerfile`, `.dockerignore`, `.env.example`, `README.md`.
