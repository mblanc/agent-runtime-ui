# Specification: Phase 2 — Domain Layer Decomposition & Strategy Pattern (`IAgentRuntimeProvider`)

> **Feature / Phase:** Phase 2 of Architectural Improvements  
> **Status:** Draft / Ready for Review  
> **Author:** Antigravity  
> **Reference:** [`docs/improvments.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/improvments.md)

---

## 1. Assumptions & Core Decisions

### Assumptions

1. `src/lib/agent-runtime-client.ts` is imported by multiple API routes and tests. To prevent breaking changes during refactoring, `src/lib/agent-runtime-client.ts` will serve as a backward-compatible facade re-exporting from the new `src/lib/agent-runtime/` package.
2. In production (`NODE_ENV === "production"`), missing Google Cloud credentials/project configuration must **fail fast** by throwing an explicit Error rather than silently falling back to offline mock mode.
3. Offline mock data and streaming logic must be completely isolated from production GCP client code.

---

## 2. Objective & Motivation

### 2.1 Problem Statement

Currently, [`src/lib/agent-runtime-client.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime-client.ts) is a 2,120-line "god class" that violates:

- **Single Responsibility Principle (SRP)**: Handles IAM tokens, REST calls, SSE streaming, heuristic JSON event parsing, turn grouping, and offline mock generation in one file.
- **Open/Closed Principle (OCP)**: Every method contains hardcoded `if (this.isMock)` branching. Adding new agent runtime backends (e.g. direct Gemini API, Cloud Run ADK, or LangGraph) requires editing every single method.
- **Dependency Inversion Principle (DIP)**: API routes depend directly on the concrete class rather than an interface abstraction.

### 2.2 Goals

1. Decompose `agent-runtime-client.ts` into a structured module under `src/lib/agent-runtime/` where each file is < 250 LOC.
2. Define the `IAgentRuntimeProvider` interface abstraction.
3. Implement `VertexAiReasoningEngineProvider` (GCP production backend) and `MockAgentRuntimeProvider` (offline local backend) using the Strategy Pattern.
4. Provide a centralized `createAgentRuntimeProvider` factory with fail-fast validation.

---

## 3. Tech Stack & Execution Commands

| Layer                         | Technology                           |
| :---------------------------- | :----------------------------------- |
| **Runtime & Package Manager** | Bun 1.3+                             |
| **Authentication Client**     | `google-auth-library` (`GoogleAuth`) |
| **Language**                  | TypeScript (Strict Mode)             |
| **Testing**                   | Vitest (`vitest`)                    |

### Core Commands

```bash
# Typecheck
bun run check

# Run Agent Client Tests
bun test tests/agent-client.test.ts

# Run Full Test Suite
bun run test
```

---

## 4. Project Structure & Architecture

```
src/lib/
├── agent-runtime/
│   ├── index.ts                      # Clean facade exporting provider factory & services
│   ├── types.ts                      # IAgentRuntimeProvider interface & contracts
│   ├── client.ts                     # Real VertexAiReasoningEngineProvider (GCP REST + Auth)
│   ├── sse-parser.ts                 # Line-based SSE chunk decoder & stream parser
│   ├── event-normalizer.ts           # Pure event parsing heuristics & turn grouping
│   ├── factory.ts                    # createAgentRuntimeProvider factory with fail-fast check
│   └── mock/
│       ├── mock-store.ts             # In-memory mock sessions & agents data
│       └── mock-provider.ts          # MockAgentRuntimeProvider implementing IAgentRuntimeProvider
└── agent-runtime-client.ts           # Backward-compatible facade (re-exports for existing imports)
```

---

## 5. Code Style & Technical Design

### 5.1 The `IAgentRuntimeProvider` Interface (`src/lib/agent-runtime/types.ts`)

```typescript
import type {
  AgentFeedbackRequest,
  AgentFeedbackResponse,
  AgentSession,
  AgentSessionEvent,
  AgentStreamEvent,
  ChatRequestBody,
  ListAgentsResponse,
} from "@/types/agent";

export interface IAgentRuntimeProvider {
  listAgents(locations?: string[]): Promise<ListAgentsResponse>;
  listSessions(
    userId: string,
    userEmail?: string,
    agentId?: string
  ): Promise<AgentSession[]>;
  createSession(userId: string, title?: string, agentId?: string): Promise<AgentSession>;
  getSession(
    sessionId: string,
    agentId?: string,
    location?: string
  ): Promise<AgentSession | null>;
  updateSessionTitle(
    sessionId: string,
    title: string,
    userId?: string,
    agentId?: string,
    location?: string
  ): Promise<void>;
  deleteSession(sessionId: string, agentId?: string, location?: string): Promise<void>;
  listSessionEvents(
    sessionId: string,
    agentId?: string,
    location?: string
  ): Promise<AgentSessionEvent[]>;
  submitFeedback(
    request: AgentFeedbackRequest,
    userId: string
  ): Promise<AgentFeedbackResponse>;
  streamQuery(
    request: ChatRequestBody,
    userId: string
  ): AsyncGenerator<AgentStreamEvent, void, unknown>;
}
```

