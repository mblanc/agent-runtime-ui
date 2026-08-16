import { describe, expect, it, vi } from "vitest";
import { createGeminiChatAdapter } from "@/lib/adapters/chat-adapter";
import {
  parseRawSessionEvent,
  groupTurnSessionEvents,
} from "@/lib/agent-runtime/event-normalizer";
import type { ChatModelRunResult } from "@assistant-ui/react";

describe("Session State & Context Caching in Chat Adapter & Normalizer", () => {
  it("extracts cached token counts from historical session event raw payload", () => {
    const rawEvt = {
      id: "evt-test-1",
      role: "assistant",
      content: "Here is your configured architecture.",
      raw_event: {
        usage_metadata: {
          prompt_token_count: 4000,
          cached_content_token_count: 3000,
          candidates_token_count: 500,
          total_token_count: 4500,
        },
        actions: {
          state_delta: {
            environment: "staging",
            cluster: "k8s-west1",
          },
        },
      },
    };

    const parsed = parseRawSessionEvent(rawEvt, "sess-1", 0);
    expect(parsed.usageMetadata).toBeDefined();
    expect(parsed.usageMetadata?.cached_content_token_count).toBe(3000);
    expect(parsed.usageMetadata?.prompt_token_count).toBe(4000);
    expect(parsed.actions).toBeDefined();
    expect(parsed.actions?.state_delta).toEqual({
      environment: "staging",
      cluster: "k8s-west1",
    });
  });

  it("yields actions and cached token counts in metadata.custom during streaming", async () => {
    const ssePayload = [
      'data: {"event_type":"thought","thought":"Setting environment..."}',
      // The wire between the route and the adapter carries normalised events:
      // `usageMetadata`, not the `usage_metadata` Vertex may have sent, which
      // the SSE parser resolved server-side. The token counts inside it keep
      // their upstream spelling — `AgentUsageMetadata` is shared with the
      // Sessions API type and is normalised only at its container key.
      'data: {"event_type":"content","content":"Configured.","actions":{"state_delta":{"cluster":"prod-1"}},"usageMetadata":{"prompt_token_count":4200,"cached_content_token_count":3420,"total_token_count":4800}}',
      "data: [DONE]",
    ].join("\n\n");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(ssePayload));
        controller.close();
      },
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    const adapter = createGeminiChatAdapter();
    const results: ChatModelRunResult[] = [];

    const runResult = adapter.run({
      messages: [
        {
          id: "msg-1",
          role: "user",
          content: [{ type: "text", text: "Configure cluster" }],
          attachments: [],
          status: { type: "complete", reason: "unknown" },
          createdAt: new Date(),
          metadata: { custom: {} },
        },
      ],
      abortSignal: new AbortController().signal,
      threadId: "test-thread",
    } as unknown as Parameters<typeof adapter.run>[0]);

    if (Symbol.asyncIterator in runResult) {
      for await (const res of runResult as AsyncGenerator<ChatModelRunResult>) {
        results.push(res);
      }
    }

    expect(results.length).toBeGreaterThan(0);
    const lastResult = results[results.length - 1];
    const custom = lastResult.metadata?.custom as Record<string, unknown> | undefined;

    expect(custom).toBeDefined();
    expect(custom?.actions).toEqual({ state_delta: { cluster: "prod-1" } });
    expect(custom?.usageMetadata).toBeDefined();
    expect(
      (custom?.usageMetadata as Record<string, unknown>).cached_content_token_count
    ).toBe(3420);
  });

  it("groups multi-turn session events with state mutations and cached tokens", () => {
    const rawEvents = [
      {
        id: "e-1",
        role: "user",
        content: "Set environment to prod",
        createTime: new Date().toISOString(),
      },
      {
        id: "e-2",
        role: "assistant",
        content: "Environment set to production.",
        actions: {
          state_delta: {
            environment: "production",
            active_tier: "enterprise",
          },
        },
        usage_metadata: {
          prompt_token_count: 5000,
          cached_content_token_count: 4000,
          total_token_count: 5200,
        },
        createTime: new Date().toISOString(),
      },
    ];

    const turns = groupTurnSessionEvents(rawEvents, "session-123");
    expect(turns.length).toBe(2);
    const assistantTurn = turns[1];

    expect(assistantTurn.actions?.state_delta).toEqual({
      environment: "production",
      active_tier: "enterprise",
    });
    expect(assistantTurn.usageMetadata?.cached_content_token_count).toBe(4000);
  });
});
