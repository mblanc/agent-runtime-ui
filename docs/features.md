# Gemini Enterprise Agent Platform & ADK Features Index

This document provides a comprehensive catalog of all **Google Gemini Enterprise Agent Platform** and **ADK (Agent Development Kit)** features supported by the `agent-runtime-ui` application, divided into **Current Capabilities (Demoable Now)** and **Upcoming / Specification-Backed Capabilities (Demoable Later)**.

---

## 1. Feature Matrix Overview

| Feature Category                | Gemini Enterprise Agent Platform Capability                      |  Status   | Primary Implementation / Specification                                                                                                                              |
| :------------------------------ | :--------------------------------------------------------------- | :-------: | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Agent Execution & Streaming** | Vertex AI Reasoning Engines (`:streamQuery` SSE)                 |  **Now**  | [`src/app/api/chat/route.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/api/chat/route.ts)                                                             |
| **Reasoning & CoT**             | Gemini 2.0 Thinking Traces & Collapsible Steps                   |  **Now**  | [`src/components/assistant-ui/reasoning.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/reasoning.tsx)                             |
| **Multi-Agent Orchestration**   | ADK Subagent Delegation Traces (`agent_call` / `agent_response`) |  **Now**  | [`src/components/assistant-ui/subagent-collapsible.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/subagent-collapsible.tsx)       |
| **Tool Execution**              | ADK Function Calling & Structured Tool Result Cards              |  **Now**  | [`src/components/assistant-ui/tool-fallback.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/tool-fallback.tsx)                     |
| **Human-in-the-Loop (HITL)**    | ADK Confirmation Tooling (`adk_request_confirmation`)            |  **Now**  | [`src/lib/agent-runtime/mock/mock-provider.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/agent-runtime/mock/mock-provider.ts)                         |
| **Memory Bank**                 | Cross-Session Semantic Long-Term Memory & User Personalization   |  **Now**  | [`src/components/memory/memory-drawer.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/memory/memory-drawer.tsx)                                 |
| **Session Persistence**         | Vertex AI Session Service (Multi-turn History CRUD)              |  **Now**  | [`src/app/api/sessions/route.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/api/sessions/route.ts)                                                     |
| **Agent Fleet Switcher**        | Agent Registry & Multi-Reasoning Engine Routing                  |  **Now**  | [`src/components/agent-switcher/agent-header-selector.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/agent-switcher/agent-header-selector.tsx) |
| **Multimodal GCS Uploads**      | Cloud Storage Multimodal Ingestion (`file_data` URIs)            |  **Now**  | [`src/app/api/uploads/presign/route.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/api/uploads/presign/route.ts)                                       |
| **Quality Flywheel**            | Vertex AI Session Feedback API (Thumbs Up / Down)                |  **Now**  | [`src/app/api/feedback/route.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/api/feedback/route.ts)                                                     |
| **Voice Multimodal**            | Speech-to-Text Dictation & Read-Aloud Speech Synthesis           |  **Now**  | [`src/lib/adapters/speech-adapters.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/adapters/speech-adapters.ts)                                         |
| **Stateless Security**          | Google Identity OAuth 2.0 PKCE & Web Crypto JWTs                 |  **Now**  | [`src/lib/auth.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/auth.ts)                                                                                 |
| **Generative Micro-UIs**        | A2UI Dynamic Interactive Widgets (Forms, Buttons, Cards)         | **Later** | [`docs/spec-a2ui-generative-ui.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-a2ui-generative-ui.md)                                                 |
| **Artifacts Service**           | Side-by-Side Live Workspace Canvas (HTML Apps, CSVs, SVGs)       | **Later** | [`docs/spec-artifacts-canvas.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-artifacts-canvas.md)                                                     |
| **Grounding & Citations**       | Google Search Grounding Widget & Enterprise RAG Inspector        | **Later** | [`docs/spec-grounding-citations.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-grounding-citations.md)                                               |
| **Skill Registry**              | Dynamic Runtime Skill Discovery & Loading (`load_skill`)         | **Later** | [`docs/spec-skill-ingestion.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-skill-ingestion.md)                                                       |
| **MCP 3-Legged OAuth**          | In-Thread User Authorization for External MCP Services           | **Later** | [`docs/message_info.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/message_info.md)                                                                       |
| **Deep Observability**          | Cloud Trace Deep-Links, Token Breakdown & Logprobs               | **Later** | [`docs/message_info.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/message_info.md)                                                                       |

