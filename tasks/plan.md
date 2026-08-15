# Implementation Plan: Agent Stream Metadata & Message Info (Inspection, Trace & Verified Reasoning)

## Overview

Implement a comprehensive, production-grade **Stream Metadata & Message Info Inspection System** in `agent-runtime-ui` based on [`docs/message_info.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/message_info.md). This feature extracts rich telemetry and runtime metadata emitted by **Google Cloud Agent Runtime** (Vertex AI Reasoning Engines & ADK) and Vertex AI `SessionService`, exposing token usage breakdowns, model version tags, Cloud Trace deep links, confidence ratings, verified reasoning cryptographic signatures, multi-agent node paths, and live action deltas within the Gemini-styled user interface.

---

## Architecture Decisions

- **Stateless Metadata Propagation**: Telemetry fields (`usage_metadata`, `model_version`, `invocation_id`, `avg_logprobs`, `node_info`, `thought_signature`, `actions`) are extracted directly from the SSE event stream (`/api/chat`) and session history REST events (`/api/sessions/[sessionId]`), normalized, and attached to `@assistant-ui/react` message custom metadata (`message.metadata.custom`). Zero additional database storage or stateful caching is required.
- **Unified Message Info Contract**: Define strict, backward-compatible TypeScript types for all telemetry attributes (`AgentUsageMetadata`, `AgentNodeInfo`, `AgentActionsDelta`, `AgentMessageInfoMetadata`) in [`src/types/agent.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/types/agent.ts) to guarantee end-to-end type safety across BFF routes, adapters, and UI components.
- **Gemini-Aesthetic Pill Badges & Popovers**: Design lightweight, accessible, non-intrusive badges and popovers styled with Google Gemini design tokens (`#f0f4f9` / `#282a2c`, monospace telemetry numbers, subtle icons, Radix UI popovers/tooltips) placed along the assistant message footer and action bar.
- **Deep Tracing & Cloud Console Integration**: Provide single-click copy for `invocation_id` / Turn ID and construct direct Google Cloud Trace console URLs (`https://console.cloud.google.com/traces/list?project={projectId}&tid={invocationId}`) allowing developers to inspect distributed traces in GCP.
- **Cryptographic CoT Verification**: Render a distinct "Verified Reasoning" badge with shield icon and tooltip on `ReasoningRoot` and `ThoughtCollapsible` whenever `thought_signature` is present, verifying authentic Gemini 2.0 Thinking chain-of-thought generation.
- **Token Telemetry Breakdown**: Provide precise token metrics (Input / Output / Thinking / Total / Traffic Tier) in an interactive popover attached to the timing footer, replacing rough character approximations with exact Vertex AI billing metrics.
- **Mock Mode Parity**: Update `MockAgentRuntimeProvider` and `mockSessionEventsStore` to emit and persist realistic telemetry payloads across multi-turn sessions, ensuring full local testability without active GCP credentials.

---

## Dependency Graph

```
┌─────────────────────────────────────────────────────────────────┐
│ Phase 1: Data Contracts, Types & Metadata Parser Engine         │
│ (src/types/agent.ts, sse-parser.ts, event-normalizer.ts)        │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 2: Chat Adapter Stream Pipeline & Mock Parity             │
│ (chat-adapter.ts, session-adapter.tsx, mock-provider.ts)        │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 3: Visual Telemetry Primitives & Info Popovers            │
│ (model-badge.tsx, token-popover.tsx, trace-link.tsx, CoT badge) │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 4: Gemini Message Footer Integration & Comprehensive UI   │
│ (gemini-message.tsx, gemini-message-timing.tsx, reasoning.tsx)  │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│ Phase 5: Verification, Quality Preflight & Documentation        │
│ (tests/message-info-*.test.ts(x), preflight quality gates)      │
└─────────────────────────────────────────────────────────────────┘
```

---

## Task List

### Phase 1: Data Contracts, Types & Metadata Parser Engine

#### Task 1: Define Message Info & Stream Metadata Type Contracts

