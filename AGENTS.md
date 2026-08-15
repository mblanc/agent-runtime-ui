# AGENTS.md

Welcome! This file provides comprehensive instructions, context, architecture overview, project structure index, and guidelines for AI agents working in the **Agent Runtime UI** codebase.

---

## 1. Context

**Agent Runtime UI** (`agent-runtime-ui`) is a production-grade, serverless web application styled after **Google Gemini**. It connects authenticated users to an **ADK (Agent Development Kit)** agent hosted on **Google Cloud Agent Runtime** (Vertex AI Reasoning Engines).

### Key Architectural Concepts

- **BFF Pattern**: Next.js App Router serves as a Backend-For-Frontend proxy. The browser never communicates directly with Vertex AI or GCP APIs.
- **Stateless Authentication**: Uses stateless Google Identity OAuth 2.0 with PKCE and HMAC-SHA256 cryptographically signed JWT cookies (`HttpOnly`, `SameSite=Lax`). Zero database is required, making the application 100% serverless and multi-instance Cloud Run ready.
- **Agent Runtime & Session Service**: Communicates with Vertex AI Reasoning Engine `:streamQuery` API for real-time SSE streaming, and the Vertex AI Sessions REST API for per-user multi-turn conversation persistence.
- **Mock Mode**: Supports offline/local testing without active GCP credentials (`MOCK_AGENT_RUNTIME=true`).

---

## 2. The App

### Features & Design System

- **Google Gemini Aesthetic**:
  - Centered _"How can I help you today?"_ greeting with ambient radial background glow in empty state.
  - Floating single-row pill composer with `+` tools menu, dynamic auto-resizing input, model selector (`Flash` / `Pro`), voice button, and stateful send/stop button.
  - Avatar-free full-width assistant responses with markdown formatting, syntax highlighting, copy button, and collapsible reasoning/thought traces.
  - Right-aligned rounded warm-grey user bubbles (`#f0f4f9` / `#282a2c`).
  - Multi-thread history sidebar with chronological grouping (Today, Yesterday, Older).
- **Subagent & Tool Integration**: Displays collapsible execution blocks for subagents and function call tools.
- **Theme Support**: Seamless Dark and Light mode powered by `next-themes`.

---

## 3. Technical Stack

| Layer                           | Technology                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| **Runtime & Package Manager**   | Bun (v1.3+)                                                                                 |
| **Framework**                   | Next.js 15 (App Router), React 19, TypeScript (strict mode)                                 |
| **Chat UI Engine**              | `@assistant-ui/react` (v0.15), `@assistant-ui/react-markdown`                               |
| **Styling & UI Primitives**     | Tailwind CSS v3, Radix UI (`@radix-ui/react-*`), `lucide-react`, `class-variance-authority` |
| **Syntax & Markdown**           | `react-shiki`, `remark-gfm`                                                                 |
| **Authentication & Auth Proxy** | Custom Google OAuth 2.0 PKCE, Web Crypto JWT sessions, `google-auth-library`                |
| **Testing**                     | Vitest (`vitest`), `@testing-library/react`, `jsdom`, Playwright (`@playwright/test`)       |
| **Tooling & Linter**            | ESLint 9 (`eslint-config-next`), Prettier 3, `concurrently`                                 |
| **Deployment**                  | Docker, Google Cloud Run                                                                    |

### Core Commands

```bash
# Development
bun run dev          # Start Next.js development server

# Preflight & Quality Gates
bun run preflight    # Format + concurrently run check, lint, and test
bun run check        # TypeScript typecheck (tsc --noEmit)
bun run lint         # ESLint code linting
bun run format       # Prettier code formatting
bun run test         # Unit & component test suite (Vitest)

# Production & Containerization
bun run build        # Production Next.js build
bun run start        # Production Next.js server
```

---

## 4. Index of Where to Find Things

Use this index to quickly locate specific subsystems and implementations across the codebase:

### Core Pages & Layouts

