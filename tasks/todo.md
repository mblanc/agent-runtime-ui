# Task List: Google Search & Enterprise RAG Grounding (Source Citations & Truthfulness Inspector)

- [ ] **Phase 1: Data Contracts, Types & Citation Parsing Engine**
  - [x] **Task 1: Define Grounding & Citation Data Contracts**
    - [x] Add `WebGroundingChunk`, `RetrievedContextChunk`, `GroundingChunk`, `GroundingSupport`, `SearchEntryPoint`, `GroundingMetadata` to `src/types/agent.ts`.
    - [x] Extend `AgentStreamEvent`, `AgentMessagePart`, and `AgentSessionEvent` with `grounding_metadata?: GroundingMetadata` and `groundingMetadata?: GroundingMetadata`.
    - [x] Verify `bun run check`.
  - [x] **Task 2: Implement Grounding Citation Normalizer & Parser Utilities**
    - [x] Create `src/lib/grounding/citation-parser.ts` with `parseCitationIndices`, `resolveCitationSource`, `extractDomainFromUri`, and `extractGroundingMetadata`.
    - [x] Create `tests/grounding-parser.test.ts` and verify with `bun test tests/grounding-parser.test.ts`.
  - [x] **Checkpoint 1: Data Contracts & Parsing Utilities**
    - [x] Verify `bun run check` and `bun test tests/grounding-parser.test.ts`.

- [ ] **Phase 2: Stream Adapter & Mock Grounding Generator**
  - [x] **Task 3: Chat Adapter Stream Interception for Grounding Metadata**
    - [x] Update `createYieldContent` and `createGeminiChatAdapter` in `src/lib/adapters/chat-adapter.ts` to parse and yield `metadata.custom.groundingMetadata`.
    - [x] Update `src/lib/agent-runtime/event-normalizer.ts` to preserve grounding metadata in thread history messages.
    - [x] Verify `bun run check` and `bun test tests/event-normalizer.test.ts`.
  - [x] **Task 4: Implement Mock Provider Grounding Simulation & Multi-Turn Persistence**
    - [x] Update `MockAgentRuntimeProvider.streamQuery` in `src/lib/agent-runtime/mock/mock-provider.ts` to yield grounding metadata and thoughts for search/RAG queries.
    - [x] Persist grounding metadata in `mockSessionEventsStore` in `src/lib/agent-runtime/mock/mock-store.ts`.
    - [x] Create `tests/grounding-stream.test.ts` and verify with `bun test tests/grounding-stream.test.ts`.
  - [x] **Checkpoint 2: Stream Pipeline & Mock Grounding Engine**
    - [x] Verify `bun run check` and `bun test tests/grounding-stream.test.ts`.

- [ ] **Phase 3: Visual Grounding Primitives & Citation UI**
  - [x] **Task 5: Build InlineCitationBadge and SourcePopover**
    - [x] Create `src/components/grounding/inline-citation-badge.tsx` with clickable/hoverable `[1]` badge.
    - [x] Create `src/components/grounding/source-popover.tsx` displaying source details, domain tag, snippet, and confidence score.
  - [x] **Task 6: Build GoogleSearchWidget**
    - [x] Create `src/components/grounding/google-search-widget.tsx` to safely render `searchEntryPoint.renderedContent` with compliant Google Search attribution.
  - [x] **Task 7: Build GroundingSourcesAccordion & EnterpriseRagDrawer**
    - [x] Create `src/components/grounding/grounding-sources-accordion.tsx` with collapsible search queries, web source cards, and RAG document items.
    - [x] Create `src/components/grounding/enterprise-rag-drawer.tsx` with slide-over drawer using `@radix-ui/react-dialog` to inspect full RAG text excerpts and GCS metadata.
    - [x] Create `tests/grounding-ui.test.tsx` and verify component behavior with `bun test tests/grounding-ui.test.tsx`.
  - [x] **Checkpoint 3: Visual Grounding Components**
    - [x] Verify `bun run check` and `bun test tests/grounding-ui.test.tsx`.

- [x] **Phase 4: Message Integration & Markdown Text Citation Badges**
  - [x] **Task 8: Assemble GroundingFooter and Mount in GeminiMessage**
    - [x] Create `src/components/grounding/grounding-footer.tsx` combining accordion, search widget, and drawer trigger.
    - [x] Extract `metadata.custom.groundingMetadata` in `src/components/assistant-ui/gemini-message.tsx` and render `GroundingFooter`.
    - [x] Verify `bun test tests/components.test.tsx`.
  - [x] **Task 9: Integrate Interactive Inline Citation Badges into MarkdownText**
    - [x] Parse inline citation tokens `[1]`, `[2]` in `src/components/assistant-ui/markdown-text.tsx` and render interactive `InlineCitationBadge` components without corrupting markdown links or math formulas.
    - [x] Verify `bun test tests/grounding-ui.test.tsx` and `bun run check`.
  - [x] **Checkpoint 4: End-to-End Chat Grounding Integration**
    - [x] Verify search queries render inline citation badges, expandable sources accordion, and official Google Search widget in chat.

- [ ] **Phase 5: Verification, Quality Preflight & Documentation**
  - [x] **Task 10: Complete Test Suite Verification, Quality Preflight & Docs Sync**
    - [x] Run `bun run check`, `bun run lint`, and `bun run test`.
    - [x] Update `AGENTS.md` with grounding components and architecture index.
    - [x] Ensure `bun run preflight` exits with status 0.