**Description:** Extend [`src/types/agent.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/types/agent.ts) with TypeScript interfaces representing all metadata emitted during `:streamQuery` and stored in `SessionService` events (`AgentUsageMetadata`, `UsageMetadataTokenDetail`, `AgentNodeInfo`, `AgentActionsDelta`, `AgentMessageInfoMetadata`). Extend `AgentStreamEvent`, `AgentSessionEvent`, and `AgentMessagePart`.

**Acceptance criteria:**

- [ ] `AgentUsageMetadata` defines `prompt_token_count`, `candidates_token_count`, `thoughts_token_count`, `total_token_count`, `traffic_type`, and token details arrays.
- [ ] `AgentNodeInfo` defines `path` (DAG node path string e.g. `"root_agent@1"`).
- [ ] `AgentActionsDelta` defines `state_delta`, `artifact_delta`, `requested_auth_configs`, `requested_tool_confirmations`.
- [ ] `AgentMessageInfoMetadata` encapsulates `invocationId`, `modelVersion`, `usageMetadata`, `avgLogprobs`, `nodeInfo`, `thoughtSignature`, `actions`, `finishReason`, `timestamp`.
- [ ] `AgentStreamEvent` and `AgentSessionEvent` include these optional metadata fields with both snake_case and camelCase compatibility.
- [ ] Zero `any` types; all types exported from [`src/types/agent.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/types/agent.ts).

**Verification:**

- [ ] Tests pass: `bun run check`
- [ ] Build succeeds: `bun run build`
- [ ] Manual check: Strict typing validated without compilation errors.

**Dependencies:** None

**Files likely touched:**

- [`src/types/agent.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/types/agent.ts)

**Estimated scope:** XS (1 file)

---

#### Task 2: Implement Stream Parser Telemetry Extraction

**Description:** Update [`src/lib/agent-runtime/sse-parser.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/sse-parser.ts) to extract `usage_metadata` / `usageMetadata`, `model_version` / `modelVersion`, `invocation_id` / `invocationId`, `avg_logprobs` / `avgLogprobs`, `node_info` / `nodeInfo`, `thought_signature` / `thoughtSignature`, `actions`, `finish_reason`, and `timestamp` from raw SSE JSON stream chunks.

**Acceptance criteria:**

- [ ] Helper extraction functions correctly resolve camelCase and snake_case variants for telemetry attributes.
- [ ] `thought_signature` is extracted from `content.parts[].thought_signature` and attached to thought stream events.
- [ ] `usage_metadata`, `model_version`, `invocation_id`, `avg_logprobs`, `node_info`, `actions` are preserved and attached to yielded `AgentStreamEvent` instances.
- [ ] Existing parsing for tool calls, subagents, thoughts, and grounding remains 100% functional.

**Verification:**

- [ ] Tests pass: `bun test tests/sse-parser.test.ts`
- [ ] Build succeeds: `bun run check`

**Dependencies:** Task 1

**Files likely touched:**

- [`src/lib/agent-runtime/sse-parser.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/sse-parser.ts)
- [`tests/sse-parser.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/sse-parser.test.ts)

**Estimated scope:** S (2 files)

---

#### Task 3: Implement Session Event Normalizer Telemetry Preservation

**Description:** Update [`src/lib/agent-runtime/event-normalizer.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/event-normalizer.ts) (`parseRawSessionEvent`, `groupTurnSessionEvents`, and `formatSessionEventsToThreadMessages`) to extract and merge message info metadata across historical session events.

**Acceptance criteria:**

- [ ] `parseRawSessionEvent` extracts `usageMetadata`, `modelVersion`, `invocationId`, `avgLogprobs`, `nodeInfo`, `thoughtSignature`, and `actions` from `raw_event`, `config`, and root session event objects.
- [ ] `groupTurnSessionEvents` aggregates token usage and preserves latest model version and trace ID for the turn.
- [ ] `formatSessionEventsToThreadMessages` passes metadata into `metadata.custom` on formatted thread messages.

**Verification:**

- [ ] Tests pass: `bun test tests/event-normalizer.test.ts`
- [ ] Build succeeds: `bun run check`

**Dependencies:** Task 1, Task 2

**Files likely touched:**

- [`src/lib/agent-runtime/event-normalizer.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/event-normalizer.ts)
- [`tests/event-normalizer.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/event-normalizer.test.ts)

**Estimated scope:** S (2 files)

---

### Checkpoint 1: Foundation & Parser Quality Gate

- [ ] All parser and normalizer unit tests pass: `bun test tests/sse-parser.test.ts tests/event-normalizer.test.ts`
- [ ] Strict type checking passes: `bun run check`

---

### Phase 2: Chat Adapter Stream Pipeline & Mock Parity

#### Task 4: Wire Message Info Telemetry into Chat Adapter Stream Loop

**Description:** Update `createYieldContent` and the SSE stream reader in [`src/lib/adapters/chat-adapter.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/adapters/chat-adapter.ts) to accumulate and yield telemetry metadata (`modelVersion`, `invocationId`, `usageMetadata`, `avgLogprobs`, `nodeInfo`, `thoughtSignature`, `actions`) in `message.metadata.custom`. Ensure [`src/lib/session-adapter.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/session-adapter.tsx) preserves these fields in `ThreadMessageLike`.

**Acceptance criteria:**

- [ ] `createYieldContent` accepts optional `messageInfo` parameters and packs them into `metadata.custom`.
- [ ] Live SSE stream updates `latestUsageMetadata`, `latestModelVersion`, `latestInvocationId`, `latestAvgLogprobs`, `latestNodeInfo`, and `latestThoughtSignature` as chunks arrive.
- [ ] Final `[DONE]` event yields complete accumulated token metrics and telemetry metadata.
- [ ] `formatRemoteMessagesToThreadMessages` in [`src/lib/session-adapter.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/session-adapter.tsx) preserves custom message metadata on historical thread reload.

