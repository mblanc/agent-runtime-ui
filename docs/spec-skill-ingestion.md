# Specification: Skill Ingestion Visualizer & Metadata Inspector

## 1. Objective & Background

### 1.1 Objective
Implement a lightweight, high-fidelity **Skill Ingestion Visualizer** in `agent-runtime-ui`. This feature detects when a Google Cloud ADK agent dynamically discovers and mounts remote skills from the **Google Cloud Skill Registry** ([`adk.dev/integrations/skills-registry`](https://adk.dev/integrations/skills-registry/)) via built-in `search_skills` and `load_skill` tools, rendering a clean **`[ 🧩 Skill Loaded: name vX.Y ]`** badge with an expandable metadata card inside the agent's reasoning trace.

### 1.2 Target User & Problem Solved
- **Target User**: Developers, enterprise stakeholders, and demo audiences observing complex multi-step agent reasoning.
- **Problem Solved**: When an agent loads a remote skill package at runtime, generic tool chips only display raw JSON payloads. Users cannot easily see what domain knowledge, instructions, or tools were unlocked by that skill.
- **Solution**: The UI intercepts `load_skill` and `search_skills` tool events, formatting them into a styled Gemini capability badge. Clicking or hovering opens an inspector detailing the skill's name, version/revision, human-readable description, and unlocked tools.

---

## 2. Architecture & Data Contracts

### 2.1 ADK Skill Tool Contract
In ADK, `load_skill` emits a standard function call and response with the following structured payload:

```typescript
export interface LoadedSkillMetadata {
  skillName: string; // e.g. "bigquery-analyzer"
  version?: string; // e.g. "2.1.0" or revision ID
  description?: string; // e.g. "Optimizes and audits BigQuery SQL queries"
  author?: string;
  license?: string;
  tools?: string[]; // e.g. ["execute_query", "explain_query"]
  instructionsSnippet?: string;
}

export interface SkillSearchMatch {
  skillName: string;
  description: string;
  version?: string;
}

export interface SkillStreamEventPayload {
  type: "search" | "load";
  query?: string;
  skill?: LoadedSkillMetadata;
  matches?: SkillSearchMatch[];
}
```

### 2.2 Tool Call Interception Mapping (`src/lib/gemini-runtime-adapter.ts`)
When the SSE stream receives a tool event:
- **`tool_call.name === "load_skill"`**:
  - Arguments: `{ "skill_name": "bigquery-analyzer", "version": "2.1.0" }`
  - Result: `{ "name": "bigquery-analyzer", "version": "2.1.0", "description": "...", "tools": ["execute_query"] }`
- The runtime adapter parses these properties and attaches `loadedSkill` metadata to the tool part, allowing the UI to render the specialized `SkillLoadedBadge`.

---

## 3. UI & UX Architecture

### 3.1 Reasoning Trace & Message Integration (`src/components/skills/`)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Assistant:                                                                  │
│ ▾ Thought: Analyzing sales database query optimization...                   │
│   ┌───────────────────────────────────────────────────────────────────────┐ │
│   │ 🧩 Skill Loaded: BigQuery Analyzer (v2.1.0)              [ View ▾ ]   │ │
│   ├───────────────────────────────────────────────────────────────────────┤ │
│   │ "Optimizes and audits BigQuery SQL queries, slot usage, and joins."   │ │
│   │ Author: Google Cloud • Tools Unlocked: [ bigquery_exec, explain_sql ] │ │
│   └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ Based on the BigQuery execution plan, here is the optimized query:          │
│ ```sql                                                                      │
│ SELECT * FROM `project.dataset.sales` WHERE date >= '2026-01-01'            │
│ ```                                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Details
1. **`SkillLoadedBadge` (`src/components/skills/skill-loaded-badge.tsx`)**:
   - Compact pill featuring a purple/indigo jigsaw puzzle icon (`🧩`), skill display name, and version tag.
   - Expandable toggle showing summary details.
2. **`SkillMetadataCard` (`src/components/skills/skill-metadata-card.tsx`)**:
   - Card rendered inside the badge or as a Radix Popover showing:
     - Description snippet from `SKILL.md` frontmatter.
     - Badges for all tools unlocked by the skill.
     - Author, license, and revision ID.
3. **`SearchSkillsPill` (`src/components/skills/search-skills-pill.tsx`)**:
   - Subtle indicator when the agent searches the registry: *"🔍 Searched Skill Registry for: 'bigquery optimization'"*.

---

## 4. Tech Stack & Dependencies

- **Framework**: Next.js 15 (App Router), React 19, TypeScript (Strict).
- **Styling**: Tailwind CSS v3, Radix UI Popover (`@radix-ui/react-popover`), `lucide-react`.
- **Testing**: Vitest (`vitest`), `@testing-library/react`, `jsdom`.

---

## 5. File Structure & Changes

```text
src/
├── components/
│   ├── skills/
│   │   ├── skill-loaded-badge.tsx            # Main pill rendered in reasoning/turn
│   │   ├── skill-metadata-card.tsx           # Expanded card showing description & tools
│   │   └── search-skills-pill.tsx            # Search query chip
│   └── assistant-ui/
│       ├── gemini-reasoning.tsx              # Render skill badges inside thinking traces
│       └── tool-fallback.tsx                 # Route load_skill / search_skills to specialized badges
├── lib/
│   ├── agent-runtime-client.ts               # Mock load_skill / search_skills responses
│   └── gemini-runtime-adapter.ts             # Map load_skill tool calls to LoadedSkillMetadata
└── types/
    └── agent.ts                              # LoadedSkillMetadata, SkillSearchMatch
```

---

## 6. Testing Strategy

1. **Adapter Parser Tests (`tests/skills-adapter.test.ts`)**:
   - Test intercepting `load_skill` tool events with valid and partial metadata.
   - Test extracting version, description, and tools list from `functionResponse`.
2. **Component Tests (`tests/skills-ui.test.tsx`)**:
   - Test `SkillLoadedBadge` renders with correct title and version tag.
   - Test expanding the badge renders the description and tool chips.
   - Test `SearchSkillsPill` renders search queries correctly.
3. **Stream Integration Tests (`tests/skills-stream.test.ts`)**:
   - Test mock stream trigger (e.g. *"Analyze this BigQuery SQL using the registry"*) producing `load_skill` events and verifying UI rendering.

---

## 7. Boundaries

- **Always**:
  - Keep the visual representation lightweight and non-intrusive inside reasoning traces.
  - Fall back gracefully to the generic tool card if the `load_skill` payload lacks expected metadata.
  - Maintain 100% strict TypeScript types.
  - Support offline / mock testing when `MOCK_AGENT_RUNTIME=true`.
- **Never**:
  - Never crash the message stream on malformed skill metadata.

---

## 8. Success Criteria & Verification

- [ ] `bun run check` passes with zero TypeScript errors.
- [ ] `bun run lint` passes with zero ESLint warnings/errors.
- [ ] `bun run test` passes all unit and component tests.
- [ ] In mock mode, sending a prompt requiring specialized skills triggers `load_skill` and displays the **`[ 🧩 Skill Loaded ]`** badge in the thinking trace.
- [ ] Expanding the badge shows the skill description, version, and unlocked tool chips.
