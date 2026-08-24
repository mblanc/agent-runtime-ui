# Implementation Plan: Skill Ingestion Visualizer & Metadata Inspector

## Overview

Implement the **Skill Ingestion Visualizer & Metadata Inspector** in `agent-runtime-ui`, detecting when Google Cloud ADK agents dynamically discover and mount remote skills from the Google Cloud Skill Registry (`adk.dev/integrations/skills-registry/`) via `search_skills` and `load_skill` tools. The UI replaces raw JSON tool dumps with a styled Gemini capability badge (`[ 🧩 Skill Loaded: name vX.Y ]`) and expandable metadata inspector card within the agent's thinking trace, displaying human-readable descriptions, authors, licenses, and unlocked tool chips.

---

## Architecture Decisions

1. **Wire Format & Data Contracts (`src/types/agent/skills.ts`)**:
   - Define `LoadedSkillMetadata`, `SkillSearchMatch`, and `SkillStreamEventPayload` adhering to the ADK Skill Registry spec.
   - Extend `ReasoningTraceEntry` in `src/types/agent/messages.ts` with `{ type: "skill_loaded"; skill: LoadedSkillMetadata; status: "running" | "complete" }` and `{ type: "skill_search"; query: string; matches?: SkillSearchMatch[]; status: "running" | "complete" }` so that thinking traces handle dynamic skill ingestion natively as structured data.

2. **Resilient Payload Parser (`src/lib/skills/skill-parser.ts`)**:
   - Normalize both `snake_case` (ADK/Python tool convention: `skill_name`, `instructions_snippet`, `unlocked_tools`) and `camelCase` (`skillName`, `instructionsSnippet`, `tools`).
   - Extract skill metadata from either `tool_call.args`, `tool_result.result`, or structured session events.
   - Provide graceful fallback: if a `load_skill` event lacks extended metadata, render available fields cleanly without crashing the stream or session history.

3. **Gemini Design System UI Components (`src/components/skills/`)**:
   - `SkillLoadedBadge`: Compact purple/indigo pill (`bg-purple-500/10 text-purple-700 dark:text-purple-300`) with jigsaw puzzle icon (`🧩` / `Boxes` / `Sparkles`), skill display name, version tag, and toggle trigger.
   - `SkillMetadataCard`: Rich card displaying description snippet from `SKILL.md` frontmatter, author, license, revision ID, and interactive tool chips for all unlocked tools.
   - `SearchSkillsPill`: Subtle indicator showing registry queries (e.g. _"🔍 Searched Skill Registry for: 'bigquery optimization'"_) with match count.

4. **Stream Accumulator & Session Rehydration**:
   - `StreamAccumulator` intercepts `load_skill` and `search_skills` tool calls and results, assembling structured `skill_loaded` and `skill_search` reasoning entries.
   - `groupTurnSessionEvents` and `parseRawSessionEvent` rehydrate skill metadata during multi-turn session history replay.
   - `ToolFallback` routes `load_skill` and `search_skills` tool calls outside reasoning to the specialized badge.

5. **Mock Provider Parity (`src/lib/agent-runtime/mock/mock-provider.ts`)**:
   - Provide an offline mock scenario (e.g. queries for _"BigQuery"_, _"load skill"_, or _"skill registry"_) that emits `search_skills` and `load_skill` events with full metadata for `bigquery-analyzer` v2.1.0.

---

## Dependency Graph

```
Phase 1: Foundation & Data Contracts
  ├── Task 1: Skill Ingestion TypeScript Contracts & Type Guards
  └── Task 2: Skill Payload Parser & Normalizer with Fallbacks
        │
Phase 2: UI Components (Badges & Metadata Card)
  ├── Task 3: Skill Loaded Badge & Metadata Card Components
  └── Task 4: Search Skills Pill & Component Test Suite
        │
Phase 3: Reasoning Trace & Tool Integration
  ├── Task 5: Reasoning Trace & Tool Fallback Skill Routing
  └── Task 6: StreamAccumulator & ChatAdapter Skill Stream Ingestion
        │
Phase 4: Mock Provider & Multi-Turn History Replay
  ├── Task 7: Mock Provider Skill Ingestion Triggers & Scenarios
  └── Task 8: Session History Rehydration & Turn Grouping for Skills
        │
Phase 5: Quality Gates & Verification
  └── Task 9: Full Quality Gate Preflight, E2E Test & Docs Sync
```

