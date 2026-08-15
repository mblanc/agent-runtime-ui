# Implementation Plan: Vertex AI Context Caching & ADK Session State Inspector

## Overview

Implement first-class support for **Vertex AI Context Caching** and the **ADK Session State Inspector** (`session.state`) in `agent-runtime-ui` based on [`docs/spec-context-caching-and-session-state.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-context-caching-and-session-state.md).

This system provides:

1. **Context Caching Telemetry & Savings Visualizer**: Intercepting `cached_content_token_count` from Vertex AI stream usage metadata to visually celebrate prompt cache hits, latency reductions, and estimated input cost savings (~75% reduction) in assistant message footers and telemetry popovers.
2. **ADK Session State Inspector & Delta Visualizer**: Providing a dedicated slide-over developer/enterprise debug drawer (`SessionStateDrawer`), in-chat state mutation chips (`StateDeltaChip`), and top-bar state indicator buttons to inspect, search, watch, and edit structured ADK session state variables (`actions.state_delta` / `session.state`) across multi-turn workflows.

---

## Architecture Decisions

- **Pure Functional Cache Metrics Engine**: Create an isolated pure helper [`src/lib/context-caching/cache-metrics.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/context-caching/cache-metrics.ts) to calculate cache hit ratios, token breakdowns, and cost discount metrics, allowing deterministic unit testing across any usage metadata structure.
- **Stateless REST Proxying for Session State**: Create `GET` and `PATCH` endpoints under `/api/sessions/[sessionId]/state` using `withAuthDynamic` to securely query and update state variables via Vertex AI `SessionService`, scoped strictly to the authenticated `userId`.
- **Client-Side React Context for Live Session State**: Provide a lightweight `SessionStateProvider` and `useSessionState()` hook managing state synchronization, drawer visibility, active session switching, and optimistic updates.
- **In-Stream Action Delta Interception**: Intercept `actions.state_delta` in `createGeminiChatAdapter` to trigger live in-chat diff chips and refresh the active session state store.
- **Google Gemini Design System Parity**: Adhere to Gemini aesthetics: ambient glow, pill badges (`⚡ 3,420 Cached Tokens (75%)`), Radix UI popovers/dialogs, collapsible accordions, and clean JSON viewers with syntax badges.
- **Complete Mock Mode Parity**: Update `MockAgentRuntimeProvider` and `mock-store.ts` with `mockSessionStateStore` to emit simulated cache hits and state delta events when requested, ensuring full offline testability (`MOCK_AGENT_RUNTIME=true`).

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Data Contracts, Types & Cache Calculation Engine               │
│ (src/types/agent.ts, src/lib/context-caching/cache-metrics.ts)          │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 2: Backend Services, Mock Store & BFF REST Endpoints              │
│ (session-service.ts, mock-provider.ts, /api/sessions/[sessionId]/state) │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 3: Stream Pipeline & Client Session State Context                 │
│ (chat-adapter.ts, state-context.tsx, state-diff.ts)                     │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 4: UI Components — Cache Savings Badge & In-Chat State Chips      │
│ (gemini-message-timing.tsx, message-info-popover.tsx, state-delta-chip) │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 5: UI Components — Session State Inspector Drawer & Navigation    │
│ (session-state-drawer.tsx, state-variable-card.tsx, header button)      │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Phase 6: End-to-End Verification, UI Tests & Quality Preflight          │
│ (tests/session-state-*.test.ts(x), bun run preflight)                   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Task List

### Phase 1: Data Contracts, Types & Cache Calculation Engine

#### Task 1: Define Context Caching & Session State Type Contracts

