# Specification: Agent Platform Artifacts Service & Live Workspace Canvas

## 1. Objective & Background

### 1.1 Objective

Implement a production-grade, Google Gemini-styled **Side-by-Side Artifacts Workspace Canvas** in the `agent-runtime-ui` application. This feature showcases the **Agent Platform Artifacts Service** (`BaseArtifactService` / `GcsArtifactService` / `InMemoryArtifactService` from [adk.dev/artifacts](https://adk.dev/artifacts/)), transforming conversational agent interactions into a collaborative workspace where users can preview, interact with, scrub versions of, and download rich digital assets (interactive HTML web applications, data tables, SVG diagrams, and syntax-highlighted code files).

### 1.2 Target User & Use Case

- **Target User**: Enterprise users, engineers, and stakeholders evaluating or using Vertex AI Agent Runtime / ADK agents.
- **Problem Solved**: Generative AI agents frequently output full HTML apps, CSV datasets, Python scripts, and SVG diagrams as raw text/markdown in chat bubbles, cluttering the message stream and preventing live testing or version comparison.
- **Solution**: The agent creates an **Artifact**. The UI auto-opens a right-hand workspace canvas that safely renders sandboxed interactive previews, provides version scrubbing (`v0` → `v1` → `v2`), integrates with the session's artifact library via REST hydration, and offers instant export.

---

## 2. Architecture & Data Contracts

### 2.1 Dual-Layer Discovery Model

The frontend interacts with the Artifacts Service via two complementary channels:

1. **Push (Live Stream Events)**: During active reasoning and generation, the `:streamQuery` SSE stream emits `artifact_created` or `artifact_updated` events, triggering zero-latency auto-open of the canvas and real-time content streaming.
2. **Pull (Interactive REST API Hydration)**: When a session is loaded or switched in the thread sidebar, the UI calls `GET /api/sessions/[sessionId]/artifacts` to populate the session's artifact shelf and version history.

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Next.js App Router (BFF)                           │
├──────────────────────────────────────┬──────────────────────────────────────┤
│ 1. SSE Stream: /api/chat             │ 2. REST API: /api/sessions/[id]/... │
│    • event: artifact_created         │    • GET /artifacts (list)           │
│    • event: artifact_updated         │    • GET /artifacts/[name]?version=N │
└──────────────────┬───────────────────┴──────────────────┬───────────────────┘
                   │                                      │
                   ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Vertex AI Agent Runtime / Mock Service                   │
│         (InMemoryArtifactService / GcsArtifactService / ADK Runner)         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Types (`src/types/agent.ts`)

```typescript
export type ArtifactMimeType =
  | "text/html"
  | "text/csv"
  | "text/markdown"
  | "text/plain"
  | "text/x-python"
  | "application/javascript"
  | "application/typescript"
  | "application/json"
  | "image/svg+xml"
  | "image/png"
  | "application/pdf"
  | (string & {});

export interface ArtifactVersion {
  version: number;
  content: string;
  createTime: string;
  sizeBytes: number;
  mimeType: ArtifactMimeType;
  gcsUri?: string;
  readUrl?: string;
}

export interface AgentArtifact {
  id: string; // e.g. "sales_dashboard.html" or "user:config.json"
  sessionId: string;
  userId: string;
  filename: string;
  title: string;
  mimeType: ArtifactMimeType;
  currentVersion: number;
  versions: ArtifactVersion[];
  createTime: string;
  updateTime: string;
  scope: "session" | "user";
}

export interface ArtifactStreamPayload {
  filename: string;
  title?: string;
  mimeType: ArtifactMimeType;
  content: string;
  version: number;
  isComplete?: boolean;
  gcsUri?: string;
}
```

### 2.3 Stream Event Schema (`AgentStreamEvent`)

```typescript
export interface AgentStreamEvent {
  event_type?:
    | "content"
    | "thought"
    | "agent_call"
    | "agent_response"
    | "tool_call"
    | "tool_result"
    | "artifact_created"
    | "artifact_updated"
    | "error"
    | "done";
  // ... other fields
  artifact?: ArtifactStreamPayload;
}
```

### 2.4 BFF REST API Endpoints

1. **`GET /api/sessions/[sessionId]/artifacts`**:
   - Lists all artifacts created in this session (and user-scoped artifacts for the authenticated user).
   - Response: `{ artifacts: AgentArtifact[] }`
2. **`GET /api/sessions/[sessionId]/artifacts/[filename]`**:
   - Query params: `?version=0` (optional, defaults to latest).
   - Response: `{ artifact: AgentArtifact, selectedVersion: ArtifactVersion }`

---

## 3. UI & UX Architecture

### 3.1 Split-Pane Layout (`src/app/page.tsx` & `src/components/artifacts/`)

```text
┌───────────────┬───────────────────────────────────┬───────────────────────────────────────────┐
│ Thread Sidebar│            Chat Thread            │         Artifacts Canvas (Right)          │
│               │                                   ├───────────────────────────────────────────┤
│ • Session 1   │ User: Create a quarterly sales    │ 📁 sales_dashboard.html   [Version: v2 ▾] │
│ • Session 2   │       dashboard.                  ├───────────────────────────────────────────┤
│               │                                   │ [ 👁 Preview ]  [ 💻 Code ]  [ 📊 Data ]  │
│               │ Assistant:                        │ ┌───────────────────────────────────────┐ │
│               │ I have created the artifact.      │ │  ┌─────────┐   ┌───────────────────┐  │ │
│               │ [📄 sales_dashboard.html • v2]    │ │  │ $145,000│   │ █████████ Q2 Sales│  │ │
│               │                                   │ │  └─────────┘   └───────────────────┘  │ │
│               │                                   │ │  [Interactive Sandboxed Iframe]       │ │
│               │                                   │ └───────────────────────────────────────┘ │
│               │                                   │ [ ⬇ Download ] [ 📋 Copy ] [ ⛶ Max ] [✕]  │
└───────────────┴───────────────────────────────────┴───────────────────────────────────────────┘
```

### 3.2 Layout Mechanics & State

- **Canvas State Store / Context**:
  - `isOpen: boolean` (default false, auto-opens when an artifact is received).
  - `activeArtifactId: string | null`.
  - `selectedVersion: number | null` (defaults to latest).
  - `activeTab: "preview" | "code" | "data"`.
  - `splitRatio: number` (default `0.5`, persisted in local storage).
  - `isFullscreen: boolean`.
- **Interactions**:
  - **Auto-Open**: Opening animation with smooth width/transform transition.
  - **Close (`✕`) & Minimize (`⇥`)**: Smoothly closes or collapses to a slim icon strip.
  - **Keyboard Shortcuts**: `Escape` closes canvas; `Cmd/Ctrl + \` toggles canvas.
  - **Inline Message Pill**: Clicking `[📄 filename • vN]` in chat focuses that artifact and version.
  - **Top Bar Artifact Shelf**: A badge `[ 📁 N Artifacts ]` in the session header with dropdown to select any session artifact.

### 3.3 Multi-Format Renderers

1. **Interactive HTML/Web Apps (`text/html`, `application/javascript`)**:
   - Rendered inside a sandboxed `<iframe>` (`sandbox="allow-scripts allow-forms allow-modals allow-popups"`).
   - Includes standard web styles (Tailwind / CSS-in-JS support) and dynamic charts (Chart.js / Vega / vanilla JS).
2. **Code Viewer (`text/x-python`, `application/typescript`, `application/json`, `text/plain`)**:
   - Rendered using `react-shiki` with dual-theme (dark/light), line numbers, and a single-click copy button.
3. **Data Tables (`text/csv`, JSON arrays)**:
   - Parsed client-side and rendered as a paginated, searchable, sortable data table.
4. **Vector Diagrams & Charts (`image/svg+xml`, Mermaid)**:
   - Rendered with interactive zoom/pan controls and SVG export.
5. **Markdown Documents (`text/markdown`)**:
   - Rendered using the existing Gemini markdown pipeline (`remark-gfm`).

---

## 4. Tech Stack & Dependencies

- **Framework**: Next.js 15 (App Router), React 19, TypeScript (Strict).
- **Styling**: Tailwind CSS v3, Radix UI primitives (`@radix-ui/react-*`), `lucide-react`.
- **Syntax Highlighting**: `react-shiki` (already in project).
- **Table / Data Parsing**: Lightweight zero-dependency CSV parser utility.
- **Testing**: Vitest (`vitest`), `@testing-library/react`, `jsdom`.

---

## 5. File Structure & Changes

```text
src/
├── app/
│   ├── api/
│   │   ├── chat/route.ts                     # Handle artifact stream events
│   │   └── sessions/[sessionId]/
│   │       └── artifacts/
│   │           ├── route.ts                  # GET /api/sessions/[sessionId]/artifacts
│   │           └── [filename]/route.ts       # GET /api/sessions/[sessionId]/artifacts/[filename]
│   └── page.tsx                              # Integrate Split-Pane Artifacts Canvas
├── components/
│   └── artifacts/
│       ├── artifacts-canvas.tsx              # Main split-pane container & header
│       ├── artifacts-shelf-button.tsx        # Top-bar artifact count badge & dropdown
│       ├── artifact-message-chip.tsx         # Inline chat chip for referenced artifacts
│       ├── renderers/
│       │   ├── html-iframe-renderer.tsx      # Sandboxed iframe with error boundary
│       │   ├── code-artifact-renderer.tsx    # Shiki syntax highlighted code viewer
│       │   ├── csv-table-renderer.tsx        # Searchable, sortable data table
│       │   ├── svg-diagram-renderer.tsx      # Pan/zoom SVG canvas
│       │   └── markdown-artifact-renderer.tsx# Formatted document preview
│       └── version-selector.tsx              # Version history dropdown and diff viewer
├── lib/
│   ├── agent-runtime-client.ts               # Artifacts mock store & stream generation
│   ├── gemini-runtime-adapter.ts             # Map artifact events to assistant-ui runtime
│   └── artifact-context.tsx                  # React Context & state hook for Artifacts
└── types/
    └── agent.ts                              # AgentArtifact, ArtifactVersion, StreamEvent extensions
```

---

## 6. Testing Strategy

1. **Unit & Store Tests (`tests/artifacts-store.test.ts`)**:
   - Test `InMemoryArtifactService` creation, version incrementing (`v0` → `v1`), version retrieval, and user-scoping.
2. **BFF API Route Tests (`tests/artifacts-api.test.ts`)**:
   - Test `GET /api/sessions/[sessionId]/artifacts` (authenticated, unauthorized, empty, and populated).
   - Test `GET /api/sessions/[sessionId]/artifacts/[filename]?version=N`.
3. **Component Tests (`tests/artifacts-canvas.test.tsx`)**:
   - Test canvas auto-opening on `artifact_created` stream event.
   - Test switching tabs (Preview / Code / Data).
   - Test version selector dropdown changing rendered version.
   - Test close (`✕`), collapse, and fullscreen buttons.
   - Test inline message chip clicking to open canvas.

---

## 7. Boundaries

- **Always**:
  - Sanitize iframe contents and use `sandbox="allow-scripts allow-forms allow-modals allow-popups"`.
  - Maintain 100% strict TypeScript types with zero `any`.
  - Support offline / mock testing seamlessly when `MOCK_AGENT_RUNTIME=true`.
  - Validate authentication (`getAuthSession()`) on all new API routes.
- **Ask First**:
  - Introducing heavy third-party canvas or editor dependencies.
- **Never**:
  - Never allow raw script execution outside the sandboxed iframe.
  - Never leak GCP credentials to client-side components.

---

## 8. Success Criteria & Verification

- [ ] `bun run check` passes with zero TypeScript errors.
- [ ] `bun run lint` passes with zero ESLint warnings/errors.
- [ ] `bun run test` passes all unit and component tests.
- [ ] Prompting the agent in mock mode with _"Build a sales dashboard"_ streams an HTML artifact and automatically opens the right-hand canvas.
- [ ] Clicking the version selector switches between `v0`, `v1`, etc.
- [ ] Refreshing the page or switching threads hydrates the artifact library from `GET /api/sessions/[sessionId]/artifacts`.
