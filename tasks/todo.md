# Todo: Vertex AI Context Caching & ADK Session State Inspector

## Phase 1: Data Contracts, Types & Cache Calculation Engine

- [x] Task 1: Define Context Caching & Session State Type Contracts (`src/types/agent.ts`)
- [x] Task 2: Implement Pure Cache Calculation Engine & Unit Tests (`src/lib/context-caching/cache-metrics.ts`, `tests/context-caching.test.ts`)
- [x] **Checkpoint 1: Foundation & Pure Calculations**

## Phase 2: Backend Services, Mock Store & BFF REST Endpoints

- [x] Task 3: Implement Session Service State Methods & Mock Store Parity (`src/lib/agent-runtime/services/session-service.ts`, `src/lib/agent-runtime/types.ts`, `src/lib/agent-runtime/mock/mock-store.ts`, `src/lib/agent-runtime/mock/mock-provider.ts`, `src/lib/agent-runtime-client.ts`)
- [x] Task 4: Implement Session State BFF REST API Route & API Tests (`src/app/api/sessions/[sessionId]/state/route.ts`, `tests/session-state-api.test.ts`)
- [x] **Checkpoint 2: Backend Services & API Quality Gate**

## Phase 3: Stream Pipeline & Client Session State Context

- [x] Task 5: Wire State Deltas & Cache Telemetry into Chat Adapter Stream (`src/lib/adapters/chat-adapter.ts`, `src/lib/agent-runtime/event-normalizer.ts`, `tests/session-state-adapter.test.ts`)
- [x] Task 6: Implement Client Session State Context & Delta Diff Helper (`src/lib/session-state/state-diff.ts`, `src/lib/session-state/state-context.tsx`, `tests/session-state-context.test.tsx`)
- [x] **Checkpoint 3: Client State Store & Stream Pipeline Gate**

## Phase 4: UI Components — Cache Savings Badge & In-Chat State Chips

- [x] Task 7: Build Context Cache Savings Badge & Popover in Message Timing (`src/components/context-caching/context-cache-popover.tsx`, `src/components/assistant-ui/gemini-message-timing.tsx`, `src/components/assistant-ui/message-info-popover.tsx`)
- [x] Task 8: Build In-Chat State Delta Chip Component (`src/components/session-state/state-delta-chip.tsx`, `src/components/assistant-ui/gemini-message.tsx`)
- [x] **Checkpoint 4: Inline Message Telemetry & State Chips Gate**

## Phase 5: UI Components — Session State Inspector Drawer & Navigation

- [x] Task 9: Build Session State Inspector Drawer, Variable Cards & Edit Modal (`src/components/session-state/session-state-drawer.tsx`, `src/components/session-state/state-variable-card.tsx`, `src/components/session-state/add-state-variable-modal.tsx`)
- [x] Task 10: Wire Session State Header Button, Avatar Menu & Page Integration (`src/components/session-state/session-state-header-button.tsx`, `src/components/auth/user-avatar-menu.tsx`, `src/app/page.tsx`)
- [x] **Checkpoint 5: Full UI & Drawer Integration Gate**

## Phase 6: End-to-End Verification, UI Tests & Quality Preflight

- [x] Task 11: Implement Dedicated Context Caching & Session State UI Tests (`tests/context-caching-ui.test.tsx`, `tests/session-state-ui.test.tsx`)
- [x] Task 12: Execute Quality Gates Preflight & Update Documentation (`AGENTS.md`, `tasks/todo.md`)
- [x] **Checkpoint 6: Complete & Ready for Review**