---

## Task List

### Phase 1: Foundation & Data Contracts

#### Task 1: Skill Ingestion TypeScript Contracts & Type Guards

**Description:** Define strict TypeScript interfaces for loaded skills, search matches, and skill event payloads in `src/types/agent/skills.ts`. Extend `ReasoningTraceEntry` in `src/types/agent/messages.ts` and barrel re-export through `src/types/agent.ts`.

**Acceptance criteria:**

- [ ] `LoadedSkillMetadata`, `SkillSearchMatch`, and `SkillStreamEventPayload` defined with strict types and zero `any`.
- [ ] `ReasoningTraceEntry` extended to support `skill_loaded` and `skill_search` entries.
- [ ] Barrel re-exported cleanly via `src/types/agent.ts`.

**Verification:**

- [ ] `bun run check` succeeds with zero TypeScript errors.

**Dependencies:** None  
**Files likely touched:**

- `src/types/agent/skills.ts` (new)
- `src/types/agent/messages.ts`
- `src/types/agent.ts`

**Estimated scope:** Small (3 files)

---

#### Task 2: Skill Payload Parser & Normalizer with Fallbacks

**Description:** Implement `src/lib/skills/skill-parser.ts` to parse and normalize tool arguments and results from `load_skill` and `search_skills` tool events, handling both snake_case and camelCase keys, missing fields, and raw JSON strings.

**Acceptance criteria:**

- [ ] `parseLoadedSkillPayload(args, result)` safely extracts `LoadedSkillMetadata` from snake_case (`skill_name`, `instructions_snippet`, `unlocked_tools`) and camelCase (`skillName`, `instructionsSnippet`, `tools`).
- [ ] `parseSearchSkillsPayload(args, result)` extracts query and search match list.
- [ ] `isLoadSkillTool(toolName)` and `isSearchSkillsTool(toolName)` identify skill tool names.
- [ ] Unit tests in `tests/skills-parser.test.ts` verify valid, partial, and malformed payloads without throwing.

**Verification:**

- [ ] Tests pass: `bun run test tests/skills-parser.test.ts`
- [ ] Type check passes: `bun run check`

**Dependencies:** Task 1  
**Files likely touched:**

- `src/lib/skills/skill-parser.ts` (new)
- `tests/skills-parser.test.ts` (new)

**Estimated scope:** Small (2 files)

---

### Checkpoint: Foundation

- [ ] All parser unit tests pass (`bun run test tests/skills-parser.test.ts`)
- [ ] TypeScript typecheck passes (`bun run check`)

---

### Phase 2: UI Components (Badges & Metadata Card)

#### Task 3: Skill Loaded Badge & Metadata Card Components

**Description:** Build `SkillLoadedBadge` and `SkillMetadataCard` in `src/components/skills/` using Tailwind CSS and Radix UI primitives, following Google Gemini design tokens with purple/indigo capability styling.

**Acceptance criteria:**

- [ ] `SkillLoadedBadge` renders compact pill with puzzle icon (`🧩`), skill name, version badge (`v2.1.0`), status indicator (running spinner or completed check), and expand button.
- [ ] `SkillMetadataCard` renders description from `SKILL.md` frontmatter, author, license, revision ID, and interactive chips for unlocked tools.
- [ ] Expanding/collapsing badge shows/hides the metadata card smoothly.

**Verification:**

- [ ] `bun run check` succeeds with zero TypeScript errors.

**Dependencies:** Task 1, Task 2  
**Files likely touched:**

- `src/components/skills/skill-metadata-card.tsx` (new)
- `src/components/skills/skill-loaded-badge.tsx` (new)
- `src/components/skills/index.ts` (new)

**Estimated scope:** Medium (3 files)

---

#### Task 4: Search Skills Pill & UI Component Tests

