# Specification: Vertex AI Context Caching & ADK Session State Inspector

## 1. Objective & Background

### 1.1 Objective

Implement first-class support for **Vertex AI Context Caching** and the **ADK Session State Inspector** (`session.state`) in `agent-runtime-ui`. This specification defines:

1. **Context Caching Telemetry & Savings Visualizer**: Intercepting `cached_content_token_count` from Vertex AI stream usage metadata to visually celebrate prompt cache hits, latency reductions, and cost savings in the chat UI.
2. **ADK Session State Inspector & Delta Visualizer**: Providing a dedicated developer/enterprise debug drawer and in-chat state delta chips to inspect, watch, and edit structured ADK session state variables (`actions.state_delta` / `session.state`) across multi-turn workflows.

### 1.2 Target User & Problem Solved

- **Target User**: Enterprise developers, solution architects, and users running long-context or stateful ADK agents on Vertex AI Reasoning Engines.
- **Problem Solved**:
  - _Context Caching Opacity_: Long system prompts, preloaded knowledge bases, or extended multi-turn histories leverage Vertex AI Context Caching to dramatically reduce costs and time-to-first-token, but the UI provides zero visibility into cache hits.
  - _Black-Box Agent State_: ADK agents dynamically store variables in `session.state` (e.g. `user_tier`, `selected_vpc`, `investigation_id`, `cart_items`). Users and developers cannot see or debug these variables as the agent mutates them across conversation turns.
- **Solution**:
  - Render **`⚡ N Cached Tokens (X% saved)`** badges and detailed cost/latency breakdown popovers on assistant message footers.
  - Render in-chat **`[ 🗄️ State Updated: +N keys ]`** chips with visual state diffs.
  - Provide a slide-over **Session State Drawer** accessible from the header and message actions to view, search, and update session state variables in real-time.

---

## 2. Tech Stack & Dependencies

| Layer             | Technology / Package                                                                                                       | Purpose                                           |
| :---------------- | :------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------ |
| **Framework**     | Next.js 15 (App Router), React 19, TypeScript (Strict)                                                                     | Application framework and type safety             |
| **Chat Engine**   | `@assistant-ui/react` (v0.15), `@assistant-ui/react-markdown`                                                              | Message part rendering and custom metadata access |
| **UI Primitives** | Tailwind CSS v3, Radix UI (`@radix-ui/react-dialog`, `@radix-ui/react-popover`, `@radix-ui/react-tooltip`), `lucide-react` | Dialogs, popovers, badges, and Gemini styling     |
| **BFF & Auth**    | Next.js API Routes, `google-auth-library`, Web Crypto JWT                                                                  | Secure Vertex AI Session Service proxying         |
| **Testing**       | Vitest (`vitest`), `@testing-library/react`, `jsdom`                                                                       | Unit, store, and component testing                |

---

## 3. Commands

```bash
# Quality Gates & Verification
bun run preflight    # Format + check + lint + test in parallel
bun run check        # TypeScript typecheck (tsc --noEmit)
bun run lint         # ESLint check
bun run format       # Prettier code formatting
bun run test         # Vitest unit & component test suite

# Development & Build
bun run dev          # Next.js dev server
bun run build        # Production Next.js build
```

---

## 4. Architecture & Data Contracts

### 4.1 Vertex AI Context Caching Telemetry (`src/types/agent.ts`)

During `:streamQuery` and session history retrieval, Vertex AI Reasoning Engine emits `usage_metadata` containing context cache counters:

```typescript
export interface TokenModalityDetail {
  modality: "TEXT" | "IMAGE" | "AUDIO" | "VIDEO" | string;
  token_count: number;
}

export interface UsageMetadata {
  prompt_token_count?: number;
  prompt_tokens_details?: TokenModalityDetail[];
  candidates_token_count?: number;
  candidates_tokens_details?: TokenModalityDetail[];
  thoughts_token_count?: number;
  cached_content_token_count?: number;
  cached_tokens_details?: TokenModalityDetail[];
  total_token_count?: number;
  traffic_type?: "ON_DEMAND" | "PROVISIONED" | string;
}

export interface ContextCacheSavingsMetrics {
  cachedTokens: number;
  promptTokens: number;
  totalTokens: number;
  cacheHitRatio: number; // e.g. 0.75 for 75%
  estimatedCostReductionPercent: number; // e.g. 75% for Gemini Flash cache discount
  isCached: boolean;
}
```

### 4.2 ADK Session State Data Contracts (`src/types/agent.ts`)

ADK agents persist structured key-value state inside Vertex AI `SessionService`. Mutations are emitted in stream events via `actions.state_delta`:

```typescript
export type SessionStateValue =
  | string
  | number
  | boolean
  | null
  | SessionStateValue[]
  | { [key: string]: SessionStateValue };

export type SessionStateMap = Record<string, SessionStateValue>;

export interface SessionStateDeltaItem {
  key: string;
  previousValue?: SessionStateValue;
  newValue: SessionStateValue;
  action: "added" | "updated" | "deleted";
}

export interface SessionStateResponse {
  sessionId: string;
  state: SessionStateMap;
  updateTime?: string;
}

export interface UpdateSessionStateRequest {
  state: SessionStateMap; // Delta or full replacement
  mode?: "merge" | "replace";
}
```

