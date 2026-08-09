# Specification: Phase 4 — UI Tool Stream Direct Wire Protocol & Scoped Attachment Store

> **Feature / Phase:** Phase 4 of Architectural Improvements  
> **Status:** Draft / Ready for Review  
> **Author:** Antigravity  
> **Reference:** [`docs/improvments.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/improvments.md)

---

## 1. Assumptions & Core Decisions

### Assumptions

1. `@assistant-ui/react` v0.15 provides first-class support for `tool-call` and `reasoning` content parts via `ChatModelRunResult.content` and `MessagePrimitive.GroupedParts`.
2. Existing HITL tools (`adk_request_confirmation`) continue to receive `function_response` payloads formatted according to Google Cloud ADK conventions when user decisions are submitted.
3. The attachment metadata store will be scoped to the active browser session, ensuring proper lifecycle cleanup via `URL.revokeObjectURL`.

---

## 2. Objective & Motivation

### 2.1 Problem Statement

1. **String Serialization Impedance Mismatch (KISS / SRP)**:
   - When tools or subagents execute during a stream or when history is loaded, the application serializes structured data into markdown pseudo-tags:
     `:::subagent[Arch Advisor]{status="complete" agent="arch_advisor"}\n...:::`
     `:::tool[check_system_health]{status="complete"}\n**Arguments:**\n...\n:::`
   - [`src/components/assistant-ui/reasoning.tsx`](file:///Users/mblanc/projects/agent-runtime-ui/src/components/assistant-ui/reasoning.tsx) runs complex regex matchers (`parseReasoningBlocks`, `parseToolBlockContent`, `parseSubAgentBlockContent`, `parseLegacyToolTraces`) to parse the string back into React elements.
   - This creates edge-case parsing bugs when model outputs contain code blocks with markdown syntax.
2. **Global Mutable State & Memory Leaks (SoC / Memory Management)**:
   - [`src/lib/gemini-runtime-adapter.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/lib/gemini-runtime-adapter.ts#L24) maintains `export const attachmentMetadataMap = new Map<string, AttachmentMetadata>()` at the module level.
   - This unbounded map leaks object URLs and metadata across multiple threads in long-running browser tabs.
3. **Monolithic Adapter File**:
   - `gemini-runtime-adapter.ts` (822 LOC) mixes chat streaming, attachment upload orchestration, speech synthesis, and feedback.

### 2.2 Goals

1. Emit native structured `tool-call` and `reasoning` parts directly from `createGeminiChatAdapter` without markdown tag round-tripping.
2. Simplify `reasoning.tsx` to render pure markdown thoughts, relying on `MessagePrimitive.GroupedParts` and `ToolFallback` for tool calls.
3. Implement `SessionAttachmentStore` with automatic URL revocation in `src/lib/attachments/attachment-store.ts`.
4. Decompose `gemini-runtime-adapter.ts` into modular, single-responsibility adapters under `src/lib/adapters/`.

---

## 3. Tech Stack & Execution Commands

| Layer                  | Technology                                                                                                |
| :--------------------- | :-------------------------------------------------------------------------------------------------------- |
| **Chat Engine**        | `@assistant-ui/react` (v0.15), `@assistant-ui/react-markdown`                                             |
| **Markdown Primitive** | `@assistant-ui/react-streamdown` with Shiki & KaTeX                                                       |
| **Language**           | TypeScript (Strict Mode)                                                                                  |
| **Testing**            | Vitest (`tests/tools-hitl.test.tsx`, `tests/multimodal-attachments.test.tsx`, `tests/voice-tts.test.tsx`) |

### Core Commands

```bash
# Typecheck
bun run check

# Run Tool & Multimodal Tests
bun test tests/tools-hitl.test.tsx tests/multimodal-attachments.test.tsx tests/voice-tts.test.tsx

# Run Full Test Suite
bun run test
```

---

## 4. Project Structure & Architecture

```
src/lib/
├── adapters/
│   ├── index.ts                      # Clean facade re-exporting all adapters
│   ├── chat-adapter.ts               # createGeminiChatAdapter (SSE to assistant-ui stream)
│   ├── feedback-adapter.ts           # createGeminiFeedbackAdapter
│   ├── gcs-attachment-adapter.ts     # createGcsAttachmentAdapter
│   └── speech-adapters.ts            # Web Speech dictation & synthesis adapters
├── attachments/
│   └── attachment-store.ts           # SessionAttachmentStore with memory lifecycle
└── gemini-runtime-adapter.ts         # Backward-compatible facade (re-exports for existing imports)

src/components/assistant-ui/
├── reasoning.tsx                     # [SIMPLIFIED] Pure thought rendering without regex parsers
├── tool-fallback.tsx                 # [MAINTAINED] Interactive tool call & HITL card
├── tool-group.tsx                    # [MAINTAINED] Grouped tool execution container
└── subagent-collapsible.tsx          # [MAINTAINED] Subagent trace accordion
```

---

## 5. Code Style & Technical Design

### 5.1 Scoped Attachment Store (`src/lib/attachments/attachment-store.ts`)

```typescript
export interface AttachmentMetadata {
  gcsUri: string;
  readUrl: string;
  previewUrl: string;
  contentType: string;
}

export interface IAttachmentMetadataStore {
  get(id: string): AttachmentMetadata | undefined;
  set(id: string, meta: AttachmentMetadata): void;
  delete(id: string): void;
  clear(): void;
}

export class SessionAttachmentStore implements IAttachmentMetadataStore {
  private store = new Map<string, AttachmentMetadata>();

  get(id: string): AttachmentMetadata | undefined {
    return this.store.get(id);
  }

  set(id: string, meta: AttachmentMetadata): void {
    this.store.set(id, meta);
  }

  delete(id: string): void {
    const meta = this.store.get(id);
    if (meta?.previewUrl && typeof URL !== "undefined" && URL.revokeObjectURL) {
      try {
        URL.revokeObjectURL(meta.previewUrl);
      } catch {
        // ignore
      }
    }
    this.store.delete(id);
  }

  clear(): void {
    for (const id of this.store.keys()) {
      this.delete(id);
    }
  }
}

export const defaultAttachmentStore = new SessionAttachmentStore();
```

### 5.2 Direct Structured Tool Call Emission (`src/lib/adapters/chat-adapter.ts`)

```typescript
// During SSE stream decoding:
if (parsed.event_type === "tool_call" && parsed.tool_call) {
  const toolName = parsed.tool_call.name || "agent_tool";
  const toolCallId = parsed.tool_call.id || `call_${Date.now()}`;
  const args = parsed.tool_call.args || {};
  const isRequiresAction =
    toolName === "adk_request_confirmation" ||
    parsed.tool_call.status === "requires-action" ||
    parsed.tool_call.requires_confirmation === true;

  toolCallsMap.set(toolCallId, {
    toolCallId,
    toolName,
    args,
    status: isRequiresAction
      ? { type: "requires-action", reason: "interrupt" }
      : { type: "running" },
  });

  // Yield directly as structured tool-call parts — NO markdown string pseudo-tags needed!
  yield createYieldContent(
    accumulatedReasoning,
    accumulatedText,
    Array.from(toolCallsMap.values())
  );
}
```

### 5.3 Simplified `ReasoningText` Component (`src/components/assistant-ui/reasoning.tsx`)

```typescript
export function ReasoningText({
  text,
  children,
  className,
}: {
  text?: string;
  children?: ReactNode;
  className?: string;
}) {
  const rawText = text || (typeof children === "string" ? children : "");

  return (
    <div
      className={cn(
        "font-mono text-[11.5px] leading-5 text-[#575b5f] dark:text-[#9aa0a6] whitespace-pre-wrap",
        className
      )}
    >
      {children ?? rawText}
    </div>
  );
}
```

---

## 6. Testing & Verification Strategy

1. **HITL Tool Interaction Test**:
   - Run `bun test tests/tools-hitl.test.tsx` to verify:
     - Tool calls render with arguments.
     - HITL approval/decline buttons render and trigger `addResult` / `respondToApproval`.
     - `function_response` payloads serialize properly back to `/api/chat`.
2. **Multimodal Uploads & Memory Cleanup Test**:
   - Run `bun test tests/multimodal-attachments.test.tsx` to ensure:
     - Presign -> PUT -> Metadata mapping succeeds.
     - `attachment.remove` revokes object URLs via `SessionAttachmentStore.delete`.
3. **Voice TTS Test**:
   - Run `bun test tests/voice-tts.test.tsx` to confirm speech synthesis and dictation adapters function cleanly.

---

## 7. Boundaries & Guardrails

- **Always do**:
  - Keep `src/lib/gemini-runtime-adapter.ts` as a backward-compatible entrypoint exporting `createGeminiChatAdapter`, `createGcsAttachmentAdapter`, etc.
  - Automatically revoke object URLs when attachments are removed.
- **Ask first**:
  - Changing the UI visual design tokens of the Gemini composer or message bubbles.
- **Never do**:
  - Re-introduce global mutable maps without lifecycle management.
  - Re-introduce markdown string pseudo-tags for structured tool calls.

---

## 8. Success Criteria

- [ ] `SessionAttachmentStore` is implemented with proper `URL.revokeObjectURL` cleanup.
- [ ] `gemini-runtime-adapter.ts` is decomposed into `src/lib/adapters/` (< 200 LOC per file).
- [ ] `reasoning.tsx` is stripped of complex regex parsers (~150 LOC reduction).
- [ ] Tool calls render as native `@assistant-ui/react` parts.
- [ ] All 176 tests pass across the entire test suite.
- [ ] `bun run preflight` passes with zero lint, type, or test errors.
