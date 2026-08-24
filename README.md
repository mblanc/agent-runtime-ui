# Agent Runtime UI

> **Google Gemini-styled web interface for Google Cloud Agent Runtime & ADK (Agent Development Kit)**

A production-grade, 100% serverless web application styled after **Google Gemini** that connects authenticated users to AI agents deployed on **Google Cloud Agent Runtime** (Vertex AI Reasoning Engines).

---

## Highlights & Features

### 🌟 Google Gemini Aesthetic

- **Ambient Radial Glow & Empty State**: Centered _"How can I help you today?"_ greeting with smooth animated radial gradient backdrop.
- **Floating Single-Row Pill Composer**: Dynamic auto-resizing input, `+` multimodal tools menu, model tier selector (`Flash` / `Pro`), voice dictation button, and stateful send/stop button.
- **Avatar-Free Full-Width Message Flow**: Clean typography, Streamdown and Shiki code syntax highlighting, KaTeX LaTeX math rendering, copy actions, and collapsible reasoning traces.
- **Warm-Grey User Bubbles**: Right-aligned rounded chat bubbles (`#f0f4f9` / `#282a2c`) with inline image/PDF attachment previews.
- **Multi-Thread Sidebar**: Collapsible conversation drawer with chronological grouping (_Today_, _Yesterday_, _Previous 7 Days_, _Older_), search, title editing, and deletion.

---

### 🧠 Reasoning & Multi-Agent Orchestration

- **Gemini 2.0 Thinking Traces**: Real-time server-sent events (SSE) streaming model thought processes inside collapsible, animated reasoning accordions.
- **ADK Subagent Delegation**: Execution breadcrumbs showing root coordinator agents delegating tasks to specialized subagents (`agent_call` / `agent_response`).
- **Structured Tool Execution**: Visual tool call cards displaying JSON arguments, execution status, and structured output payloads.
- **Human-in-the-Loop (HITL) Authorization**: Interactive amber **Requires Approval** cards with `[Approve]` and `[Decline]` actions for sensitive tool calls (`adk_request_confirmation`), resuming agent execution seamlessly upon decision.

---

### 🧩 Skill Registry Ingestion Visualizer

- **Dynamic Skill Loading**: Intercepts Google Cloud Skill Registry events (`load_skill` / `search_skills`).
- **Thinking Trace Badges**: Visual `[ 🧩 Skill Loaded: name vX.Y ]` badges embedded within reasoning steps.
- **Interactive Metadata Cards**: Inspect skill author, license, version, description, unlocked tools, and raw markdown instructions.
- **Skill Search Queries**: Expandable search pills displaying registry query terms and matched skill catalogs.

---

### 🎨 A2UI Generative Micro-UIs (`application/json+a2ui`)

- **Native Inline Micro-UIs**: Renders dynamic interactive UI component trees streamed from ADK agents directly inside chat messages.
- **Rich UI Catalog**: Form inputs, text fields, dropdown selectors, radio groups, StatMetric KPI cards, compact data tables, progress bars, and mini bar charts.
- **Interactive Action Dispatch**: Interacting with buttons or submitting forms dispatches structured actions back to the active agent session with automatic post-submit locking.

---

### 📂 Side-by-Side Workspace Canvas & Artifacts

- **Interactive Split-Pane Canvas**: Side-by-side workspace drawer for deep asset inspection and execution.
- **Multi-Format Renderers**:
  - **Interactive HTML5 Apps**: Sandboxed `<iframe>` execution environment with auto-height adjustment and error overlays.
  - **Shiki Code Highlighting**: Syntax highlighting with line numbers, copy button, and raw code view.
  - **CSV / TSV Table Explorer**: Data table with client-side sorting, text search, and pagination.
  - **SVG Vector Diagrams**: Zoomable, pannable SVG viewer with PNG/SVG export.
  - **Markdown Documents**: Rich formatted markdown renderer with GFM tables and KaTeX math.
- **Real-Time Streaming Ingestion**: Live artifact creation (`save_artifact`) detection with inline preview chips and multi-version scrubbing (`v0` → `v1` → `v2`).

---

### 🔍 Google Search Grounding & Enterprise RAG

- **Inline Superscript Citations**: Interactive clickable pills (`[1]`, `[1, 2]`) linked to verified sources.
- **Source Popovers**: Hover cards displaying source domain, favicon, page title, GCS URI, text snippet, and model confidence score.
- **Google Search Grounding Widget**: Renders official Google Search suggestion entry points (`searchEntryPoint.renderedContent`).
- **Enterprise RAG Drawer**: Slide-over drawer for deep inspection of corporate document text chunks and Google Cloud Storage metadata.

