# Implementation Plan: Agent Platform Memory Bank (User Profile & Semantic Long-Term Memory)

## Overview

Integrate Google Cloud Agent Platform Memory Bank into `agent-runtime-ui`, enabling cross-session semantic memory and user personalization for ADK agents on Vertex AI Reasoning Engines. The implementation includes:

1. **Data Contracts & Types**: Core memory entities, retrieval models, and stream event extensions.
2. **Provider & Mock Store**: In-memory mock store and REST client support for CRUD operations (`CreateMemory`, `ListMemories`, `UpdateMemory`, `DeleteMemory`, `GenerateMemories`, `RetrieveMemories`).
3. **BFF REST API Endpoints**: Stateless, authenticated Next.js route handlers under `/api/memory` with tenant isolation by `session.user.id`.
4. **Memory State Provider**: React context hook managing memory state, optimistic mutations, topic filtering, and search.
5. **Memory Profile Drawer & UI**: User avatar menu integration, slide-over drawer, topic-categorized memory cards, inline creation and editing dialogs.
6. **In-Chat Memory Retrieval Badges**: Stream adapter parsing of `preload_memory` and `load_memory` tool events, rendering interactive memory badges with fact popovers in assistant chat turns.

---

## Architecture Decisions

- **Stateless Tenant Scoping**: All `/api/memory` endpoints wrap with `withAuth` and `withAuthDynamic`, strictly filtering memory queries and mutations by `session.user.id`.
- **Strategy Pattern Client Architecture**: Follow the established `IAgentRuntimeProvider` and `AgentRuntimeClient` pattern with `MockAgentRuntimeProvider` for offline development and `VertexAgentRuntimeProvider` for GCP REST calls.
- **Radix UI Dialog & Sheet Primitives**: Build the Memory Profile Drawer using accessible `@radix-ui/react-dialog` primitives styled with Tailwind CSS v3 matching the Google Gemini aesthetic.
- **In-Chat Retrieval Integration**: Intercept ADK memory tool calls (`preload_memory`, `load_memory`, `retrieved_memories`) in `createGeminiChatAdapter` and attach structured retrieval metadata to assistant messages without cluttering the main conversation text.
- **Zero Database Requirement**: Keep backend 100% serverless, persisting mock memories in memory during testing and delegating to Vertex AI Memory Bank API in production.

---

## Dependency Graph

```
┌────────────────────────────────────────────────────────┐
│ Phase 1: Data Contracts, Types & Mock Store Engine      │
│ (src/types/agent.ts, mock-store.ts, mock-provider.ts)  │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 2: BFF REST API Endpoints & Client Integration   │
│ (/api/memory/*, agent-runtime-client.ts, client.ts)    │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 3: Client State Management & React Context       │
│ (src/lib/memory-context.tsx)                           │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 4: Memory Profile Drawer & Avatar Menu UI        │
│ (memory-drawer.tsx, memory-item-card.tsx, avatar menu) │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 5: In-Chat Retrieval Badges & Stream Adapter     │
│ (gemini-message.tsx, chat-adapter.ts, badge component) │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│ Phase 6: Automated Memory Extraction & End-to-End Test │
│ (/api/memory/generate, session consolidation, E2E tests)│
└────────────────────────────────────────────────────────┘
```

---

## Task List

### Phase 1: Data Contracts, Types & Mock Store Engine

#### Task 1: Define Memory Bank Types and Contracts

- **Description**: Add data structures for `AgentMemory`, `MemoryRetrievalItem`, `AgentMemoryListResponse`, `CreateMemoryRequest`, `UpdateMemoryRequest`, `GenerateMemoriesRequest`, and `GenerateMemoriesResponse` in [`src/types/agent.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/types/agent.ts), and extend `AgentStreamEvent` with `retrieved_memories`.
- **Acceptance criteria**:
  - [ ] `AgentMemory` interface contains `id`, `userId`, `fact`, `topic`, `createTime`, `updateTime`, `lastUsedTime`, `confidenceScore`, `sourceSessionId`.
  - [ ] `MemoryRetrievalItem` interface contains `id`, `fact`, `topic`, and `relevanceScore`.
  - [ ] `AgentStreamEvent` supports optional `retrieved_memories?: MemoryRetrievalItem[]`.
  - [ ] All types are exported from [`src/types/agent.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/types/agent.ts).