### 4.3 Stream Event Schema Extension (`AgentStreamEvent`)

```typescript
export interface AgentStreamActions {
  state_delta?: SessionStateMap;
  artifact_delta?: Record<string, unknown>;
  requested_auth_configs?: Record<string, unknown>;
  requested_tool_confirmations?: Record<string, unknown>;
}

export interface AgentStreamEvent {
  // ... existing fields
  usage_metadata?: UsageMetadata;
  actions?: AgentStreamActions;
  state_delta?: SessionStateMap;
}
```

### 4.4 BFF REST API Endpoints

1. **`GET /api/sessions/[sessionId]/state`**:
   - Fetches the current `session.state` key-value dictionary from Vertex AI Session Service.
   - Response: `SessionStateResponse`.
2. **`PATCH /api/sessions/[sessionId]/state`**:
   - Allows developers (or mock workflows) to merge or update state variables.
   - Request Body: `UpdateSessionStateRequest`.
   - Response: `SessionStateResponse`.

---

## 5. UI & UX Architecture

### 5.1 Message Timing & Context Cache Badge (`src/components/assistant-ui/gemini-message-timing.tsx`)

In the assistant message footer, alongside response duration:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Assistant:                                                                  │
│ I've retrieved the architecture constraints from your project config.       │
│                                                                             │
│ 1.8s • gemini-2.5-flash • [ ⚡ 3,420 Cached Tokens (81%) ▾ ]  [ 👍 ] [ 👎 ] │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Cache Savings Popover Details:

Clicking or hovering over the badge opens a Radix Popover:

```text
┌───────────────────────────────────────────────────────────────┐
│ ⚡ Vertex AI Context Caching                                   │
├───────────────────────────────────────────────────────────────┤
│ Context Cache Hit:            81.4% (3,420 / 4,200 prompt)    │
│ Input Tokens (Uncached):        780                           │
│ Output + Thinking Tokens:       610 (210 reasoning)           │
│ Total Consumed:               4,810                           │
├───────────────────────────────────────────────────────────────┤
│ 💰 Estimated Input Cost Savings: ~75%                         │
│ ⏱️ Time-to-First-Token Acceleration: Active                   │
└───────────────────────────────────────────────────────────────┘
```

### 5.2 In-Chat State Delta Chip (`src/components/session-state/state-delta-chip.tsx`)

When an assistant turn modifies `session.state`, render an expandable chip above or below the message text:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Assistant:                                                                  │
│ ▾ Thought: Storing selected cluster and environment to session state...    │
│                                                                             │
│ [ 🗄️ Session State Updated (+2 variables) ▾ ]                                │
│   ┌───────────────────────────────────────────────────────────────────────┐ │
│   │ + target_cluster: "prod-europe-west1"                                 │ │
│   │ ~ deployment_status: "pending_approval" (was "draft")                 │ │
│   └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ I have set the target cluster to `prod-europe-west1`. Ready to deploy?     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Session State Inspector Drawer (`src/components/session-state/session-state-drawer.tsx`)

Accessible from:

- Header **`[ 🗄️ State ]`** button.
- User Avatar menu -> **"Session State Inspector"**.
- In-chat state delta chip -> **"Open State Inspector"**.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 🗄️ Session State Inspector                                              [✕] │
│ Live ADK session.state variables for active session                         │
├─────────────────────────────────────────────────────────────────────────────┤
│ [ + Add Variable ]   [ 🔄 Refresh ]                     [ 🔍 Search keys... ]│
├─────────────────────────────────────────────────────────────────────────────┤
│ 🏷️ Active Variables (4)                                                     │
│                                                                             │
│ 🔑 target_cluster                                              Type: string │
│   "prod-europe-west1"                                              [✎] [🗑] │
│                                                                             │
│ 🔑 deployment_status                                           Type: string │
│   "pending_approval"                                               [✎] [🗑] │
│                                                                             │
│ 🔑 active_services                                              Type: array │
│   [ "frontend", "worker", "auth-proxy" ]                           [✎] [🗑] │
│                                                                             │
│ 🔑 run_config                                                  Type: object │
│   { "min_instances": 2, "memory": "4GiB", "cpu": 2 }               [✎] [🗑] │
├─────────────────────────────────────────────────────────────────────────────┤
│ 💡 State variables are automatically synced to Vertex AI Session Service.  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Project Structure & File Map

