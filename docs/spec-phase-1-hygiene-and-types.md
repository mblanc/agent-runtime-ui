# Specification: Phase 1 — Codebase Hygiene, Dead Code Removal & Discriminated Union Types

> **Feature / Phase:** Phase 1 of Architectural Improvements  
> **Status:** Draft / Ready for Review  
> **Author:** Antigravity  
> **Reference:** [`docs/improvments.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/improvments.md)

---

## 1. Assumptions & Core Decisions

### Assumptions

1. Removing unimported component files (`gemini-tools.tsx`, `gemini-reasoning.tsx`, `gemini-thinking-indicator.tsx`) has zero impact on user-facing UI or test suites because the application currently renders `tool-fallback.tsx` and `reasoning.tsx`.
2. Existing tests and adapters expect both canonical snake_case (`file_data`, `function_call`, `function_response`) and assistant-ui normalized representations. Normalization helpers must guarantee 100% backward compatibility during type tightening.
3. No database is added; all type contracts remain purely serverless and client-side safe.

---

## 2. Objective & Motivation

### 2.1 Problem Statement

1. **Dead Weight & Confusion (YAGNI / PoLA)**:
   Three legacy UI components exist in `src/components/assistant-ui/`:
   - `gemini-tools.tsx` (108 LOC): Defines `GeminiToolCall` and `GeminiReasoningTrace` (0 imports).
   - `gemini-reasoning.tsx` (94 LOC): Defines `GeminiReasoningAccordion` (0 imports, superseded by `reasoning.tsx`).
   - `gemini-thinking-indicator.tsx` (47 LOC): Defines standalone thinking component (0 imports).
     These files create confusion for developers and AI agents trying to discover the authoritative tool and reasoning renderers.
2. **Fat & Fragile Polymorphic Interfaces (ISP / Type Safety)**:
   [`src/types/agent.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/types/agent.ts) defines `AgentMessagePart` with 10 optional properties across snake_case, camelCase, and ad-hoc schemas (`file_data` vs `fileData` with `file_uri`, `fileUri`, `mime_type`, `mimeType`). This forces complex defensive checks across adapters and backend parsers.

### 2.2 Goals

