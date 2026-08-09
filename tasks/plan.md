# Implementation Plan: Architectural Refactoring & Software Design Improvements

> **Target Project:** Agent Runtime UI (`agent-runtime-ui`)  
> **Master Specifications:**
>
> - Phase 1: [`docs/spec-phase-1-hygiene-and-types.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-phase-1-hygiene-and-types.md)
> - Phase 2: [`docs/spec-phase-2-domain-decomposition-and-strategy.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-phase-2-domain-decomposition-and-strategy.md)
> - Phase 3: [`docs/spec-phase-3-bff-middleware-and-cqs.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-phase-3-bff-middleware-and-cqs.md)
> - Phase 4: [`docs/spec-phase-4-tool-stream-and-attachment-store.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-phase-4-tool-stream-and-attachment-store.md)

---

## 1. Overview & Strategy

This plan orchestrates the progressive refactoring of **Agent Runtime UI** to eliminate architectural debt, enforce **SOLID** and **Reduction (DRY/YAGNI/KISS)** principles, isolate volatile subsystems, and improve long-term maintainability without breaking existing functionality.

The refactoring is sliced vertically and sequentially across 4 distinct phases:

1. **Phase 1: Codebase Hygiene, Dead Code Removal & Discriminated Union Types** (Zero Risk)
2. **Phase 2: Domain Layer Decomposition & Strategy Pattern (`IAgentRuntimeProvider`)** (Core Maintainability)
3. **Phase 3: BFF Route Middleware (`withAuth`) & CQS Normalization** (DRY & Security)
4. **Phase 4: UI Tool Stream Direct Wire Protocol & Scoped Attachment Store** (KISS & Memory Management)

---

## 2. Dependency Graph & Architecture

```
[Phase 1: Hygiene & Types]
  Task 1.1: Delete dead components (gemini-tools, gemini-reasoning, etc.)
  Task 1.2: Refactor AgentMessagePart to strict Discriminated Unions
  Task 1.3: Add runtime normalization helper & verify tests
        │
   [Checkpoint 1: Hygiene & Types Verified]
        │
[Phase 2: Domain Decomposition & Strategy Pattern]
  Task 2.1: Domain contracts & IAgentRuntimeProvider interface
  Task 2.2: Extract event-normalizer.ts (heuristics & turn grouping)
  Task 2.3: Extract sse-parser.ts (line decoder)
  Task 2.4: Extract mock-store.ts & MockAgentRuntimeProvider
  Task 2.5: Implement VertexAiReasoningEngineProvider (GCP client)
  Task 2.6: Provider factory with fail-fast production config verification
  Task 2.7: Backward-compatible facade in agent-runtime-client.ts
        │
   [Checkpoint 2: Domain Decomposition Verified]
        │
[Phase 3: BFF Middleware & CQS Normalization]
  Task 3.1: Typed withAuth route wrapper in src/lib/api-handler.ts
  Task 3.2: Refactor agents, chat, and feedback API routes
  Task 3.3: Refactor sessions API routes & remove CQS mutation from GET
  Task 3.4: Refactor uploads API routes
  Task 3.5: API Route integration & regression tests
        │
   [Checkpoint 3: BFF Middleware & CQS Verified]
        │
[Phase 4: Tool Stream Simplification & Scoped Memory]
  Task 4.1: Implement SessionAttachmentStore with URL.revokeObjectURL
  Task 4.2: Emit structured tool-call & data parts directly from chat adapter
  Task 4.3: Simplify reasoning.tsx (remove regex parsers)
  Task 4.4: Decompose gemini-runtime-adapter into src/lib/adapters/
  Task 4.5: Component & tool interaction regression tests
        │
   [Checkpoint 4: Tool Stream & Memory Verified]
        │
[Phase 5: Final Quality Gates & Preflight]
  Task 5.1: bun run preflight & bun run build validation
```

---

## 3. Detailed Task Specifications

### Phase 1: Codebase Hygiene, Dead Code Removal & Discriminated Union Types

#### Task 1.1: Dead Component Deletion

**Description:** Delete unimported legacy components (`src/components/assistant-ui/gemini-tools.tsx`, `gemini-reasoning.tsx`, `gemini-thinking-indicator.tsx`) that have been superseded by `tool-fallback.tsx` and `reasoning.tsx`.  
**Acceptance criteria:**

