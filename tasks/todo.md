# A2UI Generative Micro-UIs Task Checklist

- [x] **Phase 1: Foundation & Data Contracts**
  - [x] **Task 1: A2UI TypeScript Contracts & Type Guards** (`src/types/agent/a2ui.ts`, `src/types/agent/message-parts.ts`, `src/types/agent.ts`)
  - [x] **Task 2: A2UI Tree Parser & Normalizer with Fallbacks** (`src/lib/a2ui/a2ui-parser.ts`, `tests/a2ui-parser.test.ts`)
  - [x] **Checkpoint: Foundation** (Verified `bun run check` and `bun run test tests/a2ui-parser.test.ts`)

- [x] **Phase 2: Component Catalog Primitives**
  - [x] **Task 3: A2UI Context, Card Container & Typography Components** (`src/components/a2ui/a2ui-context.tsx`, `a2ui-renderer.tsx`, `a2ui-fallback.tsx`, `catalog/a2ui-card.tsx`, `catalog/a2ui-typography.tsx`)
  - [x] **Task 4: A2UI Metrics, Badges, Table & Mini-Charts** (`src/components/a2ui/catalog/a2ui-stat-metric.tsx`, `catalog/a2ui-table.tsx`, `catalog/a2ui-mini-chart.tsx`, `tests/a2ui-catalog.test.tsx`)
  - [x] **Task 5: A2UI Form Controls, Inputs & Action Buttons** (`src/components/a2ui/catalog/a2ui-button.tsx`, `catalog/a2ui-form.tsx`, `catalog/a2ui-inputs.tsx`)
  - [x] **Checkpoint: Component Catalog** (Verified `bun run test tests/a2ui-catalog.test.tsx`, `bun run check`, `bun run lint`)

- [x] **Phase 3: Runtime Streaming & Message Integration**
  - [x] **Task 6: StreamAccumulator & ChatAdapter A2UI Ingestion** (`src/lib/adapters/stream-accumulator.ts`, `src/lib/adapters/yield-content.ts`, `src/lib/adapters/chat-adapter.ts`, `tests/a2ui-stream.test.ts`)
  - [x] **Task 7: GeminiMessage A2UI Mounting & Action Dispatch Wiring** (`src/components/assistant-ui/gemini-message.tsx`, `src/components/a2ui/a2ui-message-part.tsx`, `tests/a2ui-ui.test.tsx`)
  - [x] **Checkpoint: Runtime & Message Integration** (Verified `bun run test tests/a2ui-stream.test.ts tests/a2ui-ui.test.tsx`)

- [x] **Phase 4: Mock Engine & Backend Action Handling**
  - [x] **Task 8: Mock Provider A2UI Triggers & Action Resumption** (`src/lib/agent-runtime/mock/mock-provider.ts`, `tests/agent-client.test.ts`)
  - [x] **Task 9: Multi-Turn Session Persistence for A2UI Parts** (`src/lib/agent-runtime/parse-event.ts`, `group-turns.ts`, `session-adapter.tsx`, `tests/a2ui-session.test.ts`)
  - [x] **Checkpoint: Backend & Mock** (Verified `bun run test tests/a2ui-session.test.ts tests/agent-client.test.ts`)

- [x] **Phase 5: Quality Gates & Verification**
  - [x] **Task 10: Full Quality Gate Preflight, E2E Test & Docs Sync** (`tests/e2e/a2ui.spec.ts`, `AGENTS.md`)
  - [x] **Checkpoint: Complete** (Verify `bun run preflight`)