- **Verification**:
  - [ ] `bun run check` passes with zero type errors.
- **Dependencies**: None
- **Files likely touched**:
  - [`src/types/agent.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/types/agent.ts)
- **Estimated scope**: XS (1 file)

#### Task 2: Implement Mock Memory Store & Provider Methods

- **Description**: Extend `IAgentRuntimeProvider` interface and implement memory CRUD methods in `MockAgentRuntimeProvider` and `mock-store.ts`, populating seeded test memories categorized by topic (`coding_preferences`, `enterprise_context`, `communication_style`, `general`).
- **Acceptance criteria**:
  - [ ] `IAgentRuntimeProvider` defines `listMemories`, `createMemory`, `updateMemory`, `deleteMemory`, `generateMemories`, and `retrieveMemories`.
  - [ ] `mock-store.ts` initializes a Map of seeded `mockMemoriesStore` for `test-user`.
  - [ ] `MockAgentRuntimeProvider` implements memory operations with user scoping and case-insensitive topic filtering.
- **Verification**:
  - [ ] Unit tests in `tests/memory-store.test.ts` pass (`bun run test tests/memory-store.test.ts`).
  - [ ] `bun run check` passes.
- **Dependencies**: Task 1
- **Files likely touched**:
  - [`src/lib/agent-runtime/types.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/types.ts)
  - [`src/lib/agent-runtime/mock/mock-store.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/mock/mock-store.ts)
  - [`src/lib/agent-runtime/mock/mock-provider.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/mock/mock-provider.ts)
  - `tests/memory-store.test.ts`
- **Estimated scope**: M (4 files)

### Checkpoint 1: Memory Data & Mock Store Foundation

- [ ] `bun run check` passes with no type errors.
- [ ] `bun test tests/memory-store.test.ts` passes all CRUD tests.

---

### Phase 2: BFF REST API Endpoints & Client Integration

#### Task 3: Implement BFF Memory API Routes (`/api/memory`, `/api/memory/[memoryId]`, `/api/memory/generate`)

- **Description**: Create Next.js App Router API route handlers under `src/app/api/memory/` wrapping with `withAuth` and `withAuthDynamic` to support listing, creating, updating, deleting memories, and triggering extraction.
- **Acceptance criteria**:
  - [ ] `GET /api/memory` lists memories for the authenticated user with optional `?topic=` filter.
  - [ ] `POST /api/memory` validates request body and creates a new memory fact.
  - [ ] `PATCH /api/memory/[memoryId]` updates fact and/or topic, ensuring cross-user IDOR protection.
  - [ ] `DELETE /api/memory/[memoryId]` deletes memory for the authenticated user.
  - [ ] `POST /api/memory/generate` extracts memories from a session.
  - [ ] Unauthenticated requests return `401 Unauthorized`.
- **Verification**:
  - [ ] Integration tests in `tests/memory-api.test.ts` pass (`bun test tests/memory-api.test.ts`).
  - [ ] `bun run check` passes.
- **Dependencies**: Task 2
- **Files likely touched**:
  - `src/app/api/memory/route.ts`
  - `src/app/api/memory/[memoryId]/route.ts`
  - `src/app/api/memory/generate/route.ts`
  - [`src/lib/agent-runtime/client.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/client.ts)
  - [`src/lib/agent-runtime-client.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime-client.ts)
  - `tests/memory-api.test.ts`
- **Estimated scope**: M (6 files)

#### Task 4: Expose Memory Client Methods on `AgentRuntimeClient` & GCP Provider

- **Description**: Add facade methods on `AgentRuntimeClient` and implement Vertex AI REST client methods in `VertexAgentRuntimeProvider` with GCP auth token injection for production deployment.
- **Acceptance criteria**:
  - [ ] `AgentRuntimeClient` exposes `listMemories`, `createMemory`, `updateMemory`, `deleteMemory`, and `generateMemories`.
  - [ ] `VertexAgentRuntimeProvider` maps calls to Vertex AI Reasoning Engine Memory Bank REST API endpoints (`/v1beta1/.../memories`).
- **Verification**:
  - [ ] `bun run check` passes.
  - [ ] Unit tests verify mock and provider delegation.
- **Dependencies**: Task 3
- **Files likely touched**:
  - [`src/lib/agent-runtime-client.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime-client.ts)
  - [`src/lib/agent-runtime/client.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/client.ts)
