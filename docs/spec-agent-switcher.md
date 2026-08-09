# Specification: Multi-Agent Backend Switcher (Vertex AI Reasoning Engine Selector)

## 1. Objective & Background

### 1.1 Objective
Implement a dynamic **Multi-Agent Backend Switcher** in `agent-runtime-ui`. This feature allows users to discover, list, and switch between all deployed **Vertex AI Reasoning Engines** (ADK agents) across the Google Cloud project directly from the top header bar. Switching the active agent immediately resets the chat view to a fresh turn and reloads the sidebar thread list scoped to that specific agent.

### 1.2 Target User & Problem Solved
- **Target User**: Developers, teams, and enterprise evaluators managing multiple specialized ADK agents (e.g., Code Reviewer, Architecture Advisor, Support Bot) in Google Cloud.
- **Problem Solved**: Currently, the UI is hardcoded to a single environment variable (`REASONING_ENGINE_ID`), and the composer contains a static "Flash/Pro" placeholder. Users cannot test or interact with multiple deployed agents without restarting the server or editing config files.
- **Solution**:
  1. The BFF queries Vertex AI across all active project locations and returns a unified list of deployed agents (`GET /api/agents`).
  2. The top header renders a prominent **Agent Selector Dropdown** displaying agent display names, descriptions, and region badges.
  3. Selecting an agent unloads the current chat, starts a clean empty greeting screen, updates the sidebar header (*"Threads for [Selected Agent]"*), and scopes all `/api/sessions` and `/api/chat` requests to the selected engine.

---

## 2. Architecture & Data Contracts

### 2.1 Deployed Agent Data Models (`src/types/agent.ts`)

```typescript
export interface DeployedAgent {
  id: string; // e.g. "4567890123456789012"
  resourceName: string; // "projects/{project}/locations/{location}/reasoningEngines/{id}"
  displayName: string; // e.g. "ADK Architecture Advisor"
  description?: string; // e.g. "Specialized in cloud architecture patterns and security"
  location: string; // e.g. "us-central1", "europe-west4"
  createTime?: string;
  updateTime?: string;
  model?: string; // e.g. "gemini-2.5-flash", "gemini-2.5-pro"
  isDefault?: boolean;
}

export interface ListAgentsResponse {
  agents: DeployedAgent[];
  activeAgentId: string;
}
```

### 2.2 BFF REST API Endpoints

1. **`GET /api/agents`**:
   - Queries Vertex AI across configured GCP locations (`GOOGLE_CLOUD_LOCATIONS` or default `GOOGLE_CLOUD_LOCATION`) using `google-auth-library`.
   - Returns: `ListAgentsResponse`.
2. **`GET /api/sessions?agentId=[reasoningEngineId]`**:
   - Filters user sessions strictly by the chosen `reasoningEngineId` (Vertex AI sessions are hierarchical children of a Reasoning Engine resource).
3. **`POST /api/chat` (Payload Extension)**:
   - Request body accepts `{ reasoningEngineId, location }` to route the `:streamQuery` call to the chosen agent.

---

## 3. UI & UX Architecture

### 3.1 Top Header & Layout (`src/components/agent-switcher/`)

