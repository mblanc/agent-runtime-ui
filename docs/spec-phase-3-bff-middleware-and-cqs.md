# Specification: Phase 3 — BFF Route Middleware (`withAuth`) & CQS Normalization

> **Feature / Phase:** Phase 3 of Architectural Improvements  
> **Status:** Draft / Ready for Review  
> **Author:** Antigravity  
> **Reference:** [`docs/improvments.md`](file:///Users/mblanc/projects/agent-runtime-ui/docs/improvments.md)

---

## 1. Assumptions & Core Decisions

### Assumptions

1. All authenticated API routes require a valid session with a non-empty `session.user.id`.
2. Removing the background `PATCH` title mutation from `GET /api/sessions/[sessionId]` will not affect the UI because `useSessionThreadListAdapter.generateTitle` explicitly triggers title persistence via `PATCH /api/sessions/[sessionId]` when the first user message is processed.
3. The `withAuth` middleware will catch unhandled errors and return sanitized 500 JSON responses without leaking server stack traces.

---

## 2. Objective & Motivation

### 2.1 Problem Statement

1. **DRY & Boilerplate Duplication**:
   Every Next.js route handler in `src/app/api/` repeats 15+ lines of identical authentication parsing, null checking, try/catch error logging, and standard JSON response construction.
2. **Command-Query Separation (CQS) Violation**:
   [`src/app/api/sessions/[sessionId]/route.ts`](file:///Users/mblanc/projects/agent-runtime-ui/src/app/api/sessions/%5BsessionId%5D/route.ts#L68-L89) performs a mutating `PATCH` command inside a `GET` request to rename sessions with generic titles. This violates HTTP `GET` idempotency and causes unexpected backend writes during read operations.

### 2.2 Goals

1. Implement a clean, type-safe route wrapper `withAuth` in `src/lib/api-handler.ts`.
2. Refactor all 7 API routes to use `withAuth`, reducing boilerplate by ~60%.
3. Enforce strict CQS by removing mutation side-effects from `GET /api/sessions/[sessionId]`.

---

## 3. Tech Stack & Execution Commands

| Layer              | Technology                                                            |
| :----------------- | :-------------------------------------------------------------------- |
| **Framework**      | Next.js 15 App Router (`NextRequest`, `NextResponse`)                 |
| **Authentication** | Web Crypto JWT & Cookie Session (`src/lib/auth.ts`)                   |
| **Language**       | TypeScript (Strict Mode)                                              |
| **Testing**        | Vitest (`tests/sessions-api.test.ts`, `tests/chat-api.test.ts`, etc.) |

### Core Commands

```bash
# Typecheck
bun run check

# Run All API Tests
bun test tests/sessions-api.test.ts tests/chat-api.test.ts tests/feedback-api.test.ts tests/agents-api.test.ts tests/uploads-api.test.ts

# Run Full Test Suite
bun run test
```

---

## 4. Project Structure & Affected Routes

```
src/
├── lib/
│   └── api-handler.ts               # [NEW] withAuth route wrapper & response helpers
└── app/
    └── api/
        ├── agents/route.ts          # [REFACTORED] Uses withAuth
        ├── chat/route.ts            # [REFACTORED] Uses withAuth
        ├── feedback/route.ts        # [REFACTORED] Uses withAuth
        ├── sessions/
        │   ├── route.ts             # [REFACTORED] Uses withAuth
        │   └── [sessionId]/route.ts # [REFACTORED] Uses withAuth; CQS mutation removed
        └── uploads/
            ├── presign/route.ts     # [REFACTORED] Uses withAuth
            └── signed-read/route.ts # [REFACTORED] Uses withAuth
```

---

## 5. Code Style & Technical Design

### 5.1 The `withAuth` Handler Wrapper (`src/lib/api-handler.ts`)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth, AuthSession } from "@/lib/auth";

export interface AuthenticatedContext<TParams = Record<string, string>> {
  session: AuthSession;
  userId: string;
  userEmail: string;
  params?: TParams;
}

export type AuthenticatedRouteHandler<TParams = Record<string, string>> = (
  req: NextRequest,
  context: AuthenticatedContext<TParams>
) => Promise<Response>;

/**
 * Higher-order function that enforces user authentication, injects user context,
 * and standardizes error handling across API route handlers.
 */
export function withAuth<TParams = Record<string, string>>(
  handler: AuthenticatedRouteHandler<TParams>
) {
  return async (
    req: NextRequest,
    routeProps?: { params: Promise<TParams> }
  ): Promise<Response> => {
    try {
      const session = await auth.api.getSession({
        headers: req.headers,
      });

      if (!session?.user?.id) {
        return NextResponse.json(
          { error: "Unauthorized. Please sign in." },
          { status: 401 }
        );
      }

      const params = routeProps?.params ? await routeProps.params : undefined;

      return await handler(req, {
        session,
        userId: session.user.id,
        userEmail: session.user.email,
        params: params as TParams,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Internal server error";
      console.error(`[API Error] ${req.nextUrl.pathname}:`, errorMessage);
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  };
}
```

### 5.2 Refactored Route Example (`src/app/api/agents/route.ts`)

```typescript
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api-handler";
import { createAgentRuntimeProvider } from "@/lib/agent-runtime";

export const runtime = "nodejs";

export const GET = withAuth(async () => {
  const provider = createAgentRuntimeProvider();
  const result = await provider.listAgents();

  return NextResponse.json(result, {
    headers: {
      "Cache-Control": "no-store, no-cache, max-age=0, must-revalidate",
    },
  });
});
```

### 5.3 CQS Normalization in `src/app/api/sessions/[sessionId]/route.ts`

Remove the background mutating title call from `GET`:

```typescript
// BEFORE (CQS VIOLATION):
// agentClient.updateSessionTitle(sessionId, smartTitle, ...).catch(() => {});

// AFTER (CLEAN QUERY):
// Simply format session details and events; return messages. No side-effect writes.
```

---

## 6. Testing & Verification Strategy

1. **Unauthenticated Access Tests**:
   - Ensure every refactored endpoint returns `401 Unauthorized` with JSON error payload when invoked without valid session cookies.
2. **Authenticated Operations Tests**:
   - Test `GET /api/sessions`, `POST /api/sessions`, `GET /api/sessions/[sessionId]`, `PATCH /api/sessions/[sessionId]`, `DELETE /api/sessions/[sessionId]`.
   - Verify that `GET /api/sessions/[sessionId]` does not issue write operations to the provider.
3. **SSE Streaming Route Test**:
   - Verify that `POST /api/chat` continues to stream keepalive heartbeats and SSE event chunks correctly under `withAuth`.

---

## 7. Boundaries & Guardrails

- **Always do**:
  - Keep `runtime = "nodejs"` on all API routes.
  - Return clean JSON errors with appropriate HTTP status codes (400, 401, 403, 404, 500).
- **Ask first**:
  - Changing authentication cookie names or token expiration durations.
- **Never do**:
  - Perform write mutations in any `GET` HTTP handler.
  - Bypass `withAuth` on routes that expose user-specific resources.

---

## 8. Success Criteria

- [ ] `src/lib/api-handler.ts` is implemented with full TypeScript generics and error handling.
- [ ] All 7 API routes (`agents`, `chat`, `sessions`, `sessions/[sessionId]`, `feedback`, `uploads/presign`, `uploads/signed-read`) are refactored to use `withAuth`.
- [ ] Mutation on `GET /api/sessions/[sessionId]` is completely eliminated.
- [ ] All tests in `tests/sessions-api.test.ts`, `tests/chat-api.test.ts`, `tests/feedback-api.test.ts`, and `tests/uploads-api.test.ts` pass.
- [ ] `bun run check && bun run test` passes with zero regressions.
