# Specification: Linear User Message Editing & Prompt Retrying

## 1. Executive Summary & Goals

This specification defines the design and behavior for **Linear User Message Editing and Prompt Retrying** in **Agent Runtime UI**.

Based on product feedback, the application deliberately uses a **clean linear history model** (without tree branch navigation UI). When a user edits a previously sent prompt at turn `N`, all subsequent turns (`> N`) are discarded, the prompt is updated inline, and the conversation re-streams from turn `N` onward against the distant GCP Agent.

---

## 2. User Experience & UI Flows

### 2.1 User Prompt Editing

1. **Hover Action**: Hovering over a right-aligned user bubble reveals a subtle **Pencil Edit** button (`ActionBarPrimitive.Edit`).
2. **Inline Edit State**: Clicking edit transforms the user message text into an inline textarea pre-filled with the current prompt text, accompanied by **Cancel** and **Save & Submit** buttons.
3. **Submission**:
   - Pressing **Save & Submit** (or `Enter` without Shift):
     a. Updates message `N` content to the new text.
     b. Truncates all messages `> N` from local thread state.
     c. Automatically triggers a new run targeting the distant GCP Agent Runtime.
   - Pressing **Cancel** or `Esc` restores the original prompt text without mutating state.

### 2.2 Assistant Response Reloading

1. Clicking **Reload** (`ActionBarPrimitive.Reload`) on an assistant response:
   a. Removes the target assistant response.
   b. Re-streams a fresh response from the distant GCP Agent for the prompt immediately preceding it.

---

## 3. Interaction with Distant GCP Agent

When editing message `N` or retrying an assistant response:

```text
User Edits Message #2 (out of 5 turns)
─────────────────────────────────────────────────────────
Turn 1: User Prompt A      ───► Kept
Turn 2: Assistant Reply A  ───► Kept
Turn 3: User Prompt B      ───► EDITED to Prompt B'
Turn 4: Assistant Reply B  ───► Discarded
Turn 5: User Prompt C      ───► Discarded

New Stream Payload sent to /api/chat & Vertex AI Reasoning Engine:
  History: [Turn 1, Turn 2]
  New Input: [Turn 3 (Prompt B')]
```

### Session ID Persistence

- The distant agent session (`sessionId`) is preserved across edits.
- The `/api/chat` endpoint receives the truncated message history array, ensuring the distant Vertex AI Reasoning Engine operates with the exact context visible in the UI.

---

## 4. Frontend Implementation Blueprint

### 4.1 Component Updates (`src/components/assistant-ui/gemini-message.tsx`)

- Add `ActionBarPrimitive.Edit` to `MessagePrimitive.If user`.
- Render inline editable state when `isEditing` is toggled.
- Connect `ActionBarPrimitive.Reload` on assistant messages to `aui.thread.reload()`.

### 4.2 Runtime Adapter Handling (`src/lib/gemini-runtime-adapter.ts`)

- Ensure `useLocalRuntime` / `ChatModelAdapter` properly handles truncation when `reload` or `edit` is invoked via `aui.thread`.

---

## 5. Implementation Checklist

- [ ] **Task 1: User Message Edit UI**
  - Update `src/components/assistant-ui/gemini-message.tsx` to include `ActionBarPrimitive.Edit` and inline textarea editor for user bubbles.

- [ ] **Task 2: Reload & Truncation Logic**
  - Verify `aui.thread.reload()` behavior in `gemini-message.tsx` and ensure downstream messages are cleanly truncated.

- [ ] **Task 3: BFF Payload Verification**
  - Verify that `src/app/api/chat/route.ts` correctly processes truncated history arrays during re-stream queries.

- [ ] **Task 4: Unit & E2E Testing**
  - Add test cases in `tests/components.test.tsx` verifying inline user edit toggles and submission triggers.
  - Run `bun run preflight` quality gates.
