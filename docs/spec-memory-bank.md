# Specification: Agent Platform Memory Bank (User Profile & Semantic Long-Term Memory)

## 1. Objective & Background

### 1.1 Objective

Integrate the **Google Cloud Agent Platform Memory Bank** subsystem ([`docs.cloud.google.com/.../memory-bank`](https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale/memory-bank)) into `agent-runtime-ui`. This provides persistent, cross-session semantic memory and user personalization for ADK agents, allowing the agent to remember user preferences, project context, and constraints across conversations, while giving users full transparency, editing, and deletion controls over their stored memory profile.

### 1.2 Target User & Problem Solved

- **Target User**: Enterprise users and developers interacting with ADK agents across multiple sessions.
- **Problem Solved**: Standard LLM conversations are isolated. Users must repeatedly restate their coding style, enterprise roles, project IDs, or regional constraints in every new thread.
- **Solution**:
  1. The agent extracts semantic facts from conversations via `GenerateMemories` or manual `CreateMemory` calls.
  2. In new sessions, the agent retrieves relevant memories via semantic similarity search (`RetrieveMemories`) and applies them to the context window.
  3. The user has full visibility and CRUD control over their memory bank via a **Memory Profile Drawer** launched from the bottom-left **User Avatar Menu**.
  4. In-chat **Memory Retrieval Badges** show which memories shaped a specific assistant response.

---

## 2. Architecture & Data Contracts

### 2.1 Memory Bank Data Model (`src/types/agent.ts`)

```typescript
export interface AgentMemory {
  id: string; // e.g. "mem-1" or "projects/.../locations/.../reasoningEngines/.../memories/1"
  userId: string;
  fact: string;
  topic?:
    | "coding_preferences"
    | "enterprise_context"
    | "communication_style"
    | "general"
    | string;
  createTime: string;
  updateTime: string;
  lastUsedTime?: string;
  confidenceScore?: number;
  sourceSessionId?: string;
}

export interface MemoryRetrievalItem {
  id: string;
  fact: string;
  topic?: string;
  relevanceScore: number;
}

export interface AgentMemoryListResponse {
  memories: AgentMemory[];
  totalCount: number;
}

export interface CreateMemoryRequest {
  fact: string;
  topic?: string;
}

export interface UpdateMemoryRequest {
  fact: string;
  topic?: string;
}

export interface GenerateMemoriesRequest {
  sessionId: string;
}

export interface GenerateMemoriesResponse {
  extractedCount: number;
  memories: AgentMemory[];
}
```

### 2.2 ADK Out-of-the-Box Tool Handlers (`preload_memory` & `load_memory`)

ADK emits memory operations as standard tool calls. The runtime adapter (`gemini-runtime-adapter.ts`) intercepts these specific tool events and maps them to the first-class `retrieved_memories` data model:

1. **`preload_memory`**: Emitted at the start of a turn when the agent automatically pulls relevant memories into the prompt.
2. **`load_memory`**: Emitted when the agent dynamically queries the Memory Bank mid-turn.
3. **`add_session_to_memory`**: Emitted as a session callback when conversational events are added to Memory Bank.

### 2.3 Stream Event Extension (`AgentStreamEvent`)

```typescript
export interface AgentStreamEvent {
  // ... existing fields
  retrieved_memories?: MemoryRetrievalItem[];
}
```

### 2.3 BFF REST API Endpoints

1. **`GET /api/memory`**:
   - Lists all memories scoped to the authenticated `session.user.id`.
   - Query params: `?topic=coding_preferences` (optional filter).
   - Response: `AgentMemoryListResponse`.
2. **`POST /api/memory`**:
   - Manually adds a user fact (`CreateMemory`).
   - Request Body: `CreateMemoryRequest`.
   - Response: `AgentMemory`.
3. **`PATCH /api/memory/[memoryId]`**:
   - Updates an existing memory fact or topic.
   - Request Body: `UpdateMemoryRequest`.
   - Response: `AgentMemory`.
4. **`DELETE /api/memory/[memoryId]`**:
   - Removes a memory fact permanently.
   - Response: `{ success: true, deletedId: string }`.
5. **`POST /api/memory/generate`**:
   - Triggers LLM-driven memory extraction from a session (`GenerateMemories`).
   - Request Body: `GenerateMemoriesRequest`.
   - Response: `GenerateMemoriesResponse`.

---

## 3. UI & UX Architecture

### 3.1 Entry Point: User Avatar Menu ([`user-avatar-menu.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/auth/user-avatar-menu.tsx))

- Inside the dropdown menu at the bottom-left sidebar:
  ```text
  ┌─────────────────────────────────────┐
  │ User Name                           │
  │ user@example.com                    │
  ├─────────────────────────────────────┤
  │ 🧠  Memory Bank Profile             │  <-- Opens Memory Drawer
  ├─────────────────────────────────────┤
  │ 🚪  Sign out                        │
  └─────────────────────────────────────┘
  ```