```text
┌───────────────┬───────────────────────────────────────────────────────────────────────────┐
│ Sidebar       │  [ 🤖 ADK Architecture Advisor (us-central1) ▾ ]             [ 📁 2 Files]│
│               ├───────────────────────────────────────────────────────────────────────────┤
│ • Session 1   │                                                                           │
│ • Session 2   │                                                                           │
│               │                         ✨ Google Cloud Agent Runtime                     │
│ Threads for:  │                                                                           │
│ Architecture  │                     How can I help you today?                             │
│ Advisor       │                                                                           │
│               │           "Specialized in cloud architecture patterns and security"       │
│               │                                                                           │
│               │    ┌─────────────────────────────────────────────────────────────────┐    │
│               │    │ Ask ADK Architecture Advisor...                     [🎤] [ ⬆ ]  │    │
│               │    └─────────────────────────────────────────────────────────────────┘    │
└───────────────┴───────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Details
1. **`AgentHeaderSelector` (`src/components/agent-switcher/agent-header-selector.tsx`)**:
   - Replaces the static Flash/Pro picker and mounts at the top header.
   - Radix Dropdown showing:
     - 🤖 Agent Display Name + Region Badge (e.g. `us-central1`).
     - Description snippet and active status checkmark (`✓`).
2. **`ActiveAgentContext` (`src/lib/agent-context.tsx`)**:
   - Global React Context storing:
     - `activeAgent: DeployedAgent | null`
     - `availableAgents: DeployedAgent[]`
     - `setActiveAgent: (agent: DeployedAgent) => void`
     - Persists selected agent ID in `localStorage` for continuity across page refreshes.
3. **Sidebar Scoping Integration ([`thread-sidebar.tsx`](file:///Users/mblanc/projects/llm-council-ui/src/components/assistant-ui/thread-sidebar.tsx))**:
   - Thread list automatically re-fetches `/api/sessions?agentId=...` when `activeAgent` changes.
   - Header displays subtitle indicating the current agent context.
4. **Empty State Dynamic Greeting ([`gemini-thread.tsx`](file:///Users/mblanc/projects/llm-council-ui/src/components/assistant-ui/gemini-thread.tsx))**:
   - The subtitle and placeholder dynamically reflect the active agent's name and description.

---

## 4. Tech Stack & Dependencies

- **Framework**: Next.js 15 (App Router), React 19, TypeScript (Strict).
- **Styling & UI Primitives**: Tailwind CSS v3, Radix UI Dropdown Menu (`@radix-ui/react-dropdown-menu`), `lucide-react`.
- **Testing**: Vitest (`vitest`), `@testing-library/react`, `jsdom`.

---

## 5. File Structure & Changes

```text
src/
├── app/
│   ├── api/
│   │   ├── agents/
│   │   │   └── route.ts                      # GET /api/agents (list all Reasoning Engines)
│   │   ├── sessions/
│   │   │   └── route.ts                      # Filter sessions by ?agentId=
│   │   └── chat/
│   │       └── route.ts                      # Forward stream query to target reasoningEngineId
│   └── page.tsx                              # Wrap in AgentProvider & mount AgentHeaderSelector
├── components/
│   ├── agent-switcher/
│   │   └── agent-header-selector.tsx         # Top-bar dropdown selector
│   └── assistant-ui/
│       ├── gemini-thread.tsx                 # Dynamic empty state greeting per agent
│       ├── gemini-composer.tsx               # Remove static Flash/Pro placeholder
│       └── thread-sidebar.tsx                # Scoped thread list & agent title
├── lib/
│   ├── agent-context.tsx                     # React Context for active agent state
│   ├── session-adapter.tsx                   # Re-query adapter on activeAgent change
│   └── agent-runtime-client.ts               # List Reasoning Engines & mock agents store
└── types/
    └── agent.ts                              # DeployedAgent, ListAgentsResponse
```

---

## 6. Testing Strategy

1. **BFF Route Tests (`tests/agents-api.test.ts`)**:
   - Test `GET /api/agents` returns active and available agents.
   - Test `GET /api/sessions?agentId=...` filters session history by agent ID.
2. **Context & State Tests (`tests/agent-context.test.tsx`)**:
   - Test switching active agent updates `activeAgent` and triggers session reload.
   - Test local storage persistence of selected agent ID.
3. **Component Tests (`tests/agent-switcher.test.tsx`)**:
   - Test `AgentHeaderSelector` renders all available agents with region badges.
   - Test selecting an agent updates the header, clears current chat, and starts an empty turn.

---

## 7. Boundaries

- **Always**:
  - Filter session history strictly by both `userId` AND `reasoningEngineId`.
  - Fall back to the default configured agent if the user's stored agent is deleted or inaccessible.
  - Provide realistic mock agents in `agent-runtime-client.ts` when `MOCK_AGENT_RUNTIME=true`.
  - Maintain 100% strict TypeScript types.
- **Never**:
  - Never mix session histories from different agents in the same sidebar view.
  - Never block UI initialization if a single regional GCP endpoint times out (query regions in parallel with graceful error handling).

---

## 8. Success Criteria & Verification

- [ ] `bun run check` passes with zero TypeScript errors.
- [ ] `bun run lint` passes with zero ESLint warnings/errors.
- [ ] `bun run test` passes all unit and component tests.
- [ ] In mock mode, the top header dropdown lists 3 realistic agents:
  1. *ADK Architecture Advisor (us-central1)*
  2. *Code Reviewer & Auditor (europe-west4)*
  3. *Cloud Ops Assistant (us-central1)*
- [ ] Switching between agents clears the active chat, updates the thread list, and routes subsequent prompts to the newly selected agent.
