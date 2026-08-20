# Implementation Plan: A2UI (Agent-to-UI / Generative UI Streaming)

## Overview

Implement the **A2UI Protocol** (`application/json+a2ui`) in `agent-runtime-ui`, enabling Google Cloud ADK agents to stream structured JSON UI component trees that render native interactive cards, form controls, metric grids, and mini-charts directly inside chat messages, with two-way interactive action dispatch back to the agent session.

---

## Architecture Decisions

1. **Wire Format & Data Contracts (`src/types/agent/a2ui.ts`)**:
   - Deliver A2UI payloads inside `AgentMessagePart` with `type: "a2ui"` or `a2uiData: A2UIPartData`.
   - Adhere strictly to the recursive `A2UIComponentNode` contract (`type`, `id`, `props`, `children`, `actions`).
   - Support `application/json+a2ui` payload parsing from SSE events, tool results, and session history events.

2. **Action Dispatch Protocol (`A2UIContext` & `/api/chat`)**:
   - Interacting with an A2UI component (button click, form submit) locks the component into a `submitted` / `disabled` state with an inline status indicator to prevent duplicate submissions.
   - The action dispatches a structured user turn over `/api/chat` with `{ role: "user", content: "Action: ...", parts: [{ a2uiAction: { componentId, event, payload } }] }`.

3. **Component Catalog & Graceful Fallback (`src/components/a2ui/`)**:
   - Built with Tailwind CSS and Radix UI primitives (`@radix-ui/react-select`, `@radix-ui/react-radio-group`), styled after Google Gemini design tokens.
   - Any unrecognized component type renders an `A2UIFallback` structured card rather than throwing errors.

4. **Stream Accumulator & Mock Parity**:
   - `StreamAccumulator` folds A2UI stream events and exposes them via `createYieldContent`.
   - `MockAgentRuntimeProvider` provides realistic mock prompts (e.g., _"Show me the deployment approval card"_, _"Show server metrics"_) and handles action resumption turns offline.

---

## Dependency Graph

```
Phase 1: Types & Parser Foundation
  ├── Task 1: A2UI TypeScript Contracts & Type Guards
  └── Task 2: A2UI Tree Parser & Normalizer with Fallbacks
        │
Phase 2: Component Catalog Primitives
  ├── Task 3: A2UI Context, Card Container & Typography Components
  ├── Task 4: A2UI Metrics, Badges, Table & Mini-Charts
  └── Task 5: A2UI Form Controls, Inputs & Action Buttons
        │
Phase 3: Runtime Streaming & Message Integration
  ├── Task 6: StreamAccumulator & ChatAdapter A2UI Ingestion
  └── Task 7: GeminiMessage A2UI Mounting & Action Dispatch Wiring
        │
Phase 4: Mock Engine & Backend Action Handling
  ├── Task 8: Mock Provider A2UI Triggers & Action Resumption
  └── Task 9: Multi-Turn Session Persistence for A2UI Parts
        │
Phase 5: Quality Gates & Verification
  └── Task 10: End-to-End Test Suite, E2E Scenarios & Docs Update
```

---

## Task List

### Phase 1: Foundation & Data Contracts

#### Task 1: A2UI TypeScript Contracts & Type Guards

**Description:** Define strict TypeScript interfaces for A2UI components, action payloads, part data, and message part extensions in `src/types/agent/a2ui.ts` and barrel re-export in `src/types/agent.ts`.

**Acceptance criteria:**

- [ ] `A2UIComponentType`, `A2UIAction`, `A2UIComponentNode`, `A2UIPartData`, and `AgentA2UIActionPart` defined with zero `any`.
- [ ] `isA2UIPart` type guard implemented in `src/types/agent/message-parts.ts`.
- [ ] Re-exported cleanly via `src/types/agent.ts`.

**Verification:**

- [ ] `bun run check` succeeds without type errors.

**Dependencies:** None  
**Files likely touched:**

- `src/types/agent/a2ui.ts` (new)
- `src/types/agent/message-parts.ts`
- `src/types/agent.ts`