---

## 2. Features Demoable NOW (Available Today)

The following features are fully implemented and functional in the application (supporting both live Vertex AI Reasoning Engines and offline mock mode when `MOCK_AGENT_RUNTIME=true`):

### 2.1 Gemini 2.0 Thinking Traces (Reasoning Engine SSE Streaming)

- **Subsystem**: Vertex AI Reasoning Engines `:streamQuery` API.
- **Description**: Real-time server-sent events (SSE) streaming delivering model thoughts and responses. Thought tokens are rendered inside a collapsible, animated reasoning container.
- **Components**: [`src/components/assistant-ui/reasoning.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/reasoning.tsx), [`src/lib/adapters/chat-adapter.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/adapters/chat-adapter.ts).
- **Demo Trigger**: Ask any multi-step question (e.g., _"How should I architect disaster recovery for Cloud Run across two regions?"_).

### 2.2 Multi-Agent Orchestration & Subagent Delegation Traces

- **Subsystem**: ADK Subagent Architecture (`agent_call` and `agent_response` events).
- **Description**: Displays visual execution breadcrumbs showing when the root coordinator agent delegates tasks to specialized subagents (e.g., `Cloud Architecture Validator`).
- **Components**: [`src/components/assistant-ui/subagent-collapsible.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/subagent-collapsible.tsx).
- **Demo Trigger**: Send _"Analyze our architecture for Cloud Run migration"_.

### 2.3 Tool Execution & Function Calling

- **Subsystem**: ADK Function Calling.
- **Description**: Structured cards for tools invoked during reasoning. Users can expand cards to inspect raw JSON arguments and tool response payloads.
- **Components**: [`src/components/assistant-ui/tool-fallback.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/tool-fallback.tsx).
- **Demo Trigger**: Prompt the agent to perform calculations or lookup tasks.

### 2.4 Human-in-the-Loop (HITL) Authorization

