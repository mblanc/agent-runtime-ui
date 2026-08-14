# Implementation Plan: Google Search & Enterprise RAG Grounding (Source Citations & Truthfulness Inspector)

## Overview

Implement a compliant, high-fidelity Grounding & Citations Visualizer in `agent-runtime-ui` based on [`docs/spec-grounding-citations.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-grounding-citations.md). This feature supports **Grounding with Google Search** and **Vertex AI RAG Engine / Vector Search**, providing fact attribution, source lineage, interactive inline citation badges (`[1]`, `[2]`), the official Google Search suggestion entry point widget (`searchEntryPoint.renderedContent`), an expandable sources accordion, and an Enterprise RAG Document Inspector drawer for internal corporate documents.

---

## Architecture Decisions

- **Stateless Metadata Propagation**: Grounding metadata (`groundingMetadata` / `grounding_metadata`) is received over the SSE chat stream (`/api/chat`), normalized, and attached to assistant message metadata (`message.metadata.custom.groundingMetadata`). Zero additional database storage is needed.
- **Citation Parsing & Non-Destructive Markdown Preprocessing**: Inline citation tokens (e.g. `[1]`, `[2]`, `[1, 2]`) within assistant markdown text are parsed and converted to interactive inline citation badges without corrupting standard markdown links (`[link](url)`) or custom math tags (`$$...$$`, `[math]...[/math]`).
- **Google Search Attribution Compliance**: The `searchEntryPoint.renderedContent` HTML snippet is embedded securely in `GoogleSearchWidget` preserving official Google Search styling, logo assets, and query suggestions across dark and light themes.
- **Enterprise RAG Inspector Drawer**: Slide-over panel built with `@radix-ui/react-dialog` displaying deep inspection details for internal corporate documents retrieved via Vector Search (title, GCS URI, RAG corpus ID, similarity confidence score, and text excerpt).
- **Interactive Source Popovers**: Hovering or clicking an inline citation badge opens a popover displaying source title, URL domain badge, excerpt snippet, confidence score, and a link or button to inspect internal RAG chunks.
- **Offline Mock Support**: `MockAgentRuntimeProvider` generates realistic grounding metadata for search/RAG queries (e.g. questions about Vertex AI specs, GCP architectures, and enterprise policies), allowing full visual testing without live GCP credentials.

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase 1: Data Contracts, Types & Citation Parsing Engine        │
│ (src/types/agent.ts, src/lib/grounding/*, parser tests)         │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 2: Stream Adapter & Mock Grounding Generator              │
│ (chat-adapter.ts, event-normalizer.ts, mock-provider.ts)        │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 3: Visual Grounding Primitives & Citation UI              │
│ (inline-citation-badge.tsx, source-popover.tsx,                 │
│  google-search-widget.tsx, enterprise-rag-drawer.tsx)           │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 4: Message Integration & Markdown Text Citation Badges    │
│ (gemini-message.tsx, markdown-text.tsx, grounding-footer.tsx)   │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 5: Verification, End-to-End Tests & Quality Preflight     │
│ (tests/grounding-*.test.ts(x), preflight quality gates)         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Task List

### Phase 1: Data Contracts, Types & Citation Parsing Engine

#### Task 1: Define Grounding & Citation Data Contracts

**Description:** Define TypeScript interfaces for Google Search and Enterprise RAG grounding models (`WebGroundingChunk`, `RetrievedContextChunk`, `GroundingChunk`, `GroundingSupport`, `SearchEntryPoint`, `GroundingMetadata`) in [`src/types/agent.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/types/agent.ts), and extend `AgentMessagePart`, `AgentStreamEvent`, and `AgentSessionEvent` with grounding metadata fields.

**Acceptance criteria:**