**Verification:**

- [ ] Tests pass: `bun test tests/agent-client.test.ts`
- [ ] Build succeeds: `bun run check`

**Dependencies:** Task 2, Task 3

**Files likely touched:**

- [`src/lib/adapters/chat-adapter.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/adapters/chat-adapter.ts)
- [`src/lib/session-adapter.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/session-adapter.tsx)

**Estimated scope:** M (2 files)

---

#### Task 5: Implement Mock Provider Stream Metadata & Multi-Turn Persistence

**Description:** Enrich `MockAgentRuntimeProvider.streamQuery` in [`src/lib/agent-runtime/mock/mock-provider.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/mock/mock-provider.ts) and [`src/lib/agent-runtime/mock/mock-store.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/mock/mock-store.ts) to emit realistic `usage_metadata`, `model_version`, `invocation_id`, `avg_logprobs`, `node_info: { path: "root_agent@1" }`, and `thought_signature` events, persisting them into mock session event records.

**Acceptance criteria:**

- [ ] Mock stream emits `usage_metadata` with realistic prompt, candidates, and thoughts token counts.
- [ ] Mock stream emits `model_version` matching the selected model tier (`gemini-2.5-flash` or `gemini-2.5-pro`).
- [ ] Mock stream emits OpenTelemetry-compatible `invocation_id` UUID and cryptographic `thought_signature`.
- [ ] `mockSessionEventsStore` stores the full telemetry payload for session retrieval.

**Verification:**

- [ ] Tests pass: `bun test tests/agent-client.test.ts`
- [ ] Build succeeds: `bun run check`

**Dependencies:** Task 4

**Files likely touched:**

