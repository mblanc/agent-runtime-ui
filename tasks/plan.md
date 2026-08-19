# Implementation Plan: Agent Platform Artifacts Service & Live Workspace Canvas

## 1. Overview

This plan details the implementation of a Google Gemini-styled **Side-by-Side Artifacts Workspace Canvas** in the `agent-runtime-ui` application. The feature showcases the **Agent Platform Artifacts Service** (`BaseArtifactService` / `GcsArtifactService` / `InMemoryArtifactService` from ADK), transforming conversational chat into a collaborative workspace with live sandboxed previews, multi-format renderers (HTML apps, CSV data tables, SVG diagrams, Shiki code, Markdown), version scrubbing (`v0` → `v1` → `v2`), REST hydration on thread switching, and instant asset export.

---

## 2. Architecture Decisions & Standards

- **Dual-Layer Discovery**:
  - **Push (Live SSE Stream)**: `event_type: "artifact_created"` and `"artifact_updated"` stream events trigger zero-latency auto-open of the canvas and incremental streaming preview.
  - **Pull (REST API Hydration)**: `GET /api/sessions/[sessionId]/artifacts` and `GET /api/sessions/[sessionId]/artifacts/[filename]?version=N` hydrate the artifact shelf and version history on page load or thread switch.
- **Sandboxed Security**:
  - HTML/JS preview runs strictly inside an isolated `<iframe>` configured with `sandbox="allow-scripts allow-forms allow-modals allow-popups"`. No raw script execution on the parent origin.
