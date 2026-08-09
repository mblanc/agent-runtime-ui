# Agent Stream Metadata & Message Info Specification

## Overview

This document specifies the rich metadata emitted by **Google Cloud Agent Runtime** (Vertex AI Reasoning Engines & ADK) during `:streamQuery` and stored in Vertex AI `SessionService` events. It serves as a blueprint for extending the chat UI/UX with token metrics, model badges, trace links, confidence indicators, live artifacts, and multi-agent workflow breadcrumbs.

---

## 1. Streamed Metadata Inventory

During live streaming (`async_stream_query`) and session event retrieval, Vertex AI Reasoning Engine emits JSON objects with the following schema:

```json
{
  "id": "2a18cb74-f654-47f3-86ac-dbb6223bbf8b",
  "invocation_id": "e-2bb5c7b2-e5e6-4627-a57e-ee5f835a9bfa",
  "author": "root_agent",
  "model_version": "gemini-flash-latest",
  "content": {
    "parts": [
      {
        "text": "Hello! How can I help you today?",
        "thought_signature": "CtcHAY89a1--OtSEPZg..."
      }
    ],
    "role": "model"
  },
  "finish_reason": "STOP",
  "usage_metadata": {
    "candidates_token_count": 813,
    "candidates_tokens_details": [{ "modality": "TEXT", "token_count": 813 }],
    "prompt_token_count": 3002,
    "prompt_tokens_details": [{ "modality": "TEXT", "token_count": 3002 }],
    "thoughts_token_count": 275,
    "total_token_count": 4090,
    "traffic_type": "ON_DEMAND"
  },
  "avg_logprobs": -0.20916793091270758,
  "actions": {
    "state_delta": {},
    "artifact_delta": {},
    "requested_auth_configs": {},
    "requested_tool_confirmations": {}
  },
  "node_info": {
    "path": "root_agent@1"
  },
  "timestamp": 1786305763.3772614
}
```

---

## 2. Field Definitions & UI/UX Value

### 2.1 Token Usage & Breakdown (`usage_metadata`)

- **Raw Fields**:
  - `prompt_token_count`: Number of input/context tokens.
  - `candidates_token_count`: Number of output response tokens.
  - `thoughts_token_count`: Number of reasoning/thinking tokens (Gemini 2.0 Thinking).
  - `total_token_count`: Total tokens consumed.
  - `traffic_type`: Billing tier (`ON_DEMAND` vs `PROVISIONED`).
- **UI/UX Placement**:
  - **Message Details Tooltip / Popover**: `3,002 in • 813 out (275 thinking) • 4,090 total`.
  - **Cost & Quota Tracking**: Cumulative token usage displayed in session info or profile menu.

### 2.2 Model Version Tag (`model_version` / `modelVersion`)

- **Raw Field**: e.g., `"gemini-flash-latest"`, `"gemini-pro-latest"`.
- **UI/UX Placement**:
  - Pill badge rendered alongside message execution timing in the assistant message footer.

### 2.3 Cloud Trace & Invocation ID (`invocation_id` / `invocationId`)

- **Raw Field**: Unique turn identifier e.g. `"e-2bb5c7b2-e5e6-4627-a57e-ee5f835a9bfa"`.
- **UI/UX Placement**:
  - **Copy Trace ID**: Context menu action on the message.
  - **Cloud Trace Deep Link**: `https://console.cloud.google.com/traces/list?project={projectId}&tid={invocationId}` for developer inspection.

### 2.4 Model Confidence & Log-Probs (`avg_logprobs`)

- **Raw Field**: Average log probability of the generated tokens (e.g. `-0.209`).
- **UI/UX Placement**:
  - Confidence rating tooltip or subtle indicator for high-risk / fact-checking agents.

### 2.5 Live Artifacts & State Deltas (`actions.artifact_delta` & `actions.state_delta`)

- **Raw Fields**:
  - `artifact_delta`: Key-value map of created or updated file artifacts (code, markdown, CSV, SVG).
  - `state_delta`: Session memory variables updated by the agent.
- **UI/UX Placement**:
  - **Artifacts Side-Panel Canvas**: Collapsible right drawer to preview and edit agent-generated artifacts.

### 2.6 Interactive Auth & Tool Confirmations (`actions.requested_auth_configs`)

- **Raw Field**: OAuth URLs or required external connection configs.
- **UI/UX Placement**:
  - In-thread "Connect Google Drive / BigQuery" OAuth card allowing single-click user authorization.

### 2.7 Multi-Agent Orchestration Path (`node_info.path`)

- **Raw Field**: Execution node position in the agent DAG e.g. `"root_agent@1"`, `"analyst@2/search_tool"`.
- **UI/UX Placement**:
  - Visual breadcrumb or workflow timeline showing which subagent or tool node generated the chunk.

### 2.8 Cryptographic Thinking Signature (`thought_signature`)

- **Raw Field**: Cryptographic signature validating the chain-of-thought tokens.
- **UI/UX Placement**:
  - Verified reasoning indicator on collapsible thought blocks.

---

## 3. Integration Architecture with `@assistant-ui/react`

To expose these fields in the UI without modifying core state primitives:

1. **Stream Parser (`src/lib/agent-runtime/sse-parser.ts`)**:
   - Extract `usage_metadata`, `model_version`, `invocation_id`, `avg_logprobs`, and `node_info` from the stream chunk.
   - Attach them to `AgentStreamEvent`.

2. **Chat Adapter (`src/lib/adapters/chat-adapter.ts`)**:
   - Pack incoming metadata into `@assistant-ui/react` message metadata:
     ```ts
     metadata: {
       custom: {
         eventId,
         invocationId,
         modelVersion,
         usageMetadata,
         avgLogprobs,
         nodePath,
       }
     }
     ```

3. **Message UI (`src/components/assistant-ui/gemini-message.tsx`)**:
   - Access `message.metadata.custom` to render custom badges, token tooltips, and trace actions.