### 5.2 Provider Factory with Fail-Fast Configuration (`src/lib/agent-runtime/factory.ts`)

```typescript
import { IAgentRuntimeProvider } from "./types";
import { VertexAiReasoningEngineProvider } from "./client";
import { MockAgentRuntimeProvider } from "./mock/mock-provider";

export function createAgentRuntimeProvider(
  agentId?: string,
  location?: string
): IAgentRuntimeProvider {
  const isExplicitMock = process.env.MOCK_AGENT_RUNTIME === "true";
  const projectId = process.env.GOOGLE_CLOUD_PROJECT || "";
  const effectiveAgentId = agentId || process.env.GOOGLE_REASONING_ENGINE_ID || "";
  const isConfigured = Boolean(projectId && effectiveAgentId);

  // Fail-fast in production mode
  if (!isExplicitMock && !isConfigured && process.env.NODE_ENV === "production") {
    throw new Error(
      "Configuration Error: GOOGLE_CLOUD_PROJECT and GOOGLE_REASONING_ENGINE_ID must be configured in production."
    );
  }

  if (isExplicitMock || !isConfigured) {
    return new MockAgentRuntimeProvider(effectiveAgentId, location);
  }

  return new VertexAiReasoningEngineProvider(effectiveAgentId, location);
}
```

### 5.3 Event Normalizer (`src/lib/agent-runtime/event-normalizer.ts`)

Extracts and isolates pure functions:

- `safeParseJson(val: unknown): unknown`
- `extractTextFromQueryOutput(output: unknown): { text: string; thoughts: string[] }`
- `isRootWorkflowOutput(rawEvt?: Record<string, unknown>): boolean`
- `isSubagentNode(rawEvt?: Record<string, unknown>): boolean`
- `parseRawSessionEvent(rawEvt: unknown, sessionId: string, fallbackIdx: number): AgentSessionEvent`
- `groupTurnSessionEvents(rawEvents: unknown[], sessionId: string): AgentSessionEvent[]`
- `formatSessionEventsToThreadMessages(events: AgentSessionEvent[]): FormattedSessionThreadMessage[]`

---

## 6. Testing & Verification Strategy

1. **Isolated Unit Tests**:
   - Test `event-normalizer.ts` with diverse GCP Vertex AI event payloads (subagents, tool calls, function responses).
   - Test `sse-parser.ts` with chunked, multi-line, and malformed SSE data buffers.
   - Test `factory.ts` across development, test, and production environment variables.
2. **Provider Substitutability Test**:
   - Verify that both `MockAgentRuntimeProvider` and `VertexAiReasoningEngineProvider` satisfy the identical `IAgentRuntimeProvider` test suite.
3. **Regression Suite**:
   - Run `bun test tests/agent-client.test.ts` to confirm 100% compatibility with existing test assertions.

---

## 7. Boundaries & Guardrails

- **Always do**:
  - Keep `agent-runtime-client.ts` as a backward-compatible proxy so that existing imports don't break.
  - Fail fast when required environment variables are absent in production.
- **Ask first**:
  - Changing the REST wire endpoint paths on Google Cloud Vertex AI Reasoning Engines.
- **Never do**:
  - Re-introduce mock data branching inside `VertexAiReasoningEngineProvider`.
  - Expose Google Cloud service account private keys or IAM bearer tokens to the browser.

---

## 8. Success Criteria

- [ ] `src/lib/agent-runtime/` directory is established with clean submodules (< 250 LOC each).
- [ ] `IAgentRuntimeProvider` interface is implemented by both `VertexAiReasoningEngineProvider` and `MockAgentRuntimeProvider`.
- [ ] `createAgentRuntimeProvider` factory provides fail-fast validation in production.
- [ ] `src/lib/agent-runtime-client.ts` re-exports provider and normalizers cleanly.
- [ ] All 22 tests in `tests/agent-client.test.ts` pass without modification.
- [ ] `bun run check && bun run test` passes completely.