**Estimated scope:** Small (3 files)

---

#### Task 2: A2UI Tree Parser & Normalizer with Fallbacks

**Description:** Implement `parseA2UIPayload` and recursive tree validation utilities to safely parse raw JSON strings and objects into validated `A2UIPartData` structures.

**Acceptance criteria:**

- [ ] Safely parses JSON strings, arrays of nodes, single nodes, and nested trees.
- [ ] Returns sanitized `A2UIPartData` with default fallbacks for missing `type` or malformed `children`.
- [ ] Unit tests cover valid, malformed, deeply nested, and empty payloads.

**Verification:**

- [ ] Tests pass: `bun run test tests/a2ui-parser.test.ts`
- [ ] Type check passes: `bun run check`

**Dependencies:** Task 1  
**Files likely touched:**

- `src/lib/a2ui/a2ui-parser.ts` (new)
- `tests/a2ui-parser.test.ts` (new)

**Estimated scope:** Small (2 files)

---

### Checkpoint: Foundation

- [ ] `bun run check` passes
- [ ] `bun run test tests/a2ui-parser.test.ts` passes

---

### Phase 2: Component Catalog Primitives

#### Task 3: A2UI Context, Card Container & Typography Components

**Description:** Create `A2UIContext` for action dispatch and state tracking, root `A2UIRenderer`, `A2UIFallback`, `A2UICard`, `A2UIHeading`, `A2UIText`, `A2UIBadge`, and `A2UIDivider`.

**Acceptance criteria:**

- [ ] `A2UIContext` tracks submitted component states and provides `onAction` dispatch callback.
- [ ] `A2UIRenderer` recursively dispatches component nodes to catalog components.
- [ ] `A2UICard` renders header, title, badge, and body container with Gemini styling tokens.
- [ ] Unknown node types render `A2UIFallback` with sanitized JSON preview.

**Verification:**

- [ ] Tests pass: `bun run test tests/a2ui-catalog.test.tsx`
- [ ] Type check passes: `bun run check`

**Dependencies:** Task 2  
**Files likely touched:**

- `src/components/a2ui/a2ui-context.tsx` (new)
- `src/components/a2ui/a2ui-renderer.tsx` (new)
- `src/components/a2ui/a2ui-fallback.tsx` (new)
- `src/components/a2ui/catalog/a2ui-card.tsx` (new)
- `src/components/a2ui/catalog/a2ui-typography.tsx` (new)

**Estimated scope:** Medium (5 files)

---

#### Task 4: A2UI Metrics, Badges, Table & Mini-Charts

**Description:** Implement `A2UIStatMetric`, `A2UITable`, `A2UIProgressBar`, and `A2UIMiniBarChart` lightweight SVG components.

**Acceptance criteria:**

- [ ] `A2UIStatMetric` renders key-value cards with optional change percentage pills (`+12%`, `-5%`).
- [ ] `A2UITable` renders compact, accessible tables with column headers and striped/hover rows.
- [ ] `A2UIProgressBar` and `A2UIMiniBarChart` render clean SVG visuals with theme support.

**Verification:**

- [ ] Tests pass: `bun run test tests/a2ui-catalog.test.tsx`
- [ ] Type check passes: `bun run check`

**Dependencies:** Task 3  
**Files likely touched:**

- `src/components/a2ui/catalog/a2ui-stat-metric.tsx` (new)
- `src/components/a2ui/catalog/a2ui-table.tsx` (new)
- `src/components/a2ui/catalog/a2ui-mini-chart.tsx` (new)
- `tests/a2ui-catalog.test.tsx` (new)

**Estimated scope:** Medium (4 files)

---

#### Task 5: A2UI Form Controls, Inputs & Action Buttons

**Description:** Implement `A2UIForm`, `A2UITextInput`, `A2UISelectDropdown`, `A2UIRadioGroup`, and `A2UIButton` with interactive state management and submission locking.

**Acceptance criteria:**