**Description:** Extend [`src/types/agent.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/types/agent.ts) with strict TypeScript types for Vertex AI context caching metrics (`TokenModalityDetail`, `ContextCacheSavingsMetrics`), ADK session state values (`SessionStateValue`, `SessionStateMap`, `SessionStateDeltaItem`), and session state API contracts (`SessionStateResponse`, `UpdateSessionStateRequest`). Update `AgentUsageMetadata`, `AgentActionsDelta`, `AgentStreamEvent`, and `AgentSessionEvent`.

**Acceptance criteria:**

- [ ] `AgentUsageMetadata` supports `cached_content_token_count`, `cachedTokenCount`, `cached_tokens_details`, and `cachedTokensDetails`.
- [ ] `ContextCacheSavingsMetrics` defines `cachedTokens`, `promptTokens`, `totalTokens`, `cacheHitRatio`, `estimatedCostReductionPercent`, and `isCached`.
- [ ] `SessionStateValue` and `SessionStateMap` represent arbitrary structured session JSON dictionaries.
- [ ] `SessionStateDeltaItem` models diff mutations (`added`, `updated`, `deleted`).
- [ ] `SessionStateResponse` and `UpdateSessionStateRequest` are typed for REST operations.
- [ ] Zero `any` types; all types exported from [`src/types/agent.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/types/agent.ts).

**Verification:**

- [ ] Tests pass: `bun run check`
- [ ] Build succeeds: `bun run build`
- [ ] Manual check: Types compile cleanly without errors.

**Dependencies:** None

**Files likely touched:**

- [`src/types/agent.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/types/agent.ts)

**Estimated scope:** XS (1 file)

---

#### Task 2: Implement Pure Cache Calculation Engine & Unit Tests

**Description:** Implement [`src/lib/context-caching/cache-metrics.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/context-caching/cache-metrics.ts) with pure calculation helper `calculateContextCacheMetrics(usage?: AgentUsageMetadata | UsageMetadata): ContextCacheSavingsMetrics`. Implement comprehensive unit tests in [`tests/context-caching.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/context-caching.test.ts).

**Acceptance criteria:**

- [ ] Computes `cachedTokens`, `promptTokens`, `totalTokens`, `cacheHitRatio` (0.0 to 1.0), and `estimatedCostReductionPercent` (75% savings for Gemini Flash cached context).
- [ ] Safely handles edge cases: `undefined` usage, zero cached tokens, 100% cached tokens, missing prompt token count, effective token maximums.
- [ ] Formats percentages and token counts safely.
- [ ] Unit tests cover all boundary scenarios in [`tests/context-caching.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/context-caching.test.ts).

**Verification:**

- [ ] Tests pass: `bun test tests/context-caching.test.ts`
- [ ] Build succeeds: `bun run check`

**Dependencies:** Task 1

**Files likely touched:**

- [`src/lib/context-caching/cache-metrics.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/context-caching/cache-metrics.ts)
- [`tests/context-caching.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/context-caching.test.ts)

**Estimated scope:** S (2 files)

---

### Checkpoint 1: Foundation & Pure Calculations

- [ ] All cache metric unit tests pass: `bun test tests/context-caching.test.ts`
- [ ] Strict type checking passes: `bun run check`

---

### Phase 2: Backend Services, Mock Store & BFF REST Endpoints

#### Task 3: Implement Session Service State Methods & Mock Store Parity

**Description:** Update `IAgentRuntimeProvider` in [`src/lib/agent-runtime/types.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/types.ts) and `VertexAiSessionService` in [`src/lib/agent-runtime/services/session-service.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/services/session-service.ts) to support `getSessionState` and `updateSessionState`. Add `mockSessionStateStore` in [`src/lib/agent-runtime/mock/mock-store.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/mock/mock-store.ts), update `MockAgentRuntimeProvider` in [`src/lib/agent-runtime/mock/mock-provider.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/mock/mock-provider.ts) with state CRUD and simulated cache tokens & state deltas, and export methods on `AgentRuntimeClient` in [`src/lib/agent-runtime-client.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime-client.ts).

**Acceptance criteria:**

- [ ] `VertexAiSessionService.getSessionState` and `updateSessionState` communicate with the Vertex AI Session Service endpoint.
- [ ] `mockSessionStateStore` is initialized with sample variables (`target_cluster`, `deployment_status`, `active_services`, `run_config`).
- [ ] `MockAgentRuntimeProvider.getSessionState` and `updateSessionState` support merge and replace modes.
- [ ] `MockAgentRuntimeProvider.streamQuery` emits `cached_content_token_count` (e.g. 3,420 cached tokens out of 4,200 prompt tokens) and emits `actions.state_delta` on state-modifying requests (e.g. "set environment to staging", "update cluster").
- [ ] `AgentRuntimeClient` exposes `getSessionState` and `updateSessionState`.

**Verification:**

- [ ] Tests pass: `bun test tests/agent-client.test.ts`
- [ ] Build succeeds: `bun run check`

**Dependencies:** Task 1, Task 2

**Files likely touched:**

- [`src/lib/agent-runtime/types.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/types.ts)
- [`src/lib/agent-runtime/services/session-service.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/services/session-service.ts)
- [`src/lib/agent-runtime/mock/mock-store.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/mock/mock-store.ts)
- [`src/lib/agent-runtime/mock/mock-provider.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/mock/mock-provider.ts)
- [`src/lib/agent-runtime-client.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime-client.ts)