- **Subsystem**: ADK Confirmation Tooling (`FunctionTool(require_confirmation=True)` or `tool_context.request_confirmation()`).
- **Description**: When a tool requires authorization, the agent pauses and renders an amber **Requires Approval** card with **[Approve]** and **[Decline]** buttons. Approving or declining locks the UI card and sends a `function_response` turn back to the engine to resume or abort the workflow.
- **Components**: [`src/components/assistant-ui/tool-fallback.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/tool-fallback.tsx#L237-L294).
- **Demo Trigger**: Send _"Delete test cluster"_ or _"Confirm deployment to production"_.

### 2.5 Agent Platform Memory Bank (User Personalization)

- **Subsystem**: Google Cloud Agent Platform Memory Bank.
- **Description**: Cross-session semantic long-term memory. Users can manage facts (create, edit, delete, categorize) via the slide-over Memory Drawer. In-chat turns that leverage stored facts display a **`🧠 N Memories Applied`** badge with hover inspection.
- **Components**: [`src/components/memory/memory-drawer.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/memory/memory-drawer.tsx), [`src/app/api/memory/route.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/api/memory/route.ts).
- **Demo Trigger**: Open **Memory Bank Profile** from the header or avatar menu. Add a preference (e.g. _"Prefers TypeScript and Bun"_). Send a prompt and view the retrieval badge.

### 2.6 Multi-Turn Session Persistence

- **Subsystem**: Vertex AI Session Service REST API.
- **Description**: Multi-thread conversation history stored server-side. Users can create new threads, switch sessions, delete conversations, and view auto-generated titles in the left sidebar.
- **Components**: [`src/components/assistant-ui/thread-sidebar.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/thread-sidebar.tsx), [`src/app/api/sessions/route.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/api/sessions/route.ts).
- **Demo Trigger**: Create multiple chats, switch between them, and refresh the browser.

### 2.7 Deployed Agent Fleet Switcher

- **Subsystem**: Agent Registry / Multi-Reasoning Engine Router.
- **Description**: Allows switching between different deployed agents and regions directly from the top navigation bar.
- **Components**: [`src/components/agent-switcher/agent-header-selector.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/agent-switcher/agent-header-selector.tsx), [`src/app/api/agents/route.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/api/agents/route.ts).
- **Demo Trigger**: Select a different agent from the header dropdown.

### 2.8 Multimodal File Uploads via Google Cloud Storage (GCS)

- **Subsystem**: Cloud Storage Multimodal Ingestion.
- **Description**: Direct-to-GCS upload via signed URLs (`/api/uploads/presign`). Files are referenced in conversation turns as `file_data: { file_uri: "gs://..." }`.
- **Components**: [`src/app/api/uploads/presign/route.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/api/uploads/presign/route.ts), [`src/components/assistant-ui/gemini-composer.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/gemini-composer.tsx).
- **Demo Trigger**: Click `+` in the pill composer, attach a PDF/image, and ask the agent to analyze it.

### 2.9 Quality Flywheel & Feedback Logging

- **Subsystem**: Vertex AI Session Feedback API.
- **Description**: End-user evaluation gathering. Hovering over assistant responses exposes **Thumbs Up** and **Thumbs Down** buttons that submit feedback entries directly to GCP.
- **Components**: [`src/app/api/feedback/route.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/api/feedback/route.ts), [`src/components/assistant-ui/gemini-message.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/gemini-message.tsx).
- **Demo Trigger**: Click 👍 or 👎 on any assistant response.

### 2.10 Voice Multimodal & Model Tier Selection

- **Subsystem**: Web Speech API & Model Routing.
- **Description**: Voice input dictation and text-to-speech read-aloud playback, plus toggle between `Flash` and `Pro` tiers.
- **Components**: [`src/lib/adapters/speech-adapters.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/adapters/speech-adapters.ts), [`src/components/assistant-ui/gemini-composer.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/gemini-composer.tsx).
- **Demo Trigger**: Click the microphone icon to speak, click the speaker icon on assistant messages, or switch the model pill.

### 2.11 Stateless Google Identity Authentication

- **Subsystem**: Google OAuth 2.0 PKCE & Web Crypto API.
- **Description**: 100% database-free, serverless session management using cryptographically signed JWT cookies (`HttpOnly`, `SameSite=Lax`). Multi-instance Cloud Run ready.
- **Components**: [`src/lib/auth.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/auth.ts), [`src/lib/jwt.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/jwt.ts).

---

## 3. Features Demoable in the FUTURE (Architected Specifications)

The following specifications are designed and documented in [`docs/`](file:///Users/mblanc/projects/agent-runtime-ui/docs):

### 3.1 A2UI (Agent-to-UI / Generative UI Streaming)

- **Specification**: [`docs/spec-a2ui-generative-ui.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-a2ui-generative-ui.md)
- **Subsystem**: ADK A2UI Protocol (`application/json+a2ui`).
- **User Experience**: The agent streams structured UI component trees that render native interactive cards, form inputs, selection menus, stat metric grids, and mini-charts directly inside chat messages. Interacting with buttons or forms dispatches structured actions back to the agent session.

### 3.2 Side-by-Side Artifacts Workspace Canvas

- **Specification**: [`docs/spec-artifacts-canvas.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-artifacts-canvas.md)
- **Subsystem**: Agent Platform Artifacts Service (`BaseArtifactService` / `GcsArtifactService`).
- **User Experience**: Generates versioned digital assets (HTML5 apps, CSV datasets, SVG diagrams, code files) that auto-open in a split-screen right workspace drawer. Includes live sandboxed preview, version scrubbing (`v0` → `v1` → `v2`), and export controls.

### 3.3 Google Search Grounding & Enterprise RAG Inspector

- **Specification**: [`docs/spec-grounding-citations.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-grounding-citations.md)
- **Subsystem**: Vertex AI Search Grounding & Vector Search RAG.
- **User Experience**: Renders the official Google Search suggestion entry point widget (`searchEntryPoint.renderedContent`), clickable inline citation badges (`[1]`, `[2]`), and a private enterprise document inspector for internal corporate knowledge sources.

### 3.4 Dynamic Skill Registry Ingestion Visualizer