- [ ] `WebGroundingChunk` contains `uri`, `title`, and optional `domain`.
- [ ] `RetrievedContextChunk` contains `uri`, `title`, `text?`, `ragCorpusId?`, and `confidenceScore?`.
- [ ] `GroundingChunk` contains optional `web` and `retrievedContext` fields.
- [ ] `GroundingSupport` contains `groundingChunkIndices: number[]`, `confidenceScores?: number[]`, and `segment?: { startIndex: number; endIndex: number; text: string }`.
- [ ] `SearchEntryPoint` contains optional `renderedContent` and `sdkBlob`.
- [ ] `GroundingMetadata` contains `webSearchQueries?`, `groundingChunks?`, `groundingSupports?`, `searchEntryPoint?`, and `retrievalQueries?`.
- [ ] `AgentStreamEvent`, `AgentMessagePart`, and `AgentSessionEvent` support `grounding_metadata?: GroundingMetadata` and `groundingMetadata?: GroundingMetadata`.
- [ ] All types are exported from [`src/types/agent.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/types/agent.ts).

**Verification:**

- [ ] Tests pass: `bun run check`
- [ ] Build succeeds: `bun run build`
- [ ] Manual check: Types are strictly typed with zero `any`.

**Dependencies:** None

**Files likely touched:**

- [`src/types/agent.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/types/agent.ts)

**Estimated scope:** XS (1 file)

---

#### Task 2: Implement Grounding Citation Normalizer & Parser Utilities

**Description:** Create citation parsing and index resolution utilities in `src/lib/grounding/citation-parser.ts` to extract citation indices (e.g. `[1]`, `[2]`, `[1, 2]`, `[1][2]`), map 1-based indices to `GroundingChunk` objects, format domain names from URLs, and extract grounding metadata from raw event payloads.

**Acceptance criteria:**

- [ ] `parseCitationIndices(text: string)` extracts citation references without matching standard markdown links `[text](url)` or math tags.
- [ ] `resolveCitationSource(index: number, chunks: GroundingChunk[])` safely resolves 1-based index to chunk (e.g. index 1 -> `chunks[0]`).
- [ ] `extractDomainFromUri(uri: string)` extracts clean hostnames (e.g. `cloud.google.com`) or GCS bucket paths (e.g. `gs://corp-bucket`).
- [ ] `extractGroundingMetadata(raw: unknown)` extracts normalized `GroundingMetadata` from diverse Gemini and Vertex AI event formats.
- [ ] Unit test suite in `tests/grounding-parser.test.ts` verifies regex matching, edge cases, and normalization.

**Verification:**

- [ ] Tests pass: `bun test tests/grounding-parser.test.ts`
- [ ] Build succeeds: `bun run check`
- [ ] Manual check: Edge cases with multiple citations like `[1, 2, 3]` and invalid indices are handled gracefully.

**Dependencies:** Task 1

**Files likely touched:**

- `src/lib/grounding/citation-parser.ts`
- `tests/grounding-parser.test.ts`

**Estimated scope:** S (2 files)

---

### Checkpoint 1: Data Contracts & Parsing Utilities

- [ ] `bun run check` passes with zero type errors.
- [ ] `bun test tests/grounding-parser.test.ts` passes all citation extraction and normalization tests.

---

### Phase 2: Stream Adapter & Mock Grounding Generator

#### Task 3: Chat Adapter Stream Interception for Grounding Metadata

**Description:** Update `createGeminiChatAdapter` in [`src/lib/adapters/chat-adapter.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/adapters/chat-adapter.ts) to intercept `grounding_metadata` / `groundingMetadata` in SSE stream events, preserve it across stream chunks, and attach it to message custom metadata (`metadata.custom.groundingMetadata`). Also update `createYieldContent` to accept and emit `groundingMetadata`.

**Acceptance criteria:**

- [ ] `createYieldContent` accepts `groundingMetadata?: GroundingMetadata` and places it in `metadata.custom.groundingMetadata`.
- [ ] `createGeminiChatAdapter` parses `grounding_metadata` and `groundingMetadata` from stream chunks and accumulates the latest metadata.
- [ ] On stream `[DONE]`, the final yielded message maintains `metadata.custom.groundingMetadata`.
- [ ] Thread message history transformation in `event-normalizer.ts` preserves grounding metadata when loading past sessions.

**Verification:**

- [ ] Tests pass: `bun test tests/event-normalizer.test.ts`
- [ ] Build succeeds: `bun run check`
- [ ] Manual check: Chat adapter outputs metadata with grounding chunks and search entry point intact.

**Dependencies:** Tasks 1, 2

**Files likely touched:**

- [`src/lib/adapters/chat-adapter.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/adapters/chat-adapter.ts)
- [`src/lib/agent-runtime/event-normalizer.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/event-normalizer.ts)

**Estimated scope:** S (2 files)

---

#### Task 4: Implement Mock Provider Grounding Simulation & Multi-Turn Persistence

**Description:** Update `MockAgentRuntimeProvider.streamQuery` in [`src/lib/agent-runtime/mock/mock-provider.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/mock/mock-provider.ts) to simulate Google Search and Enterprise RAG grounding when the user asks questions requiring factual specs, docs, search, or RAG. Emit realistic `grounding_metadata` with search queries, web grounding chunks, internal RAG chunks (`gs://corp-bucket/...`), grounding supports, and Google Search entry point HTML snippet. Persist `groundingMetadata` into `mockSessionEventsStore`.

