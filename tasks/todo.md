# Task List: Subagent Reasoning & Collapsible Tool UI

- [x] Task 1: Enhance `SubAgentCollapsible` component styling & disclosure triangle
  - Acceptance: `SubAgentCollapsible` matches function tool design with subagent icon, title, role/status badges, disclosure chevron, and input/output panel.
  - Verify: Component unit tests / inspect `src/components/assistant-ui/subagent-collapsible.tsx`.
  - Files: `src/components/assistant-ui/subagent-collapsible.tsx`, `src/components/assistant-ui/reasoning.tsx`

- [x] Task 2: Update stream event parsing & adapter routing for live subagents
  - Acceptance: Streaming subagent events from `agent-runtime-client.ts` are routed by `gemini-runtime-adapter.ts` into `accumulatedReasoning` as `:::subagent[...]` blocks instead of `accumulatedText`.
  - Verify: Test streamQuery handling in `tests/agent-client.test.ts` and `npm test`.
  - Files: `src/lib/agent-runtime-client.ts`, `src/lib/gemini-runtime-adapter.ts`

- [x] Task 3: Refine session event history grouping for subagent turns
  - Acceptance: `groupTurnSessionEvents` accurately puts intermediate subagent events into `thought` as `:::subagent[...]` blocks and reserves `content` for final root workflow synthesis.
  - Verify: `npm test` passes with test cases for multi-agent reasoning engines.
  - Files: `src/lib/agent-runtime-client.ts`, `tests/agent-client.test.ts`

- [x] Task 4: End-to-end verification and build check
  - Acceptance: Full test suite passes and application builds cleanly without errors.
  - Verify: Run `npm test` and `npm run build`.
  - Files: Entire repository.
