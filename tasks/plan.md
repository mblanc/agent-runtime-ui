# Technical Implementation Plan: Subagent Reasoning & Collapsible Tool UI

## Overview

Re-route intermediate subagent outputs from Reasoning Engine workflows into the thinking/reasoning process accordion as collapsible function-tool-like UI components (`SubAgentCollapsible`), leaving only the final synthesis in the main response text.

---

## Component & Dependency Map

```
┌─────────────────────────────────────────────────────────────┐
│                 Vertex AI Reasoning Engine                  │
└──────────────────────────────┬──────────────────────────────┘
                               │ SSE / REST Session Events
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                src/lib/agent-runtime-client.ts              │
│  - streamQuery(): Parse subagent SSE events & yield types   │
│  - groupTurnSessionEvents(): Group intermediate subagents   │
│    into :::subagent[...] reasoning blocks                  │
└──────────────────────────────┬──────────────────────────────┘
                               │ AgentStreamEvent / AgentSessionEvent
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              src/lib/gemini-runtime-adapter.ts              │
│  - Route agent_call, agent_response, subagent events into   │
│    accumulatedReasoning instead of accumulatedText          │
└──────────────────────────────┬──────────────────────────────┘
                               │ ChatModelRunResult (reasoning vs text)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│               src/components/assistant-ui/                  │
│  - reasoning.tsx: Parse :::subagent[...] blocks             │
│  - subagent-collapsible.tsx: Render tool-like collapsible   │
│    with disclosure triangle & status badges                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Implementation Order

1. **Subagent Collapsible UI Enhancement (`subagent-collapsible.tsx` & `reasoning.tsx`)**:
   - Ensure `SubAgentCollapsible` has the function tool design pattern (header with subagent icon, title, status badges, disclosure chevron, expandable body with input/output).
   - Ensure `ReasoningText` handles subagent blocks cleanly.
2. **Stream Event Routing (`gemini-runtime-adapter.ts` & `agent-runtime-client.ts`)**:
   - Intercept subagent stream events and route their payload into `accumulatedReasoning` as `:::subagent[...]` blocks instead of `accumulatedText`.
3. **Session Event History Grouping (`agent-runtime-client.ts`)**:
   - Refine `groupTurnSessionEvents` and `isRootWorkflowOutput` to cleanly distinguish intermediate subagents vs final response text.
4. **Verification & Tests (`tests/agent-client.test.ts`)**:
   - Add/update unit tests covering subagent reasoning streaming and history grouping.
   - Run `npm test` and `npm run build` to confirm zero regressions.
