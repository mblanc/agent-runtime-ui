# Task List: Multi-Agent Backend Switcher (Vertex AI Reasoning Engine Selector)

## Phase 1: Contracts & BFF API Routes

- [x] **Task 1.1: Data Types & AgentRuntimeClient Discovery/Scoping**
  - **Description:** Define `DeployedAgent` and `ListAgentsResponse` in `src/types/agent.ts`. Implement multi-location engine discovery and mock agent stores in `AgentRuntimeClient`. Update `listSessions` and `createSession` to support `reasoningEngineId` scoping.
  - **Acceptance Criteria:**
    - [x] `DeployedAgent` and `ListAgentsResponse` interfaces in `src/types/agent.ts`
    - [x] `AgentRuntimeClient.listReasoningEngines()` queries configured locations or returns 3 mock agents
    - [x] `AgentRuntimeClient.listSessions()` and `createSession()` scoped to `reasoningEngineId`
    - [x] Mock store updated with 3 realistic agents and isolated mock sessions
  - **Verification:** `bun test tests/agent-client.test.ts`
  - **Files:** `src/types/agent.ts`, `src/lib/agent-runtime-client.ts`, `tests/agent-client.test.ts`
  - **Scope:** M

- [x] **Task 1.2: BFF API Endpoints (`GET /api/agents` & scoped `/api/sessions`)**
  - **Description:** Implement `src/app/api/agents/route.ts` with authentication and engine listing. Update `/api/sessions` routes to parse `agentId` query parameter and body payload. Update `/api/chat` to pass `reasoningEngineId`.
  - **Acceptance Criteria:**
    - [x] `GET /api/agents` returns `{ agents, activeAgentId }`
    - [x] `GET /api/sessions?agentId=...` filters sessions by agent ID
    - [x] `POST /api/sessions` creates session scoped to `agentId`
    - [x] `POST /api/chat` routes query to selected `reasoningEngineId`
  - **Verification:** `bun test tests/agents-api.test.ts tests/sessions-api.test.ts`
  - **Files:** `src/app/api/agents/route.ts`, `src/app/api/sessions/route.ts`, `src/app/api/chat/route.ts`
  - **Scope:** M

- [x] **Task 1.3: BFF API Route Unit & Integration Tests**
  - **Description:** Add test suite in `tests/agents-api.test.ts` and update `tests/sessions-api.test.ts` to test endpoint auth, multi-location discovery, error handling, and session scoping.
  - **Acceptance Criteria:**
    - [x] Test `GET /api/agents` unauthenticated (401) and authenticated (200)
    - [x] Test `GET /api/sessions?agentId=...` isolation
    - [x] Test multi-region parallel discovery with partial failure resilience
  - **Verification:** `bun test tests/agents-api.test.ts tests/sessions-api.test.ts tests/chat-api.test.ts`
  - **Files:** `tests/agents-api.test.ts`, `tests/sessions-api.test.ts`
  - **Scope:** S

### Checkpoint 1: API Foundation Verified

- [x] TypeScript check passes (`bun run check`)
- [x] All API tests pass (`bun test tests/*api*.test.ts`)

---

## Phase 2: Client State & Runtime Adapters

- [x] **Task 2.1: ActiveAgentContext & LocalStorage Persistence**
  - **Description:** Implement `AgentProvider` and `useActiveAgent` in `src/lib/agent-context.tsx` with initial fetch from `/api/agents`, `localStorage` persistence, fallback to default agent, and selection updater.
  - **Acceptance Criteria:**
    - [x] `AgentContext` and `AgentProvider` manage `activeAgent`, `availableAgents`, `isLoading`, and `setActiveAgent`
    - [x] Selected agent ID persisted to `localStorage` under `agent_runtime_active_agent_id`
    - [x] Invalid stored ID falls back to default agent
  - **Verification:** `bun test tests/agent-context.test.tsx`
  - **Files:** `src/lib/agent-context.tsx`, `tests/agent-context.test.tsx`
  - **Scope:** S

- [x] **Task 2.2: Session Adapter & Chat Adapter Scoping**
  - **Description:** Update `useSessionThreadListAdapter` in `src/lib/session-adapter.tsx` to include `agentId` in session queries and creation. Update `createGeminiChatAdapter` to pass `reasoningEngineId` to `/api/chat`.
  - **Acceptance Criteria:**
    - [x] `useSessionThreadListAdapter(userId, agentId)` requests `/api/sessions?agentId=...`
    - [x] `createGeminiChatAdapter` passes `reasoningEngineId` in `/api/chat` request body
    - [x] Thread list re-fetches when active agent changes
  - **Verification:** `bun test tests/multimodal-attachments.test.tsx tests/tools-hitl.test.tsx`
  - **Files:** `src/lib/session-adapter.tsx`, `src/lib/gemini-runtime-adapter.ts`
  - **Scope:** S