**Estimated scope:** M (5 files)

---

#### Task 4: Implement Session State BFF REST API Route & API Tests

**Description:** Create [`src/app/api/sessions/[sessionId]/state/route.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/api/sessions/[sessionId]/state/route.ts) with `GET` and `PATCH` handlers protected by `withAuthDynamic`. Implement integration tests in [`tests/session-state-api.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/session-state-api.test.ts).

**Acceptance criteria:**

- [ ] `GET /api/sessions/[sessionId]/state` verifies authentication, checks session ownership, queries state, and returns `SessionStateResponse`.
- [ ] `PATCH /api/sessions/[sessionId]/state` verifies authentication, checks ownership, validates payload `{ state, mode }`, updates state, and returns updated `SessionStateResponse`.
- [ ] Rejects unauthorized requests with 401 and cross-user session tampering with 403.
- [ ] Handles missing/invalid sessions with 404.
- [ ] Unit & integration tests in [`tests/session-state-api.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/session-state-api.test.ts) pass.

**Verification:**

- [ ] Tests pass: `bun test tests/session-state-api.test.ts`
- [ ] Build succeeds: `bun run check`

**Dependencies:** Task 3

**Files likely touched:**

- [`src/app/api/sessions/[sessionId]/state/route.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/api/sessions/[sessionId]/state/route.ts)
- [`tests/session-state-api.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/session-state-api.test.ts)

**Estimated scope:** S (2 files)

---

### Checkpoint 2: Backend Services & API Quality Gate

- [ ] All session state API tests pass: `bun test tests/session-state-api.test.ts`
- [ ] Client & mock integration tests pass: `bun test tests/agent-client.test.ts`
- [ ] Strict type checking passes: `bun run check`

---

### Phase 3: Stream Pipeline & Client Session State Context

#### Task 5: Wire State Deltas & Cache Telemetry into Chat Adapter Stream

**Description:** Update `createYieldContent` and stream processing in [`src/lib/adapters/chat-adapter.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/adapters/chat-adapter.ts) and [`src/lib/agent-runtime/event-normalizer.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/event-normalizer.ts) to extract and preserve `actions.state_delta` and `usage_metadata.cached_content_token_count` across live streaming and historical session turns. Create [`tests/session-state-adapter.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/session-state-adapter.test.ts).

**Acceptance criteria:**

- [ ] `chat-adapter.ts` extracts `actions.state_delta` / `actions.stateDelta` and passes it into message metadata `metadata.custom.actions`.
- [ ] `chat-adapter.ts` preserves `cached_content_token_count` in `metadata.custom.usageMetadata`.
- [ ] `event-normalizer.ts` extracts and preserves `actions.state_delta` and cached token counts from historical session events.
- [ ] Tests in [`tests/session-state-adapter.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/session-state-adapter.test.ts) verify SSE parsing of state deltas and cached token metadata.

**Verification:**

- [ ] Tests pass: `bun test tests/session-state-adapter.test.ts`
- [ ] Build succeeds: `bun run check`

**Dependencies:** Task 3, Task 4

**Files likely touched:**

- [`src/lib/adapters/chat-adapter.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/adapters/chat-adapter.ts)
- [`src/lib/agent-runtime/event-normalizer.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/event-normalizer.ts)
- [`tests/session-state-adapter.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/session-state-adapter.test.ts)