- [ ] `src/components/assistant-ui/gemini-tools.tsx` deleted.
- [ ] `src/components/assistant-ui/gemini-reasoning.tsx` deleted.
- [ ] `src/components/assistant-ui/gemini-thinking-indicator.tsx` deleted.
- [ ] Zero broken imports across `src/` and `tests/`.  
      **Verification:** `bun run check && bun test tests/components.test.tsx`  
      **Dependencies:** None  
      **Files touched:**
- `src/components/assistant-ui/gemini-tools.tsx` (delete)
- `src/components/assistant-ui/gemini-reasoning.tsx` (delete)
- `src/components/assistant-ui/gemini-thinking-indicator.tsx` (delete)  
  **Estimated scope:** XS (3 deleted files)

---

#### Task 1.2: Discriminated Union Types in `src/types/agent.ts`

**Description:** Refactor `AgentMessagePart` into clean discriminated unions (`AgentTextPart`, `AgentReasoningPart`, `AgentFileDataPart`, `AgentImagePart`, `AgentFileBlobPart`, `AgentFunctionCallPart`, `AgentFunctionResponsePart`) discriminated on the `type` field. Provide `normalizeAgentMessagePart` helper for backward-compatible payload parsing.  
**Acceptance criteria:**

- [ ] `AgentMessagePart` converted to discriminated union in `src/types/agent.ts`.
- [ ] `normalizeAgentMessagePart` helper implemented and exported.
- [ ] `AgentSessionEvent` cleaned up with normalized `tool_calls` and `tool_results`.  
      **Verification:** `bun run check`  
      **Dependencies:** Task 1.1  
      **Files touched:**
- `src/types/agent.ts`  
  **Estimated scope:** S (1 file)

---

#### Task 1.3: Update Type Consumers & Verify Tests

**Description:** Update type consumers in `src/lib/gemini-runtime-adapter.ts` and `src/lib/agent-runtime-client.ts` to utilize discriminated union patterns and verify full test suite.  
**Acceptance criteria:**

- [ ] All consumers in `src/lib/` typecheck cleanly without `any` casts.
- [ ] Unit tests pass with 100% success.  
      **Verification:** `bun test tests/chat-api.test.ts tests/tools-hitl.test.tsx`  
      **Dependencies:** Task 1.2  
      **Files touched:**
- `src/lib/gemini-runtime-adapter.ts`
- `src/lib/agent-runtime-client.ts`  
  **Estimated scope:** S (2 files)

---

### Checkpoint 1: Hygiene & Types Verified

- [ ] `bun run check` passes with 0 errors.
- [ ] `bun run test` passes 176 tests.

---

### Phase 2: Domain Layer Decomposition & Strategy Pattern (`IAgentRuntimeProvider`)

#### Task 2.1: Domain Types & `IAgentRuntimeProvider` Contract

**Description:** Create `src/lib/agent-runtime/types.ts` defining `IAgentRuntimeProvider`, configuration interfaces, and domain models.  
**Acceptance criteria:**

- [ ] `src/lib/agent-runtime/types.ts` created with complete `IAgentRuntimeProvider` method contracts.  
      **Verification:** `bun run check`  
      **Dependencies:** Checkpoint 1  
      **Files touched:**
- `src/lib/agent-runtime/types.ts`  
  **Estimated scope:** S (1 file)

---

#### Task 2.2: Extract Event Normalizer Module

**Description:** Extract pure event normalization, turn grouping, and AST extraction helpers from `agent-runtime-client.ts` into `src/lib/agent-runtime/event-normalizer.ts`.  
**Acceptance criteria:**

- [ ] `parseRawSessionEvent`, `groupTurnSessionEvents`, `extractTextFromQueryOutput`, `formatSessionEventsToThreadMessages` extracted into pure module.
- [ ] Zero direct dependencies on network I/O or GCP SDKs in this file.  
      **Verification:** `bun test tests/agent-client.test.ts`  
      **Dependencies:** Task 2.1  
      **Files touched:**
- `src/lib/agent-runtime/event-normalizer.ts`  
  **Estimated scope:** S (1 file)

---

#### Task 2.3: Extract SSE Stream Parser Module

**Description:** Extract line-based SSE chunk decoder and keepalive parser into `src/lib/agent-runtime/sse-parser.ts`.  
**Acceptance criteria:**