- **Split-Pane Layout**:
  - Flexible split-pane container with draggable divider, collapsible toggle (`Cmd/Ctrl + \` / `Escape`), full-screen maximization, and local storage ratio persistence.
- **Strict Typing & Zero Database**:
  - 100% strict TypeScript types in `src/types/agent/artifacts.ts` without `any`.
  - Fully stateless BFF with session ownership verification (`isSessionOwnedBy`, `requireSessionOwner`) and mock mode support (`MOCK_AGENT_RUNTIME=true`).

---

## 3. Dependency Graph

```text
src/types/agent/artifacts.ts
    │
    ├── src/lib/agent-runtime/mock/mock-store.ts & mock-provider.ts
    │       │
    │       ├── src/app/api/sessions/[sessionId]/artifacts/ (BFF Routes)
    │       │
    │       └── src/lib/adapters/stream-accumulator.ts (SSE Stream Ingestion)
    │               │
    │               └── src/lib/artifacts/artifact-context.tsx (Client State Store)
    │                       │
    │                       ├── src/components/artifacts/renderers/ (Multi-format Renderers)
    │                       │       │
    │                       │       └── src/components/artifacts/artifacts-canvas.tsx (Split-Pane UI)
    │                       │
    │                       ├── src/components/artifacts/artifacts-shelf-button.tsx (Header Badge)
    │                       │
    │                       └── src/components/artifacts/artifact-message-chip.tsx (In-chat Trigger)
    │                               │
    │                               └── src/app/page.tsx (Split Layout Integration)
```

---

## 4. Phased Task List

### Phase 1: Data Contracts & Mock Store Foundation

#### Task 1: Artifact Domain Types & Stream Event Extension

- **Description:** Define strict data types for artifacts, versions, MIME types, and extend the stream event schema with artifact payloads.
- **Acceptance Criteria:**
  - [ ] `src/types/agent/artifacts.ts` exports `ArtifactMimeType`, `ArtifactVersion`, `AgentArtifact`, `ArtifactStreamPayload`, `AgentArtifactListResponse`, `AgentArtifactResponse`.
  - [ ] `src/types/agent/stream.ts` extends `AgentStreamEvent` with `"artifact_created" | "artifact_updated"` in `event_type` and `artifact?: ArtifactStreamPayload`.
  - [ ] Barrel file `src/types/agent.ts` re-exports `* from "./agent/artifacts"`.
- **Verification:**
  - [ ] `bun run check` succeeds with zero type errors.
- **Dependencies:** None
- **Files likely touched:**
  - `src/types/agent/artifacts.ts` (new)
  - `src/types/agent/stream.ts`
  - `src/types/agent.ts`
- **Estimated Scope:** S (3 files)

#### Task 2: Artifacts Mock Store, Provider Interface & Stream Triggers

- **Description:** Extend `IAgentRuntimeProvider` with `listArtifacts` and `getArtifact`, implement in-memory mock store with sample multi-version artifacts (HTML, CSV, SVG, Python), and add mock streaming event generator triggers for artifact requests.
- **Acceptance Criteria:**
  - [ ] `IAgentRuntimeProvider` defines `listArtifacts` and `getArtifact` methods.
  - [ ] `mockArtifactsStore` in `mock-store.ts` contains realistic sample artifacts with version histories (`sales_dashboard.html`, `quarterly_revenue.csv`, `system_architecture.svg`, `pipeline_script.py`).
  - [ ] `MockAgentRuntimeProvider` implements `listArtifacts`, `getArtifact`, and streams `artifact_created`/`artifact_updated` events when prompted with artifact keywords.
  - [ ] Store unit tests in `tests/artifacts-store.test.ts` verify artifact listing, version filtering, and version retrieval.
- **Verification:**
  - [ ] `bun test tests/artifacts-store.test.ts` passes all tests.
  - [ ] `bun run check` succeeds.
- **Dependencies:** Task 1
- **Files likely touched:**
  - `src/lib/agent-runtime/types.ts`
  - `src/lib/agent-runtime/mock/mock-store.ts`
  - `src/lib/agent-runtime/mock/mock-provider.ts`
  - `tests/artifacts-store.test.ts` (new)
- **Estimated Scope:** M (4 files)

---

### Checkpoint 1: Foundation & Store Verification

- [ ] TypeScript typecheck passes (`bun run check`).
- [ ] Store unit tests pass (`bun test tests/artifacts-store.test.ts`).
- [ ] No regression across existing test suite (`bun run test`).

---

### Phase 2: BFF REST API Endpoints

#### Task 3: Artifacts BFF REST API Routes with Session Ownership

- **Description:** Implement `GET /api/sessions/[sessionId]/artifacts` (list artifacts) and `GET /api/sessions/[sessionId]/artifacts/[filename]` (get specific artifact/version) with authentication and session ownership checks.
- **Acceptance Criteria:**
  - [ ] `GET /api/sessions/[sessionId]/artifacts` returns `{ artifacts: AgentArtifact[] }` for authenticated session owner, returns empty array for local session IDs, and handles 401/403/404 appropriately.
  - [ ] `GET /api/sessions/[sessionId]/artifacts/[filename]` supports `?version=N` query param and returns `{ artifact: AgentArtifact, selectedVersion: ArtifactVersion }`.
  - [ ] Integration tests in `tests/artifacts-api.test.ts` verify authenticated access, unauthorized rejection, 404 for missing artifacts, and version filtering.
- **Verification:**
  - [ ] `bun test tests/artifacts-api.test.ts` passes all tests.
  - [ ] `bun run check && bun run lint` succeeds.
- **Dependencies:** Task 1, Task 2
- **Files likely touched:**
  - `src/app/api/sessions/[sessionId]/artifacts/route.ts` (new)
  - `src/app/api/sessions/[sessionId]/artifacts/[filename]/route.ts` (new)
  - `tests/artifacts-api.test.ts` (new)
- **Estimated Scope:** M (3 files)

---

### Checkpoint 2: REST API Routes Verified

- [ ] REST API integration tests pass with 100% assertions satisfied.
- [ ] Session ownership and authentication guards confirmed fail-closed.

---

### Phase 3: Streaming Ingestion & Client State Management

#### Task 4: Stream Accumulator & Chat Adapter Artifact Ingestion

- **Description:** Update `StreamAccumulator` and `yield-content.ts` to ingest `artifact_created` and `artifact_updated` stream events, attaching accumulated artifact metadata to message run results.
- **Acceptance Criteria:**
  - [ ] `StreamAccumulator.handle()` processes `artifact_created` and `artifact_updated` events, updating live artifact tracking.
  - [ ] `createYieldContent` attaches `artifacts` and latest artifact event metadata to message metadata `custom.artifacts`.
  - [ ] Unit tests in `tests/artifacts-stream.test.ts` verify event accumulation, version tracking, and snapshot yield.
- **Verification:**
  - [ ] `bun test tests/artifacts-stream.test.ts` passes all tests.
  - [ ] `bun run check` succeeds.
- **Dependencies:** Task 1, Task 2
- **Files likely touched:**
  - `src/lib/adapters/stream-accumulator.ts`
  - `src/lib/adapters/yield-content.ts`
  - `tests/artifacts-stream.test.ts` (new)
- **Estimated Scope:** M (3 files)

#### Task 5: Artifacts Context & State Hook (`useArtifacts`)

- **Description:** Implement `ArtifactProvider` and `useArtifacts` hook providing complete canvas state (`isOpen`, `activeArtifact`, `selectedVersion`, `activeTab`, `splitRatio`, `isFullscreen`, `isLoading`, `error`) and actions.
- **Acceptance Criteria:**
  - [ ] `ArtifactProvider` manages artifact collection, active selection, version scrubbing, tab state, split ratio, and fullscreen mode.
  - [ ] Automatically hydrates session artifacts via `/api/sessions/[sessionId]/artifacts` when `activeSessionId` changes.
  - [ ] Persists split ratio to `localStorage` (default `0.5`).
  - [ ] Exposes methods: `openArtifact`, `closeCanvas`, `toggleCanvas`, `selectVersion`, `setActiveTab`, `setSplitRatio`, `toggleFullscreen`, `ingestStreamArtifact`, `refreshArtifacts`.
  - [ ] Unit tests in `tests/artifacts-context.test.tsx` verify state transitions, session switching hydration, and version switching.
- **Verification:**
  - [ ] `bun test tests/artifacts-context.test.tsx` passes all tests.
  - [ ] `bun run check` succeeds.
- **Dependencies:** Task 1, Task 3, Task 4
- **Files likely touched:**
  - `src/lib/artifacts/artifact-context.tsx` (new)
  - `tests/artifacts-context.test.tsx` (new)
- **Estimated Scope:** S (2 files)

---

### Checkpoint 3: Stream Processing & Context State Verified

- [ ] Stream accumulator and context state tests pass cleanly.
- [ ] Session switching properly refreshes and isolates artifacts.

---

### Phase 4: Multi-Format Renderers & Utilities

#### Task 6: Sandboxed HTML Iframe & Shiki Code Renderers

- **Description:** Implement safe sandboxed iframe renderer for HTML/JS web applications and Shiki-highlighted code renderer for Python, TypeScript, JSON, and text.
- **Acceptance Criteria:**
  - [ ] `HtmlIframeRenderer` renders content in an `<iframe>` with `sandbox="allow-scripts allow-forms allow-modals allow-popups"`, responsive container, loading state, and error boundary.
  - [ ] `CodeArtifactRenderer` renders syntax-highlighted code via `react-shiki` supporting dark/light mode, line numbers, and a copy button.
  - [ ] Component tests in `tests/artifacts-renderers.test.tsx` verify iframe sandboxing, copy action, and theme switching.
- **Verification:**
  - [ ] `bun test tests/artifacts-renderers.test.tsx` passes.
  - [ ] `bun run check && bun run lint` succeeds.
- **Dependencies:** Task 1
- **Files likely touched:**
  - `src/components/artifacts/renderers/html-iframe-renderer.tsx` (new)
  - `src/components/artifacts/renderers/code-artifact-renderer.tsx` (new)
  - `tests/artifacts-renderers.test.tsx` (new)
- **Estimated Scope:** M (3 files)

#### Task 7: CSV Data Table, SVG Diagram & Markdown Renderers

- **Description:** Implement client-side CSV table parser and viewer with search/sort/pagination, interactive SVG diagram viewer with pan/zoom controls, and formatted Markdown previewer.
- **Acceptance Criteria:**
  - [ ] `csv-parser.ts` safely parses CSV string into headers and rows.
  - [ ] `CsvTableRenderer` displays searchable, sortable, paginated data table with export to CSV/JSON.
  - [ ] `SvgDiagramRenderer` safely renders SVG diagrams with pan, zoom in/out, reset zoom, and download controls.
  - [ ] `MarkdownArtifactRenderer` renders markdown documents using `MarkdownText` / GFM pipeline.
  - [ ] Component tests in `tests/artifacts-renderers-extra.test.tsx` verify CSV parsing/sorting and SVG pan/zoom controls.
- **Verification:**
  - [ ] `bun test tests/artifacts-renderers.test.tsx tests/artifacts-renderers-extra.test.tsx` passes.
  - [ ] `bun run check && bun run lint` succeeds.
- **Dependencies:** Task 1, Task 6
- **Files likely touched:**
  - `src/lib/artifacts/csv-parser.ts` (new)
  - `src/components/artifacts/renderers/csv-table-renderer.tsx` (new)
  - `src/components/artifacts/renderers/svg-diagram-renderer.tsx` (new)
  - `src/components/artifacts/renderers/markdown-artifact-renderer.tsx` (new)
  - `tests/artifacts-renderers-extra.test.tsx` (new)
- **Estimated Scope:** M (5 files)

---

### Checkpoint 4: All Multi-Format Renderers Verified

- [ ] All 5 renderers render their respective MIME types accurately.
- [ ] Iframe sandboxing verified safe against arbitrary parent-window script access.

---

### Phase 5: Split-Pane Canvas, Header Shelf, Inline Triggers & Page Integration

#### Task 8: Version Selector & Split-Pane Canvas Container

- **Description:** Implement `VersionSelector` dropdown and main `ArtifactsCanvas` split-pane container with header controls, tab switcher (`Preview`, `Code`, `Data`), action bar (`Download`, `Copy`, `Maximize`, `Close`), resize divider, and keyboard shortcuts (`Escape`, `Cmd/Ctrl + \`).
- **Acceptance Criteria:**
  - [ ] `VersionSelector` displays current version badge, version history dropdown with timestamps, byte sizes, and version switching.
  - [ ] `ArtifactsCanvas` mounts the top control bar, tab switcher, renderer dispatcher, and action footer.
  - [ ] Keyboard listeners: `Escape` closes canvas, `Cmd/Ctrl + \` toggles canvas.
  - [ ] Draggable split divider adjusts width ratio smoothly.
  - [ ] Component tests in `tests/artifacts-canvas.test.tsx` verify open/close, tab switching, version selection, and keyboard triggers.
- **Verification:**
  - [ ] `bun test tests/artifacts-canvas.test.tsx` passes.
  - [ ] `bun run check && bun run lint` succeeds.
- **Dependencies:** Task 5, Task 6, Task 7
- **Files likely touched:**
  - `src/components/artifacts/version-selector.tsx` (new)
  - `src/components/artifacts/artifacts-canvas.tsx` (new)
  - `tests/artifacts-canvas.test.tsx` (new)
- **Estimated Scope:** M (3 files)

#### Task 9: Top Bar Artifact Shelf & Inline Chat Message Chip

- **Description:** Implement `ArtifactsShelfButton` for top navigation bar with artifact count badge and dropdown, and `ArtifactMessageChip` for inline chat message triggers.
- **Acceptance Criteria:**
  - [ ] `ArtifactsShelfButton` displays `[ 📁 N Artifacts ]` with badge count and dropdown list to open any session artifact; hidden or disabled when count is 0.
  - [ ] `ArtifactMessageChip` displays `[📄 filename • vN]` inside chat messages when an artifact is created/updated; clicking it opens canvas to that artifact and version.
  - [ ] `src/components/assistant-ui/gemini-message.tsx` detects artifact stream events/metadata and renders `ArtifactMessageChip`.
  - [ ] Component tests in `tests/artifacts-triggers.test.tsx` verify shelf badge and inline message chip click interactions.
- **Verification:**
  - [ ] `bun test tests/artifacts-triggers.test.tsx` passes.
  - [ ] `bun run check && bun run lint` succeeds.
- **Dependencies:** Task 5, Task 8
- **Files likely touched:**
  - `src/components/artifacts/artifacts-shelf-button.tsx` (new)
  - `src/components/artifacts/artifact-message-chip.tsx` (new)
  - `src/components/assistant-ui/gemini-message.tsx`
  - `tests/artifacts-triggers.test.tsx` (new)
- **Estimated Scope:** M (4 files)

#### Task 10: Full Split-Pane Page Integration & End-to-End Verification

- **Description:** Wire `ArtifactProvider`, `ArtifactsShelfButton`, and `ArtifactsCanvas` into `src/app/page.tsx` split layout. Ensure keyboard shortcuts, session switching hydration, and mock streaming auto-open work end-to-end.
- **Acceptance Criteria:**
  - [ ] `src/app/page.tsx` integrates `ArtifactProvider`, `ArtifactsShelfButton` in top header, and `ArtifactsCanvas` in split-pane container.
  - [ ] Auto-opens canvas on stream artifact arrival.
  - [ ] Full preflight gate (`bun run preflight`: check, lint, test) passes with 100% clean status.
  - [ ] End-to-end test in `tests/artifacts-e2e.test.tsx` verifies full flow (prompt -> stream artifact -> auto-open canvas -> version switch -> export).
- **Verification:**
  - [ ] `bun run preflight` passes completely.
- **Dependencies:** Tasks 1-9
- **Files likely touched:**
  - `src/app/page.tsx`
  - `tests/artifacts-e2e.test.tsx` (new)
  - `AGENTS.md` (index update)
- **Estimated Scope:** M (3 files)

---

### Checkpoint 5: Complete Implementation & Preflight Gate

- [ ] `bun run check` passes with 0 type errors.
- [ ] `bun run lint` passes with 0 ESLint warnings/errors.
- [ ] `bun run test` passes all tests across entire suite.
- [ ] `bun run preflight` runs cleanly.

---

## 5. Risks and Mitigations

| Risk                                                                | Impact | Mitigation                                                                                                                               |
| ------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Script execution in untrusted HTML artifacts escaping into host DOM | High   | Use strict `sandbox="allow-scripts allow-forms allow-modals allow-popups"` without `allow-same-origin` or `allow-top-navigation`.        |
| Split-pane resizing causing layout thrashing or scroll jumping      | Medium | Use pure CSS flexbox split with min/max bounds (30% to 70%), requestAnimationFrame on mouse drag, and overflow containment.              |
| Large CSV datasets causing UI freeze during client-side parsing     | Medium | Implement lightweight line-by-line parsing with row count limits (e.g. 5,000 max preview rows) and pagination (25/50/100 rows per page). |
| Out-of-sync version history when switching sessions                 | Medium | Clear and re-hydrate artifacts state on `activeSessionId` change in `ArtifactProvider`.                                                  |
| Breaking changes in assistant-ui message metadata structure         | Low    | Attach artifact event payloads under namespaced `custom.artifacts` / `custom.artifactEvent` metadata fields.                             |

---

## 6. Open Questions

- None blocking: The architecture adheres to existing patterns established by Memory and Session State modules in `agent-runtime-ui`.