### 3.2 Memory Profile Drawer (`src/components/memory/memory-drawer.tsx`)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🧠 Memory Bank Profile                                                  [✕] │
│ Personalized semantic context stored for user@example.com                   │
├─────────────────────────────────────────────────────────────────────────────┤
│ [ + Add Custom Memory ]                                  [ Search facts... ]│
├─────────────────────────────────────────────────────────────────────────────┤
│ 🏷️ Coding Preferences (2)                                                   │
│   • "Prefers TypeScript with strict typing over vanilla JS"        [✎] [🗑]  │
│   • "Always uses Bun package manager and Tailwind CSS v3"          [✎] [🗑]  │
│                                                                             │
│ 🏷️ Enterprise Context (2)                                                   │
│   • "Project Lead for Cloud Migration in europe-west1"             [✎] [🗑]  │
│   • "Uses Vertex AI Agent Runtime with PKCE authentication"        [✎] [🗑]  │
│                                                                             │
│ 🏷️ Communication Style (1)                                                  │
│   • "Prefers concise technical explanations with code diffs"       [✎] [🗑]  │
├─────────────────────────────────────────────────────────────────────────────┤
│ ⚡ Auto-Consolidation: Automatically extracts facts on session end [Active] │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.3 In-Chat Memory Retrieval Badge (`src/components/assistant-ui/gemini-message.tsx`)

- When the agent responds using retrieved memories, render a subtle pill above or below the message:
  ```text
  ┌──────────────────────────────────────────────────────────────┐
  │ 🧠 2 Memories Applied: "Prefers TypeScript", "Uses Bun" ▾    │
  └──────────────────────────────────────────────────────────────┘
  ```
- Hovering or clicking expands a popover detailing the exact semantic facts retrieved and their relevance scores.

---

## 4. Tech Stack & Dependencies

- **Framework**: Next.js 15 (App Router), React 19, TypeScript (Strict).
- **Styling**: Tailwind CSS v3, Radix UI Dialog/Sheet (`@radix-ui/react-dialog`), `lucide-react`.
- **Testing**: Vitest (`vitest`), `@testing-library/react`, `jsdom`.

---

## 5. File Structure & Changes

```text
src/
├── app/
│   └── api/
│       └── memory/
│           ├── route.ts                      # GET (list), POST (create)
│           ├── [memoryId]/route.ts           # PATCH (update), DELETE (delete)
│           └── generate/route.ts             # POST (trigger extraction)
├── components/
│   ├── auth/
│   │   └── user-avatar-menu.tsx              # Add "Memory Bank Profile" item
│   ├── memory/
│   │   ├── memory-drawer.tsx                 # Main slide-over drawer
│   │   ├── memory-item-card.tsx              # Single fact card with edit/delete
│   │   ├── add-memory-modal.tsx              # Modal/inline form for new facts
│   │   └── memory-retrieval-badge.tsx        # In-chat memory chip & popover
│   └── assistant-ui/
│       └── gemini-message.tsx                # Mount memory retrieval badge
├── lib/
│   ├── agent-runtime-client.ts               # Memory Bank mock store & REST client
│   └── memory-context.tsx                    # React state provider for memories
└── types/
    └── agent.ts                              # AgentMemory, CreateMemoryRequest, etc.
```

---

## 6. Testing Strategy

1. **Unit & Mock Store Tests (`tests/memory-store.test.ts`)**:
   - Test `MemoryBankStore` fact creation, updating, deletion, topic categorization, and semantic similarity search.
2. **BFF API Route Tests (`tests/memory-api.test.ts`)**:
   - Test `GET /api/memory` (authenticated vs unauthenticated).
   - Test `POST /api/memory`, `PATCH /api/memory/[id]`, and `DELETE /api/memory/[id]`.
   - Test `POST /api/memory/generate`.
3. **Component Tests (`tests/memory-ui.test.tsx`)**:
   - Test opening the Memory Drawer from `UserAvatarMenu`.
   - Test adding a new memory fact.
   - Test deleting an existing fact.
   - Test in-chat memory badge popover displaying retrieved facts.

---

## 7. Boundaries

- **Always**:
  - Filter all memory operations strictly by the authenticated `session.user.id` (zero cross-tenant leakage).
  - Provide complete offline / mock mode support when `MOCK_AGENT_RUNTIME=true`.
  - Maintain 100% strict TypeScript types.
- **Never**:
  - Never allow deleting another user's memories.
  - Never expose internal Vertex AI credentials to the browser.

---

## 8. Success Criteria & Verification

- [ ] `bun run check` passes with zero TypeScript errors.
- [ ] `bun run lint` passes with zero ESLint warnings/errors.
- [ ] `bun run test` passes all unit and component tests.
- [ ] Clicking **"Memory Bank Profile"** in the bottom-left avatar menu opens the Memory Drawer.
- [ ] Users can add, edit, and delete memories in mock mode.
- [ ] Chat turns with mock memory triggers display the **"🧠 Memories Applied"** badge.
