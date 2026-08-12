# Task List: Agent Platform Memory Bank

- [x] **Phase 1: Data Contracts, Types & Mock Store Engine**
  - [x] **Task 1: Define Memory Bank Types and Contracts**
    - [x] Add `AgentMemory`, `MemoryRetrievalItem`, `AgentMemoryListResponse`, `CreateMemoryRequest`, `UpdateMemoryRequest`, `GenerateMemoriesRequest`, and `GenerateMemoriesResponse` to `src/types/agent.ts`.
    - [x] Extend `AgentStreamEvent` with `retrieved_memories?: MemoryRetrievalItem[]`.
    - [x] Verify `bun run check`.
  - [x] **Task 2: Implement Mock Memory Store & Provider Methods**
    - [x] Extend `IAgentRuntimeProvider` in `src/lib/agent-runtime/types.ts`.
    - [x] Seed `mockMemoriesStore` in `src/lib/agent-runtime/mock/mock-store.ts`.
    - [x] Implement memory CRUD in `MockAgentRuntimeProvider` in `src/lib/agent-runtime/mock/mock-provider.ts`.
    - [x] Create `tests/memory-store.test.ts` and verify with `bun test tests/memory-store.test.ts`.
  - [x] **Checkpoint 1: Memory Data & Mock Store Foundation**
    - [x] Verify `bun run check` and `bun test tests/memory-store.test.ts`.

- [x] **Phase 2: BFF REST API Endpoints & Client Integration**
  - [x] **Task 3: Implement BFF Memory API Routes**
    - [x] Implement `GET /api/memory` (listing & filtering) and `POST /api/memory` (create) in `src/app/api/memory/route.ts`.
    - [x] Implement `PATCH /api/memory/[memoryId]` (update) and `DELETE /api/memory/[memoryId]` (delete) in `src/app/api/memory/[memoryId]/route.ts`.
    - [x] Implement `POST /api/memory/generate` in `src/app/api/memory/generate/route.ts`.
    - [x] Create `tests/memory-api.test.ts` and verify with `bun test tests/memory-api.test.ts`.
  - [x] **Task 4: Expose Memory Client Methods on AgentRuntimeClient & GCP Provider**
    - [x] Add facade methods to `AgentRuntimeClient` in `src/lib/agent-runtime-client.ts`.
    - [x] Implement REST mapping in `VertexAgentRuntimeProvider` in `src/lib/agent-runtime/client.ts`.
    - [x] Verify `bun run check`.
  - [x] **Checkpoint 2: REST API & Client Layer**
    - [x] Verify `bun test tests/memory-api.test.ts` passes.

- [x] **Phase 3: Client State Management & React Context**
  - [x] **Task 5: Implement MemoryProvider and useMemory Hook**
    - [x] Create `src/lib/memory-context.tsx` with optimistic CRUD, topic filters, search, and drawer state.
    - [x] Create `tests/memory-context.test.tsx` and verify with `bun test tests/memory-context.test.tsx`.

- [x] **Phase 4: Memory Profile Drawer & Avatar Menu UI**
  - [x] **Task 6: Build Memory Fact Cards and Add/Edit Modals**
    - [x] Create `src/components/memory/memory-item-card.tsx` with topic badges, inline editing, and delete actions.
    - [x] Create `src/components/memory/add-memory-modal.tsx` with fact input and category selection.
  - [x] **Task 7: Build MemoryDrawer and Integrate into UserAvatarMenu & Layout**
    - [x] Create `src/components/memory/memory-drawer.tsx` using Radix Dialog/Sheet with search, topic filtering, and auto-consolidation status.
    - [x] Add "Memory Bank Profile" item with `🧠` Brain icon to `src/components/auth/user-avatar-menu.tsx`.
    - [x] Mount `MemoryProvider` in `src/app/page.tsx` or root layout.
    - [x] Create `tests/memory-ui.test.tsx` and verify with `bun test tests/memory-ui.test.tsx`.
  - [x] **Checkpoint 3: Memory Drawer & Avatar Menu UI**
    - [x] Verify drawer opens, displays facts, allows adding, editing, and deleting memories.

- [x] **Phase 5: In-Chat Memory Retrieval Badges & Stream Adapter**
  - [x] **Task 8: Build In-Chat Memory Retrieval Badge & Popover**
    - [x] Create `src/components/memory/memory-retrieval-badge.tsx` with expandable fact details and relevance scores.
  - [x] **Task 9: Wire Memory Tool Interception in Chat Adapter & GeminiMessage**
    - [x] Update `createGeminiChatAdapter` in `src/lib/adapters/chat-adapter.ts` to intercept `preload_memory` and `load_memory` tool calls / `retrieved_memories` stream events and attach to message metadata.
    - [x] Mount `MemoryRetrievalBadge` in `src/components/assistant-ui/gemini-message.tsx`.
    - [x] Update `MockAgentRuntimeProvider.streamQuery` to yield simulated memory retrieval events.
    - [x] Create `tests/memory-chat.test.ts` and verify.
  - [x] **Checkpoint 4: In-Chat Retrieval & End-to-End Integration**
    - [x] Verify `🧠 Memories Applied` badge appears in chat messages and expands details.

- [x] **Phase 6: Verification, Polish & Preflight**
  - [x] **Task 10: Full Test Suite Verification and Quality Preflight**
    - [x] Run `bun run check`, `bun run lint`, and `bun run test`.
    - [x] Ensure `bun run preflight` exits with code 0.
