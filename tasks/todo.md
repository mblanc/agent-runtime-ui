# Skill Ingestion Visualizer & Metadata Inspector Task Checklist

- [x] **Phase 1: Foundation & Data Contracts**
  - [x] **Task 1: Skill Ingestion TypeScript Contracts & Type Guards** (`src/types/agent/skills.ts`, `src/types/agent/messages.ts`, `src/types/agent.ts`)
  - [x] **Task 2: Skill Payload Parser & Normalizer with Fallbacks** (`src/lib/skills/skill-parser.ts`, `tests/skills-parser.test.ts`)
  - [x] **Checkpoint: Foundation** (Verified `bun run check` and `bun run test tests/skills-parser.test.ts`)

- [x] **Phase 2: UI Components (Badges & Metadata Card)**
  - [x] **Task 3: Skill Loaded Badge & Metadata Card Components** (`src/components/skills/skill-metadata-card.tsx`, `skill-loaded-badge.tsx`, `index.ts`)
  - [x] **Task 4: Search Skills Pill & Component Test Suite** (`src/components/skills/search-skills-pill.tsx`, `tests/skills-ui.test.tsx`)
  - [x] **Checkpoint: UI Components** (Verified `bun run test tests/skills-ui.test.tsx`, `bun run check`, `bun run lint`)

- [x] **Phase 3: Reasoning Trace & Tool Integration**
  - [x] **Task 5: Reasoning Trace & Tool Fallback Skill Routing** (`src/components/assistant-ui/reasoning.tsx`, `src/lib/agent-runtime/reasoning-directives.ts`, `src/components/assistant-ui/tool-fallback.tsx`, `src/components/assistant-ui/tool-collapsible.tsx`)
  - [x] **Task 6: StreamAccumulator & ChatAdapter Skill Stream Ingestion** (`src/lib/adapters/stream-accumulator.ts`, `tests/skills-stream.test.ts`)
  - [x] **Checkpoint: Reasoning & Streaming** (Verified `bun run test tests/skills-stream.test.ts`, `bun run check`)

- [x] **Phase 4: Mock Provider & Multi-Turn History Replay**
  - [x] **Task 7: Mock Provider Skill Ingestion Triggers & Scenarios** (`src/lib/agent-runtime/mock/mock-provider.ts`)
  - [x] **Task 8: Session History Rehydration & Turn Grouping for Skills** (`src/lib/agent-runtime/group-turns.ts`, `src/lib/agent-runtime/parse-event.ts`, `tests/skills-session.test.ts`)
  - [x] **Checkpoint: Backend & Mock** (Verified `bun run test tests/skills-session.test.ts`, `bun run check`)

- [x] **Phase 5: Quality Gates & Verification**
  - [x] **Task 9: Full Quality Gate Preflight, E2E Test & Docs Sync** (`AGENTS.md`, `tasks/plan.md`, `tasks/todo.md`)
  - [x] **Checkpoint: Complete** (Verified `bun run preflight`: format, check, lint, 87 test suites / 763 tests passed)