- [ ] `sse-parser.ts` handles chunk boundaries, UTF-8 decoding, keepalive events, and `[DONE]` markers.  
      **Verification:** `bun test tests/chat-api.test.ts`  
      **Dependencies:** Task 2.1  
      **Files touched:**
- `src/lib/agent-runtime/sse-parser.ts`  
  **Estimated scope:** S (1 file)

---

#### Task 2.4: Extract Mock Store & `MockAgentRuntimeProvider`

**Description:** Extract offline in-memory stores and mock streaming simulation into `src/lib/agent-runtime/mock/mock-store.ts` and `src/lib/agent-runtime/mock/mock-provider.ts` implementing `IAgentRuntimeProvider`.  
**Acceptance criteria:**

- [ ] Mock fixtures and streaming logic isolated in `src/lib/agent-runtime/mock/`.
- [ ] `MockAgentRuntimeProvider` implements `IAgentRuntimeProvider`.  
      **Verification:** `bun test tests/agent-client.test.ts`  
      **Dependencies:** Task 2.2, Task 2.3  
      **Files touched:**
- `src/lib/agent-runtime/mock/mock-store.ts`
- `src/lib/agent-runtime/mock/mock-provider.ts`  
  **Estimated scope:** M (2 files)

---

#### Task 2.5: Implement `VertexAiReasoningEngineProvider`

**Description:** Implement real Google Cloud Vertex AI REST and streaming client in `src/lib/agent-runtime/client.ts` implementing `IAgentRuntimeProvider`.  
**Acceptance criteria:**

- [ ] `VertexAiReasoningEngineProvider` handles GoogleAuth token management and Vertex AI REST API calls.
- [ ] Zero mock branching inside production client methods.  
      **Verification:** `bun run check`  
      **Dependencies:** Task 2.2, Task 2.3  
      **Files touched:**
- `src/lib/agent-runtime/client.ts`  
  **Estimated scope:** M (1 file)

---

#### Task 2.6: Factory with Fail-Fast Configuration

**Description:** Implement `createAgentRuntimeProvider` in `src/lib/agent-runtime/factory.ts` with explicit fail-fast validation in production mode. Create `src/lib/agent-runtime/index.ts` public export.  
**Acceptance criteria:**

- [ ] `createAgentRuntimeProvider` instantiates `VertexAiReasoningEngineProvider` or `MockAgentRuntimeProvider` based on environment.
- [ ] Missing config in production throws an explicit `Error` immediately.
- [ ] `src/lib/agent-runtime/index.ts` exports factory, types, and normalizers.  
      **Verification:** `bun test tests/agent-client.test.ts`  
      **Dependencies:** Task 2.4, Task 2.5  
      **Files touched:**
- `src/lib/agent-runtime/factory.ts`
- `src/lib/agent-runtime/index.ts`  
  **Estimated scope:** S (2 files)

---

#### Task 2.7: Backward-Compatible Facade in `agent-runtime-client.ts`

**Description:** Refactor `src/lib/agent-runtime-client.ts` to re-export `AgentRuntimeClient` wrapping `createAgentRuntimeProvider`, ensuring zero breaking changes for existing imports.  
**Acceptance criteria:**

- [ ] `src/lib/agent-runtime-client.ts` LOC reduced from 2,120 to < 80.
- [ ] All 22 tests in `tests/agent-client.test.ts` pass without modification.  
      **Verification:** `bun test tests/agent-client.test.ts`  
      **Dependencies:** Task 2.6  
      **Files touched:**
- `src/lib/agent-runtime-client.ts`  
  **Estimated scope:** S (1 file)

---

### Checkpoint 2: Domain Decomposition Verified

- [ ] `bun run check` passes.
- [ ] All tests in `tests/agent-client.test.ts` and `tests/agents-api.test.ts` pass cleanly.

---

### Phase 3: BFF Route Middleware (`withAuth`) & CQS Normalization

#### Task 3.1: Typed `withAuth` Route Wrapper

**Description:** Create `src/lib/api-handler.ts` providing `withAuth` higher-order function that extracts user session, standardizes 401/500 error responses, and injects `AuthenticatedContext`.  
**Acceptance criteria:**