---

### 🐍 Sandboxed Python Code Execution

- **Vertex AI Code Execution**: Visualizes Google Cloud Python code execution (`executable_code` & `code_execution_result`).
- **Execution Cards**: Collapsible code cards with syntax highlighting, runtime duration, exit outcome badges (`Exit 0: OK`, `Exit 1: Error`), terminal stdout/stderr output, and inline zoomable Matplotlib/Seaborn plot visualizers.

---

### ⚡ Context Caching & ADK Session State Inspector

- **Context Caching Telemetry**: Real-time badges showing cached prompt tokens, cache hit ratio, and cost/latency reduction with detailed breakdown popovers.
- **In-Chat State Mutation Chips**: Visual pills (`[ 🗄️ State Updated: +2 keys ]`) showing real-time ADK session state mutations.
- **Session State Drawer**: Slide-over inspector to view, search, filter, create, and live-mutate typed ADK session state variables (`session.state`).

---

### 💾 Agent Platform Memory Bank (Personalization)

- **Cross-Session Long-Term Memory**: Persistent user facts and enterprise preferences managed via the slide-over Memory Drawer.
- **Automatic Fact Extraction**: Trigger Memory Bank `:generate` to automatically distill user profile facts from conversation history.
- **Retrieval Telemetry**: In-chat `🧠 N Memories Applied` badges indicating long-term memories retrieved for context grounding.

---

### 📊 Deep Observability & Cryptographic Verification

- **Message Info Popover**: Detailed metrics including model version, invocation ID, trace ID, token breakdown progress bar (`prompt`, `candidate`, `thought`), logprobs confidence rating, and one-click deep links to Google Cloud Trace.
- **Thought Signature Verification**: Cryptographic verification badge (`thought_signature`) confirming Gemini 2.0 reasoning trace authenticity.

---

### 📎 Multimodal GCS Attachments & Voice

- **Direct-to-Cloud Storage Uploads**: Client uploads large images/PDFs directly to GCS via short-lived signed URLs (`/api/uploads/presign`), passing `gs://...` URIs in the agent's turn to bypass Next.js payload limits.
- **Voice Multimodal**: Speech-to-text dictation in the composer and text-to-speech read-aloud playback for assistant messages via Web Speech API.

---

### 🔒 Stateless Security & Serverless Architecture

- **Stateless Google Identity OAuth 2.0 PKCE**: Database-free authentication using Web Crypto HMAC-SHA256 cryptographically signed JWT cookies (`HttpOnly`, `SameSite=Lax`).
- **Zero Session Mismatch**: 100% serverless, stateless design built for auto-scaling on Google Cloud Run.
- **Dual Execution Engine**: Supports live Vertex AI Reasoning Engines and zero-dependency offline mock mode (`MOCK_AGENT_RUNTIME=true`).

---

## System Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                CLIENT LAYER (Browser)                                  │
│  • Google Gemini UI (@assistant-ui/react v0.15 + Tailwind CSS + Streamdown / Shiki)     │
│  • A2UI Generative Micro-UIs, Workspace Artifacts Canvas, Grounding & Citations       │
│  • Context Caching Badges, ADK Session State Inspector, Memory Bank Drawer             │
│  • HITL Tool Approval, Python Sandbox Visualizer, Deep Observability Popovers          │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │ HTTPS / SSE Streams / Direct GCS PUTs
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                           BACKEND-FOR-FRONTEND (Next.js 15)                            │
│  • Edge Middleware & Stateless JWT Cookie Auth (Google Identity OAuth 2.0 PKCE)        │
│  • Modular Domain Services (Streaming, Sessions, State, Artifacts, Memory, Feedback)   │
│  • Provider Strategy (VertexAiReasoningEngineProvider vs MockAgentRuntimeProvider)     │
│  • Keepalive Heartbeat Guard & Normalized SSE Pipeline                                 │
└──────────────────────────────────────────┬─────────────────────────────────────────────┘
                                           │ IAM Bearer Tokens (google-auth-library)
                                           ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 GOOGLE CLOUD PLATFORM                                  │
│  • Vertex AI Reasoning Engines (:streamQuery SSE streaming & :query fallback)          │
│  • Vertex AI Session Service (Multi-turn multi-thread persistence & state deltas)       │
│  • Vertex AI Context Caching, Search Grounding & Vector Search RAG                     │
│  • Vertex AI Memory Bank (:retrieve, :generate) & Session Feedback API                 │
│  • Google Cloud Storage (Direct multimodal file ingestion & signed URLs)               │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Technical Stack

