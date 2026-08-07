# Spec: Subagent Reasoning & Collapsible Tool UI for Agent Workflows

## Objective

Fix the handling and rendering of subagent outputs in Vertex AI Reasoning Engine workflows (e.g. `projects/125188993477/locations/us-central1/reasoningEngines/6238058879222022144`).

Currently, intermediate subagent answers are being rendered as the main assistant response result rather than being part of the reasoning process.

This spec defines changes to:

1. Stream processing and session event grouping to ensure intermediate subagent outputs (during live streaming and history loading) are categorized as reasoning/thought blocks instead of main response text.
2. Reasoning UI rendering to display subagent calls and answers in the thinking box formatted like function tools, featuring a collapsible card with a disclosure triangle (chevron), subagent name, status badge, and expandable input/output details.

---

## Tech Stack

- **Framework**: Next.js (App Router), React 19, Tailwind CSS
- **Chat UI**: `@assistant-ui/react`, Lucide React icons
- **Backend / Client**: Google Auth Library, Vertex AI Reasoning Engine REST / SSE streaming endpoints
- **Testing**: Vitest

---

## Commands

- **Build**: `npm run build`
- **Test**: `npm test`
- **Lint**: `npm run lint`
- **Dev**: `npm run dev`

---

## Project Structure

```
src/
├── app/
│   └── api/
│       └── chat/route.ts                 # Next.js API route handling SSE streaming
├── components/
│   └── assistant-ui/
│       ├── gemini-message.tsx            # Message container rendering reasoning & content
│       ├── gemini-reasoning.tsx          # Standalone Gemini thinking process accordion
│       ├── reasoning.tsx                 # Reasoning root, trigger, content & block parser
│       ├── subagent-collapsible.tsx      # Subagent collapsible card component with disclosure triangle
│       └── tool-collapsible.tsx          # Function tool collapsible card component
├── lib/
│   ├── agent-runtime-client.ts           # Agent Runtime client, event parser & turn grouping
│   └── gemini-runtime-adapter.ts         # Assistant UI chat adapter & SSE stream handler
tasks/
├── spec.md                               # This specification
├── plan.md                               # Implementation plan
└── todo.md                               # Task breakdown
```

---

## Code Style

Follow modern TypeScript and React practices in line with existing codebase patterns:

- Use functional components with explicit TypeScript interfaces for props.
- Standardize reasoning block syntax using structured markdown directives:
  `:::subagent[Agent Name]{agent="name" status="complete" id="123"}\n**Input:**\n...\n**Output:**\n...\n:::`
- Ensure components support dark mode and light mode with Tailwind CSS classes.

---

## Testing Strategy

- **Framework**: Vitest
- **Unit Tests**:
  - `tests/agent-client.test.ts`: Verify `groupTurnSessionEvents`, `parseRawSessionEvent`, `isRootWorkflowOutput`, and `streamQuery` subagent categorization.
  - Test streaming events handling in `gemini-runtime-adapter.ts` for subagent events.
  - Test `parseReasoningBlocks` and `ReasoningText` rendering of subagent blocks as tool-like collapsibles.

---

## Boundaries

- **Always do**: Keep subagent execution details inside the thinking/reasoning box (`ReasoningRoot`), reserve main content (`accumulatedText`) strictly for the final synthesized answer.
- **Ask first**: Major changes to the underlying SSE protocol between BFF and frontend.
- **Never do**: Break existing single-agent or non-workflow session rendering; mix up user messages with assistant reasoning blocks.

---

## Success Criteria

1. **Subagent Answers in Reasoning**: Intermediate subagent thoughts, inputs, and answers from Reasoning Engine workflows are routed into `accumulatedReasoning` / `thought` rather than `accumulatedText` / main message content.
2. **Tool-like Collapsible UI**: Subagent answers in the thinking box render as collapsible cards with a disclosure triangle (chevron), subagent title, status indicator (Running / Completed / Error), and expandable panel displaying input/output.
3. **Session History Support**: Loading session history from Vertex AI Reasoning Engines correctly groups subagent events under the main turn's `thought` as collapsible subagent blocks, leaving only the final synthesized response in `content`.
4. **Streaming Real-time Support**: Real-time SSE streams with subagent steps display interactive collapsible subagent tools inside the thinking box as they execute and complete.
5. **Passing Tests**: All unit and integration tests pass cleanly via `npm test`.

---

## Open Questions

1. Should subagent collapsibles default to closed or open while the subagent is actively running during live streaming? (Proposed: default open while running, auto-collapse or stay user-controlled upon completion).
2. Are subagent inputs always available in SSE events, or should the card gracefully handle output-only subagent events? (Proposed: render Input section when present, otherwise render subagent output directly).
