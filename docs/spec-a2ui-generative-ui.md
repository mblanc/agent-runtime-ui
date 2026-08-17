# Specification: A2UI (Agent-to-UI / Generative UI Streaming)

## 1. Objective & Background

### 1.1 Objective

Implement the **A2UI Protocol** ([`a2ui.org`](https://a2ui.org/) / [`adk.dev/integrations/a2ui`](https://adk.dev/integrations/a2ui/)) in `agent-runtime-ui`. This allows Google Cloud ADK agents to stream structured JSON UI component trees (`application/json+a2ui`) that render directly inside conversational messages as interactive, Gemini-styled widgets (Cards, Stat Metrics, Forms, Action Buttons, Selection Dropdowns, and Mini-Charts) with two-way interactive dispatch back to the agent session.

### 1.2 Target User & Problem Solved

- **Target User**: Enterprise users and developers interacting with ADK agents on Vertex AI.
- **Problem Solved**: Text and markdown are passive and clumsy for structured interactions (e.g., flight booking cards, multi-field configuration forms, approval buttons, or metric cards).
- **Solution**: The agent emits an A2UI JSON payload. The client dynamically parses and renders native React/Tailwind components directly in the message flow. Clicking buttons or submitting forms updates component state in-place and dispatches the action back to the agent to continue the multi-turn workflow.

---

## 2. Architecture & Data Contracts

### 2.1 A2UI Wire Format (`src/types/agent.ts`)

A2UI payloads are delivered inside message parts using the official MIME type `application/json+a2ui`:

```typescript
export type A2UIComponentType =
  | "Card"
  | "Heading"
  | "Text"
  | "Badge"
  | "Button"
  | "Divider"
  | "StatMetric"
  | "Form"
  | "TextInput"
  | "SelectDropdown"
  | "RadioGroup"
  | "Table"
  | "ProgressBar"
  | "MiniBarChart"
  | (string & {});

export interface A2UIAction {
  event: string; // e.g. "submit_approval", "select_option", "form_submit"
  payload?: Record<string, unknown>;
}

export interface A2UIComponentNode {
  type: A2UIComponentType;
  id?: string;
  props?: Record<string, unknown>;
  children?: A2UIComponentNode[] | string;
  actions?: A2UIAction[];
}

export interface A2UIPartData {
  version?: "0.8" | "0.9" | string;
  root: A2UIComponentNode | A2UIComponentNode[];
}

export interface AgentMessagePart {
  // ... existing fields
  a2ui?: A2UIPartData;
  a2uiData?: A2UIPartData;
}
```

### 2.2 Action Dispatch Protocol (`/api/chat`)

When a user interacts with an A2UI component (e.g. clicks an action button or submits a form):

1. **In-Place State Lock**: The component transitions to a `submitted` / `disabled` state with a subtle loading spinner.
2. **Automated Conversational Turn**: The component dispatches a structured user message over `/api/chat`:
   ```json
   {
     "role": "user",
     "content": "Action: submit_approval (decision=approved, region=europe-west1)",
     "parts": [
       {
         "a2uiAction": {
           "componentId": "budget_card_1",
           "event": "submit_approval",
           "payload": { "decision": "approved", "region": "europe-west1" }
         }
       }
     ]
   }
   ```
3. The ADK agent receives the event and streams the next assistant turn.

---

## 3. UI & UX Architecture

### 3.1 Inline Message Layout (`src/components/a2ui/`)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Assistant:                                                                  │
│ I've prepared the deployment plan and approval card:                       │
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ 🚀 Cloud Run Deployment Plan                            [ Status: Ready ]│ │
│ ├─────────────────────────────────────────────────────────────────────────┤ │
│ │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐                │ │
│ │  │ Service Name  │  │ Target Region │  │ Min Instances │                │ │
│ │  │ backend-api   │  │ europe-west1  │  │       2       │                │ │
│ │  └───────────────┘  └───────────────┘  └───────────────┘                │ │
│ │                                                                         │ │
│ │  CPU Allocation: [ 2 vCPU ▾ ]       Memory Limit: [ 4 GiB ▾ ]           │ │
│ │                                                                         │ │
│ │  [ 🚀 Approve & Deploy ]    [ ✏ Modify Config ]    [ ✕ Cancel ]          │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Catalog Implementations (`src/components/a2ui/catalog/`)

1. **Containers & Typography**:
   - `Card`: Rounded border container with subtle background `#f8fafd` / `#1a1c1e`.
   - `Heading`: Level 1-4 styled headings.
   - `Text`: Markdown-enabled body text.
   - `Badge`: Status tags (success, warning, error, info, neutral).
   - `Divider`: Subtle separator line.
2. **Key-Value & Metrics**:
   - `StatMetric`: Metric grid showing label, value, and optional change badge (`+15%`).
3. **Form Controls**:
   - `Form`: Wrapper managing form state and submit events.
   - `TextInput`: Labelled text/number input.
   - `SelectDropdown`: Radix-based selection menu.
   - `RadioGroup`: Radio selection list.
4. **Action Controls**:
   - `Button`: Action triggers with primary (`#0b57d0`), outline, and destructive styles.
5. **Data & Visual Summaries**:
   - `Table`: Clean compact data table.
   - `ProgressBar`: Animated progress meter.
   - `MiniBarChart`: Lightweight SVG bar chart comparing categories.
6. **Graceful Fallback**:
   - `A2UIFallback`: If an unknown component type is encountered, render a clean structured JSON/card view without throwing errors.

---

## 4. Tech Stack & Dependencies

- **Framework**: Next.js 15 (App Router), React 19, TypeScript (Strict).
- **Styling & Primitives**: Tailwind CSS v3, Radix UI (`@radix-ui/react-select`, `@radix-ui/react-radio-group`), `lucide-react`.
- **Testing**: Vitest (`vitest`), `@testing-library/react`, `jsdom`.

---

## 5. File Structure & Changes

```text
src/
├── components/
│   ├── a2ui/
│   │   ├── a2ui-renderer.tsx                 # Root A2UI component tree dispatcher
│   │   ├── a2ui-context.tsx                  # Action dispatch callback context
│   │   ├── a2ui-fallback.tsx                 # Graceful fallback for unknown nodes
│   │   └── catalog/
│   │       ├── a2ui-card.tsx                 # Card container
│   │       ├── a2ui-stat-metric.tsx          # Metric cards & key-value grids
│   │       ├── a2ui-button.tsx               # Action buttons & trigger handlers
│   │       ├── a2ui-form.tsx                 # Form container & submit handling
│   │       ├── a2ui-inputs.tsx               # TextInput, Select, RadioGroup
│   │       ├── a2ui-table.tsx                # Compact table view
│   │       └── a2ui-mini-chart.tsx           # Lightweight SVG mini bar/progress
│   └── assistant-ui/
│       └── gemini-message.tsx                # Mount A2UI renderer for a2ui message parts
├── lib/
│   ├── agent-runtime-client.ts               # Mock stream triggers for A2UI cards/forms
│   └── adapters/chat-adapter.ts              # Parse application/json+a2ui stream parts
└── types/
    └── agent.ts                              # A2UIComponentNode, A2UIAction, A2UIPartData
```

---

## 6. Testing Strategy

1. **Schema & Parser Tests (`tests/a2ui-parser.test.ts`)**:
   - Test parsing valid and malformed A2UI JSON trees.
   - Test recursive tree traversal and fallback routing.
2. **Catalog Component Tests (`tests/a2ui-catalog.test.tsx`)**:
   - Test `Card`, `StatMetric`, `Button`, `Form`, `Select`, `Table`, and `MiniBarChart` rendering.
   - Test button click dispatches correct event and payload.
   - Test form submit serializes all input fields into action payload.
3. **Stream Integration Tests (`tests/a2ui-stream.test.ts`)**:
   - Test `:streamQuery` SSE stream receiving `application/json+a2ui` part and rendering the widget.
   - Test automated user turn dispatch on button click.

---

## 7. Boundaries

- **Always**:
  - Maintain clean separation between A2UI (inline chat micro-UI) and Artifacts Canvas (side-by-side workspace).
  - Disable action buttons and inputs once submitted to prevent double-execution.
  - Provide fallback rendering for unsupported component types.
  - Maintain 100% strict TypeScript types with zero `any`.
- **Never**:
  - Never execute unsandboxed arbitrary JavaScript or iframes inside inline chat bubbles.

---

## 8. Success Criteria & Verification

- [ ] `bun run check` passes with zero TypeScript errors.
- [ ] `bun run lint` passes with zero ESLint warnings/errors.
- [ ] `bun run test` passes all unit and component tests.
- [ ] Asking the agent in mock mode: _"Show me the deployment approval card"_ renders an interactive A2UI card.
- [ ] Clicking **"Approve & Deploy"** updates the card state to `Submitted` and automatically sends the action to the agent.
