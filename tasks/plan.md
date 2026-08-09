# Implementation Plan: Multi-Agent Backend Switcher (Vertex AI Reasoning Engine Selector)

## Overview

Implement a dynamic **Multi-Agent Backend Switcher** in `agent-runtime-ui`. This enables users to discover, list, and switch between deployed **Vertex AI Reasoning Engines** (ADK agents) across Google Cloud project regions directly from the top navigation bar. Selecting an active agent scopes conversation threads, updates greeting displays, and routes chat completions and session persistence to the selected engine.

---

## Architecture & Design Decisions

1. **Multi-Region Engine Discovery (`GET /api/agents`)**:
   - Queries Vertex AI Reasoning Engines across regions configured in `GOOGLE_CLOUD_LOCATIONS` (e.g., `us-central1,europe-west4`) or `GOOGLE_CLOUD_LOCATION` (default `us-central1`) in parallel using `Promise.allSettled`.
   - In mock mode (`MOCK_AGENT_RUNTIME=true` or missing credentials), returns 3 realistic mock agents:
     - `mock-arch-advisor`: _ADK Architecture Advisor (us-central1)_
     - `mock-code-reviewer`: _Code Reviewer & Auditor (europe-west4)_
     - `mock-cloud-ops`: _Cloud Ops Assistant (us-central1)_

2. **Scoped Session Management (`GET /api/sessions?agentId=...`)**:
   - Vertex AI Sessions are child resources of Reasoning Engines (`projects/{project}/locations/{location}/reasoningEngines/{engineId}/sessions/{sessionId}`).
   - The BFF API and client-side session store will isolate threads by both `userId` and `agentId` (`reasoningEngineId`).

3. **Global Agent State (`ActiveAgentContext` & `AgentProvider`)**:
   - React Context manages `activeAgent`, `availableAgents`, `isLoading`, and `setActiveAgent`.
   - Persists selected agent ID in `localStorage` (`agent_runtime_active_agent_id`).
   - Automatically falls back to the default or first available agent if the stored ID is invalid or missing.

4. **UI Integration**:
   - Top Header bar hosts `AgentHeaderSelector` with 🤖 icon, display name, location badge, and Radix dropdown.
   - `ThreadSidebar` updates its section header (`Threads for [Selected Agent]`) and re-queries sessions when `activeAgent` changes.
   - `GeminiThread` empty state greeting dynamically displays the active agent's name and description.
   - `GeminiComposer` input placeholder adapts to the active agent, and static Flash/Pro placeholder is removed or refactored.

---

## Task Breakdown & Dependency Graph

```
[Phase 1: Contracts & BFF API Routes]
  Task 1.1: Data Types & AgentRuntimeClient Discovery/Scoping
  Task 1.2: BFF API Endpoints (GET /api/agents & scoped /api/sessions)
  Task 1.3: BFF API Route Unit & Integration Tests
        │
   [Checkpoint 1: API Foundation Verified]
        │
[Phase 2: Client State & Runtime Adapters]
  Task 2.1: ActiveAgentContext & LocalStorage Persistence
  Task 2.2: Session Adapter & Chat Adapter Scoping
  Task 2.3: Context & Adapter Unit Tests
        │
   [Checkpoint 2: Client State & Adapters Verified]
        │
[Phase 3: UI Components & Page Integration]
  Task 3.1: AgentHeaderSelector Component
  Task 3.2: ThreadSidebar & GeminiThread Dynamic Scoping
  Task 3.3: Chat Page Layout Integration & Composer Refactor
  Task 3.4: UI Component & Interaction Tests
        │
   [Checkpoint 3: End-to-End User Flow Verified]
        │
[Phase 4: Verification & Quality Gates]
  Task 4.1: Full Preflight & Quality Gates (tsc, lint, test, build)
```

---

## Detailed Task Specifications

### Phase 1: Contracts & BFF API Routes

