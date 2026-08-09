# Task List: Architectural Refactoring & Software Design Improvements

## Phase 1: Codebase Hygiene, Dead Code Removal & Discriminated Union Types

- [ ] **Task 1.1: Dead Component Deletion**
  - **Description:** Delete unimported legacy components (`gemini-tools.tsx`, `gemini-reasoning.tsx`, `gemini-thinking-indicator.tsx`).
  - **Acceptance Criteria:**
    - [ ] `src/components/assistant-ui/gemini-tools.tsx` deleted
    - [ ] `src/components/assistant-ui/gemini-reasoning.tsx` deleted
    - [ ] `src/components/assistant-ui/gemini-thinking-indicator.tsx` deleted
    - [ ] Zero broken imports
  - **Verification:** `bun run check && bun test tests/components.test.tsx`
  - **Files:** `src/components/assistant-ui/gemini-tools.tsx`, `src/components/assistant-ui/gemini-reasoning.tsx`, `src/components/assistant-ui/gemini-thinking-indicator.tsx`
  - **Scope:** XS

- [ ] **Task 1.2: Discriminated Union Types in `src/types/agent.ts`**
  - **Description:** Refactor `AgentMessagePart` into strict discriminated unions with `normalizeAgentMessagePart` runtime helper. Clean up `AgentSessionEvent`.
  - **Acceptance Criteria:**
    - [ ] `AgentMessagePart` converted to discriminated union (`AgentTextPart`, `AgentFileDataPart`, `AgentFunctionCallPart`, etc.)
    - [ ] `normalizeAgentMessagePart` helper exported
    - [ ] `AgentSessionEvent` normalized
  - **Verification:** `bun run check`
  - **Files:** `src/types/agent.ts`
  - **Scope:** S

- [ ] **Task 1.3: Update Type Consumers & Verify Tests**
  - **Description:** Update consumers in `gemini-runtime-adapter.ts` and `agent-runtime-client.ts` to utilize discriminated union patterns.
  - **Acceptance Criteria:**
    - [ ] All consumers typecheck cleanly without `any` casts
    - [ ] Test suites pass with 100% success
  - **Verification:** `bun test tests/chat-api.test.ts tests/tools-hitl.test.tsx`
  - **Files:** `src/lib/gemini-runtime-adapter.ts`, `src/lib/agent-runtime-client.ts`
  - **Scope:** S

### Checkpoint 1: Hygiene & Types Verified
- [ ] TypeScript check passes (`bun run check`)
- [ ] Test suite passes (`bun run test`)

---

## Phase 2: Domain Layer Decomposition & Strategy Pattern (`IAgentRuntimeProvider`)

- [ ] **Task 2.1: Domain Types & `IAgentRuntimeProvider` Contract**
  - **Description:** Create `src/lib/agent-runtime/types.ts` defining `IAgentRuntimeProvider` interface and contracts.
  - **Acceptance Criteria:**
    - [ ] `src/lib/agent-runtime/types.ts` created with complete `IAgentRuntimeProvider` methods
  - **Verification:** `bun run check`
  - **Files:** `src/lib/agent-runtime/types.ts`
  - **Scope:** S

- [ ] **Task 2.2: Extract Event Normalizer Module**
  - **Description:** Extract pure event normalization, turn grouping, and AST extraction helpers into `src/lib/agent-runtime/event-normalizer.ts`.
  - **Acceptance Criteria:**
    - [ ] `parseRawSessionEvent`, `groupTurnSessionEvents`, `extractTextFromQueryOutput`, `formatSessionEventsToThreadMessages` extracted
    - [ ] Zero network/GCP SDK dependencies in this file
  - **Verification:** `bun test tests/agent-client.test.ts`
  - **Files:** `src/lib/agent-runtime/event-normalizer.ts`
  - **Scope:** S

- [ ] **Task 2.3: Extract SSE Stream Parser Module**
  - **Description:** Extract line-based SSE chunk decoder and keepalive parser into `src/lib/agent-runtime/sse-parser.ts`.
  - **Acceptance Criteria:**
    - [ ] `sse-parser.ts` handles chunk boundaries, keepalives, and `[DONE]` markers
  - **Verification:** `bun test tests/chat-api.test.ts`
  - **Files:** `src/lib/agent-runtime/sse-parser.ts`
  - **Scope:** S

- [ ] **Task 2.4: Extract Mock Store & `MockAgentRuntimeProvider`**
  - **Description:** Extract offline in-memory stores and mock streaming simulation into `src/lib/agent-runtime/mock/mock-store.ts` and `src/lib/agent-runtime/mock/mock-provider.ts` implementing `IAgentRuntimeProvider`.
  - **Acceptance Criteria:**
    - [ ] Mock fixtures and streaming logic isolated in `src/lib/agent-runtime/mock/`
    - [ ] `MockAgentRuntimeProvider` implements `IAgentRuntimeProvider`
  - **Verification:** `bun test tests/agent-client.test.ts`
  - **Files:** `src/lib/agent-runtime/mock/mock-store.ts`, `src/lib/agent-runtime/mock/mock-provider.ts`
  - **Scope:** M

