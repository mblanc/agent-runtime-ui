# Specification: Generic Tool Execution & ADK HITL Integration

## 1. Executive Summary & Goals

This specification details the technical design for **Generic Tool Call Rendering** and **Human-in-the-Loop (HITL) Approval** in **Agent Runtime UI**.

Per product requirements:

- **100% Generic Tool Display**: Tool call inputs (`args`) and outputs (`result`) are rendered using a unified, generic `ToolFallback` component. No tool-specific custom React components are used.
- **ADK HITL Integration**: Handles ADK confirmation tool requests (`adk_request_confirmation`), presenting interactive **Approve** and **Decline** controls, and resuming execution by returning `function_response` to the distant GCP Agent.

---

## 2. End-to-End HITL Protocol Flow

```text
┌─────────────────┐  1. ADK emits function_call: adk_request_confirmation ┌──────────────────┐
│                 │──────────────────────────────────────────────────────►│ Next.js BFF      │
│                 │                                                       │ (/api/chat)      │
│                 │◄──────────────────────────────────────────────────────│                  │
│  Browser UI     │  2. Render Generic HITL Card (status: requires-action)└──────────────────┘
│ (assistant-ui) │
│                 │  3. User clicks Approve / Decline
│                 │──────────────────────────────────────────────────────►┌──────────────────┐
│                 │  4. Send function_response: { confirmed: true/false } │ Agent Runtime    │
│                 │     over /api/chat                                    │ (Vertex AI ADK)  │
└─────────────────┘                                                       └──────────────────┘
```

---

## 3. Generic Tool UI Design (`src/components/assistant-ui/tool-fallback.tsx`)

The `ToolFallback` component renders all tool calls using a generic, collapsible structure:

```tsx
<div className="my-2.5 rounded-xl border border-border bg-card p-3 shadow-xs">
  {/* Tool Header: Icon, Name, Status Badge, Expand Toggle */}
  <div className="flex items-center justify-between">
    <div className="flex items-center gap-2 text-xs font-mono font-medium">
      <Wrench className="h-3.5 w-3.5 text-primary" />
      <span>{toolName}</span>
      <StatusBadge status={part.status.type} />
    </div>
    <button
      onClick={toggleExpanded}
      className="text-xs text-muted-foreground hover:text-foreground"
    >
      {expanded ? "Collapse" : "View Details"}
    </button>
  </div>

  {/* HITL Approval Block (when status === "requires-action") */}
  {part.status.type === "requires-action" && (
    <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
      <div className="text-xs font-medium text-amber-900 dark:text-amber-200 mb-2">
        Tool requires human approval to proceed
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => respondToApproval({ confirmed: true })}>
          <Check className="mr-1 h-3.5 w-3.5" /> Approve
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => respondToApproval({ confirmed: false })}
        >
          <X className="mr-1 h-3.5 w-3.5" /> Decline
        </Button>
      </div>
    </div>
  )}

  {/* Expanded Content: Full Args & Full Raw Result */}
  {expanded && (
    <div className="mt-3 space-y-2 border-t pt-2 text-xs font-mono">
      <div>
        <div className="text-muted-foreground mb-1">Arguments:</div>
        <pre className="overflow-x-auto rounded-lg bg-muted p-2">
          {JSON.stringify(args, null, 2)}
        </pre>
      </div>

      {result && (
        <div>
          <div className="text-muted-foreground mb-1">Response Payload:</div>
          <pre className="overflow-x-auto rounded-lg bg-muted p-2">
            {formatResult(result)}
          </pre>
        </div>
      )}
    </div>
  )}
</div>
```

---

## 4. Interaction with Distant Agent (`/api/chat`)

1. **Receiving Confirmation Calls**:
   When the distant GCP Agent emits `adk_request_confirmation`, `/api/chat` streams the tool call part to `assistant-ui` with `status: { type: "requires-action" }`.

2. **Sending User Decision**:
   When the user clicks **Approve** or **Decline**, `assistant-ui` invokes `addResult({ confirmed: boolean })`.
   The `gemini-runtime-adapter.ts` formats a `user` role message containing `function_response`:

```json
{
  "role": "user",
  "parts": [
    {
      "function_response": {
        "id": "adk-call-id-12345",
        "name": "adk_request_confirmation",
        "response": { "confirmed": true }
      }
    }
  ]
}
```

This payload is sent to `:streamQuery` to resume distant agent execution.

---

## 5. Implementation Checklist

- [ ] **Task 1: Update `tool-fallback.tsx`**
  - Refactor `src/components/assistant-ui/tool-fallback.tsx` to support generic JSON/string result formatting and collapsible full-payload viewer.
  - Implement HITL `requires-action` confirmation controls (Approve / Decline).

- [ ] **Task 2: Adapt Stream Receiver**
  - Ensure `gemini-runtime-adapter.ts` maps `adk_request_confirmation` tool calls to `requires-action` status.

- [ ] **Task 3: Unit Testing & Quality Gates**
  - Add test cases in `tests/components.test.tsx` for tool call expand/collapse and HITL action triggers.
  - Run `bun run preflight` quality gates.
