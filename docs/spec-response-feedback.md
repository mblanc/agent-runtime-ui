# Specification: Response Feedback & GCP Feedback Service Integration

## 1. Executive Summary & Goals

This specification details the technical design for adding **User Response Feedback** to **Agent Runtime UI** and connecting it to the **Vertex AI Agent Platform Feedback Service** (`projects/.../reasoningEngines/.../feedbackEntries`).

It enables users to give qualitative feedback (Thumbs Up / Thumbs Down, feedback labels, and text comments) on assistant turns. The feedback is forwarded via a Next.js BFF endpoint to GCP, populating **Cloud Trace** and **BigQuery Agent Analytics** for model evaluation and quality flywheel monitoring.

---

## 2. End-to-End Data Flow

```text
┌─────────────────┐     1. User clicks Thumbs Up / Down      ┌──────────────────┐
│                 │─────────────────────────────────────────►│ Next.js BFF      │
│                 │                                          │ POST /api/feedback
│                 │◄─────────────────────────────────────────│                  │
│  Browser UI     │     2. Returns { name: "..." }           └──────────────────┘
│ (assistant-ui) │                                                    │
│                 │                                                   │ 3. REST API Call
│                 │                                                   ▼
│                 │                                          ┌──────────────────┐
│                 │                                          │ Vertex AI Agent  │
│                 │                                          │ Feedback Service │
└─────────────────┘                                          └──────────────────┘
```

---

## 3. Data Contracts & Types (`src/types/agent.ts`)

```typescript
export type FeedbackType = "THUMBS_UP" | "THUMBS_DOWN" | "FEEDBACK_TYPE_UNSPECIFIED";

export interface AgentFeedbackRequest {
  sessionId: string;
  eventId?: string; // Target response turn event ID
  feedbackType: FeedbackType;
  feedbackText?: string;
  feedbackLabels?: string[];
}

export interface AgentFeedbackResponse {
  name: string;
  createTime: string;
  feedbackType: FeedbackType;
}
```

---

## 4. Backend API Route (`POST /api/feedback`)

### 4.1 Specification

- **Endpoint**: `/api/feedback`
- **HTTP Method**: `POST`
- **Authentication**: Enforces `getAuthSession()` JWT cookie validation.
- **Payload**: `AgentFeedbackRequest`

### 4.2 Behavior & GCP Proxying

1. Extracts `userId` from authenticated session.
2. Constructs the GCP REST API URL:
   `https://{LOCATION}-aiplatform.googleapis.com/v1beta1/projects/{PROJECT_ID}/locations/{LOCATION}/reasoningEngines/{AGENT_ENGINE_ID}/feedbackEntries`
3. Obtains GCP OAuth access token via `google-auth-library`.
4. Sends GCP payload:
   ```json
   {
     "session_id": "SESSION_ID",
     "event_id": "EVENT_ID",
     "feedback_type": "THUMBS_UP",
     "config": {
       "feedback_text": "Detailed comment...",
       "feedback_labels": ["accurate"],
       "user_id": "userId",
       "source": "Agent Runtime UI"
     }
   }
   ```
5. Returns `AgentFeedbackResponse` (HTTP 200).

---

## 5. Frontend UI Integration (`src/components/assistant-ui/gemini-message.tsx`)

### 5.1 Assistant Action Bar Update

Mount `ActionBarPrimitive.FeedbackPositive` and `ActionBarPrimitive.FeedbackNegative` inside `ActionBarPrimitive.Root` in `ChatMessageImpl`:

```tsx
<ActionBarPrimitive.Root>
  {/* Copy & Reload buttons */}
  <ActionBarPrimitive.Copy ... />
  <ActionBarPrimitive.Reload ... />

  {/* Feedback Controls */}
  <ActionBarPrimitive.FeedbackPositive className="h-8 w-8 hover:bg-muted rounded-full text-muted-foreground hover:text-emerald-500">
    <ThumbsUp className="h-4 w-4" />
  </ActionBarPrimitive.FeedbackPositive>

  <ActionBarPrimitive.FeedbackNegative className="h-8 w-8 hover:bg-muted rounded-full text-muted-foreground hover:text-rose-500">
    <ThumbsDown className="h-4 w-4" />
  </ActionBarPrimitive.FeedbackNegative>
</ActionBarPrimitive.Root>
```

### 5.2 `feedbackAdapter` Integration

Configure `feedbackAdapter` in `gemini-runtime-adapter.ts` to trigger `POST /api/feedback` when feedback buttons are toggled.

---

## 6. Implementation Checklist

- [ ] **Task 1: Data Contracts**
  - Update `src/types/agent.ts` with `AgentFeedbackRequest` and `AgentFeedbackResponse`.

- [ ] **Task 2: Next.js API Route**
  - Implement `src/app/api/feedback/route.ts` with GCP OAuth and Vertex AI REST API integration.
  - Add API unit tests in `tests/feedback-api.test.ts`.

- [ ] **Task 3: Assistant UI Wiring**
  - Update `src/components/assistant-ui/gemini-message.tsx` to render `ThumbsUp` / `ThumbsDown` action buttons.
  - Wire `feedbackAdapter` in `src/lib/gemini-runtime-adapter.ts`.

- [ ] **Task 4: Quality Gates**
  - Run `bun run preflight` to ensure typecheck, lint, and tests pass.