- [ ] **Task 2.5: Implement `VertexAiReasoningEngineProvider`**
  - **Description:** Implement real Google Cloud Vertex AI REST and streaming client in `src/lib/agent-runtime/client.ts` implementing `IAgentRuntimeProvider`.
  - **Acceptance Criteria:**
    - [ ] `VertexAiReasoningEngineProvider` handles GoogleAuth token management and Vertex AI REST API calls
    - [ ] Zero mock branching inside production client methods
  - **Verification:** `bun run check`
  - **Files:** `src/lib/agent-runtime/client.ts`
  - **Scope:** M

- [ ] **Task 2.6: Factory with Fail-Fast Configuration**
  - **Description:** Implement `createAgentRuntimeProvider` in `src/lib/agent-runtime/factory.ts` with explicit fail-fast validation in production mode. Create `src/lib/agent-runtime/index.ts` public export.
  - **Acceptance Criteria:**
    - [ ] `createAgentRuntimeProvider` instantiates `VertexAiReasoningEngineProvider` or `MockAgentRuntimeProvider` based on environment
    - [ ] Missing config in production throws an explicit `Error` immediately
    - [ ] `src/lib/agent-runtime/index.ts` exports factory, types, and normalizers
  - **Verification:** `bun test tests/agent-client.test.ts`
  - **Files:** `src/lib/agent-runtime/factory.ts`, `src/lib/agent-runtime/index.ts`
  - **Scope:** S

- [ ] **Task 2.7: Backward-Compatible Facade in `agent-runtime-client.ts`**
  - **Description:** Refactor `src/lib/agent-runtime-client.ts` to re-export `AgentRuntimeClient` wrapping `createAgentRuntimeProvider`.
  - **Acceptance Criteria:**
    - [ ] `src/lib/agent-runtime-client.ts` LOC reduced from 2,120 to < 80
    - [ ] All 22 tests in `tests/agent-client.test.ts` pass without modification
  - **Verification:** `bun test tests/agent-client.test.ts`
  - **Files:** `src/lib/agent-runtime-client.ts`
  - **Scope:** S

### Checkpoint 2: Domain Decomposition Verified
- [ ] TypeScript check passes (`bun run check`)
- [ ] Tests pass (`bun test tests/agent-client.test.ts tests/agents-api.test.ts`)

---

## Phase 3: BFF Route Middleware (`withAuth`) & CQS Normalization

- [ ] **Task 3.1: Typed `withAuth` Route Wrapper**
  - **Description:** Create `src/lib/api-handler.ts` providing `withAuth` higher-order function that extracts user session, standardizes 401/500 error responses, and injects `AuthenticatedContext`.
  - **Acceptance Criteria:**
    - [ ] `withAuth` handles authentication verification, route params resolution, and centralized error logging
  - **Verification:** `bun run check`
  - **Files:** `src/lib/api-handler.ts`
  - **Scope:** S

- [ ] **Task 3.2: Refactor Agents, Chat, and Feedback Routes**
  - **Description:** Refactor `src/app/api/agents/route.ts`, `src/app/api/chat/route.ts`, and `src/app/api/feedback/route.ts` to use `withAuth`.
  - **Acceptance Criteria:**
    - [ ] Routes refactored with clean declarative syntax using `withAuth`
    - [ ] Chat SSE streaming works seamlessly inside `withAuth`
  - **Verification:** `bun test tests/agents-api.test.ts tests/chat-api.test.ts tests/feedback-api.test.ts`
  - **Files:** `src/app/api/agents/route.ts`, `src/app/api/chat/route.ts`, `src/app/api/feedback/route.ts`
  - **Scope:** M

- [ ] **Task 3.3: Refactor Sessions Routes & Eliminate CQS Mutation**
  - **Description:** Refactor `src/app/api/sessions/route.ts` and `src/app/api/sessions/[sessionId]/route.ts` to use `withAuth`. Remove background mutating `PATCH` on `GET /api/sessions/[sessionId]`.
  - **Acceptance Criteria:**
    - [ ] `GET /api/sessions/[sessionId]` operates as a pure, idempotent query without side-effect writes
    - [ ] All session CRUD routes use `withAuth`
  - **Verification:** `bun test tests/sessions-api.test.ts`
  - **Files:** `src/app/api/sessions/route.ts`, `src/app/api/sessions/[sessionId]/route.ts`
  - **Scope:** S