#### Task 1.1: Data Types & AgentRuntimeClient Discovery/Scoping

**Description:** Define `DeployedAgent` and `ListAgentsResponse` interfaces in `src/types/agent.ts`. Extend `AgentRuntimeClient` to support listing reasoning engines across multiple locations, returning mock agents in mock mode, and isolating sessions per agent ID.

**Acceptance criteria:**

- [ ] `DeployedAgent` and `ListAgentsResponse` interfaces added to [`src/types/agent.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/types/agent.ts).
- [ ] `AgentRuntimeClient.listReasoningEngines()` implemented with multi-location query and mock fallback.
- [ ] `AgentRuntimeClient.listSessions()` and `createSession()` accept `reasoningEngineId` for scoping.
- [ ] Mock store contains 3 realistic agents with distinct mock sessions per agent.

**Verification:**

- [ ] Unit test `tests/agent-client.test.ts` passes.
- [ ] TypeScript check passes with zero errors.

**Dependencies:** None
**Files touched:**

- `src/types/agent.ts`
- `src/lib/agent-runtime-client.ts`
- `tests/agent-client.test.ts`
  **Estimated scope:** M (3 files)

---

#### Task 1.2: BFF API Endpoints (`GET /api/agents` & scoped `/api/sessions`)

**Description:** Create `GET /api/agents` route returning available agents and default active agent ID. Update `GET /api/sessions` and `POST /api/sessions` to accept `agentId` query parameter / body payload. Ensure `POST /api/chat` handles `reasoningEngineId` payload.

**Acceptance criteria:**

- [ ] `src/app/api/agents/route.ts` created with auth validation and `GET` handler.
- [ ] `GET /api/sessions` parses `agentId` query param and filters sessions accordingly.
- [ ] `POST /api/sessions` accepts `agentId` and creates session under the specific engine.
- [ ] `POST /api/chat` passes `reasoningEngineId` and `location` to `AgentRuntimeClient`.

**Verification:**

- [ ] `bun run test tests/agents-api.test.ts` and `bun run test tests/sessions-api.test.ts` pass.

**Dependencies:** Task 1.1
**Files touched:**

- `src/app/api/agents/route.ts`
- `src/app/api/sessions/route.ts`
- `src/app/api/chat/route.ts`
  **Estimated scope:** M (3 files)

---

#### Task 1.3: BFF API Route Unit & Integration Tests

**Description:** Create comprehensive test suites for `GET /api/agents` and scoped `GET/POST /api/sessions` in `tests/agents-api.test.ts` and update `tests/sessions-api.test.ts`.

**Acceptance criteria:**

- [ ] Test `GET /api/agents` returns 401 when unauthenticated.
- [ ] Test `GET /api/agents` returns mock agent list and active ID when authenticated.
- [ ] Test `GET /api/sessions?agentId=...` filters sessions by agent.
- [ ] Test multi-region parallel fetching handles regional failures gracefully.

**Verification:**

- [ ] `bun test tests/agents-api.test.ts tests/sessions-api.test.ts tests/chat-api.test.ts` passes.

**Dependencies:** Task 1.2
**Files touched:**

- `tests/agents-api.test.ts`
- `tests/sessions-api.test.ts`
  **Estimated scope:** S (2 files)

---

### Checkpoint 1: API Foundation Verified

- [ ] `bun run check` passes.
- [ ] All API unit and integration tests pass cleanly.

---

### Phase 2: Client State & Runtime Adapters

#### Task 2.1: ActiveAgentContext & LocalStorage Persistence

**Description:** Implement `AgentProvider` and `useActiveAgent` in `src/lib/agent-context.tsx` to manage available agents, active agent selection, loading state, and `localStorage` persistence with fallback.

**Acceptance criteria:**

- [ ] `AgentContext` and `AgentProvider` created with `activeAgent`, `availableAgents`, `isLoading`, and `setActiveAgent`.
- [ ] Initial state fetches `/api/agents` and restores stored agent from `localStorage`.
- [ ] Invalid or deleted agent IDs fall back to default agent.
- [ ] Switching agent updates state and `localStorage`.

**Verification:**

- [ ] Unit tests in `tests/agent-context.test.tsx` pass.

**Dependencies:** Task 1.2
**Files touched:**

- `src/lib/agent-context.tsx`
- `tests/agent-context.test.tsx`
  **Estimated scope:** S (2 files)

---

#### Task 2.2: Session Adapter & Chat Adapter Scoping

**Description:** Update `useSessionThreadListAdapter` in `src/lib/session-adapter.tsx` and `createGeminiChatAdapter` in `src/lib/gemini-runtime-adapter.ts` to accept active agent ID and dynamically scope list/create session requests and chat queries.

**Acceptance criteria:**

- [ ] `useSessionThreadListAdapter(userId, agentId)` passes `agentId` to `/api/sessions`.
- [ ] `createGeminiChatAdapter` accepts `getAgentId` callback and sends `reasoningEngineId` in `/api/chat` payload.
- [ ] Changing `agentId` triggers thread list re-fetch.

**Verification:**

- [ ] `bun test tests/multimodal-attachments.test.tsx tests/tools-hitl.test.tsx` passes.

**Dependencies:** Task 2.1
**Files touched:**

- `src/lib/session-adapter.tsx`
- `src/lib/gemini-runtime-adapter.ts`
  **Estimated scope:** S (2 files)

---

#### Task 2.3: Context & Adapter Unit Tests

**Description:** Add unit tests verifying `AgentProvider` state transitions, localStorage synchronization, and adapter scoping when `activeAgent` changes.

**Acceptance criteria:**

- [ ] Test context initialization from `/api/agents`.
- [ ] Test persistence and recovery from localStorage.
- [ ] Test session adapter URLs include `agentId`.

**Verification:**

- [ ] `bun test tests/agent-context.test.tsx` passes.

**Dependencies:** Task 2.1, Task 2.2
**Files touched:**

- `tests/agent-context.test.tsx`
  **Estimated scope:** S (1 file)

---

### Checkpoint 2: Client State & Adapters Verified

- [ ] `bun run check` passes.
- [ ] Context and adapter tests pass.

---

### Phase 3: UI Components & Page Integration

#### Task 3.1: AgentHeaderSelector Component

**Description:** Build `AgentHeaderSelector` in `src/components/agent-switcher/agent-header-selector.tsx` with Radix dropdown menu, agent display names, description snippets, region badges, and active checkmarks.

**Acceptance criteria:**

- [ ] `AgentHeaderSelector` renders active agent display name and region badge.
- [ ] Dropdown lists all available agents with descriptions, region badges, and active indicator.
- [ ] Clicking an agent calls `setActiveAgent` and switches active state.
- [ ] Supports dark and light mode styling consistent with Gemini aesthetic.

**Verification:**

- [ ] Component renders cleanly in test suite `tests/agent-switcher.test.tsx`.

**Dependencies:** Task 2.1
**Files touched:**

- `src/components/agent-switcher/agent-header-selector.tsx`
- `tests/agent-switcher.test.tsx`
  **Estimated scope:** S (2 files)

---

#### Task 3.2: ThreadSidebar & GeminiThread Dynamic Scoping

**Description:** Update `ThreadSidebar` to display the active agent context subtitle and update `GeminiThread` empty state to display dynamic agent greeting, description, and sparkle badge.

**Acceptance criteria:**

- [ ] `ThreadSidebar` displays subtitle (e.g., _"Threads for [Agent Name]"_).
- [ ] `GeminiThread` empty state shows active agent display name and description.
- [ ] Empty state greeting gracefully defaults when agent description is omitted.

**Verification:**

- [ ] `bun test tests/thread-sidebar.test.tsx tests/components.test.tsx` passes.

**Dependencies:** Task 2.1, Task 3.1
**Files touched:**

- `src/components/assistant-ui/thread-sidebar.tsx`
- `src/components/assistant-ui/gemini-thread.tsx`
  **Estimated scope:** S (2 files)

---

#### Task 3.3: Chat Page Layout Integration & Composer Refactor

**Description:** Mount `AgentProvider` in `src/app/page.tsx` (or `layout.tsx`), place `AgentHeaderSelector` in the top header bar, remove static Flash/Pro picker from `GeminiComposer`, and update input placeholder.

**Acceptance criteria:**

- [ ] `AgentProvider` wraps the chat runtime and page.
- [ ] Top header bar renders `AgentHeaderSelector`.
- [ ] `GeminiComposer` placeholder updates to `"Ask [Agent Name]..."` (or `"Ask Gemini..."`).
- [ ] Static Flash/Pro picker replaced cleanly by header agent selector.
- [ ] Switching active agent resets thread view to new/empty thread.

**Verification:**

- [ ] Component and page tests pass.

**Dependencies:** Task 3.1, Task 3.2
**Files touched:**

- `src/app/page.tsx`
- `src/components/assistant-ui/gemini-composer.tsx`
  **Estimated scope:** S (2 files)

---

#### Task 3.4: UI Component & Interaction Tests

**Description:** Add comprehensive UI tests in `tests/agent-switcher.test.tsx` and update `tests/components.test.tsx` and `tests/thread-sidebar.test.tsx`.

**Acceptance criteria:**

- [ ] Test dropdown interactions: opening menu, selecting different agent, checking checkmark.
- [ ] Test thread sidebar header updates when active agent changes.
- [ ] Test empty greeting reflects active agent details.

**Verification:**

- [ ] `bun test tests/agent-switcher.test.tsx tests/components.test.tsx tests/thread-sidebar.test.tsx` passes.

**Dependencies:** Task 3.3
**Files touched:**

- `tests/agent-switcher.test.tsx`
- `tests/components.test.tsx`
- `tests/thread-sidebar.test.tsx`
  **Estimated scope:** M (3 files)

---

### Checkpoint 3: End-to-End User Flow Verified

- [ ] `bun run test` passes all tests.
- [ ] User flow for agent switching, thread scoping, and greeting updates verified.

---

### Phase 4: Verification & Quality Gates

#### Task 4.1: Full Preflight & Quality Gates

**Description:** Run all quality gates (`bun run preflight`, `bun run check`, `bun run lint`, `bun run test`, `bun run build`) to ensure 100% type safety, code styling, zero lint warnings, and passing production build.

**Acceptance criteria:**

- [ ] `bun run check` passes with 0 errors.
- [ ] `bun run lint` passes with 0 warnings/errors.
- [ ] `bun run test` passes 100% of test suites.
- [ ] `bun run build` completes successfully.

**Verification:**

- [ ] Execute `bun run preflight` and `bun run build`.

**Dependencies:** Task 3.4
**Files touched:**

- None (verification task)
  **Estimated scope:** XS (0 files)

---

## Risks and Mitigations

| Risk                                                                 | Impact | Mitigation                                                                                                                                         |
| -------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Regional GCP API latency or timeout when querying multiple locations | Medium | Use `Promise.allSettled` to query regional endpoints concurrently and return all successfully resolved engines without failing the entire request. |
| In-memory mock store mixing sessions between agents                  | High   | Key mock session store by composite key or filter by `reasoningEngineId` property on session records.                                              |
| Agent ID stored in `localStorage` no longer exists in project        | Low    | Validate stored ID against `availableAgents`; fallback automatically to default agent if not found.                                                |
| Switching agent while a stream is in flight                          | Medium | Switching agent triggers a new empty turn and aborts any active controller stream.                                                                 |

---

## Open Questions & Clarifications

None. All requirements, contracts, and UI patterns are specified in [`docs/spec-agent-switcher.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-agent-switcher.md).