- [ ] `A2UIButton` renders primary, outline, and destructive variants; shows loading spinner while dispatching; disables on submit.
- [ ] `A2UIForm` collects values from child inputs and dispatches aggregated payload on submit.
- [ ] `A2UITextInput`, `A2UISelectDropdown`, and `A2UIRadioGroup` bind state to form context or standalone action triggers.

**Verification:**

- [ ] Tests pass: `bun run test tests/a2ui-catalog.test.tsx`
- [ ] Type check passes: `bun run check`

**Dependencies:** Task 3, Task 4  
**Files likely touched:**

- `src/components/a2ui/catalog/a2ui-button.tsx` (new)
- `src/components/a2ui/catalog/a2ui-form.tsx` (new)
- `src/components/a2ui/catalog/a2ui-inputs.tsx` (new)
- `tests/a2ui-catalog.test.tsx`

**Estimated scope:** Medium (4 files)

---

### Checkpoint: Component Catalog

- [ ] All catalog unit and component tests pass (`tests/a2ui-catalog.test.tsx`)
- [ ] `bun run check` and `bun run lint` pass

---

### Phase 3: Runtime Streaming & Message Integration

#### Task 6: StreamAccumulator & ChatAdapter A2UI Ingestion

**Description:** Extend `StreamAccumulator` and `createYieldContent` to parse incoming `application/json+a2ui` SSE parts, tool outputs, and custom stream events, carrying A2UI payload trees in the snapshot metadata.

**Acceptance criteria:**

- [ ] `StreamAccumulator` detects and accumulates `a2ui` stream parts without breaking text/thought streaming.
- [ ] `createYieldContent` includes `a2ui` data in message metadata.
- [ ] `toAgentMessages` in `chat-adapter.ts` formats outgoing `a2uiAction` user turns into structured agent wire turns.

**Verification:**

- [ ] Tests pass: `bun run test tests/a2ui-stream.test.ts tests/stream-accumulator.test.ts`
- [ ] Type check passes: `bun run check`

**Dependencies:** Task 2  
**Files likely touched:**

- `src/lib/adapters/stream-accumulator.ts`
- `src/lib/adapters/yield-content.ts`
- `src/lib/adapters/chat-adapter.ts`
- `tests/a2ui-stream.test.ts` (new)

**Estimated scope:** Medium (4 files)

---

#### Task 7: GeminiMessage A2UI Mounting & Action Dispatch Wiring

**Description:** Mount `A2UIRenderer` inside `src/components/assistant-ui/gemini-message.tsx` wrapped in `A2UIProvider` that connects action dispatches to the assistant-ui composer/runtime.

**Acceptance criteria:**

- [ ] Assistant messages containing `a2ui` parts render the interactive widget inline below or alongside markdown text.
- [ ] Clicking buttons or submitting forms triggers the action dispatch handler, locks the component, and appends a user turn to the active thread.
- [ ] User messages display a clean summary chip when representing an A2UI action response (similar to HITL confirmations).

**Verification:**

- [ ] Tests pass: `bun run test tests/a2ui-ui.test.tsx`
- [ ] Type check passes: `bun run check`

**Dependencies:** Task 5, Task 6  
**Files likely touched:**

- `src/components/assistant-ui/gemini-message.tsx`
- `src/components/a2ui/a2ui-message-part.tsx` (new)
- `tests/a2ui-ui.test.tsx` (new)

**Estimated scope:** Small (3 files)

---

### Checkpoint: Runtime & Message Integration

- [ ] Stream accumulation and message rendering tests pass
- [ ] Interactive action dispatches trigger user turns in mock tests

---

### Phase 4: Mock Engine & Backend Action Handling

#### Task 8: Mock Provider A2UI Triggers & Action Resumption

**Description:** Add mock scenarios in `MockAgentRuntimeProvider` that emit A2UI component trees (e.g. Cloud Run deployment approval card, database configuration form, cluster metrics) and handle action response turns.

**Acceptance criteria:**