- [ ] `withAuth` handles authentication verification, route params resolution, and centralized error logging.  
      **Verification:** `bun run check`  
      **Dependencies:** Checkpoint 2  
      **Files touched:**
- `src/lib/api-handler.ts`  
  **Estimated scope:** S (1 file)

---

#### Task 3.2: Refactor Agents, Chat, and Feedback Routes

**Description:** Refactor `src/app/api/agents/route.ts`, `src/app/api/chat/route.ts`, and `src/app/api/feedback/route.ts` to use `withAuth`.  
**Acceptance criteria:**

- [ ] Routes refactored with clean declarative syntax using `withAuth`.
- [ ] Chat SSE streaming works seamlessly inside `withAuth`.  
      **Verification:** `bun test tests/agents-api.test.ts tests/chat-api.test.ts tests/feedback-api.test.ts`  
      **Dependencies:** Task 3.1  
      **Files touched:**
- `src/app/api/agents/route.ts`
- `src/app/api/chat/route.ts`
- `src/app/api/feedback/route.ts`  
  **Estimated scope:** M (3 files)

---

#### Task 3.3: Refactor Sessions Routes & Eliminate CQS Mutation

**Description:** Refactor `src/app/api/sessions/route.ts` and `src/app/api/sessions/[sessionId]/route.ts` to use `withAuth`. Remove background mutating `PATCH` on `GET /api/sessions/[sessionId]`.  
**Acceptance criteria:**

- [ ] `GET /api/sessions/[sessionId]` operates as a pure, idempotent query without side-effect writes.
- [ ] All session CRUD routes use `withAuth`.  
      **Verification:** `bun test tests/sessions-api.test.ts`  
      **Dependencies:** Task 3.1  
      **Files touched:**
- `src/app/api/sessions/route.ts`
- `src/app/api/sessions/[sessionId]/route.ts`  
  **Estimated scope:** S (2 files)

---

#### Task 3.4: Refactor Uploads Routes

**Description:** Refactor `src/app/api/uploads/presign/route.ts` and `src/app/api/uploads/signed-read/route.ts` with `withAuth`.  
**Acceptance criteria:**

- [ ] Presign and signed-read routes use `withAuth` and enforce user identity prefix isolation.  
      **Verification:** `bun test tests/uploads-api.test.ts`  
      **Dependencies:** Task 3.1  
      **Files touched:**
- `src/app/api/uploads/presign/route.ts`
- `src/app/api/uploads/signed-read/route.ts`  
  **Estimated scope:** S (2 files)

---

### Checkpoint 3: BFF Middleware & CQS Verified

- [ ] All API test suites pass (`bun test tests/*api*.test.ts`).
- [ ] `bun run check` passes with 0 errors.

---

### Phase 4: UI Tool Stream Direct Wire Protocol & Scoped Attachment Store

#### Task 4.1: Scoped `SessionAttachmentStore`

**Description:** Create `src/lib/attachments/attachment-store.ts` implementing `SessionAttachmentStore` with automatic `URL.revokeObjectURL` cleanup when attachments are removed.  
**Acceptance criteria:**

- [ ] `SessionAttachmentStore` provides `get`, `set`, `delete`, and `clear`.
- [ ] Removing an attachment automatically revokes its object URL to prevent memory leaks.  
      **Verification:** `bun test tests/multimodal-attachments.test.tsx`  
      **Dependencies:** Checkpoint 3  
      **Files touched:**
- `src/lib/attachments/attachment-store.ts`  
  **Estimated scope:** S (1 file)

---

#### Task 4.2: Direct Structured Tool Call Emission in Chat Adapter

**Description:** Refactor `createGeminiChatAdapter` to emit native `tool-call` parts directly into `@assistant-ui/react` runtime without serializing into `:::tool[...]` string pseudo-tags.  
**Acceptance criteria:**

- [ ] `tool_call` and `tool_result` SSE events yield directly as structured `tool-call` parts in `createYieldContent`.
- [ ] String tag manipulation helpers deleted from chat adapter.  
      **Verification:** `bun test tests/tools-hitl.test.tsx`  
      **Dependencies:** Task 4.1  
      **Files touched:**
- `src/lib/gemini-runtime-adapter.ts`  
  **Estimated scope:** M (1 file)

---

#### Task 4.3: Simplify `reasoning.tsx` Component