**Acceptance criteria:**

- [ ] Questions containing search/specs/docs/grounding keywords trigger mock grounding generation.
- [ ] Stream generator yields `thought` event indicating Google Search & RAG corpus retrieval.
- [ ] Stream generator yields `grounding_metadata` containing realistic `webSearchQueries`, `groundingChunks` (both web and GCS RAG documents), `groundingSupports`, and `searchEntryPoint.renderedContent`.
- [ ] Response text includes natural inline citations `[1]`, `[2]`, `[3]`.
- [ ] `mockSessionEventsStore` persists `groundingMetadata` on assistant session events.
- [ ] Integration test in `tests/grounding-stream.test.ts` validates end-to-end stream yielding and metadata attachment.

**Verification:**

- [ ] Tests pass: `bun test tests/grounding-stream.test.ts`
- [ ] Build succeeds: `bun run check`
- [ ] Manual check: Mock responses for search queries stream citations and metadata.

**Dependencies:** Tasks 2, 3

**Files likely touched:**

- [`src/lib/agent-runtime/mock/mock-provider.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/mock/mock-provider.ts)
- [`src/lib/agent-runtime/mock/mock-store.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/mock/mock-store.ts)
- `tests/grounding-stream.test.ts`

**Estimated scope:** M (3 files)

---

### Checkpoint 2: Stream Pipeline & Mock Grounding Engine

- [ ] `bun run check` passes.
- [ ] `bun test tests/grounding-stream.test.ts` passes, verifying stream chunks yield grounding metadata to message state.

---

### Phase 3: Visual Grounding Primitives & Citation UI

#### Task 5: Build `InlineCitationBadge` and `SourcePopover`

**Description:** Create `src/components/grounding/inline-citation-badge.tsx` and `src/components/grounding/source-popover.tsx`. The citation badge renders as a compact, styled pill/superscript (e.g. `[1]`, `[2]`). Hovering or clicking opens a popover displaying source title, clickable URL link or GCS URI, domain badge, snippet text, and similarity confidence score.

**Acceptance criteria:**

- [ ] `InlineCitationBadge` displays 1-based index (e.g. `[1]`, `[2]`) or multiple indices (e.g. `[1, 2]`).
- [ ] Clicking or hovering badge opens `SourcePopover` with full source details.
- [ ] `SourcePopover` displays web favicon/globe icon, title, domain, text snippet, and confidence rating.
- [ ] For internal RAG chunks (`retrievedContext`), displays document icon, GCS URI, RAG corpus ID, and button to open Enterprise RAG Drawer.
- [ ] Keyboard accessible (Tab focusable, Enter/Space toggles popover, Escape closes).
- [ ] Seamless styling for both light and dark modes.

**Verification:**

- [ ] Tests pass: `bun test tests/grounding-ui.test.tsx`
- [ ] Build succeeds: `bun run check`
- [ ] Manual check: Popover positions accurately and displays source info.

**Dependencies:** Tasks 1, 2

**Files likely touched:**

- `src/components/grounding/inline-citation-badge.tsx`
- `src/components/grounding/source-popover.tsx`

**Estimated scope:** S (2 files)

---

#### Task 6: Build `GoogleSearchWidget`

**Description:** Create `src/components/grounding/google-search-widget.tsx` to safely embed the official Google Search suggestion entry point (`searchEntryPoint.renderedContent`) provided by Vertex AI Reasoning Engine / Gemini API, strictly adhering to Google Search Grounding attribution guidelines.

