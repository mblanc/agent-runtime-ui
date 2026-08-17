# Specification: Python Code Execution Sandbox & Rich Output Visualizer

## 1. Objective & Background

### 1.1 Objective

Implement first-class support for **Vertex AI & ADK Python Code Execution** in `agent-runtime-ui`. This specification defines the end-to-end data contracts, stream parsing, and Gemini-styled interactive UI components to render model-generated Python code blocks (`executable_code`) paired with their sandboxed execution results (`code_execution_result`), including stdout/stderr console logs, tabular data outputs, and generated visual charts (Matplotlib, Seaborn).

### 1.2 Target User & Problem Solved

- **Target User**: Developers, data scientists, financial analysts, and enterprise users relying on Gemini for computations, data analysis, statistical modeling, algorithmic reasoning, and chart generation.
- **Problem Solved**:
  - Without dedicated code execution support, code snippets and execution logs appear as unstructured markdown text or unformatted tool calls, masking the execution status (success, error, timeout) and preventing rich interactive inspection.
  - Generated visual charts (e.g. generated plots) are lost or rendered as raw ASCII rather than high-fidelity visual cards.
- **Solution**:
  - Intercept native Vertex AI `executable_code` and `code_execution_result` message parts from the `:streamQuery` SSE stream.
  - Render an interactive, collapsible **Code Execution Card** featuring Shiki syntax highlighting, execution duration, exit outcome badges (`Exit 0: OK`, `Exit 1: Error`, `Timeout`), a tabbed dark console terminal for stdout/stderr, and inline rendering of generated visual plots.

---

## 2. Tech Stack & Dependencies

| Layer                   | Technology / Package                                                                              | Purpose                                                   |
| :---------------------- | :------------------------------------------------------------------------------------------------ | :-------------------------------------------------------- |
| **Framework**           | Next.js 15 (App Router), React 19, TypeScript (Strict)                                            | Core application platform                                 |
| **Chat UI Engine**      | `@assistant-ui/react` (v0.15), `@assistant-ui/react-markdown`                                     | Message part dispatch and thread composition              |
| **Syntax Highlighting** | `react-shiki` (`github-light` / `github-dark` themes)                                             | Dual-theme syntax highlighting for Python code            |
| **UI Primitives**       | Tailwind CSS v3, Radix UI (`@radix-ui/react-collapsible`, `@radix-ui/react-tabs`), `lucide-react` | Expandable code blocks, terminal tabs, and action buttons |
| **Testing**             | Vitest (`vitest`), `@testing-library/react`, `jsdom`                                              | Unit, stream, and component test suite                    |

---

## 3. Commands

```bash
# Quality Gates & Verification
bun run preflight    # Format + check + lint + test in parallel
bun run check        # TypeScript typecheck (tsc --noEmit)
bun run lint         # ESLint check
bun run format       # Prettier code formatting
bun run test         # Vitest unit & component test suite

# Development
bun run dev          # Next.js development server
bun run build        # Production Next.js build
```

---

## 4. Architecture & Data Contracts

### 4.1 Vertex AI Code Execution Wire Format (`src/types/agent.ts`)

In Google Gemini 2.0 / 2.5 and Vertex AI Reasoning Engines, the model uses native code execution via two distinct part schemas:

```typescript
export type CodeExecutionLanguage = "PYTHON" | "JAVASCRIPT" | (string & {});

export type CodeExecutionOutcome =
  "OUTCOME_OK" | "OUTCOME_FAILED" | "OUTCOME_DEADLINE_EXCEEDED" | (string & {});

export interface ExecutableCodeData {
  language: CodeExecutionLanguage;
  code: string;
}

export interface CodeExecutionResultData {
  outcome: CodeExecutionOutcome;
  output: string; // Stdout, stderr, or base64 image data
  durationMs?: number;
  generatedImages?: string[]; // Extracted data URLs or GCS URIs
}

export interface AgentExecutableCodePart extends BaseAgentMessagePart {
  type?: "executable_code";
  executable_code: ExecutableCodeData;
  executableCode?: ExecutableCodeData;
}

export interface AgentCodeExecutionResultPart extends BaseAgentMessagePart {
  type?: "code_execution_result";
  code_execution_result: CodeExecutionResultData;
  codeExecutionResult?: CodeExecutionResultData;
}

export interface AgentCodeExecutionBlock {
  id: string;
  language: CodeExecutionLanguage;
  code: string;
  result?: CodeExecutionResultData;
  status: "running" | "complete" | "error";
}
```

