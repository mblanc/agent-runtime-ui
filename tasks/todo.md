# Tasks: Assistant-UI Thread List & Agent Runtime Session Service

- [x] Task 1: Agent Runtime Client Session Service Methods & Types
  - Acceptance: `src/types/agent.ts` defines `AgentSession`, `AgentSessionEvent`, and `sessionId` in `ChatRequestBody`. `AgentRuntimeClient` in `src/lib/agent-runtime-client.ts` implements `listSessions`, `createSession`, `getSession`, `deleteSession`, and `listSessionEvents` with live GCP REST & local mock modes. `streamQuery` forwards `session_id` to `async_stream_query`.
  - Verify: `bun run test tests/agent-client.test.ts`
  - Files: `src/types/agent.ts`, `src/lib/agent-runtime-client.ts`, `tests/agent-client.test.ts`

- [x] Task 2: Next.js BFF Session API Routes (`/api/sessions/*`)
  - Acceptance: `src/app/api/sessions/route.ts` (GET list, POST create) and `src/app/api/sessions/[sessionId]/route.ts` (GET events/details, DELETE) implemented with signed session auth check. `src/app/api/chat/route.ts` accepts `sessionId` and passes it to `agentClient.streamQuery`. Unauthenticated calls return 401.
  - Verify: `bun run test tests/sessions-api.test.ts`
  - Files: `src/app/api/sessions/route.ts`, `src/app/api/sessions/[sessionId]/route.ts`, `src/app/api/chat/route.ts`, `tests/sessions-api.test.ts`

- [x] Task 3: Client Session Adapter & Thread List State Management
  - Acceptance: `src/lib/session-adapter.ts` implements `RemoteThreadListAdapter` connecting assistant-ui to `/api/sessions`. `src/lib/gemini-runtime-adapter.ts` and `src/app/page.tsx` wire the remote thread list runtime and pass active session ID into chat streams.
  - Verify: `bun run check` and component integration tests
  - Files: `src/lib/session-adapter.ts`, `src/lib/gemini-runtime-adapter.ts`, `src/app/page.tsx`

- [x] Task 4: Gemini-Themed Thread Sidebar with Assistant-UI Primitives
  - Acceptance: `src/components/assistant-ui/thread-sidebar.tsx` updated with `ThreadListPrimitive.Root`, `ThreadListPrimitive.New`, `ThreadListPrimitive.Items`, and `ThreadListItemPrimitive`. Real sessions displayed, new chat button creates threads, delete action removes sessions with confirmation, collapsible sidebar preserved.
  - Verify: `bun run test tests/thread-sidebar.test.tsx`
  - Files: `src/components/assistant-ui/thread-sidebar.tsx`, `tests/thread-sidebar.test.tsx`

- [x] Task 5: End-to-End Test Suite & Preflight Verification
  - Acceptance: Full automated test suite passes with zero linter, formatting, or TypeScript errors (`bun run preflight`).
  - Verify: `bun run preflight`
  - Files: All touched files