**Estimated scope:** S (3 files)

---

#### Task 6: Implement Client Session State Context & Delta Diff Helper

**Description:** Create [`src/lib/session-state/state-diff.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/session-state/state-diff.ts) with pure diff helper `computeStateDelta(oldState, newState): SessionStateDeltaItem[]`. Create [`src/lib/session-state/state-context.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/session-state/state-context.tsx) providing `SessionStateProvider` and `useSessionState()` / `useOptionalSessionState()` hooks. Add unit tests in [`tests/session-state-context.test.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/tests/session-state-context.test.tsx).

**Acceptance criteria:**

- [ ] `computeStateDelta` correctly identifies `added`, `updated`, and `deleted` key-value pairs with old and new values.
- [ ] `SessionStateProvider` fetches and stores live `state: SessionStateMap` for the active session.
- [ ] Provides `isLoading`, `error`, `isDrawerOpen`, `setIsDrawerOpen`, `refreshState`, `updateVariable(key, value)`, `deleteVariable(key)`, `clearState`.
- [ ] Optimistically updates state and rolls back gracefully on network failure.
- [ ] Context unit tests in [`tests/session-state-context.test.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/tests/session-state-context.test.tsx) pass.

**Verification:**

- [ ] Tests pass: `bun test tests/session-state-context.test.tsx`
- [ ] Build succeeds: `bun run check`

**Dependencies:** Task 4, Task 5

**Files likely touched:**

- [`src/lib/session-state/state-diff.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/session-state/state-diff.ts)
- [`src/lib/session-state/state-context.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/session-state/state-context.tsx)
- [`tests/session-state-context.test.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/tests/session-state-context.test.tsx)

**Estimated scope:** M (3 files)

---

### Checkpoint 3: Client State Store & Stream Pipeline Gate

- [ ] State diff and adapter tests pass: `bun test tests/session-state-adapter.test.ts tests/session-state-context.test.tsx`
- [ ] Existing test suites pass: `bun run test`

---

### Phase 4: UI Components — Cache Savings Badge & In-Chat State Chips

#### Task 7: Build Context Cache Savings Badge & Popover in Message Timing

**Description:** Create [`src/components/context-caching/context-cache-popover.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/context-caching/context-cache-popover.tsx). Update [`src/components/assistant-ui/gemini-message-timing.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/gemini-message-timing.tsx) and [`src/components/assistant-ui/message-info-popover.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/message-info-popover.tsx) to render the **`⚡ N Cached Tokens (X% saved)`** badge and detail popover when cached tokens are detected.

**Acceptance criteria:**

- [ ] `GeminiMessageTiming` displays the `⚡ N Cached Tokens (X%)` badge when `cachedTokens > 0`.
- [ ] Hovering/clicking the badge opens `ContextCachePopover` displaying:
  - Cache hit percentage (e.g. 81.4%)
  - Input tokens (uncached) vs Cached tokens breakdown
  - Output + reasoning tokens
  - Total tokens consumed
  - Estimated input cost savings (~75%)
  - Time-to-First-Token acceleration status
- [ ] `MessageInfoPopover` displays cached tokens in the token breakdown bar and metrics pill grid.

**Verification:**

- [ ] Tests pass: `bun test tests/components.test.tsx`
- [ ] Build succeeds: `bun run check`

**Dependencies:** Task 2, Task 5

**Files likely touched:**