**Description:** Remove complex regex parsers (`parseReasoningBlocks`, `parseToolBlockContent`, `parseSubAgentBlockContent`, `parseLegacyToolTraces`) from `src/components/assistant-ui/reasoning.tsx`, rendering reasoning text purely as styled monospace text/markdown.  
**Acceptance criteria:**

- [ ] `reasoning.tsx` LOC reduced from 382 to < 120.
- [ ] Brittle regex parsing logic eliminated.
- [ ] Tool calls rendered by `MessagePrimitive.GroupedParts` and `ToolFallback`.  
      **Verification:** `bun test tests/components.test.tsx tests/tools-hitl.test.tsx`  
      **Dependencies:** Task 4.2  
      **Files touched:**
- `src/components/assistant-ui/reasoning.tsx`  
  **Estimated scope:** S (1 file)

---

#### Task 4.4: Decompose `gemini-runtime-adapter.ts` into Modular Adapters

**Description:** Decompose `src/lib/gemini-runtime-adapter.ts` into focused submodules in `src/lib/adapters/`: `chat-adapter.ts`, `feedback-adapter.ts`, `gcs-attachment-adapter.ts`, `speech-adapters.ts`. Keep `gemini-runtime-adapter.ts` as a re-export facade.  
**Acceptance criteria:**

- [ ] Each adapter file under `src/lib/adapters/` has a single responsibility (< 200 LOC).
- [ ] Re-export facade maintains backward compatibility for all existing imports.  
      **Verification:** `bun test tests/multimodal-attachments.test.tsx tests/voice-tts.test.tsx tests/feedback-ui.test.tsx`  
      **Dependencies:** Task 4.2, Task 4.3  
      **Files touched:**
- `src/lib/adapters/chat-adapter.ts`
- `src/lib/adapters/feedback-adapter.ts`
- `src/lib/adapters/gcs-attachment-adapter.ts`
- `src/lib/adapters/speech-adapters.ts`
- `src/lib/adapters/index.ts`
- `src/lib/gemini-runtime-adapter.ts`  
  **Estimated scope:** M (6 files)

---

### Checkpoint 4: Tool Stream & Memory Management Verified

- [ ] All component and adapter tests pass (`bun test tests/*.test.tsx`).
- [ ] Zero memory leaks from revoked attachment URLs.

---

### Phase 5: Final Quality Gates & Preflight

#### Task 5.1: Full Preflight & Production Build Validation

**Description:** Run the full preflight quality suite (`bun run preflight`: format, check, lint, test) and production Next.js build (`bun run build`).  
**Acceptance criteria:**

- [ ] `bun run check` passes with 0 type errors.
- [ ] `bun run lint` passes with 0 warnings/errors.
- [ ] `bun run test` passes 100% of test suites.
- [ ] `bun run build` completes successfully.  
      **Verification:** `bun run preflight && bun run build`  
      **Dependencies:** Checkpoint 4  
      **Files touched:** None (verification task)  
      **Estimated scope:** XS (0 files)

---

## 4. Risks and Mitigations

| Risk                                                       | Impact | Mitigation Strategy                                                                                                                                                  |
| :--------------------------------------------------------- | :----- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Breaking existing test imports during client decomposition | Medium | Keep `src/lib/agent-runtime-client.ts` and `src/lib/gemini-runtime-adapter.ts` as re-export facades during and after the migration.                                  |
| Edge-case tool rendering when streaming completes          | Medium | Verify that `createYieldContent` correctly maps `ToolCallYieldItem` status (`running`, `requires-action`, `complete`) into native `@assistant-ui/react` part format. |
| Silent regression in production environment configuration  | High   | Add explicit fail-fast assertions in `createAgentRuntimeProvider` when `NODE_ENV === "production"`.                                                                  |

---

## 5. Verification Commands Summary

```bash
# Verify Phase 1
bun run check && bun test tests/components.test.tsx

# Verify Phase 2
bun test tests/agent-client.test.ts tests/agents-api.test.ts

# Verify Phase 3
bun test tests/sessions-api.test.ts tests/chat-api.test.ts tests/feedback-api.test.ts tests/uploads-api.test.ts

# Verify Phase 4
bun test tests/tools-hitl.test.tsx tests/multimodal-attachments.test.tsx tests/voice-tts.test.tsx

# Full Preflight Gate
bun run preflight && bun run build
```
