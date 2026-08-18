# Todo: Python Code Execution Sandbox & Rich Output Visualizer

## Phase 1: Foundation (Contracts & Pure Parsers)

- [x] **Task 1**: Data Contracts & Type Definitions (`src/types/agent/message-parts.ts`, `src/types/agent/stream.ts`, `src/types/agent.ts`, `src/types/agent/agents.ts`)
- [x] **Task 2**: Execution Output & ANSI Log Parsers (`src/lib/code-execution/output-parser.ts`, `src/lib/code-execution/ansi-to-html.ts`, `tests/code-execution-parser.test.ts`)
- [x] **Checkpoint 1**: Foundation verification (`bun test tests/code-execution-parser.test.ts` & `bun run check`)

## Phase 2: Stream & Session Ingestion Engine

- [x] **Task 3**: SSE Stream & Session History Normalization (`src/lib/agent-runtime/sse-parser.ts`, `src/lib/agent-runtime/parse-event.ts`, `src/lib/agent-runtime/to-thread-messages.ts`, `src/lib/agent-runtime/group-turns.ts`, `tests/code-execution-stream.test.ts`)
- [x] **Task 4**: StreamAccumulator & Chat Adapter Integration (`src/lib/adapters/stream-accumulator.ts`, `src/lib/adapters/yield-content.ts`, `src/lib/session-adapter.tsx`, `tests/code-execution-accumulator.test.ts`)
- [x] **Checkpoint 2**: Stream & Ingestion Engine verification (`bun run test tests/code-execution-stream.test.ts` & `bun run test tests/code-execution-accumulator.test.ts`)

## Phase 3: UI Components & Visualizer

- [x] **Task 5**: Code Execution UI Primitives (`src/components/code-execution/code-editor-panel.tsx`, `console-output-panel.tsx`, `plot-viewer-panel.tsx`, `index.ts`)
- [x] **Task 6**: Collapsible CodeExecutionCard & Assistant UI Integration (`src/components/code-execution/code-execution-card.tsx`, `src/components/assistant-ui/gemini-message.tsx`, `tests/code-execution-ui.test.tsx`)
- [x] **Checkpoint 3**: UI & Interaction verification (`bun run test tests/code-execution-ui.test.tsx`)

## Phase 4: Mock Provider & Quality Verification

- [x] **Task 7**: Mock Provider Triggers & Offline Parity (`src/lib/agent-runtime/mock/mock-provider.ts`, `tests/code-execution-mock.test.ts`)
- [x] **Task 8**: End-to-End Quality Gates & Adapter Integration (`tests/code-execution-adapter.test.ts`, `bun run preflight`)
- [x] **Checkpoint 4**: Complete Definition of Done (`bun run preflight` exits with 0, 67 test files and 635 tests passing)