- [`src/components/context-caching/context-cache-popover.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/context-caching/context-cache-popover.tsx)
- [`src/components/assistant-ui/gemini-message-timing.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/gemini-message-timing.tsx)
- [`src/components/assistant-ui/message-info-popover.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/message-info-popover.tsx)

**Estimated scope:** M (3 files)

---

#### Task 8: Build In-Chat State Delta Chip Component

**Description:** Create [`src/components/session-state/state-delta-chip.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/session-state/state-delta-chip.tsx). Mount `StateDeltaChip` inside `ChatMessage` in [`src/components/assistant-ui/gemini-message.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/gemini-message.tsx) to render collapsible state mutation chips on assistant turns with `actions.state_delta`.

**Acceptance criteria:**

- [ ] Renders an expandable pill: **`[ 🗄️ Session State Updated (+N variables) ▾ ]`** when `actions.state_delta` is present on the assistant message.
- [ ] Expanded view displays formatted key-value diffs with type badges and old vs new values.
- [ ] Includes an action button "Open State Inspector" that opens `SessionStateDrawer`.
- [ ] Respects Gemini dark/light styling and animation guidelines.

**Verification:**

- [ ] Tests pass: `bun test tests/components.test.tsx`
- [ ] Build succeeds: `bun run check`

**Dependencies:** Task 6, Task 7

**Files likely touched:**

- [`src/components/session-state/state-delta-chip.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/session-state/state-delta-chip.tsx)
- [`src/components/assistant-ui/gemini-message.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/gemini-message.tsx)

**Estimated scope:** S (2 files)

---

### Checkpoint 4: Inline Message Telemetry & State Chips Gate

- [ ] Component tests pass: `bun test tests/components.test.tsx`
- [ ] Type check clean: `bun run check`

---

### Phase 5: UI Components — Session State Inspector Drawer & Navigation

#### Task 9: Build Session State Inspector Drawer, Variable Cards & Edit Modal

**Description:** Create [`src/components/session-state/session-state-drawer.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/session-state/session-state-drawer.tsx), [`src/components/session-state/state-variable-card.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/session-state/state-variable-card.tsx), and [`src/components/session-state/add-state-variable-modal.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/session-state/add-state-variable-modal.tsx).

**Acceptance criteria:**

- [ ] `SessionStateDrawer`: slide-over panel with header, variable count, search filter input, "Add Variable" button, "Refresh" button, and empty state.
- [ ] `StateVariableCard`: card displaying variable key name, type badge (`string`, `number`, `boolean`, `array`, `object`, `null`), formatted JSON/syntax view, copy button, edit button, and delete button.
- [ ] `AddStateVariableModal`: modal dialog to add or edit a key-value pair with automatic type detection (or type selector) and JSON validation for arrays/objects.
- [ ] Handles search filtering by key name or value content.

**Verification:**

- [ ] Tests pass: `bun test tests/components.test.tsx`
- [ ] Build succeeds: `bun run check`

**Dependencies:** Task 6, Task 8

**Files likely touched:**

- [`src/components/session-state/session-state-drawer.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/session-state/session-state-drawer.tsx)
- [`src/components/session-state/state-variable-card.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/session-state/state-variable-card.tsx)
- [`src/components/session-state/add-state-variable-modal.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/session-state/add-state-variable-modal.tsx)

**Estimated scope:** M (3 files)

---

#### Task 10: Wire Session State Header Button, Avatar Menu & Page Integration

**Description:** Create [`src/components/session-state/session-state-header-button.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/session-state/session-state-header-button.tsx). Integrate `SessionStateHeaderButton` and `SessionStateProvider` into [`src/app/page.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/page.tsx). Add "Session State Inspector" option to [`src/components/auth/user-avatar-menu.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/auth/user-avatar-menu.tsx).

**Acceptance criteria:**

- [ ] `SessionStateHeaderButton` renders in top header alongside `MemoryHeaderButton` with database icon and active variable count badge.
- [ ] Clicking `SessionStateHeaderButton` toggles `SessionStateDrawer`.
- [ ] `UserAvatarMenu` contains "Session State Inspector" dropdown item that opens the drawer.
- [ ] `ChatPage` wraps contents with `SessionStateProvider` and mounts `SessionStateDrawer`.

**Verification:**

- [ ] Tests pass: `bun test tests/components.test.tsx`
- [ ] Build succeeds: `bun run check`

**Dependencies:** Task 9

**Files likely touched:**