| Layer                         | Technology                                                                                                                                          |
| :---------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Runtime & Package Manager** | [Bun](https://bun.sh/) (v1.3+)                                                                                                                      |
| **Framework**                 | [Next.js 15](https://nextjs.org/) (App Router), [React 19](https://react.dev/), TypeScript (strict mode)                                            |
| **Chat UI Engine**            | [`@assistant-ui/react`](https://assistant-ui.com/) (v0.15), `@assistant-ui/react-markdown`, `@assistant-ui/react-streamdown`                        |
| **Styling & Primitives**      | [Tailwind CSS v3](https://tailwindcss.com/), [Radix UI](https://www.radix-ui.com/), [Lucide Icons](https://lucide.dev/), `class-variance-authority` |
| **Syntax & Math Rendering**   | [Shiki](https://shiki.style/) (`react-shiki`), [Streamdown](https://github.com/streamdown), [KaTeX](https://katex.org/), `remark-gfm`               |
| **Auth & Security**           | Google OAuth 2.0 PKCE, Web Crypto HMAC-SHA256 JWT, `google-auth-library`                                                                            |
| **Storage & Multimodal**      | [`@google-cloud/storage`](https://cloud.google.com/storage)                                                                                         |
| **Testing**                   | [Vitest](https://vitest.dev/), `@testing-library/react`, `jsdom`, [Playwright](https://playwright.dev/)                                             |
| **Deployment**                | Docker, [Google Cloud Run](https://cloud.google.com/run)                                                                                            |

---

## Project Structure

```
agent-runtime-ui/
├── docs/                                  # Architectural specifications & feature documentation
│   ├── architecture.md                    # Detailed architecture & contributor guide
│   ├── features.md                        # Gemini Enterprise & ADK feature catalog
│   ├── spec-a2ui-generative-ui.md         # A2UI Generative Micro-UI specification
│   ├── spec-artifacts-canvas.md           # Workspace Artifacts Canvas specification
│   ├── spec-skill-ingestion.md            # Skill Registry ingestion visualizer specification
│   ├── spec-context-caching-and-state.md  # Context caching & ADK state inspector specification
│   └── spec-grounding-citations.md        # Google search & enterprise RAG grounding specification
├── src/
│   ├── app/                               # Next.js App Router pages and API routes
│   │   ├── api/                           # Backend-For-Frontend (BFF) proxy endpoints
│   │   │   ├── agents/                    # Deployed agent fleet discovery
│   │   │   ├── auth/                      # Google OAuth PKCE and session handlers
│   │   │   ├── chat/                      # SSE streaming proxy (:streamQuery)
│   │   │   ├── feedback/                  # Vertex AI session feedback API
│   │   │   ├── memory/                    # Memory Bank CRUD and auto-generation
│   │   │   ├── sessions/                  # Session service, history, state, and artifacts
│   │   │   └── uploads/                   # GCS presigned URLs for multimodal attachments
│   │   ├── login/                         # Google SSO sign-in page
│   │   ├── globals.css                    # Tailwind styles, glow animations, theme tokens
│   │   ├── layout.tsx                     # Root layout with theme & tooltip providers
│   │   └── page.tsx                       # Main Gemini chat interface
│   ├── components/                        # React UI component catalog
│   │   ├── a2ui/                          # A2UI generative micro-UI renderer and catalog
│   │   ├── agent-switcher/                # Header deployed agent fleet selector
│   │   ├── artifacts/                     # Workspace canvas, version selector & renderers
│   │   ├── assistant-ui/                  # Gemini thread, pill composer, and message parts
│   │   ├── auth/                          # User avatar menu and login button
│   │   ├── code-execution/                # Python sandbox visualizer and terminal cards
│   │   ├── context-caching/               # Cache hit ratio badge and savings popover
│   │   ├── grounding/                     # Citation pills, search widget, RAG drawer
│   │   ├── memory/                        # Long-term Memory Bank drawer & badges
│   │   ├── session-state/                 # ADK session state drawer, cards, and modal
│   │   ├── skills/                        # Skill loaded badges and metadata cards
│   │   └── ui/                            # Radix / shadcn UI primitives
│   ├── lib/                               # Core business logic and service adapters
│   │   ├── a2ui/                          # A2UI payload parsers and tree sanitizers
│   │   ├── adapters/                      # assistant-ui chat & speech model adapters
│   │   ├── agent-runtime/                 # Vertex AI provider, mock provider, domain services
│   │   │   └── services/                  # Streaming, session, memory, feedback, agent services
│   │   ├── artifacts/                     # Artifact extraction and MIME utilities
│   │   ├── code-execution/                # Code execution event parser and accumulator
│   │   ├── context-caching/               # Token savings and cost reduction calculations
│   │   ├── grounding/                     # Citation normalization and GCS extraction
│   │   ├── session-state/                 # Session state diffing and React context
│   │   ├── skills/                        # Skill event parser and metadata extractors
│   │   ├── auth.ts / jwt.ts               # Web Crypto JWT and Google OAuth logic
│   │   └── session-ownership.ts           # IDOR security and session ownership verification
│   ├── types/                             # Domain TypeScript interfaces
│   └── middleware.ts                      # Edge auth gate & session verification
└── tests/                                 # Unit, component, and integration tests (Vitest)
```

---

## Quick Start

### 1. Prerequisites

- [Bun](https://bun.sh/) (v1.3+) installed on your machine.
- _(Optional for Live GCP Mode)_ A Google Cloud Project with Vertex AI APIs enabled and a deployed Reasoning Engine.

### 2. Installation

```bash
git clone https://github.com/your-org/agent-runtime-ui.git
cd agent-runtime-ui
bun install
```

### 3. Environment Configuration

Copy the example environment template:

```bash
cp .env.example .env.local
```

#### Option A: Offline / Mock Mode (Zero GCP Setup Required)

To run locally without Google Cloud credentials, configure `.env.local` as follows:

```env
BETTER_AUTH_SECRET=any_32_characters_minimum_random_secret_string
BETTER_AUTH_URL=http://localhost:3000

GOOGLE_CLIENT_ID=mock_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=mock_client_secret

MOCK_AGENT_RUNTIME=true
```

#### Option B: Live Google Cloud Vertex AI Mode

Fill in your Google OAuth credentials and Google Cloud project details:

```env
# Authentication & Security
BETTER_AUTH_SECRET=your_32_char_minimum_secret_key
BETTER_AUTH_URL=http://localhost:3000

# Google OAuth Credentials (Google Cloud Console -> APIs & Services -> Credentials)
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret

# Google Cloud Agent Runtime (Vertex AI Reasoning Engines)
GOOGLE_CLOUD_PROJECT=your-gcp-project-id
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_REASONING_ENGINE_ID=projects/PROJECT_NUMBER/locations/us-central1/reasoningEngines/ENGINE_ID

# Optional: Extra regions to search when listing agents
# GOOGLE_CLOUD_LOCATIONS=us-central1,europe-west4

# Multimodal Attachments (Cloud Storage)
GCS_BUCKET_NAME=your-attachments-bucket-name

# Live GCP Mode
MOCK_AGENT_RUNTIME=false
```

Authenticate your local environment with Application Default Credentials (ADC):

```bash
gcloud auth application-default login
```

### 4. Run Development Server

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Reference ADK Agent (`agent.py`)

Here is an example Python ADK agent utilizing capabilities supported by `agent-runtime-ui`:

```python
from typing import Any, Dict
from google.genai import types
from google.adk.agents import Agent
from google.adk.apps import App, ResumabilityConfig
from google.adk.tools import FunctionTool, ToolContext
from google.adk.tools.preload_memory_tool import PreloadMemoryTool
from google.adk.artifacts import InMemoryArtifactService

# 1. Human-in-the-Loop (HITL) Tool requiring user approval
def deploy_service(service_name: str, region: str) -> Dict[str, Any]:
    """Deploys service to Cloud Run upon user approval."""
    return {"status": "deployed", "service": service_name, "region": region}

deploy_tool = FunctionTool(deploy_service, require_confirmation=True)

# 2. Workspace Artifact Creation Tool
async def generate_dashboard(project: str, tool_context: ToolContext) -> Dict[str, Any]:
    """Generates an HTML status dashboard artifact."""
    html = f"<!DOCTYPE html><html><body style='font-family:sans-serif;padding:24px'><h1>{project} Status</h1><p>All systems operational.</p></body></html>"
    part = types.Part(inline_data=types.Blob(mime_type="text/html", data=html.encode("utf-8")))
    version = await tool_context.save_artifact("dashboard.html", part)
    return {"status": "created", "filename": "dashboard.html", "version": version}

# 3. Specialized Subagent
security_auditor = Agent(
    name="security_auditor",
    model="gemini-2.5-flash",
    description="Audits IAM policies and cloud security posture.",
    instruction="Analyze permissions and highlight potential vulnerabilities."
)

# 4. Root Orchestrator Agent
root_agent = Agent(
    name="cloud_architect",
    model="gemini-2.5-flash",
    generate_content_config=types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_budget=1024)
    ),
    instruction="You are the Cloud Architecture Advisor. Assist with cloud infrastructure, security, and deployments.",
    sub_agents=[security_auditor],
    tools=[PreloadMemoryTool(), deploy_tool, generate_dashboard],
    after_agent_callback=lambda ctx: ctx.add_session_to_memory()
)

# 5. ADK App Container
app = App(
    name="app",
    root_agent=root_agent,
    resumability_config=ResumabilityConfig(is_resumable=True),
    artifact_service=InMemoryArtifactService()
)
```

---

## Environment Variables Reference

| Variable                     | Required  |         Default         | Description                                                        |
| :--------------------------- | :-------: | :---------------------: | :----------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`         |  **Yes**  |            —            | 32+ character key used to sign HMAC-SHA256 session tokens.         |
| `BETTER_AUTH_URL`            |  **Yes**  | `http://localhost:3000` | Base URL of the application for OAuth redirect verification.       |
| `GOOGLE_CLIENT_ID`           |  **Yes**  |            —            | Google Cloud OAuth 2.0 Web Client ID.                              |
| `GOOGLE_CLIENT_SECRET`       |  **Yes**  |            —            | Google Cloud OAuth 2.0 Web Client Secret.                          |
| `GOOGLE_CLOUD_PROJECT`       | Live mode |            —            | Google Cloud Project ID hosting the Reasoning Engine.              |
| `GOOGLE_CLOUD_LOCATION`      | Live mode |      `us-central1`      | Default GCP region for Vertex AI endpoints.                        |
| `GOOGLE_REASONING_ENGINE_ID` | Live mode |            —            | Resource name or ID of the Vertex AI Reasoning Engine.             |
| `GOOGLE_CLOUD_LOCATIONS`     | Optional  | `GOOGLE_CLOUD_LOCATION` | Comma-separated regions searched when listing reasoning engines.   |
| `GCS_BUCKET_NAME`            | Live mode |            —            | Cloud Storage bucket for multimodal user attachments.              |
| `MOCK_AGENT_RUNTIME`         | Optional  |         `false`         | Set to `true` to run offline against the in-memory mock engine.    |
| `NEXT_PUBLIC_DEBUG_STREAM`   | Optional  |         `false`         | Set to `true` in development to log raw SSE events in the console. |

---

## Development & Quality Commands

```bash
# Start local development server
bun run dev

# Run TypeScript type check
bun run check

# Run ESLint
bun run lint

# Format code with Prettier
bun run format

# Run Vitest test suite
bun run test

# Run Vitest in watch mode
bun run test:watch

# Run Playwright end-to-end tests
bun run test:e2e

# Run preflight quality check (format, typecheck, lint, test concurrently)
bun run preflight
```

---

## Deployment to Google Cloud Run

Deploy directly to Google Cloud Run using Google Cloud Build:

```bash
# 1. Build and push container image to Google Artifact Registry
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/agent-runtime-ui

# 2. Deploy container to Google Cloud Run
gcloud run deploy agent-runtime-ui \
  --image gcr.io/YOUR_PROJECT_ID/agent-runtime-ui \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars "\
BETTER_AUTH_SECRET=YOUR_PRODUCTION_SECRET,\
BETTER_AUTH_URL=https://your-cloud-run-url.a.run.app,\
GOOGLE_CLIENT_ID=YOUR_CLIENT_ID,\
GOOGLE_CLIENT_SECRET=YOUR_CLIENT_SECRET,\
GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID,\
GOOGLE_CLOUD_LOCATION=us-central1,\
GOOGLE_REASONING_ENGINE_ID=projects/PROJECT_NUM/locations/us-central1/reasoningEngines/ENGINE_ID,\
GCS_BUCKET_NAME=YOUR_GCS_BUCKET,\
MOCK_AGENT_RUNTIME=false"
```

> [!NOTE]
> Ensure the Cloud Run service account has the **Vertex AI User** (`roles/aiplatform.user`) and **Storage Object Admin** (`roles/storage.objectAdmin`) IAM roles assigned.

---

## License

Apache 2.0 — Built with ❤️ for the Google Cloud & ADK agent ecosystem.