- **Estimated scope**: S (2 files)

### Checkpoint 2: REST API & Client Layer

- [ ] `bun test tests/memory-api.test.ts` passes with 100% assertions.
- [ ] `bun run check` and `bun run lint` succeed.

---

### Phase 3: Client State Management & React Context

#### Task 5: Implement `MemoryProvider` and `useMemory` Hook

- **Description**: Create `src/lib/memory-context.tsx` providing React state management for fetching, caching, searching, creating, editing, and deleting memories with optimistic updates and error handling.
- **Acceptance criteria**:
  - [ ] `useMemory()` provides `memories`, `isLoading`, `error`, `activeTopic`, `searchQuery`, `setTopic`, `setSearchQuery`, `createMemory`, `updateMemory`, `deleteMemory`, `refreshMemories`, `isDrawerOpen`, `setIsDrawerOpen`.
  - [ ] Memory updates apply optimistically and roll back on API error.
  - [ ] Filtered and searched memories update reactively based on topic and search query.
- **Verification**:
  - [ ] Context tests in `tests/memory-context.test.tsx` pass.
  - [ ] `bun run check` passes.
- **Dependencies**: Task 3
- **Files likely touched**:
  - `src/lib/memory-context.tsx`
  - `tests/memory-context.test.tsx`
- **Estimated scope**: S (2 files)

---

### Phase 4: Memory Profile Drawer & Avatar Menu UI

#### Task 6: Build Memory Fact Cards and Add/Edit Modals

- **Description**: Create `src/components/memory/memory-item-card.tsx` and `src/components/memory/add-memory-modal.tsx` supporting viewing, inline editing, topic tags, confidence indicators, and deletion confirmation.
- **Acceptance criteria**:
  - [ ] `MemoryItemCard` renders fact text, topic badge, timestamp, and edit/delete action triggers.
  - [ ] Inline editing mode allows editing fact content and topic selector.
  - [ ] `AddMemoryModal` allows adding a new memory with fact text and category selection (`coding_preferences`, `enterprise_context`, `communication_style`, `general`).
- **Verification**:
  - [ ] Component tests in `tests/memory-ui.test.tsx` pass.
- **Dependencies**: Task 5
- **Files likely touched**:
  - `src/components/memory/memory-item-card.tsx`
  - `src/components/memory/add-memory-modal.tsx`
- **Estimated scope**: S (2 files)

#### Task 7: Build `MemoryDrawer` and Integrate into `UserAvatarMenu` & App Layout

- **Description**: Create `src/components/memory/memory-drawer.tsx` (slide-over panel with search input, topic chips, fact list, empty states, and auto-consolidation status) and add "Memory Bank Profile" item with Brain icon `🧠` to `UserAvatarMenu`. Mount `MemoryProvider` in `src/app/page.tsx` or layout.
- **Acceptance criteria**:
  - [ ] Clicking "Memory Bank Profile" in avatar dropdown opens `MemoryDrawer`.
  - [ ] Drawer displays user's stored memories grouped or filtered by topic.
  - [ ] Search input filters facts in real time.
  - [ ] Drawer can be closed with close button, `Esc` key, or backdrop click.
- **Verification**:
  - [ ] Component tests in `tests/memory-ui.test.tsx` pass.
  - [ ] Visual verification of drawer layout and animations.
- **Dependencies**: Tasks 5, 6
- **Files likely touched**:
  - `src/components/memory/memory-drawer.tsx`
  - [`src/components/auth/user-avatar-menu.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/auth/user-avatar-menu.tsx)
  - [`src/app/page.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/page.tsx)
  - `tests/memory-ui.test.tsx`
- **Estimated scope**: M (4 files)

### Checkpoint 3: Memory Drawer & Avatar Menu UI

- [ ] User can open Memory Drawer from avatar menu, view categorized facts, add a new fact, and edit or delete existing facts in mock mode.
- [ ] All component tests pass (`bun test tests/memory-ui.test.tsx`).

---

### Phase 5: In-Chat Memory Retrieval Badges & Stream Adapter

#### Task 8: Build In-Chat Memory Retrieval Badge & Popover

