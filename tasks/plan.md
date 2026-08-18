# Implementation Plan: Python Code Execution Sandbox & Rich Output Visualizer

## Overview

Implement first-class support for **Vertex AI & ADK Python Code Execution** in `agent-runtime-ui` as specified in [`docs/spec-code-execution.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-code-execution.md). This feature intercepts model-generated Python code blocks (`executable_code`) and their sandboxed execution outcomes (`code_execution_result`), providing structured stream parsing, terminal stdout/stderr rendering with ANSI color support, inline Matplotlib/Seaborn visual plot rendering, and collapsible Gemini-styled cards.

---

## Architecture Decisions

1. **Structured Part Normalization**:
   - Upstream Vertex AI emits `executable_code` (with `language` and `code`) followed by `code_execution_result` (with `outcome`, `output`).
   - Normalization occurs at the single SSE boundary in `src/lib/agent-runtime/sse-parser.ts` and `src/lib/agent-runtime/parse-event.ts`.
2. **State Machine Accumulation**:
   - `StreamAccumulator` pairs contiguous `executable_code` and `code_execution_result` parts into unified `AgentCodeExecutionBlock` items attached to the message custom metadata.
   - Throttled snapshots (25ms) ensure smooth streaming without UI thrashing.
3. **Dual-Theme Highlighting & Dark Monospace Terminal**:
   - Python code is syntax-highlighted via `react-shiki` (`github-light` / `github-dark`).
   - Terminal stdout/stderr outputs are rendered in a dedicated dark monospace console with ANSI-to-HTML colorization for tracebacks.
4. **Rich Plot Visualization**:
   - Extracted base64 PNG/SVG data URLs or GCS image URIs render in an interactive, zoomable, and downloadable plot card.
5. **Auto-Expansion on Error**:
   - If execution fails (`OUTCOME_FAILED`), the card automatically selects and expands the console output tab to immediately highlight the traceback.

---

## Dependency Graph

```
[Types: ExecutableCodeData, CodeExecutionResultData]
                      │
                      ▼
[Output & ANSI Parsers: output-parser.ts, ansi-to-html.ts]
                      │
                      ▼
[Stream & History Parsers: sse-parser.ts, parse-event.ts]
                      │
                      ▼
[Accumulator & Yield: stream-accumulator.ts, yield-content.ts]
                      │
                      ▼
[UI Primitives: CodeViewer, ConsoleOutput, PlotRenderer, StatusBadge]
                      │
                      ▼
[Composite Card & Chat Message: code-execution-card.tsx, gemini-message.tsx]
                      │
                      ▼
[Mock Mode Triggers & End-to-End Verification]
```

---

## Task List

### Phase 1: Foundation (Contracts & Pure Parsers)

#### Task 1: Data Contracts & Type Definitions

**Description:** Define TypeScript interfaces for Python code execution in `src/types/agent/message-parts.ts`, `stream.ts`, and re-export in `src/types/agent.ts`.

**Acceptance criteria:**

- [ ] Define `CodeExecutionLanguage` ("PYTHON" | "JAVASCRIPT" | string).
- [ ] Define `CodeExecutionOutcome` ("OUTCOME_OK" | "OUTCOME_FAILED" | "OUTCOME_DEADLINE_EXCEEDED" | string).
- [ ] Define `ExecutableCodeData`, `CodeExecutionResultData`, and `AgentCodeExecutionBlock`.
- [ ] Extend `AgentStreamEvent` and `BaseAgentMessagePart` with `executable_code` and `code_execution_result` fields.

**Verification:**

- [ ] Typecheck passes: `bun run check`

**Dependencies:** None

**Files likely touched:**

- `src/types/agent/message-parts.ts`
- `src/types/agent/stream.ts`
- `src/types/agent.ts`

**Estimated scope:** Small (2-3 files)

---

#### Task 2: Execution Output & ANSI Log Parsers

**Description:** Create pure helper functions `parseCodeExecutionOutput` and `ansiToHtml` in `src/lib/code-execution/` to extract clean stdout vs. base64/GCS chart images and colorize terminal ANSI error codes.

**Acceptance criteria:**

- [ ] `parseCodeExecutionOutput()` extracts text stdout and an array of base64/GCS image URLs.
- [ ] `ansiToHtml()` converts standard ANSI terminal escape sequences into safe HTML styling for Python tracebacks.
- [ ] Unit tests in `tests/code-execution-parser.test.ts` verify all outcome types, clean output separation, and image extraction.

**Verification:**

- [ ] Tests pass: `bun test tests/code-execution-parser.test.ts`
- [ ] Typecheck passes: `bun run check`

**Dependencies:** Task 1

**Files likely touched:**

- `src/lib/code-execution/output-parser.ts`
- `src/lib/code-execution/ansi-to-html.ts`
- `tests/code-execution-parser.test.ts`

**Estimated scope:** Small (3 files)

---

### Checkpoint 1: Foundation

- [ ] Typecheck (`bun run check`) passes with zero errors.
- [ ] Parser unit tests (`bun test tests/code-execution-parser.test.ts`) pass.

---

### Phase 2: Stream & Session Ingestion Engine

#### Task 3: SSE Stream & Session History Normalization

**Description:** Update `src/lib/agent-runtime/sse-parser.ts` and `src/lib/agent-runtime/parse-event.ts` to parse `executable_code` and `code_execution_result` parts from Vertex AI `:streamQuery` and Sessions REST API history.

**Acceptance criteria:**

- [ ] `parseSseStream` extracts `executable_code` and `code_execution_result` parts into normalized `AgentStreamEvent` objects.
- [ ] `parseRawSessionEvent` extracts code execution blocks from historical session turn parts.
- [ ] `to-thread-messages.ts` transforms historical code execution turns into thread message parts without loss.

**Verification:**

- [ ] Tests pass: `bun test tests/code-execution-stream.test.ts`
- [ ] All existing stream & session tests pass: `bun test tests/sse-parser.test.ts tests/sessions-api.test.ts`

**Dependencies:** Task 1, Task 2

**Files likely touched:**

- `src/lib/agent-runtime/sse-parser.ts`
- `src/lib/agent-runtime/parse-event.ts`
- `src/lib/agent-runtime/to-thread-messages.ts`
- `tests/code-execution-stream.test.ts`

**Estimated scope:** Medium (4 files)

---

#### Task 4: StreamAccumulator & Chat Adapter Integration

**Description:** Update `StreamAccumulator` in `src/lib/adapters/stream-accumulator.ts` and `yield-content.ts` to accumulate code execution blocks and yield them in message metadata snapshots.

**Acceptance criteria:**

- [ ] `StreamAccumulator.handle()` handles `executable_code` and `code_execution_result` events.
- [ ] Pairs active code blocks with incoming execution results by ID or sequence.
- [ ] `createYieldContent()` includes `codeExecutionBlocks` in custom message metadata.
- [ ] In-progress code execution displays `running` status; terminal event sets status to `complete`.

**Verification:**

- [ ] Tests pass: `bun test tests/stream-accumulator.test.ts`
- [ ] Accumulator unit tests pass: `bun test tests/code-execution-accumulator.test.ts`

**Dependencies:** Task 3

**Files likely touched:**

- `src/lib/adapters/stream-accumulator.ts`
- `src/lib/adapters/yield-content.ts`
- `src/lib/adapters/chat-adapter.ts`
- `tests/code-execution-accumulator.test.ts`

**Estimated scope:** Medium (4 files)

---

### Checkpoint 2: Stream & Ingestion Engine

- [ ] All stream ingestion and accumulator tests pass.
- [ ] History hydration tests confirm multi-turn rehydration of code execution cards.

---

### Phase 3: UI Components & Visualizer

#### Task 5: Code Execution UI Primitives

**Description:** Implement modular UI primitives in `src/components/code-execution/` for code viewing, terminal console output, plot rendering, and outcome status badges.

**Acceptance criteria:**

- [ ] `CodeViewer`: Python code with Shiki highlighting, line numbers, and copy button.
- [ ] `ConsoleOutput`: Dark monospace terminal with ANSI traceback styling and stdout copy.
- [ ] `PlotRenderer`: Responsive container displaying generated Matplotlib/Seaborn images with download action.
- [ ] `CodeExecutionStatusBadge`: Status chips (`Exit 0 (OK)` green, `Exit 1 (Failed)` red, `Timeout` amber, `Executing...` blue).

**Verification:**

- [ ] Tests pass: `bun test tests/code-execution-ui.test.tsx`
- [ ] Typecheck passes: `bun run check`

**Dependencies:** Task 2, Task 4

**Files likely touched:**

- `src/components/code-execution/code-viewer.tsx`
- `src/components/code-execution/console-output.tsx`
- `src/components/code-execution/plot-renderer.tsx`
- `src/components/code-execution/code-execution-status-badge.tsx`

**Estimated scope:** Medium (4 files)

---

#### Task 6: Collapsible CodeExecutionCard & Assistant UI Message Mounting

**Description:** Build composite `CodeExecutionCard` and mount it inside `src/components/assistant-ui/gemini-message.tsx`.

**Acceptance criteria:**

- [ ] `CodeExecutionCard` renders header with status badge, duration, and tabs (`Code`, `Console Output`, `Generated Plot`).
- [ ] Auto-expands console output when status is `OUTCOME_FAILED`.
- [ ] Mounted in `gemini-message.tsx` for assistant message turns with code execution blocks.
- [ ] Supports dark and light theme transitions seamlessly.

**Verification:**

- [ ] Tests pass: `bun test tests/code-execution-ui.test.tsx`
- [ ] Assistant UI components pass: `bun test tests/components.test.tsx`

**Dependencies:** Task 5

**Files likely touched:**

- `src/components/code-execution/code-execution-card.tsx`
- `src/components/assistant-ui/gemini-message.tsx`
- `tests/code-execution-ui.test.tsx`

**Estimated scope:** Medium (3 files)

---

### Checkpoint 3: UI & Interaction Verification

- [ ] UI component tests pass with complete coverage of execution states, tabs, and theme variants.
- [ ] Card expands, collapses, copies code, and renders plots cleanly.

---

### Phase 4: Mock Provider & Quality Verification

#### Task 7: Mock Provider Triggers & Offline Parity

**Description:** Enhance `MockAgentRuntimeProvider` in `src/lib/agent-runtime/mock/mock-provider.ts` to support code execution triggers and simulated plot generation in offline mode (`MOCK_AGENT_RUNTIME=true`).

**Acceptance criteria:**

- [ ] Prompt containing "calculate" or "python" triggers mock `executable_code` and `code_execution_result` stream events.
- [ ] Prompt containing "plot" or "chart" generates simulated base64 Matplotlib histogram.
- [ ] Error trigger generates simulated Python traceback with `OUTCOME_FAILED`.

**Verification:**

- [ ] Mock provider integration tests pass: `bun test tests/agent-client.test.ts`

**Dependencies:** Task 6

**Files likely touched:**

- `src/lib/agent-runtime/mock/mock-provider.ts`
- `tests/agent-client.test.ts`

**Estimated scope:** Small (2 files)

---

#### Task 8: End-to-End Quality Gates & Documentation Updates

**Description:** Run comprehensive preflight verification, ensure zero regressions across all 61+ test suites, and update features documentation.

**Acceptance criteria:**

- [ ] `bun run preflight` passes (format, check, lint, vitest tests).
- [ ] All unit and component tests pass without errors or console warnings.
- [ ] `docs/features.md` updated to reflect Python Code Execution as active capability.

**Verification:**

- [ ] `bun run preflight` exits with code 0.

**Dependencies:** Tasks 1-7

**Files likely touched:**

- `docs/features.md`

**Estimated scope:** Small (1 file)

---

### Checkpoint 4: Complete Definition of Done

- [ ] All 8 tasks implemented and checked off in `tasks/todo.md`.
- [ ] 100% strict TypeScript types with zero `any`.
- [ ] Full `bun run preflight` quality gate green.

---

## Risks and Mitigations

| Risk                                           | Impact | Mitigation                                                                                                     |
| :--------------------------------------------- | :----: | :------------------------------------------------------------------------------------------------------------- |
| Large base64 image strings in SSE stream       |  Med   | Output parser extracts base64 regex without blocking stream processing; images are referenced safely in state. |
| Incomplete ANSI color support crashing console |  Low   | Pure ANSI-to-HTML parser strips unsupported escapes and escapes all HTML entities to prevent XSS.              |
| Message re-rendering jitter during streaming   |  Low   | 25ms yield throttle barrier in `StreamAccumulator` batches incremental code tokens.                            |

---

## Open Questions

- None blocking: The data contracts match the official Vertex AI Reasoning Engines and ADK schema in [`docs/spec-code-execution.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-code-execution.md).
