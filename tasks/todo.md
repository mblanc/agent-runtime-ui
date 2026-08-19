# Todo Checklist: Agent Platform Artifacts Service & Live Workspace Canvas

## Phase 1: Data Contracts & Mock Store Foundation

- [x] Task 1: Artifact Domain Types & Stream Event Extension
  - [x] Create `src/types/agent/artifacts.ts` with `ArtifactMimeType`, `ArtifactVersion`, `AgentArtifact`, `ArtifactStreamPayload`, `AgentArtifactListResponse`, `AgentArtifactResponse`
  - [x] Extend `src/types/agent/stream.ts` `AgentStreamEvent` with `"artifact_created" | "artifact_updated"` and `artifact?: ArtifactStreamPayload`
  - [x] Re-export from `src/types/agent.ts`
  - [x] Verify `bun run check`
- [x] Task 2: Artifacts Mock Store, Provider Interface & Stream Triggers
  - [x] Extend `IAgentRuntimeProvider` in `src/lib/agent-runtime/types.ts` with `listArtifacts` and `getArtifact`
  - [x] Populate `mockArtifactsStore` in `src/lib/agent-runtime/mock/mock-store.ts` with rich multi-version sample artifacts
  - [x] Implement `MockAgentRuntimeProvider` artifact methods and streaming triggers in `src/lib/agent-runtime/mock/mock-provider.ts`
  - [x] Create unit tests in `tests/artifacts-store.test.ts`
  - [x] Verify `bun test tests/artifacts-store.test.ts`
- [x] Checkpoint 1: Foundation & Store Verification (`bun run check && bun test tests/artifacts-store.test.ts`)

## Phase 2: BFF REST API Endpoints

- [x] Task 3: Artifacts BFF REST API Routes with Session Ownership
  - [x] Create `src/app/api/sessions/[sessionId]/artifacts/route.ts` (`GET /api/sessions/[sessionId]/artifacts`)
  - [x] Create `src/app/api/sessions/[sessionId]/artifacts/[filename]/route.ts` (`GET /api/sessions/[sessionId]/artifacts/[filename]?version=N`)
  - [x] Add API integration tests in `tests/artifacts-api.test.ts`
  - [x] Verify `bun test tests/artifacts-api.test.ts`
- [x] Checkpoint 2: REST API Routes Verified (`bun run check && bun test tests/artifacts-api.test.ts`)

## Phase 3: Streaming Ingestion & Client State Management

- [x] Task 4: Stream Accumulator & Chat Adapter Artifact Ingestion
  - [x] Ingest `artifact_created` and `artifact_updated` in `src/lib/adapters/stream-accumulator.ts`
  - [x] Attach artifact metadata in `src/lib/adapters/yield-content.ts`
  - [x] Add stream tests in `tests/artifacts-stream.test.ts`
  - [x] Verify `bun test tests/artifacts-stream.test.ts`
- [x] Task 5: Artifacts Context & State Hook (`useArtifacts`)
  - [x] Create `src/lib/artifacts/artifact-context.tsx` with state management, version scrubbing, and session hydration
  - [x] Add context unit tests in `tests/artifacts-context.test.tsx`
  - [x] Verify `bun test tests/artifacts-context.test.tsx`
- [x] Checkpoint 3: Stream Processing & Context State Verified (`bun run check && bun test tests/artifacts-context.test.tsx tests/artifacts-stream.test.ts`)

## Phase 4: Multi-Format Renderers & Utilities

- [x] Task 6: Sandboxed HTML Iframe & Shiki Code Renderers
  - [x] Implement `src/components/artifacts/renderers/html-iframe-renderer.tsx` with strict iframe sandboxing and error boundary
  - [x] Implement `src/components/artifacts/renderers/code-artifact-renderer.tsx` with `react-shiki` dual theme and copy button
  - [x] Add renderer component tests in `tests/artifacts-renderers.test.tsx`
  - [x] Verify `bun test tests/artifacts-renderers.test.tsx`
- [x] Task 7: CSV Data Table, SVG Diagram & Markdown Renderers
  - [x] Implement `src/lib/artifacts/csv-parser.ts` lightweight CSV parser
  - [x] Implement `src/components/artifacts/renderers/csv-table-renderer.tsx` with search, sort, pagination, and export
  - [x] Implement `src/components/artifacts/renderers/svg-diagram-renderer.tsx` with pan, zoom, reset, and SVG download
  - [x] Implement `src/components/artifacts/renderers/markdown-artifact-renderer.tsx` with GFM markdown
  - [x] Add extra renderer component tests in `tests/artifacts-renderers.test.tsx`
  - [x] Verify `bun test tests/artifacts-renderers.test.tsx`
- [x] Checkpoint 4: All Multi-Format Renderers Verified (`bun run check && bun run lint && bun test tests/artifacts-renderers*`)

## Phase 5: Split-Pane Canvas, Header Shelf, Inline Triggers & Page Integration

- [x] Task 8: Version Selector & Split-Pane Canvas Container
  - [x] Implement `src/components/artifacts/version-selector.tsx` version history dropdown
  - [x] Implement `src/components/artifacts/artifacts-canvas.tsx` split-pane container, tab switcher, resize drag, and keyboard shortcuts
  - [x] Add canvas component tests in `tests/artifacts-ui.test.tsx`
  - [x] Verify `bun test tests/artifacts-ui.test.tsx`
- [x] Task 9: Top Bar Artifact Shelf & Inline Chat Message Chip
  - [x] Implement `src/components/artifacts/artifacts-header-button.tsx` header button `[ 📁 N Artifacts ]`
  - [x] Implement `src/components/artifacts/artifact-chip.tsx` inline message trigger
  - [x] Integrate into `src/components/assistant-ui/gemini-message.tsx`
  - [x] Add trigger tests in `tests/artifacts-ui.test.tsx`
  - [x] Verify `bun test tests/artifacts-ui.test.tsx`
- [x] Task 10: Full Split-Pane Page Integration & End-to-End Verification
  - [x] Integrate `ArtifactProvider`, `ArtifactsHeaderButton`, and `ArtifactsCanvas` in `src/app/page.tsx`
  - [x] Update `AGENTS.md` component index
  - [x] Run full preflight verification (`bun run preflight`)
- [x] Checkpoint 5: Complete Implementation & Preflight Gate (`bun run preflight`)