### 4.2 Stream Event Schema Extension (`AgentStreamEvent`)

```typescript
export interface AgentStreamEvent {
  event_type?:
    | "content"
    | "thought"
    | "executable_code"
    | "code_execution_result"
    | "agent_call"
    | "agent_response"
    | "tool_call"
    | "tool_result"
    | "error"
    | "done";
  // ... other fields
  executable_code?: ExecutableCodeData;
  executableCode?: ExecutableCodeData;
  code_execution_result?: CodeExecutionResultData;
  codeExecutionResult?: CodeExecutionResultData;
}
```

### 4.3 Part Grouping & Normalization (`src/lib/adapters/chat-adapter.ts`)

When `:streamQuery` emits an `executable_code` part followed by a `code_execution_result` part:

1. `normalizeAgentMessagePart()` recognizes `raw.executable_code` and `raw.code_execution_result`.
2. The runtime adapter pairs contiguous `executable_code` + `code_execution_result` parts into a unified `AgentCodeExecutionBlock` attached to the `@assistant-ui/react` message part state.

---

## 5. UI & UX Architecture

### 5.1 Inline Message Code Execution Card (`src/components/code-execution/`)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Assistant:                                                                  │
│ I'll write a Python script to compute the Monte Carlo VaR simulation:       │
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ 🐍 Python Execution                 [ Status: Exit 0 (OK) • 240ms ] [▾] │ │
│ ├─────────────────────────────────────────────────────────────────────────┤ │
│ │ [ 💻 Code ]  [ 📟 Console Output (4 lines) ]  [ 📊 Plot (1) ]            │ │
│ ├─────────────────────────────────────────────────────────────────────────┤ │
│ │ 1  import numpy as np                                                   │ │
│ │ 2  import matplotlib.pyplot as plt                                      │ │
│ │ 3  returns = np.random.normal(0.001, 0.02, 10000)                       │ │
│ │ 4  var_95 = np.percentile(returns, 5)                                   │ │
│ │ 5  print(f"95% Daily Value at Risk: {var_95 * 100:.2f}%")               │ │
│ ├─────────────────────────────────────────────────────────────────────────┤ │
│ │ 📟 Terminal Output:                                                     │ │
│ │   > 95% Daily Value at Risk: -3.18%                                     │ │
│ │                                                                         │ │
│ │ 📊 Generated Plot:                                                      │ │
│ │   ┌───────────────────────────────────────────────────────────────────┐ │ │
│ │   │   Histogram: Monte Carlo Return Distribution                       │ │ │
│ │   │   [ Interactive Zoomable Rendered Matplotlib Image ]              │ │ │
│ │   └───────────────────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ Based on the simulation, the portfolio's 95% Value at Risk is -3.18%.       │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 Component Breakdown (`src/components/code-execution/`)

1. **`CodeExecutionCard` (`src/components/code-execution/code-execution-card.tsx`)**:
   - Primary container with rounded borders, subtle gradient header, collapse/expand toggle, and execution time badge.
   - Distinct visual state indicators:
     - **Running**: Blue pulsing spinner with _"Executing Python in Vertex sandbox..."_.
     - **Success (`OUTCOME_OK`)**: Emerald badge `[ ✓ Exit 0 (OK) ]`.
     - **Error (`OUTCOME_FAILED`)**: Rose badge `[ ✕ Exit 1 (Failed) ]` with auto-expanded error trace.
     - **Timeout (`OUTCOME_DEADLINE_EXCEEDED`)**: Amber badge `[ ⏱ Timeout ]`.
2. **`CodeViewer` (`src/components/code-execution/code-viewer.tsx`)**:
   - Embedded Shiki syntax highlighter (`python`) with line numbers and a one-click **"Copy Code"** button.
3. **`ConsoleOutput` (`src/components/code-execution/console-output.tsx`)**:
   - Monospace dark terminal window (`#121316` / `#090a0c`) rendering stdout and stderr with ANSI color support for tracebacks.
4. **`PlotRenderer` (`src/components/code-execution/plot-renderer.tsx`)**:
   - Detects base64 images (`data:image/png;base64,...`) or GCS image URIs in execution output, rendering a zoomable, downloadable media card.

---

## 6. Project Structure & File Map