- **Description**: Create `src/components/memory/memory-retrieval-badge.tsx` rendering a subtle Gemini-styled pill ("🧠 N Memories Applied: ... ▾") with an expandable popover listing the exact retrieved facts, topics, and relevance scores.
- **Acceptance criteria**:
  - [ ] Renders memory count and preview summary in a rounded pill.
  - [ ] Clicking/hovering expands a popover detailing each retrieved memory item with topic badge and relevance score.
  - [ ] Styled cleanly for both Light and Dark mode.
- **Verification**:
  - [ ] Component unit tests pass.
- **Dependencies**: Task 1
- **Files likely touched**:
  - `src/components/memory/memory-retrieval-badge.tsx`
  - `tests/memory-badge.test.tsx`
- **Estimated scope**: S (2 files)

#### Task 9: Wire Memory Tool Interception in Chat Adapter & `GeminiMessage`

- **Description**: Update `createGeminiChatAdapter` in `src/lib/adapters/chat-adapter.ts` to intercept `preload_memory` and `load_memory` ADK tool events or `retrieved_memories` stream events, populate `metadata.custom.retrievedMemories`, and render `MemoryRetrievalBadge` in `src/components/assistant-ui/gemini-message.tsx`. Update mock stream generator to emit simulated memory retrievals.
- **Acceptance criteria**:
  - [ ] `createGeminiChatAdapter` parses `preload_memory` and `load_memory` tool calls and attaches retrieved memory items to message metadata.
  - [ ] `GeminiMessage` (assistant message branch) renders `MemoryRetrievalBadge` when `retrievedMemories` exist in message metadata.
  - [ ] `MockAgentRuntimeProvider.streamQuery` yields simulated retrieved memories when relevant queries are made.
- **Verification**:
  - [ ] Unit & stream tests in `tests/memory-chat.test.ts` pass.
  - [ ] `bun run check` and `bun run test` pass with zero regressions.
- **Dependencies**: Tasks 7, 8
- **Files likely touched**:
  - [`src/lib/adapters/chat-adapter.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/adapters/chat-adapter.ts)
  - [`src/components/assistant-ui/gemini-message.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/gemini-message.tsx)
  - [`src/lib/agent-runtime/mock/mock-provider.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/mock/mock-provider.ts)
  - `tests/memory-chat.test.ts`
- **Estimated scope**: M (4 files)

### Checkpoint 4: In-Chat Retrieval & End-to-End Integration

- [ ] Asking a question in chat triggers mock `preload_memory` retrieval and renders the `🧠 Memories Applied` badge.
- [ ] Clicking the badge displays the retrieved semantic facts and relevance scores.
- [ ] All tests across the test suite pass cleanly (`bun test`).

---

### Phase 6: Verification, Polish & Preflight

#### Task 10: Full Test Suite Verification and Quality Preflight

- **Description**: Run comprehensive quality preflight (`bun run check`, `bun run lint`, `bun run test`) ensuring zero lint errors, 100% strict TypeScript compliance, complete test coverage, and documentation sync.
- **Acceptance criteria**:
  - [ ] `bun run check` passes with 0 type errors.
  - [ ] `bun run lint` passes with 0 warnings/errors.
  - [ ] `bun run test` passes all tests (including existing and new memory tests).
- **Verification**:
  - [ ] `bun run preflight` exits with code 0.
- **Dependencies**: Tasks 1 through 9
- **Files likely touched**:
  - `tests/`
  - Codebase documentation
- **Estimated scope**: S (1-2 files)

---

## Risks and Mitigations

| Risk                                                 | Impact | Mitigation                                                                                                           |
| ---------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------- |
| Cross-tenant memory data leakage                     | High   | Enforce authenticated `session.user.id` filter on every API route handler via `withAuth` and mock/GCP store methods. |
| In-chat memory badges cluttering conversation UI     | Med    | Use subtle, collapsible pill components with popovers rather than full expanded cards in message stream.             |
| Memory mutations causing chat UI re-render thrashing | Low    | Scope memory state within dedicated `MemoryProvider` independent of assistant-ui thread runtime.                     |
| Mock mode vs GCP Vertex AI divergence                | Med    | Keep `IAgentRuntimeProvider` interface uniform across `MockAgentRuntimeProvider` and `VertexAgentRuntimeProvider`.   |

---

## Open Questions

- None identified. The spec [`docs/spec-memory-bank.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-memory-bank.md) provides complete data contracts, REST endpoints, and UI guidelines.