**Description:** Build `SearchSkillsPill` in `src/components/skills/` to display registry searches, and create a comprehensive component test suite in `tests/skills-ui.test.tsx`.

**Acceptance criteria:**

- [ ] `SearchSkillsPill` renders search query and match count pill (e.g. _"🔍 Searched Skill Registry for: 'bigquery optimization'"_).
- [ ] `tests/skills-ui.test.tsx` tests `SkillLoadedBadge`, `SkillMetadataCard`, and `SearchSkillsPill` for rendering, expanding, and edge cases (missing version/author/tools).

**Verification:**

- [ ] Tests pass: `bun run test tests/skills-ui.test.tsx`
- [ ] Lint passes: `bun run lint`

**Dependencies:** Task 3  
**Files likely touched:**

- `src/components/skills/search-skills-pill.tsx` (new)
- `tests/skills-ui.test.tsx` (new)

**Estimated scope:** Small (2 files)

---

### Checkpoint: UI Components

- [ ] Component test suite passes (`bun run test tests/skills-ui.test.tsx`)
- [ ] Type check and lint pass clean (`bun run check && bun run lint`)

---

### Phase 3: Reasoning Trace & Tool Integration

#### Task 5: Reasoning Trace & Tool Fallback Skill Routing

**Description:** Update `src/components/assistant-ui/reasoning.tsx`, `src/lib/agent-runtime/reasoning-directives.ts`, and `src/components/assistant-ui/tool-fallback.tsx` to render specialized skill badges for `skill_loaded` and `skill_search` entries.

**Acceptance criteria:**

- [ ] `ReasoningTraceBlocks` renders `SkillLoadedBadge` for `skill_loaded` trace entries and `SearchSkillsPill` for `skill_search` entries.
- [ ] `reasoning-directives.ts` supports formatting skill directives for string fallback representation.
- [ ] `ToolFallback` routes `load_skill` and `search_skills` tool parts to `SkillLoadedBadge` and `SearchSkillsPill`.

**Verification:**

- [ ] Tests pass: `bun run test tests/components.test.tsx`
- [ ] Type check passes: `bun run check`

**Dependencies:** Task 3, Task 4  
**Files likely touched:**

- `src/components/assistant-ui/reasoning.tsx`
- `src/lib/agent-runtime/reasoning-directives.ts`
- `src/components/assistant-ui/tool-fallback.tsx`

**Estimated scope:** Medium (3 files)

---

#### Task 6: StreamAccumulator & ChatAdapter Skill Stream Ingestion

**Description:** Update `StreamAccumulator` in `src/lib/adapters/stream-accumulator.ts` to detect `load_skill` and `search_skills` tool events and assemble `skill_loaded` and `skill_search` reasoning entries. Write stream integration tests.

**Acceptance criteria:**

- [ ] `StreamAccumulator` intercepts `tool_call` and `tool_result` for `load_skill`, creating a `skill_loaded` entry in `reasoningEntries` and updating it upon completion.
- [ ] `StreamAccumulator` intercepts `search_skills`, creating a `skill_search` entry with parsed query and matches.
- [ ] `tests/skills-stream.test.ts` validates streaming sequences of `search_skills` and `load_skill` yielding proper reasoning trace snapshots.

**Verification:**

- [ ] Tests pass: `bun run test tests/skills-stream.test.ts`
- [ ] Type check passes: `bun run check`

**Dependencies:** Task 2, Task 5  
**Files likely touched:**

- `src/lib/adapters/stream-accumulator.ts`
- `tests/skills-stream.test.ts` (new)

**Estimated scope:** Medium (2 files)

---

### Checkpoint: Reasoning & Streaming

- [ ] Stream integration tests pass (`bun run test tests/skills-stream.test.ts`)
- [ ] Type check passes (`bun run check`)

---

### Phase 4: Mock Provider & Multi-Turn History Replay

#### Task 7: Mock Provider Skill Ingestion Triggers & Scenarios

**Description:** Add a skill registry loading scenario in `MockAgentRuntimeProvider` (`src/lib/agent-runtime/mock/mock-provider.ts`) triggered by prompts referencing skills, BigQuery SQL optimization, or registry.