```text
src/
├── components/
│   ├── code-execution/
│   │   ├── code-execution-card.tsx           # Main collapsible card with header & tabs
│   │   ├── code-viewer.tsx                   # Shiki Python code block with copy button
│   │   ├── console-output.tsx                # Monospace terminal output container
│   │   ├── plot-renderer.tsx                 # Inline image & plot display
│   │   └── code-execution-status-badge.tsx   # Exit outcome & timing chip
│   └── assistant-ui/
│       └── gemini-message.tsx                # Mount CodeExecutionCard in message parts
├── lib/
│   ├── code-execution/
│   │   ├── output-parser.ts                  # Extracts text output vs image data URLs
│   │   └── ansi-to-html.ts                   # Converts terminal ANSI colors for errors
│   ├── agent-runtime-client.ts               # Mock code execution triggers & outputs
│   └── adapters/chat-adapter.ts              # Map executable_code & result parts
└── types/
    └── agent.ts                              # ExecutableCodeData, CodeExecutionResultData
```

---

## 7. Code Style & Example Implementations

### 7.1 Pure Output & Plot Extractor (`src/lib/code-execution/output-parser.ts`)

```typescript
export interface ParsedExecutionOutput {
  stdout: string;
  images: string[];
}

const BASE64_IMAGE_REGEX = /data:image\/(?:png|jpeg|svg\+xml);base64,[A-Za-z0-9+/=]+/g;

export function parseCodeExecutionOutput(rawOutput?: string): ParsedExecutionOutput {
  if (!rawOutput) {
    return { stdout: "", images: [] };
  }

  const images: string[] = [];
  const matches = rawOutput.match(BASE64_IMAGE_REGEX);
  if (matches) {
    images.push(...matches);
  }

  const stdout = rawOutput.replace(BASE64_IMAGE_REGEX, "").trim();

  return {
    stdout,
    images,
  };
}
```

---

## 8. Testing Strategy

1. **Unit & Parser Tests (`tests/code-execution-parser.test.ts`)**:
   - Test extracting clean text stdout vs base64 image data URLs from execution outputs.
   - Test normalizing raw `executable_code` and `code_execution_result` objects.
   - Test mapping outcomes (`OUTCOME_OK`, `OUTCOME_FAILED`, `OUTCOME_DEADLINE_EXCEEDED`).
2. **Component Tests (`tests/code-execution-ui.test.tsx`)**:
   - Test `CodeExecutionCard` rendering running, success, error, and timeout states.
   - Test tab switching between Code, Console Output, and Generated Plot.
   - Test copy code button copies snippet to clipboard.
   - Test expanding and collapsing the code execution block.
3. **Stream Integration Tests (`tests/code-execution-stream.test.ts`)**:
   - Test mock stream trigger (e.g. _"Run Python to calculate Fibonacci numbers"_) emitting paired `executable_code` and `code_execution_result` events.

---

## 9. Boundaries

- **Always**:
  - Keep Python syntax highlighting responsive and themed for both Dark and Light modes.
  - Automatically expand the console output tab when the execution outcome is `OUTCOME_FAILED` to display error tracebacks immediately.
  - Maintain 100% strict TypeScript types with zero `any`.
  - Provide complete offline / mock mode support when `MOCK_AGENT_RUNTIME=true`.
- **Ask First**:
  - Introducing heavy charting or execution runtime engines on the client side.
- **Never**:
  - Never execute arbitrary Python code directly in the browser. Execution must always remain safely sandboxed in Vertex AI Reasoning Engines.
  - Never crash the message stream on malformed stdout or oversized output strings.

---

## 10. Success Criteria & Verification

- [ ] `bun run check` passes with zero TypeScript errors.
- [ ] `bun run lint` passes with zero ESLint warnings/errors.
- [ ] `bun run test` passes all unit and component tests.
- [ ] In mock mode, sending a calculation prompt (e.g., _"Calculate prime numbers up to 100 with Python"_) renders the collapsible **Python Execution** card.
- [ ] Clicking the card toggles code and terminal output.
- [ ] Simulated chart generation prompts render the inline plot preview card with download options.

---

## 11. Open Questions & Assumptions

- **Assumptions**:
  - Vertex AI Reasoning Engines and ADK agents emit `executable_code` followed by `code_execution_result` in `:streamQuery`.
  - Sandboxed execution happens entirely on the Google Cloud backend.
- **Open Questions**:
  - Should users be able to edit the code snippet in-place and request a re-run from the agent? _(Recommended: add an "Edit & Re-run" button in Phase 2)_.