- Delete all 3 dead component files.
- Refactor `AgentMessagePart` in [`src/types/agent.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/types/agent.ts) into strict, type-safe **discriminated unions** with a runtime normalization utility.
- Clean up `AgentSessionEvent` to eliminate redundant single/array field duplication.
- Ensure all 176 Vitest tests pass with zero type errors (`bun run check`).

---

## 3. Tech Stack & Execution Commands

| Layer                         | Technology                                  |
| :---------------------------- | :------------------------------------------ |
| **Runtime & Package Manager** | Bun 1.3+                                    |
| **Framework**                 | Next.js 15 (App Router), React 19           |
| **Language**                  | TypeScript (Strict Mode)                    |
| **Testing**                   | Vitest (`vitest`), `@testing-library/react` |

### Core Commands

```bash
# Typecheck
bun run check

# Run Full Test Suite
bun run test

# Linting & Formatting
bun run lint
bun run format

# Full Quality Preflight
bun run preflight
```

---

## 4. Project Structure & Affected Files

```
src/
├── types/
│   └── agent.ts                      # [MODIFIED] Discriminated union types & normalizer
└── components/
    └── assistant-ui/
        ├── gemini-tools.tsx          # [DELETED] Unused legacy tool component
        ├── gemini-reasoning.tsx      # [DELETED] Unused legacy reasoning accordion
        ├── gemini-thinking-indicator.tsx # [DELETED] Unused legacy thinking indicator
        ├── gemini-message.tsx        # [MAINTAINED] Primary message renderer
        ├── reasoning.tsx             # [MAINTAINED] Primary reasoning compound component
        └── tool-fallback.tsx         # [MAINTAINED] Primary tool fallback component
```

---

## 5. Code Style & Technical Design

### 5.1 Discriminated Union Schema (`src/types/agent.ts`)

```typescript
// Strict, clean discriminated union for Agent Message Parts
export type AgentMessagePart =
  | AgentTextPart
  | AgentReasoningPart
  | AgentFileDataPart
  | AgentImagePart
  | AgentFileBlobPart
  | AgentFunctionCallPart
  | AgentFunctionResponsePart;

export interface AgentTextPart {
  type: "text";
  text: string;
}

export interface AgentReasoningPart {
  type: "reasoning";
  text: string;
  thought?: boolean;
}

export interface AgentFileDataPart {
  type: "file_data";
  file_data: {
    file_uri: string;
    mime_type: string;
  };
  filename?: string;
}

export interface AgentImagePart {
  type: "image";
  image: string; // Base64 data URL or HTTP URL
  filename?: string;
}

export interface AgentFileBlobPart {
  type: "file";
  file: {
    data: string;
    mimeType: string;
    filename?: string;
  };
}

export interface AgentFunctionCallPart {
  type: "function_call";
  function_call: {
    id?: string;
    name: string;
    args: Record<string, unknown>;
  };
}

export interface AgentFunctionResponsePart {
  type: "function_response";
  function_response: {
    id?: string;
    name: string;
    response: Record<string, unknown>;
  };
}
```

### 5.2 Normalization Helper (`src/types/agent.ts`)

```typescript
/**
 * Normalizes legacy or loose wire part payloads into strict discriminated AgentMessagePart unions.
 */
export function normalizeAgentMessagePart(
  raw: Record<string, unknown>
): AgentMessagePart {
  if (
    typeof raw.text === "string" &&
    !raw.function_call &&
    !raw.functionCall &&
    !raw.file_data &&
    !raw.fileData
  ) {
    if (raw.thought === true) {
      return { type: "reasoning", text: raw.text, thought: true };
    }
    return { type: "text", text: raw.text };
  }

  const fnCall = (raw.function_call || raw.functionCall) as
    Record<string, unknown> | undefined;
  if (fnCall) {
    return {
      type: "function_call",
      function_call: {
        id: (fnCall.id as string) || (raw.id as string),
        name: String(fnCall.name || "tool"),
        args: (fnCall.args as Record<string, unknown>) || {},
      },
    };
  }

  const fnResp = (raw.function_response || raw.functionResponse) as
    Record<string, unknown> | undefined;
  if (fnResp) {
    return {
      type: "function_response",
      function_response: {
        id: (fnResp.id as string) || (raw.id as string),
        name: String(fnResp.name || "tool"),
        response: (fnResp.response as Record<string, unknown>) || {},
      },
    };
  }

  const fileData = (raw.file_data || raw.fileData) as Record<string, unknown> | undefined;
  if (fileData) {
    const file_uri = String(fileData.file_uri || fileData.fileUri || "");
    const mime_type = String(
      fileData.mime_type || fileData.mimeType || "application/octet-stream"
    );
    return {
      type: "file_data",
      file_data: { file_uri, mime_type },
    };
  }

  if (typeof raw.image === "string") {
    return { type: "image", image: raw.image };
  }

  return { type: "text", text: String(raw.text || JSON.stringify(raw)) };
}
```

---

## 6. Testing & Verification Strategy

1. **Static Analysis**: Run `bun run check` to verify that all consumers of `src/types/agent.ts` typecheck cleanly without type assertions or `any`.
2. **Component Tests**: Run `bun test tests/components.test.tsx` and `bun test tests/tools-hitl.test.tsx` to verify message rendering and tool interactions continue functioning seamlessly.
3. **API & Client Tests**: Run `bun test tests/chat-api.test.ts` and `bun test tests/agent-client.test.ts` to ensure payload serialization remains compatible with the Vertex AI Reasoning Engine wire protocol.

---

## 7. Boundaries & Guardrails

- **Always do**:
  - Run `bun run check` and `bun run test` after deleting dead files and updating type definitions.
  - Maintain the runtime `normalizeAgentMessagePart` helper for robust deserialization of Vertex AI responses.
- **Ask first**:
  - Modifying any public Next.js API route contracts in `/api/*`.
- **Never do**:
  - Introduce `any` casts to bypass TypeScript checks.
  - Delete `reasoning.tsx`, `tool-fallback.tsx`, or `tool-group.tsx` which are active in production.

---

## 8. Success Criteria

- [ ] `src/components/assistant-ui/gemini-tools.tsx` is deleted.
- [ ] `src/components/assistant-ui/gemini-reasoning.tsx` is deleted.
- [ ] `src/components/assistant-ui/gemini-thinking-indicator.tsx` is deleted.
- [ ] `AgentMessagePart` is converted into a discriminated union with `type` discriminant.
- [ ] `bun run check` passes with 0 type errors.
- [ ] `bun run test` passes with 100% of test suites green (176+ tests).

---

## 9. Open Questions & Clarifications

1. **Question**: Are there external packages importing `GeminiToolCall` from `gemini-tools.tsx`?  
   **Answer**: No. A full repository grep confirmed 0 external imports across `src/` and `tests/`.