- [`src/lib/agent-runtime/mock/mock-provider.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/mock/mock-provider.ts)
- [`src/lib/agent-runtime/mock/mock-store.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/mock/mock-store.ts)
- [`tests/agent-client.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/agent-client.test.ts)

**Estimated scope:** S (3 files)

---

### Checkpoint 2: Stream Pipeline & Adapter Quality Gate

- [ ] Adapter and mock streaming tests pass: `bun test tests/agent-client.test.ts`
- [ ] All 32 existing test suites pass cleanly: `bun run test`

---

### Phase 3: Visual Telemetry Primitives & Info Popovers

#### Task 6: Build Model Version Badge and Token Usage Popover

**Description:** Create [`src/components/assistant-ui/model-badge.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/model-badge.tsx) and [`src/components/assistant-ui/token-usage-popover.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/token-usage-popover.tsx) to display the model version tag (e.g. `Gemini 2.5 Flash`, `gemini-flash-latest`) and an interactive popover breaking down prompt tokens, candidate tokens, reasoning tokens, and billing traffic tier.

**Acceptance criteria:**

- [ ] `ModelBadge` renders a compact, elegant pill badge with model icon and human-friendly display name (e.g. `Flash`, `Pro`, `gemini-flash-latest`).
- [ ] `TokenUsagePopover` renders on hover or click with detailed breakdown:
  - Input tokens (`prompt_token_count`)
  - Output tokens (`candidates_token_count`)
  - Thinking tokens (`thoughts_token_count`)
  - Total tokens (`total_token_count`)
  - Traffic tier badge (`ON_DEMAND` / `PROVISIONED`)
- [ ] Fallback gracefully when exact token metadata is pending or absent (using estimated tokens/s).

**Verification:**

- [ ] Tests pass: `bun test tests/components.test.tsx`
- [ ] Build succeeds: `bun run check`

**Dependencies:** Task 4

**Files likely touched:**

- [`src/components/assistant-ui/model-badge.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/model-badge.tsx)
- [`src/components/assistant-ui/token-usage-popover.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/token-usage-popover.tsx)

**Estimated scope:** M (2 files)

---

#### Task 7: Build Cloud Trace Deep Link & Message Info Inspection Modal

**Description:** Create [`src/components/assistant-ui/cloud-trace-link.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/cloud-trace-link.tsx) and [`src/components/assistant-ui/message-info-dialog.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/message-info-dialog.tsx) to provide a single-click Cloud Trace ID copy button, Google Cloud Trace console link, confidence rating display, DAG node path breadcrumb, and a complete technical inspection dialog.

**Acceptance criteria:**

- [ ] `CloudTraceLink` provides a copy button for `invocation_id` with 2-second visual copied confirmation.
- [ ] Generates valid Google Cloud Trace console URL (`https://console.cloud.google.com/traces/list?project={projectId}&tid={invocationId}`) with external link icon.
- [ ] Confidence indicator converts `avg_logprobs` into human-understandable certainty score (e.g. `-0.21 logprob` / High Confidence).
- [ ] Node path badge displays execution DAG location (e.g. `root_agent@1`).
- [ ] `MessageInfoDialog` provides a comprehensive view of all turn metadata in a clean modal/sheet.

**Verification:**

- [ ] Tests pass: `bun test tests/components.test.tsx`
- [ ] Build succeeds: `bun run check`

**Dependencies:** Task 6

**Files likely touched:**

- [`src/components/assistant-ui/cloud-trace-link.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/cloud-trace-link.tsx)
- [`src/components/assistant-ui/message-info-dialog.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/message-info-dialog.tsx)

**Estimated scope:** M (2 files)

---

#### Task 8: Build Verified Reasoning & Thought Signature Indicator

**Description:** Update [`src/components/assistant-ui/reasoning.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/reasoning.tsx) and [`src/components/assistant-ui/thought-collapsible.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/thought-collapsible.tsx) to render a "Verified Reasoning" cryptographic badge with shield icon and tooltip when `thought_signature` is present.

**Acceptance criteria:**

- [ ] `ReasoningTrigger` displays a subtle verified shield badge (`Verified Reasoning`) when `thought_signature` exists on the message or thought block.
- [ ] Hover tooltip explains cryptographic verification by Vertex AI Reasoning Engine.
- [ ] Truncated cryptographic signature string can be copied or inspected in the message info modal.

**Verification:**

- [ ] Tests pass: `bun test tests/components.test.tsx`
- [ ] Build succeeds: `bun run check`

**Dependencies:** Task 7

**Files likely touched:**

- [`src/components/assistant-ui/reasoning.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/reasoning.tsx)
- [`src/components/assistant-ui/thought-collapsible.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/thought-collapsible.tsx)

**Estimated scope:** S (2 files)

---

### Checkpoint 3: Visual Telemetry Primitives Gate

- [ ] All visual component tests pass: `bun test tests/components.test.tsx`
- [ ] Type check clean: `bun run check`

---

### Phase 4: Gemini Message Integration & UX Polish

#### Task 9: Integrate Message Info Subsystems into Gemini Message Footer

**Description:** Update [`src/components/assistant-ui/gemini-message.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/gemini-message.tsx) and [`src/components/assistant-ui/gemini-message-timing.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/gemini-message-timing.tsx) to assemble all telemetry badges into the assistant message footer and action bar.

**Acceptance criteria:**

- [ ] Message footer combines:
  - Generation duration & speed (`1.2s • 85 tok/s`)
  - `ModelBadge` (`Flash` / `Pro` / `gemini-flash-latest`)
  - `TokenUsagePopover` trigger (`4,090 tokens` with breakdown popover)
  - `CloudTraceLink` / Turn ID trigger
  - Confidence rating badge (if `avg_logprobs` is present)
  - `Info` button triggering `MessageInfoDialog` in the message action bar.
- [ ] Flawless responsive layout on mobile and desktop, matching Gemini dark and light themes.

**Verification:**

- [ ] Tests pass: `bun test tests/components.test.tsx`
- [ ] Build succeeds: `bun run check`

**Dependencies:** Task 6, Task 7, Task 8

**Files likely touched:**

- [`src/components/assistant-ui/gemini-message.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/gemini-message.tsx)
- [`src/components/assistant-ui/gemini-message-timing.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/gemini-message-timing.tsx)

**Estimated scope:** S (2 files)

---

#### Task 10: Build Message Info Test Suite

**Description:** Create dedicated test suites [`tests/message-info-parser.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/message-info-parser.test.ts), [`tests/message-info-stream.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/message-info-stream.test.ts), and [`tests/message-info-ui.test.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/tests/message-info-ui.test.tsx) validating the end-to-end lifecycle of telemetry metadata parsing, streaming, and UI interaction.

**Acceptance criteria:**

- [ ] `message-info-parser.test.ts` validates extraction of all telemetry fields (`usage_metadata`, `model_version`, `invocation_id`, `avg_logprobs`, `node_info`, `thought_signature`, `actions`) across diverse SSE payload structures.
- [ ] `message-info-stream.test.ts` validates live adapter accumulation, token calculations, and multi-turn session persistence.
- [ ] `message-info-ui.test.tsx` tests rendering and user interactions: hovering token popover, copying trace ID, clicking info modal, and verified reasoning shield.

**Verification:**

- [ ] Tests pass: `bun test tests/message-info-*.test.ts*`
- [ ] Build succeeds: `bun run check`

**Dependencies:** Task 9

**Files likely touched:**

- [`tests/message-info-parser.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/message-info-parser.test.ts)
- [`tests/message-info-stream.test.ts`](file:///Users/mblanc/projects/agent-runtime-ui/tests/message-info-stream.test.ts)
- [`tests/message-info-ui.test.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/tests/message-info-ui.test.tsx)

**Estimated scope:** M (3 files)

---

### Checkpoint 4: UI Integration & Verification Gate

- [ ] All message info tests pass: `bun test tests/message-info-*.test.ts*`
- [ ] Existing test suite passes with zero regressions: `bun run test`

---

### Phase 5: Verification, Quality Preflight & Documentation

#### Task 11: Execute Full Preflight & Update Documentation

**Description:** Run full preflight quality gates (`bun run preflight`), format code, check types, run linter, execute entire Vitest suite, and update [`AGENTS.md`](file:///Users/mblanc/projects/agent-runtime-ui/AGENTS.md) and [`tasks/todo.md`](file:///Users/mblanc/projects/agent-runtime-ui/tasks/todo.md).

**Acceptance criteria:**

- [ ] `bun run check` passes with 0 type errors.
- [ ] `bun run lint` passes with 0 ESLint warnings or errors.
- [ ] `bun run test` passes all tests across all test suites.
- [ ] `bun run preflight` exits with status 0.
- [ ] [`AGENTS.md`](file:///Users/mblanc/projects/agent-runtime-ui/AGENTS.md) index updated with new message info components, utilities, and specs.

**Verification:**

- [ ] `bun run preflight` exits 0 cleanly.

**Dependencies:** Tasks 1-10

**Files likely touched:**

- [`AGENTS.md`](file:///Users/mblanc/projects/agent-runtime-ui/AGENTS.md)
- [`tasks/todo.md`](file:///Users/mblanc/projects/agent-runtime-ui/tasks/todo.md)

**Estimated scope:** S (2 files)

---

### Checkpoint 5: Complete & Ready for Review

- [ ] All acceptance criteria across Tasks 1-11 verified.
- [ ] Quality gates clear.

---

## Risks and Mitigations

| Risk                                                                                                                                                               | Impact | Mitigation                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| **Streaming Telemetry Partial vs Final Flaps**: `usage_metadata` or `avg_logprobs` may only be emitted in the final chunk or summary event, causing layout jitter. | Medium | Buffer telemetry values in `chat-adapter.ts` and only render badges in the message footer when streaming is complete or stable.     |
| **Missing Google Cloud Project ID for Trace Links**: In local/mock environments, `GOOGLE_CLOUD_PROJECT` may not be configured.                                     | Low    | Gracefully fallback to copying the raw `invocation_id` and omit the deep link if `projectId` is unavailable.                        |
| **Large Cryptographic Signatures Cluttering UI**: `thought_signature` is a long cryptographic string.                                                              | Low    | Render only a compact, stylized "Verified Reasoning" shield icon with tooltip; keep the raw signature inside the inspection dialog. |
| **Legacy Session Event Compatibility**: Older stored session events in Vertex AI Session Service may lack new metadata fields.                                     | Low    | Make all telemetry properties optional in `AgentSessionEvent` with safe defaults in event normalizer.                               |

---

## Open Questions

- None. The specification in [`docs/message_info.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/message_info.md) is comprehensive and maps directly onto the existing `@assistant-ui/react` v0.15 adapter architecture.