- [`src/app/page.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/page.tsx): Main chat page wiring `useRemoteThreadListRuntime`, `useLocalRuntime`, and layout primitives.
- [`src/app/login/page.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/login/page.tsx): Gemini-styled Google SSO login page.
- [`src/app/layout.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/layout.tsx): Root layout with theme provider and session context.
- [`src/app/globals.css`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/globals.css): Global Tailwind styles, ambient glow tokens, and custom scrollbars.

### API Routes (Backend-For-Frontend)

- [`src/app/api/chat/route.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/api/chat/route.ts): SSE streaming endpoint connecting to Vertex AI Reasoning Engine `:streamQuery`.
- [`src/app/api/sessions/route.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/api/sessions/route.ts): List user sessions (`GET`) and create new session (`POST`).
- [`src/app/api/sessions/[sessionId]/route.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/api/sessions/[sessionId]/route.ts): Fetch session event history (`GET`) and delete session (`DELETE`).
- [`src/app/api/sessions/[sessionId]/state/route.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/api/sessions/[sessionId]/state/route.ts): Fetch and mutate ADK session state map (`GET`, `PATCH`).
- [`src/app/api/auth/sign-in/google/route.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/api/auth/sign-in/google/route.ts): Initiates Google OAuth 2.0 PKCE flow.
- [`src/app/api/auth/callback/google/route.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/api/auth/callback/google/route.ts): Handles OAuth redirect, issues signed JWT session cookie.
- [`src/app/api/auth/session/route.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/api/auth/session/route.ts): Validates JWT session cookie and returns user profile.
- [`src/app/api/auth/sign-out/route.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/api/auth/sign-out/route.ts): Clears session cookie.

### Assistant UI Components

- [`src/components/assistant-ui/gemini-thread.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/gemini-thread.tsx): Active conversation view, empty state greeting, and viewport footer.
- [`src/components/assistant-ui/gemini-composer.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/gemini-composer.tsx): Single-row pill composer with model selector (Flash/Pro) and controls.
- [`src/components/assistant-ui/gemini-message.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/gemini-message.tsx): Message part rendering (user bubbles, markdown text, thinking indicators, state chips).
- [`src/components/assistant-ui/gemini-message-timing.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/gemini-message-timing.tsx): Generation duration, token throughput, context cache savings badge, and execution telemetry badge integration.
- [`src/components/assistant-ui/message-info-popover.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/message-info-popover.tsx): Detailed floating popover displaying model version, invocation/trace ID, token breakdown progress bar, and model confidence rating.
- [`src/components/assistant-ui/thought-signature-badge.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/thought-signature-badge.tsx): Cryptographic reasoning trace verification badge and signature inspection popover.
- [`src/components/assistant-ui/gemini-reasoning.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/gemini-reasoning.tsx): Collapsible reasoning/thought accordion block.
- [`src/components/assistant-ui/gemini-tools.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/gemini-tools.tsx): Tool call execution chips and output payloads.
- [`src/components/assistant-ui/subagent-collapsible.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/subagent-collapsible.tsx): Subagent execution trace accordion.
- [`src/components/assistant-ui/thread-sidebar.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/thread-sidebar.tsx): Multi-thread sidebar list with delete and new chat actions.
- [`src/components/assistant-ui/markdown-text.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/markdown-text.tsx): Markdown text primitive integration with syntax highlighting.
- [`src/components/assistant-ui/shiki-highlighter.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/shiki-highlighter.tsx): Code block syntax highlighting component.

### Context Caching & Session State Components

- [`src/components/context-caching/context-cache-popover.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/context-caching/context-cache-popover.tsx): Floating popover and timing badge displaying cache hit ratio, token savings, and cost reduction.
- [`src/components/session-state/session-state-drawer.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/session-state/session-state-drawer.tsx): Slide-over inspector drawer for viewing, filtering, and mutating ADK session state variables.
- [`src/components/session-state/state-variable-card.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/session-state/state-variable-card.tsx): Individual state variable card with type badges, copy actions, and inline JSON editing.
- [`src/components/session-state/add-state-variable-modal.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/session-state/add-state-variable-modal.tsx): Modal form for creating typed state variables.
- [`src/components/session-state/state-delta-chip.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/session-state/state-delta-chip.tsx): In-chat pill chip showing state variable mutations and opening the inspector.
- [`src/components/session-state/session-state-header-button.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/session-state/session-state-header-button.tsx): Header navigation button with live variable count badge.

### Grounding & Citations Components

- [`src/components/grounding/inline-citation-badge.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/grounding/inline-citation-badge.tsx): Interactive superscript citation pill (`[1]`, `[1, 2]`) with hover/click popover and keyboard navigation.
- [`src/components/grounding/source-popover.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/grounding/source-popover.tsx): Detailed floating popover displaying source title, domain badge, GCS URI, snippet, and confidence score.
- [`src/components/grounding/google-search-widget.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/grounding/google-search-widget.tsx): Sanitized Google Search Grounding attribution container rendering official search suggestions.
- [`src/components/grounding/grounding-sources-accordion.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/grounding/grounding-sources-accordion.tsx): Expandable sources list detailing search queries, web source links, and corporate RAG documents.
- [`src/components/grounding/enterprise-rag-drawer.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/grounding/enterprise-rag-drawer.tsx): Slide-over drawer for deep inspection of enterprise RAG document text excerpts and GCS metadata.
- [`src/components/grounding/grounding-footer.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/grounding/grounding-footer.tsx): Composite footer component integrating sources accordion, search widget, and RAG drawer.

### Auth & UI Primitives

- [`src/components/auth/user-avatar-menu.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/auth/user-avatar-menu.tsx): User profile dropdown with logout button and drawer triggers.
- [`src/components/auth/login-button.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/auth/login-button.tsx): Google SSO sign-in button.
- [`src/components/ui/`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/ui): Radix/shadcn UI primitives ([`button.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/ui/button.tsx), [`dropdown-menu.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/ui/dropdown-menu.tsx), [`avatar.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/ui/avatar.tsx), [`tooltip.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/ui/tooltip.tsx)).

### Business Logic & Services

- [`src/lib/agent-runtime-client.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime-client.ts): Vertex AI Reasoning Engine REST API client, SSE stream handler, and mock store.
- [`src/lib/gemini-runtime-adapter.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/gemini-runtime-adapter.ts): `ChatModelAdapter` translating `/api/chat` SSE stream to assistant-ui runtime.
- [`src/lib/context-caching/cache-metrics.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/context-caching/cache-metrics.ts): Context caching hit ratio and cost reduction calculations.
- [`src/lib/session-state/state-context.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/session-state/state-context.tsx): Session state React Context and hooks (`useSessionState`).
- [`src/lib/session-state/state-diff.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/session-state/state-diff.ts): Structural state delta diffing and type inference.
- [`src/lib/grounding/citation-parser.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/grounding/citation-parser.ts): Citation parsing, domain/GCS extraction, metadata normalization, and markdown citation transformation.
- [`src/lib/session-adapter.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/session-adapter.tsx): `RemoteThreadListAdapter` connecting assistant-ui thread list to `/api/sessions`.
- [`src/lib/auth.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/auth.ts): Server-side authentication and session extraction.
- [`src/lib/auth-client.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/auth-client.ts): Client-side authentication state hook.
- [`src/lib/jwt.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/jwt.ts): Web Crypto API HMAC-SHA256 JWT signing and verification.

### Types & Specs

- [`src/types/agent.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/types/agent.ts): Data contracts for streams, sessions, subagents, grounding metadata, context caching, and session state.
- [`docs/spec.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec.md): Overall application specification and architecture diagram.
- [`docs/spec-context-caching-and-session-state.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-context-caching-and-session-state.md): Specification for Vertex AI Context Caching & ADK Session State Inspector.
- [`docs/spec-grounding-citations.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-grounding-citations.md): Specification for Google Search and Enterprise RAG Grounding, citations, and inspection drawer.
- [`docs/spec-session-service-thread-list.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-session-service-thread-list.md): Detailed specification for session service and sidebar thread list integration.