- **Specification**: [`docs/spec-skill-ingestion.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/spec-skill-ingestion.md)
- **Subsystem**: Google Cloud Skill Registry (`search_skills` and `load_skill`).
- **User Experience**: Intercepts runtime skill discovery, rendering **`[ 🧩 Skill Loaded: name vX.Y ]`** badges inside thinking traces with popovers detailing skill descriptions and newly unlocked tools.

### 3.5 MCP (Model Context Protocol) 3-Legged OAuth Integration

- **Subsystem**: `@assistant-ui/react-mcp` & ADK `McpToolset`.
- **User Experience**: Allows end users to connect private external tools (GitHub, Google Drive, Linear, Jira) via an in-chat OAuth card or header dialog. The agent pauses, user authorizes in a popup, and the agent automatically resumes execution with the authorized token.

### 3.6 Deep Observability & Cloud Trace Deep-Links

- **Specification**: [`docs/message_info.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/message_info.md)
- **Subsystem**: Google Cloud Trace, BigQuery Agent Analytics, and OpenTelemetry.
- **User Experience**: Message footer metadata displaying token counts (`prompt`, `candidate`, `thought`), log-probability confidence scores, and single-click deep links to Google Cloud Trace (`tid={invocationId}`).

---

## 4. Master ADK Agent Definition (`app/agent.py`)

Here is a reference ADK agent combining current and future platform capabilities:

```python
from typing import Dict, Any
from google.genai import types
from google.adk.agents import Agent
from google.adk.apps import App, ResumabilityConfig
from google.adk.tools import FunctionTool, ToolContext, VertexAiSearchTool
from google.adk.tools.preload_memory_tool import PreloadMemoryTool
from google.adk.artifacts import InMemoryArtifactService
from google.adk.plugins.bigquery_agent_analytics import BigQueryAgentAnalyticsPlugin

# 1. HITL Confirmation Tool
def execute_cloud_deployment(service_name: str, region: str) -> Dict[str, Any]:
    """Deploys service to Google Cloud Run."""
    return {"status": "deployed", "service": service_name, "region": region}

deploy_tool = FunctionTool(execute_cloud_deployment, require_confirmation=True)

# 2. Artifacts Creation Tool
async def create_status_dashboard(project: str, tool_context: ToolContext) -> Dict[str, Any]:
    """Generates an HTML status dashboard artifact."""
    html = f"<html><body style='background:#111;color:#fff;padding:20px'><h1>{project} Online</h1></body></html>"
    part = types.Part(inline_data=types.Blob(mime_type="text/html", data=html.encode("utf-8")))
    version = await tool_context.save_artifact("dashboard.html", part)
    return {"status": "created", "filename": "dashboard.html", "version": version}

# 3. Subagent
security_auditor = Agent(
    name="security_auditor",
    model="gemini-2.5-flash",
    description="Audits IAM policies and VPC security benchmarks.",
    instruction="Evaluate security and return concise recommendations."
)

# 4. Root Agent
root_agent = Agent(
    name="cloud_architect",
    model="gemini-2.5-flash",
    generate_content_config=types.GenerateContentConfig(
        thinking_config=types.ThinkingConfig(thinking_budget=1024)
    ),
    instruction="You are the Cloud Architecture Advisor. Assist with architecture, security, and deployment.",
    sub_agents=[security_auditor],
    tools=[PreloadMemoryTool(), deploy_tool, create_status_dashboard],
    after_agent_callback=lambda ctx: ctx.add_session_to_memory()
)

# 5. Application Container
app = App(
    name="app",
    root_agent=root_agent,
    resumability_config=ResumabilityConfig(is_resumable=True),
    artifact_service=InMemoryArtifactService(),
    plugins=[BigQueryAgentAnalyticsPlugin(project_id="my-gcp-project", dataset_id="agent_logs")]
)
```

---

## 5. Suggested Demo Flow Script

1. **Authentication**: Sign in via Google SSO (showcases stateless OAuth 2.0 PKCE).
2. **Personalization**: Open the **Memory Bank Profile** drawer and view stored enterprise preferences.
3. **Fleet Management**: Switch deployed agents using the top header dropdown.
4. **Multimodal Ingestion**: Upload an architecture PDF or PNG using the `+` composer button.
5. **Complex Reasoning & Delegation**: Ask an architecture question; inspect Gemini 2.0 Thinking traces and the subagent delegation accordion.
6. **Governance & HITL**: Ask to deploy the service; showcase the amber **Approve / Decline** card.
7. **Evaluation**: Click the **Thumbs Up** icon to log feedback to Vertex AI.
8. **Session Management**: Switch threads in the sidebar to verify conversation history rehydration.