- [`src/components/session-state/session-state-header-button.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/session-state/session-state-header-button.tsx)
- [`src/components/auth/user-avatar-menu.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/auth/user-avatar-menu.tsx)
- [`src/app/page.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/page.tsx)

**Estimated scope:** S (3 files)

---

### Checkpoint 5: Full UI & Drawer Integration Gate

- [ ] All component tests pass: `bun test tests/components.test.tsx`
- [ ] Application builds without errors: `bun run build`

---

### Phase 6: End-to-End Verification, UI Tests & Quality Preflight

#### Task 11: Implement Dedicated Context Caching & Session State UI Tests

**Description:** Create dedicated component and interaction test suites [`tests/context-caching-ui.test.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/tests/context-caching-ui.test.tsx) and [`tests/session-state-ui.test.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/tests/session-state-ui.test.tsx).

**Acceptance criteria:**

- [ ] Tests verify cache badge rendering when `cached_content_token_count > 0` and popover toggle.
- [ ] Tests verify `StateDeltaChip` rendering diffs on state-modifying turns.
- [ ] Tests verify opening `SessionStateDrawer`, searching keys, adding a variable via modal, editing a variable, deleting a variable, and refreshing state.

**Verification:**

- [ ] Tests pass: `bun test tests/context-caching-ui.test.tsx tests/session-state-ui.test.tsx`
- [ ] Build succeeds: `bun run check`

**Dependencies:** Task 7, Task 8, Task 9, Task 10

**Files likely touched:**

- [`tests/context-caching-ui.test.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/tests/context-caching-ui.test.tsx)
- [`tests/session-state-ui.test.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/tests/session-state-ui.test.tsx)

**Estimated scope:** S (2 files)

---

#### Task 12: Execute Quality Gates Preflight & Update Documentation

**Description:** Execute full quality preflight (`bun run preflight`: check, lint, format, test). Update [`AGENTS.md`](file:///Users/mblanc/projects/agent-runtime-ui/AGENTS.md) index with new context caching & session state components, services, and tests. Update [`tasks/todo.md`](file:///Users/mblanc/projects/agent-runtime-ui/tasks/todo.md).

**Acceptance criteria:**

- [ ] `bun run check` passes with 0 type errors.
- [ ] `bun run lint` passes with 0 ESLint warnings/errors.
- [ ] `bun run test` passes all tests across all test suites.
- [ ] `bun run preflight` exits with status 0.
- [ ] [`AGENTS.md`](file:///Users/mblanc/projects/agent-runtime-ui/AGENTS.md) index and file references updated.

**Verification:**

- [ ] `bun run preflight` exits 0 cleanly.

**Dependencies:** Tasks 1-11

**Files likely touched:**

- [`AGENTS.md`](file:///Users/mblanc/projects/agent-runtime-ui/AGENTS.md)
- [`tasks/todo.md`](file:///Users/mblanc/projects/agent-runtime-ui/tasks/todo.md)

**Estimated scope:** S (2 files)

---

### Checkpoint 6: Complete & Ready for Review

- [ ] All acceptance criteria across Tasks 1-12 verified.
- [ ] Quality gates clear.

---

## Risks and Mitigations

| Risk                                                                                                                                                           | Impact | Mitigation                                                                                                            |
| :------------------------------------------------------------------------------------------------------------------------------------------------------------- | :----- | :-------------------------------------------------------------------------------------------------------------------- |
| **Token Breakdown Discrepancies**: `cached_content_token_count` may be included in or excluded from `prompt_token_count` depending on Vertex AI model version. | Medium | Use `Math.max(promptTokens, cachedTokens)` as effective total input to prevent negative ratios or >100% calculations. |
| **Complex Nested JSON in Session State**: Large arrays or circular objects could break rendering.                                                              | Medium | Implement safe JSON formatting with fallback string representation and depth limits in `StateVariableCard`.           |
| **State Delta Stream Flapping**: Rapid streaming chunks emitting partial state deltas could cause layout thrashing.                                            | Low    | Accumulate final state deltas on turn completion before re-rendering in-chat diff chips.                              |
| **Cross-Session State Leakage**: Switching threads could display leftover state variables.                                                                     | High   | Reset state store and cancel active fetches in `SessionStateProvider` whenever `activeSessionId` changes.             |

---

## Open Questions

- None. The specification in [`docs/spec-context-caching-and-session-state.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-context-caching-and-session-state.md) is clear and aligns with the existing architecture.