### Test Suite

- [`tests/context-caching.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/context-caching.test.ts): Pure calculation unit tests for context cache hit ratio and metrics.
- [`tests/context-caching-ui.test.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/tests/context-caching-ui.test.tsx): UI component tests for context caching badge and savings popover.
- [`tests/session-state-api.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/session-state-api.test.ts): REST API integration tests for `/api/sessions/[sessionId]/state`.
- [`tests/session-state-adapter.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/session-state-adapter.test.ts): Stream parsing and event normalization tests for state deltas and cached tokens.
- [`tests/session-state-context.test.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/tests/session-state-context.test.tsx): Session state diffing, type parsing, and context provider tests.
- [`tests/session-state-ui.test.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/tests/session-state-ui.test.tsx): UI component tests for StateDeltaChip, StateVariableCard, AddStateVariableModal, and SessionStateDrawer.
- [`tests/grounding-parser.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/grounding-parser.test.ts): Unit tests for citation regex parsing, 1-based index resolution, and grounding normalization.
- [`tests/grounding-stream.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/grounding-stream.test.ts): Integration tests for grounding stream SSE interception, chat adapter metadata, and multi-turn persistence.
- [`tests/grounding-ui.test.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/tests/grounding-ui.test.tsx): Component tests for citation badges, popovers, Google Search widget, and RAG drawer.
- [`tests/message-info.test.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/tests/message-info.test.tsx): Component and interaction tests for `MessageInfoPopover` and `ThoughtSignatureBadge`.
- [`tests/sessions-api.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/sessions-api.test.ts): Integration tests for session REST endpoints.
- [`tests/chat-api.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/chat-api.test.ts): Unit tests for `/api/chat` SSE streaming proxy.
- [`tests/thread-sidebar.test.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/tests/thread-sidebar.test.tsx): React testing for thread sidebar primitives.
- [`tests/components.test.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/tests/components.test.tsx): Gemini UI components tests.
- [`tests/agent-client.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/agent-client.test.ts): Agent Runtime REST & streaming client tests.
- [`tests/e2e/`](file:///Users/mblanc/projects/agent-runtime-ui/tests/e2e): Playwright end-to-end test specifications.

---

## 5. Do's and Don'ts

### Do's

- **Run Quality Gates**: Always run `bun run preflight` (or `bun run check`, `bun run lint`, `bun run test`) before completing a task to ensure zero type errors or broken tests.
- **Strict TypeScript Types**: Maintain 100% strict typing. Avoid `any` at all costs. Define clean interfaces in [`src/types/agent.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/types/agent.ts) when extending functionality.
- **Use `cn()` Utility**: Use the `cn()` helper from [`src/lib/utils.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/utils.ts) when merging Tailwind classes.
- **Stateless Serverless Architecture**: Keep session management strictly stateless via cryptographic JWT cookies.
- **User Identity Scoping**: Ensure all backend API endpoints (`/api/sessions`, `/api/chat`) strictly validate user authentication and filter resources by `userId`.
- **Maintain `@assistant-ui/react` v0.15 Patterns**: Use current accessor APIs (`aui.thread`, `aui.composer`, `aui.message`) and unified state hooks (`useAui()`, `useAuiState()`).
- **Support Mock Mode**: Keep mock data handlers in [`src/lib/agent-runtime-client.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime-client.ts) in sync whenever adding new stream event types or tool representations.

### Don'ts

- **Never Expose GCP Credentials**: Never leak Google Cloud Service Account private keys or IAM bearer tokens to the browser.
- **Never Add Unnecessary Database Dependencies**: Do not introduce stateful databases (e.g. SQLite, Cloud SQL) unless requested. The app is intentionally database-free.
- **Never Bypass API Auth Checks**: Do not remove `getAuthSession()` verification from API routes under `src/app/api/`.
- **Never Use Removed `@assistant-ui/react` Legacy Context Hooks**: Avoid deprecated hooks like `useThreadRuntime`, `useMessage`, `useComposer`, or `useAssistantRuntime` which were removed in 0.15.
- **Never Expose Raw GCP Errors**: Always catch GCP API failures gracefully in BFF routes and stream sanitized user-friendly error messages.