- [x] **Task 2.3: Context & Adapter Unit Tests**
  - **Description:** Implement unit tests verifying state transitions, storage persistence, fallback behavior, and adapter scoping on agent change.
  - **Acceptance Criteria:**
    - [x] Context initialization tests pass
    - [x] LocalStorage synchronization tests pass
    - [x] Adapter request URL parameters verified
  - **Verification:** `bun test tests/agent-context.test.tsx`
  - **Files:** `tests/agent-context.test.tsx`
  - **Scope:** S

### Checkpoint 2: Client State & Adapters Verified

- [x] TypeScript check passes (`bun run check`)
- [x] Context and adapter tests pass (`bun test tests/agent-context.test.tsx`)

---

## Phase 3: UI Components & Page Integration

- [x] **Task 3.1: AgentHeaderSelector Component**
  - **Description:** Create `AgentHeaderSelector` in `src/components/agent-switcher/agent-header-selector.tsx` using Radix dropdown menu, active agent indicator, region badges, and descriptions.
  - **Acceptance Criteria:**
    - [x] Top bar displays active agent name and region badge
    - [x] Dropdown lists all available agents with descriptions and active checkmarks
    - [x] Agent selection updates global context
  - **Verification:** `bun test tests/agent-switcher.test.tsx`
  - **Files:** `src/components/agent-switcher/agent-header-selector.tsx`, `tests/agent-switcher.test.tsx`
  - **Scope:** S

- [x] **Task 3.2: ThreadSidebar & GeminiThread Dynamic Scoping**
  - **Description:** Update `ThreadSidebar` with agent subtitle header (`Threads for [Agent Name]`) and update `GeminiThread` empty state greeting and subtitle to reflect active agent.
  - **Acceptance Criteria:**
    - [x] `ThreadSidebar` displays current agent subtitle
    - [x] `GeminiThread` empty state shows active agent display name and description
  - **Verification:** `bun test tests/thread-sidebar.test.tsx tests/components.test.tsx`
  - **Files:** `src/components/assistant-ui/thread-sidebar.tsx`, `src/components/assistant-ui/gemini-thread.tsx`
  - **Scope:** S

- [x] **Task 3.3: Chat Page Layout Integration & Composer Refactor**
  - **Description:** Mount `AgentProvider` and `AgentHeaderSelector` in `src/app/page.tsx`. Remove static Flash/Pro picker in `GeminiComposer` and adapt input placeholder to `"Ask [Agent Name]..."`.
  - **Acceptance Criteria:**
    - [x] `AgentProvider` wraps chat page
    - [x] Top header bar renders `AgentHeaderSelector`
    - [x] Composer placeholder dynamically includes agent name
    - [x] Static Flash/Pro picker replaced cleanly
  - **Verification:** `bun test tests/components.test.tsx`
  - **Files:** `src/app/page.tsx`, `src/components/assistant-ui/gemini-composer.tsx`
  - **Scope:** S

- [x] **Task 3.4: UI Component & Interaction Tests**
  - **Description:** Build end-to-end component tests in `tests/agent-switcher.test.tsx` and update existing component tests.
  - **Acceptance Criteria:**
    - [x] Test dropdown interactions and agent selection
    - [x] Test sidebar header reflects active agent
    - [x] Test empty greeting displays agent name and description
  - **Verification:** `bun test tests/agent-switcher.test.tsx tests/components.test.tsx tests/thread-sidebar.test.tsx`
  - **Files:** `tests/agent-switcher.test.tsx`, `tests/components.test.tsx`, `tests/thread-sidebar.test.tsx`
  - **Scope:** M

### Checkpoint 3: End-to-End User Flow Verified

- [x] All unit and component tests pass (`bun run test`)
- [x] Agent switching and session scoping verified end-to-end

---

## Phase 4: Verification & Quality Gates

- [x] **Task 4.1: Full Preflight & Quality Gates**
  - **Description:** Run all quality gates (`bun run check`, `bun run lint`, `bun run test`, `bun run build`).
  - **Acceptance Criteria:**
    - [x] `bun run check` passes with 0 type errors
    - [x] `bun run lint` passes with 0 warnings/errors
    - [x] `bun run test` passes 100% of test suites
    - [x] `bun run build` completes successfully
  - **Verification:** `bun run preflight && bun run build`
  - **Files:** None
  - **Scope:** XS