```text
src/
├── app/
│   └── api/
│       └── sessions/
│           └── [sessionId]/
│               └── state/
│                   └── route.ts              # GET (fetch state), PATCH (update state)
├── components/
│   ├── assistant-ui/
│   │   ├── gemini-message-timing.tsx         # Context cache badge & popover
│   │   └── gemini-message.tsx                # Mount state delta chips
│   ├── session-state/
│   │   ├── session-state-drawer.tsx          # Main slide-over state inspector
│   │   ├── session-state-header-button.tsx   # Top-bar state button & badge
│   │   ├── state-delta-chip.tsx              # In-turn state delta notification chip
│   │   ├── state-variable-card.tsx           # Single key-value card with JSON viewer
│   │   └── add-state-variable-modal.tsx      # Modal to add/edit state variable
│   └── auth/
│       └── user-avatar-menu.tsx              # Link to open Session State Inspector
├── lib/
│   ├── context-caching/
│   │   └── cache-metrics.ts                  # Token calculations & savings helper
│   ├── session-state/
│   │   └── state-context.tsx                 # React Context & hooks for session state
│   ├── agent-runtime-client.ts               # Mock store state CRUD & stream delta triggers
│   └── adapters/chat-adapter.ts              # Map usage_metadata & state_delta to AUI
└── types/
    └── agent.ts                              # UsageMetadata, SessionStateMap, StateDelta
```

---

## 7. Code Style & Example Implementations

### 7.1 Pure Cache Calculation Helper (`src/lib/context-caching/cache-metrics.ts`)

```typescript
import type { UsageMetadata, ContextCacheSavingsMetrics } from "@/types/agent";

export function calculateContextCacheMetrics(
  usage?: UsageMetadata
): ContextCacheSavingsMetrics {
  const cachedTokens = usage?.cached_content_token_count ?? 0;
  const promptTokens = usage?.prompt_token_count ?? 0;
  const totalTokens = usage?.total_token_count ?? promptTokens;

  const totalInputTokens = Math.max(promptTokens, cachedTokens);
  const cacheHitRatio =
    totalInputTokens > 0 ? Math.min(1, cachedTokens / totalInputTokens) : 0;

  // Gemini 2.0 / 2.5 Flash charges 75% less for cached context tokens
  const estimatedCostReductionPercent = Math.round(cacheHitRatio * 75);

  return {
    cachedTokens,
    promptTokens,
    totalTokens,
    cacheHitRatio,
    estimatedCostReductionPercent,
    isCached: cachedTokens > 0,
  };
}
```

---

## 8. Testing Strategy

1. **Unit Tests (`tests/context-caching.test.ts`)**:
   - Test `calculateContextCacheMetrics` with zero cache, partial cache (e.g. 3000/4000), 100% cache, and missing `usage_metadata`.
   - Test cache hit ratio and cost reduction formatting.
2. **State Store & Adapter Tests (`tests/session-state-adapter.test.ts`)**:
   - Test `adapters/chat-adapter` parsing `actions.state_delta` from SSE chunks.
   - Test state delta classification (`added`, `updated`, `deleted`).
3. **BFF Route Tests (`tests/session-state-api.test.ts`)**:
   - Test `GET /api/sessions/[sessionId]/state` with authenticated session.
   - Test `PATCH /api/sessions/[sessionId]/state` updating key-value pairs.
4. **Component Tests (`tests/session-state-ui.test.tsx`)**:
   - Test `gemini-message-timing.tsx` rendering cache badge when `cached_content_token_count > 0`.
   - Test opening `SessionStateDrawer` and editing/adding state variables in mock mode.
   - Test `StateDeltaChip` rendering diffs on state-modifying turns.

---

## 9. Boundaries

- **Always**:
  - Scope all `session.state` queries and updates strictly to the authenticated `userId`.
  - Provide complete mock parity in [`src/lib/agent-runtime-client.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime-client.ts) so offline testing (`MOCK_AGENT_RUNTIME=true`) functions seamlessly.
  - Maintain 100% strict TypeScript typing with zero `any`.
  - Format raw JSON / complex objects safely with syntax formatting without crashing on circular structures.
- **Ask First**:
  - Automatically injecting `session.state` modifications directly into prompt payloads without explicit user confirmation.
- **Never**:
  - Never allow cross-session state leakage or modifying state belonging to another user.
  - Never crash the stream renderer on malformed `usage_metadata` or unexpected state object types.

---

## 10. Success Criteria & Verification

- [ ] `bun run check` passes with zero TypeScript errors.
- [ ] `bun run lint` passes with zero ESLint warnings/errors.
- [ ] `bun run test` passes all unit and component tests.
- [ ] In mock mode, sending a prompt with simulated cached context displays the **`⚡ 3,420 Cached Tokens (75%)`** badge in the message footer.
- [ ] Hovering/clicking the badge opens the **Vertex AI Context Caching** breakdown popover.
- [ ] In mock mode, asking the agent to update configuration (e.g., _"Set environment to staging"_) streams a `state_delta` event and displays the **`[ 🗄️ Session State Updated ]`** chip.
- [ ] Clicking **"State"** in the header opens the slide-over drawer showing live key-value variables.

---

## 11. Open Questions & Assumptions

- **Assumptions**:
  - Vertex AI Reasoning Engines return `cached_content_token_count` inside standard `usage_metadata` for cached turns.
  - ADK agents use `actions.state_delta` in `:streamQuery` and store session state in `SessionService`.
- **Open Questions**:
  - Should the Session State drawer allow live editing in production mode, or should manual state modification be restricted to development/mock modes? _(Recommended: allow editing in development/mock, read-only with copy in production)_.