- [ ] Prompt _"Show me the deployment approval card"_ yields an A2UI deployment card with buttons.
- [ ] Prompt _"Show cluster metrics"_ yields an A2UI stat metric and mini-chart widget.
- [ ] Dispatching `submit_approval` or form actions resumes the stream with confirmation text in mock mode.

**Verification:**

- [ ] Tests pass: `bun run test tests/a2ui-mock.test.ts`
- [ ] Type check passes: `bun run check`

**Dependencies:** Task 6, Task 7  
**Files likely touched:**

- `src/lib/agent-runtime/mock/mock-provider.ts`
- `src/lib/agent-runtime/mock/mock-store.ts`
- `tests/a2ui-mock.test.ts` (new)

**Estimated scope:** Small (3 files)

---

#### Task 9: Multi-Turn Session Persistence for A2UI Parts

**Description:** Ensure that session event loading and rehydration (`/api/sessions/[sessionId]`) correctly restores A2UI component trees in historical turns.

**Acceptance criteria:**

- [ ] Historical session turns with `application/json+a2ui` parts rehydrate and render A2UI widgets with submitted/disabled state.
- [ ] Event normalizer in `session-service.ts` converts stored A2UI events into `AgentMessagePart`.

**Verification:**

- [ ] Tests pass: `bun run test tests/sessions-api.test.ts tests/event-normalizer.test.ts`
- [ ] Type check passes: `bun run check`

**Dependencies:** Task 8  
**Files likely touched:**

- `src/lib/agent-runtime/services/session-service.ts`
- `src/lib/agent-runtime/event-normalizer.ts`
- `tests/a2ui-session-history.test.ts` (new)

**Estimated scope:** Small (3 files)

---

### Phase 5: Quality Gates & Verification

#### Task 10: Full Quality Gate Preflight, E2E Test & Docs Sync

**Description:** Run comprehensive quality gates, add Playwright E2E test for A2UI card interaction, and update documentation.

**Acceptance criteria:**

- [ ] `bun run preflight` passes (format + check + lint + all unit/component tests).
- [ ] Playwright E2E test in `tests/e2e/a2ui-interaction.spec.ts` verifies interactive card rendering and approval click in mock mode.
- [ ] `docs/features.md` updated to mark A2UI as **Now (Available Today)**.

**Verification:**

- [ ] `bun run preflight` passes with zero errors
- [ ] `bun run test:e2e` passes

**Dependencies:** Tasks 1-9  
**Files likely touched:**

- `tests/e2e/a2ui-interaction.spec.ts` (new)
- `docs/features.md`
- `AGENTS.md`

**Estimated scope:** Small (3 files)

---

## Checkpoint: Complete

- [ ] All 10 tasks complete with passing tests
- [ ] `bun run preflight` passes cleanly
- [ ] Interactive demo verified in browser

---

## Risks and Mitigations

| Risk                                                                                      | Impact | Mitigation                                                                                                   |
| :---------------------------------------------------------------------------------------- | :----: | :----------------------------------------------------------------------------------------------------------- |
| **Malformed JSON in Stream**: LLM or engine streams partial or invalid A2UI JSON          |  Med   | Safe parser (`parseA2UIPayload`) with graceful fallback to `A2UIFallback` card view; never crashes stream.   |
| **Double Submission**: User rapidly clicks action buttons or submits forms multiple times |  High  | Immediate optimistic lock in `A2UIContext` disabling inputs/buttons upon first click with loading indicator. |
| **Arbitrary JS Injection**: Untrusted payloads attempting script execution                |  High  | Strict component whitelist; zero `eval`, `dangerouslySetInnerHTML`, or unsandboxed iframes.                  |
| **Stream Performance / Jank**: Re-rendering deep component trees on every token delta     |  Low   | Memoize catalog components and decouple A2UI part accumulation from text stream throttling (25ms barrier).   |

---

## Open Questions

- None. The specification in [`docs/spec-a2ui-generative-ui.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-a2ui-generative-ui.md) provides complete schema and UX requirements.