**Acceptance criteria:**

- [ ] Prompt containing "bigquery", "skill", or "registry" triggers `search_skills` and `load_skill` tool events with realistic metadata (`bigquery-analyzer` v2.1.0, author "Google Cloud", tools `["bigquery_execute_query", "bigquery_explain_plan", "bigquery_cost_estimate"]`).
- [ ] Stream yields thinking thoughts, skill badge events, and generated optimized SQL response.
- [ ] Mock client test validates the skill loading flow offline.

**Verification:**

- [ ] Tests pass: `bun run test tests/agent-client.test.ts`
- [ ] Manual check in mock mode works end-to-end.

**Dependencies:** Task 6  
**Files likely touched:**

- `src/lib/agent-runtime/mock/mock-provider.ts`
- `tests/agent-client.test.ts`

**Estimated scope:** Small (2 files)

---

#### Task 8: Session History Rehydration & Turn Grouping for Skills

**Description:** Update `groupTurnSessionEvents` and `parseRawSessionEvent` to preserve and rehydrate skill tool calls and metadata during multi-turn session history loading.

**Acceptance criteria:**

- [ ] `parseRawSessionEvent` and `groupTurnSessionEvents` rehydrate `skill_loaded` and `skill_search` entries into `reasoningTrace`.
- [ ] Replayed session history renders the `SkillLoadedBadge` and `SearchSkillsPill` identically to live streaming.
- [ ] `tests/skills-session.test.ts` tests session event history rehydration with skill tool events.

**Verification:**

- [ ] Tests pass: `bun run test tests/skills-session.test.ts`
- [ ] Type check passes: `bun run check`

**Dependencies:** Task 5, Task 7  
**Files likely touched:**

- `src/lib/agent-runtime/group-turns.ts`
- `src/lib/agent-runtime/parse-event.ts`
- `tests/skills-session.test.ts` (new)

**Estimated scope:** Medium (3 files)

---

### Checkpoint: Backend & Mock

- [ ] Session history and mock tests pass (`bun run test tests/skills-session.test.ts tests/agent-client.test.ts`)
- [ ] Type check passes (`bun run check`)

---

### Phase 5: Quality Gates & Verification

#### Task 9: Full Quality Gate Preflight, E2E Test & Docs Sync

**Description:** Create E2E / integration test scenario for skill visualizer, verify full test suite, linting, formatting, and update documentation.

**Acceptance criteria:**

- [ ] `bun run check` passes with 0 TypeScript errors.
- [ ] `bun run lint` passes with 0 ESLint warnings/errors.
- [ ] `bun run test` passes all unit, component, and stream integration tests.
- [ ] `AGENTS.md` index updated with new skill components and utilities.

**Verification:**

- [ ] Full quality gate passes: `bun run preflight`

**Dependencies:** Tasks 1-8  
**Files likely touched:**

- `tests/e2e/skills.spec.ts` (new) or integration test
- `AGENTS.md`

**Estimated scope:** Small (2 files)

---

### Checkpoint: Complete

- [ ] `bun run preflight` passes 100% cleanly
- [ ] All success criteria from `docs/spec-skill-ingestion.md` verified

---

## Risks and Mitigations

| Risk                                                                          | Impact | Mitigation                                                                                             |
| ----------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------ |
| ADK tool response format variations (snake_case vs camelCase, nested objects) | Medium | Resilient normalizer in `skill-parser.ts` handles all key variants with sensible defaults              |
| Large instructions snippet causing layout shifts in thinking trace            | Low    | Collapsible / truncated instructions preview inside `SkillMetadataCard`                                |
| Multiple skills loaded in a single turn                                       | Low    | `ReasoningTraceBlocks` and `StreamAccumulator` key skill entries uniquely by skill name / tool call ID |
| Missing metadata in raw tool payloads                                         | Low    | Graceful fallback to basic skill name badge or generic tool card                                       |

---

## Open Questions

- None. The specification in `docs/spec-skill-ingestion.md` and ADK tool contracts are unambiguous and verified against the existing architecture.