**Acceptance criteria:**

- [ ] Safely renders `searchEntryPoint.renderedContent` HTML inside an attribution-compliant container.
- [ ] Preserves Google Search logo and suggestion chips without alteration or suppression.
- [ ] Applies theme-appropriate styling for light and dark modes.
- [ ] Returns `null` cleanly if `renderedContent` is absent or empty.
- [ ] Sanitizes rendered content to prevent unsafe script execution while preserving search links and styling.

**Verification:**

- [ ] Tests pass: `bun test tests/grounding-ui.test.tsx`
- [ ] Build succeeds: `bun run check`
- [ ] Manual check: Search suggestion chips render cleanly in light/dark themes.

**Dependencies:** Task 1

**Files likely touched:**

- `src/components/grounding/google-search-widget.tsx`

**Estimated scope:** S (1 file)

---

#### Task 7: Build `GroundingSourcesAccordion` & `EnterpriseRagDrawer`

**Description:** Create `src/components/grounding/grounding-sources-accordion.tsx` and `src/components/grounding/enterprise-rag-drawer.tsx`. The accordion displays a summary bar ("🔍 Grounded with Google Search & Enterprise Docs [N Sources ▾]") expandable to show search queries, web source cards, and RAG document items. The `EnterpriseRagDrawer` provides a full slide-over inspector (using `@radix-ui/react-dialog`) to view the complete retrieved corporate text chunks, GCS paths, and confidence scores.

**Acceptance criteria:**

- [ ] `GroundingSourcesAccordion` collapses and expands smoothly with Chevron toggle.
- [ ] Displays search queries as distinct pill tags ("Searches: ...").
- [ ] Lists web sources with favicon/globe, title, domain link, and confidence indicator.
- [ ] Lists enterprise RAG documents with GCS bucket links and "Inspect Document" action.
- [ ] `EnterpriseRagDrawer` opens slide-over drawer displaying full document text chunk, metadata (corpus ID, GCS URI, confidence score), and close button.
- [ ] Accessible keyboard navigation and ARIA attributes (`aria-expanded`, `aria-controls`).

**Verification:**

- [ ] Tests pass: `bun test tests/grounding-ui.test.tsx`
- [ ] Build succeeds: `bun run check`
- [ ] Manual check: Accordion expands/collapses and drawer slides in from right.

**Dependencies:** Tasks 5, 6

**Files likely touched:**

- `src/components/grounding/grounding-sources-accordion.tsx`
- `src/components/grounding/enterprise-rag-drawer.tsx`

**Estimated scope:** M (2 files)

---

### Checkpoint 3: Visual Grounding Components

- [ ] `bun run check` passes with zero type errors.
- [ ] `bun test tests/grounding-ui.test.tsx` passes component tests for citation badge, popover, search widget, accordion, and RAG drawer.

---

### Phase 4: Message Integration & Markdown Text Citation Badges

#### Task 8: Assemble `GroundingFooter` and Mount in `GeminiMessage`

**Description:** Create `src/components/grounding/grounding-footer.tsx` integrating `GroundingSourcesAccordion`, `GoogleSearchWidget`, and `EnterpriseRagDrawer`. Mount `GroundingFooter` in [`src/components/assistant-ui/gemini-message.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/gemini-message.tsx) inside the assistant message branch, extracting `groundingMetadata` from `message.metadata.custom.groundingMetadata` via `useAuiState`.

**Acceptance criteria:**

- [ ] `GroundingFooter` encapsulates sources accordion, Google Search entry point widget, and RAG drawer state.
- [ ] `GeminiMessage` extracts `metadata.custom.groundingMetadata` and renders `GroundingFooter` below assistant response text and above timing/actions footer.
- [ ] Renders nothing if no `groundingMetadata` or chunks exist.
- [ ] Matches the Google Gemini message aesthetic with proper padding and dividers.

**Verification:**

- [ ] Tests pass: `bun test tests/components.test.tsx`
- [ ] Build succeeds: `bun run check`
- [ ] Manual check: Grounded messages show the grounding footer in chat UI.

**Dependencies:** Tasks 3, 7

**Files likely touched:**

- `src/components/grounding/grounding-footer.tsx`
- [`src/components/assistant-ui/gemini-message.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/gemini-message.tsx)

