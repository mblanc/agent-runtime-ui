# Software Design Review & Architectural Improvements Roadmap

> **Target Project:** Agent Runtime UI (`agent-runtime-ui`)  
> **Master Analysis Report:** [`docs/improvments.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/improvments.md)

---

## Phase Specifications Index

Per the **Spec-Driven Development** methodology, each phase of the architectural refactoring has its own formal technical specification covering objectives, commands, project structure, code style, testing strategy, boundaries, and acceptance criteria:

1. 📋 **Phase 1: Codebase Hygiene, Dead Code Removal & Discriminated Union Types**  
   [`docs/spec-phase-1-hygiene-and-types.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-phase-1-hygiene-and-types.md)
   - Delete orphaned components (`gemini-tools.tsx`, `gemini-reasoning.tsx`, `gemini-thinking-indicator.tsx`).
   - Refactor `AgentMessagePart` and `AgentSessionEvent` in [`src/types/agent.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/types/agent.ts) into strict discriminated unions with runtime normalizer.

2. 📋 **Phase 2: Domain Layer Decomposition & Strategy Pattern (`IAgentRuntimeProvider`)**  
   [`docs/spec-phase-2-domain-decomposition-and-strategy.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-phase-2-domain-decomposition-and-strategy.md)
   - Decompose monolithic [`src/lib/agent-runtime-client.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime-client.ts) (2,120 LOC) into focused submodules in `src/lib/agent-runtime/`.
   - Implement `IAgentRuntimeProvider` strategy interface, `VertexAiReasoningEngineProvider`, `MockAgentRuntimeProvider`, and `createAgentRuntimeProvider` factory with fail-fast production checks.

3. 📋 **Phase 3: BFF Route Middleware (`withAuth`) & CQS Normalization**  
   [`docs/spec-phase-3-bff-middleware-and-cqs.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-phase-3-bff-middleware-and-cqs.md)
   - Create typed `withAuth` route wrapper in `src/lib/api-handler.ts` to eliminate auth boilerplate across 7 API routes.
   - Remove background title mutation from `GET /api/sessions/[sessionId]` to enforce Command-Query Separation and HTTP idempotency.

4. 📋 **Phase 4: UI Tool Stream Direct Wire Protocol & Scoped Attachment Store**  
   [`docs/spec-phase-4-tool-stream-and-attachment-store.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-phase-4-tool-stream-and-attachment-store.md)
   - Eliminate string pseudo-tags (`:::tool[...]`) and brittle regex round-tripping in [`reasoning.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/reasoning.tsx) in favor of native structured `@assistant-ui/react` parts.
   - Implement `SessionAttachmentStore` with automatic `URL.revokeObjectURL` cleanup, eliminating global mutable state.