- [ ] **Task 3.4: Refactor Uploads Routes**
  - **Description:** Refactor `src/app/api/uploads/presign/route.ts` and `src/app/api/uploads/signed-read/route.ts` with `withAuth`.
  - **Acceptance Criteria:**
    - [ ] Presign and signed-read routes use `withAuth` and enforce user identity prefix isolation
  - **Verification:** `bun test tests/uploads-api.test.ts`
  - **Files:** `src/app/api/uploads/presign/route.ts`, `src/app/api/uploads/signed-read/route.ts`
  - **Scope:** S

### Checkpoint 3: BFF Middleware & CQS Verified
- [ ] All API test suites pass (`bun test tests/*api*.test.ts`)
- [ ] TypeScript check passes (`bun run check`)

---

## Phase 4: UI Tool Stream Direct Wire Protocol & Scoped Attachment Store

- [ ] **Task 4.1: Scoped `SessionAttachmentStore`**
  - **Description:** Create `src/lib/attachments/attachment-store.ts` implementing `SessionAttachmentStore` with automatic `URL.revokeObjectURL` cleanup when attachments are removed.
  - **Acceptance Criteria:**
    - [ ] `SessionAttachmentStore` provides `get`, `set`, `delete`, and `clear`
    - [ ] Removing an attachment automatically revokes its object URL to prevent memory leaks
  - **Verification:** `bun test tests/multimodal-attachments.test.tsx`
  - **Files:** `src/lib/attachments/attachment-store.ts`
  - **Scope:** S

- [ ] **Task 4.2: Direct Structured Tool Call Emission in Chat Adapter**
  - **Description:** Refactor `createGeminiChatAdapter` to emit native `tool-call` parts directly into `@assistant-ui/react` runtime without serializing into `:::tool[...]` string pseudo-tags.
  - **Acceptance Criteria:**
    - [ ] `tool_call` and `tool_result` SSE events yield directly as structured `tool-call` parts in `createYieldContent`
    - [ ] String tag manipulation helpers deleted from chat adapter
  - **Verification:** `bun test tests/tools-hitl.test.tsx`
  - **Files:** `src/lib/gemini-runtime-adapter.ts`
  - **Scope:** M

- [ ] **Task 4.3: Simplify `reasoning.tsx` Component**
  - **Description:** Remove complex regex parsers from `src/components/assistant-ui/reasoning.tsx`, rendering reasoning text purely as styled monospace text/markdown.
  - **Acceptance Criteria:**
    - [ ] `reasoning.tsx` LOC reduced from 382 to < 120
    - [ ] Brittle regex parsing logic eliminated
    - [ ] Tool calls rendered by `MessagePrimitive.GroupedParts` and `ToolFallback`
  - **Verification:** `bun test tests/components.test.tsx tests/tools-hitl.test.tsx`
  - **Files:** `src/components/assistant-ui/reasoning.tsx`
  - **Scope:** S

- [ ] **Task 4.4: Decompose `gemini-runtime-adapter.ts` into Modular Adapters**
  - **Description:** Decompose `src/lib/gemini-runtime-adapter.ts` into focused submodules in `src/lib/adapters/`: `chat-adapter.ts`, `feedback-adapter.ts`, `gcs-attachment-adapter.ts`, `speech-adapters.ts`.
  - **Acceptance Criteria:**
    - [ ] Each adapter file under `src/lib/adapters/` has a single responsibility (< 200 LOC)
    - [ ] Re-export facade maintains backward compatibility for all existing imports
  - **Verification:** `bun test tests/multimodal-attachments.test.tsx tests/voice-tts.test.tsx tests/feedback-ui.test.tsx`
  - **Files:** `src/lib/adapters/chat-adapter.ts`, `src/lib/adapters/feedback-adapter.ts`, `src/lib/adapters/gcs-attachment-adapter.ts`, `src/lib/adapters/speech-adapters.ts`, `src/lib/adapters/index.ts`, `src/lib/gemini-runtime-adapter.ts`
  - **Scope:** M

### Checkpoint 4: Tool Stream & Memory Management Verified
- [ ] All component and adapter tests pass (`bun test tests/*.test.tsx`)
- [ ] Zero memory leaks from revoked attachment URLs

---

## Phase 5: Final Quality Gates & Preflight

- [ ] **Task 5.1: Full Preflight & Production Build Validation**
  - **Description:** Run full preflight quality suite (`bun run preflight`: format, check, lint, test) and production Next.js build (`bun run build`).
  - **Acceptance Criteria:**
    - [ ] `bun run check` passes with 0 type errors
    - [ ] `bun run lint` passes with 0 warnings/errors
    - [ ] `bun run test` passes 100% of test suites
    - [ ] `bun run build` completes successfully
  - **Verification:** `bun run preflight && bun run build`
  - **Files:** None
  - **Scope:** XS