**Estimated scope:** S (2 files)

---

#### Task 9: Integrate Interactive Inline Citation Badges into `MarkdownText`

**Description:** Update [`src/components/assistant-ui/markdown-text.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/markdown-text.tsx) and streamdown pipeline to recognize citation patterns like `[1]`, `[2]`, `[1, 2]` within text and render them as interactive `InlineCitationBadge` components linked to the message's `groundingChunks`.

**Acceptance criteria:**

- [ ] Inline citations `[1]`, `[2]`, `[1, 2]` in assistant text render as clickable `InlineCitationBadge` elements.
- [ ] Does not corrupt standard markdown links (e.g. `[Google Cloud](https://cloud.google.com)`), code blocks, or math tags.
- [ ] Badges connect to `groundingMetadata.groundingChunks` in the current message context.
- [ ] Clicking or hovering on an inline citation badge displays the `SourcePopover`.

**Verification:**

- [ ] Tests pass: `bun test tests/grounding-ui.test.tsx`
- [ ] Build succeeds: `bun run check`
- [ ] Manual check: Streaming responses display interactive `[1]` badges inline within paragraphs.

**Dependencies:** Tasks 5, 8

**Files likely touched:**

- [`src/components/assistant-ui/markdown-text.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/markdown-text.tsx)
- `src/components/grounding/citation-markdown-plugin.tsx`

**Estimated scope:** M (2 files)

---

### Checkpoint 4: End-to-End Chat Grounding Integration

- [ ] Asking a search or specs question in chat displays inline citation badges `[1]`, `[2]` in response text.
- [ ] Clicking or hovering badges displays source preview popover with title, domain, and confidence score.
- [ ] Message footer shows Grounding Sources Accordion, Google Search suggestions widget, and opens Enterprise RAG Drawer.
- [ ] All unit and component tests pass (`bun test`).

---

### Phase 5: Verification, Quality Preflight & Documentation

#### Task 10: Complete Test Suite Verification, Quality Preflight & Docs Sync

**Description:** Run comprehensive verification including `bun run check`, `bun run lint`, `bun run test`, and `bun run preflight`. Ensure 100% strict TypeScript types, zero ESLint warnings, all unit/integration tests passing, and documentation index updated in `AGENTS.md`.

**Acceptance criteria:**

- [ ] `bun run check` passes with zero type errors.
- [ ] `bun run lint` passes with zero ESLint warnings/errors.
- [ ] `bun run test` passes all tests across the repository.
- [ ] `bun run preflight` exits with status 0.
- [ ] `AGENTS.md` is updated with grounding components index and data contracts.

**Verification:**

- [ ] `bun run preflight` exits cleanly.

**Dependencies:** Tasks 1 through 9

**Files likely touched:**

- `tests/`
- [`AGENTS.md`](file:///Users/mblanc/projects/agent-runtime-ui/AGENTS.md)

**Estimated scope:** S (2 files)

---

## Risks and Mitigations

| Risk                                                              | Impact | Mitigation                                                                                                                                                                         |
| ----------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| XSS vulnerability from `searchEntryPoint.renderedContent` HTML    | High   | Sanitize HTML content before rendering while preserving valid Google Search attribution elements and SVG icons.                                                                    |
| Citation parser breaking standard markdown links or math formulas | High   | Use regex lookaheads/lookbehinds and token boundary validation so only standalone numeric bracket references `[1]`, `[2]` are transformed, ignoring `[text](url)` and math blocks. |
| Grounding metadata lost during stream chunks or message updates   | Med    | Maintain accumulated grounding metadata in adapter closure and ensure final yield on `[DONE]` includes complete metadata.                                                          |
| Google Search attribution policy violation                        | High   | Embed `searchEntryPoint.renderedContent` faithfully without hiding, overlaying, or modifying Google logos or suggestion terms.                                                     |
| Missing or ungrounded turns throwing runtime errors               | Low    | Gracefully guard all grounding components with optional chaining and return `null` when metadata or chunks are absent.                                                             |

---

## Open Questions

- None. The specification [`docs/spec-grounding-citations.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-grounding-citations.md) fully defines data contracts, component hierarchy, attribution requirements, and mock behavior.
