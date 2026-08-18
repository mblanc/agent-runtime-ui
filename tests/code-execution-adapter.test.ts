import { describe, it, expect, beforeEach, vi } from "vitest";
import { createGeminiChatAdapter } from "@/lib/adapters/chat-adapter";
import { MockAgentRuntimeProvider } from "@/lib/agent-runtime/mock/mock-provider";
import {
  mockSessionsStore,
  mockSessionEventsStore,
} from "@/lib/agent-runtime/mock/mock-store";
import type { ChatModelRunResult } from "@assistant-ui/react";
import type { AgentCodeExecutionBlock } from "@/types/agent";

describe("ChatAdapter with Code Execution", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSessionsStore.clear();
    mockSessionEventsStore.clear();
  });

  it("yields snapshots with codeExecutionBlocks when streaming code execution", async () => {
    const provider = new MockAgentRuntimeProvider();
    const adapter = createGeminiChatAdapter();

    // Mock fetch to invoke provider.streamQuery via ReadableStream
    global.fetch = vi.fn().mockImplementation(async () => {
      const generator = provider.streamQuery(
        {
          messages: [{ role: "user", content: "calculate python fibonacci sequence" }],
        },
        "test-user"
      );

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          for await (const evt of generator) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(evt)}\n\n`));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        },
      });

      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      });
    }) as unknown as typeof fetch;

    const runResult = adapter.run({
      messages: [
        {
          id: "m-user-1",
          role: "user",
          content: [{ type: "text", text: "calculate python fibonacci sequence" }],
          attachments: [],
          status: { type: "complete", reason: "unknown" },
          createdAt: new Date(),
          metadata: { custom: {} },
        },
      ],
      abortSignal: new AbortController().signal,
    } as unknown as Parameters<typeof adapter.run>[0]);

    const snapshots: ChatModelRunResult[] = [];
    if (Symbol.asyncIterator in runResult) {
      for await (const snapshot of runResult as AsyncGenerator<
        ChatModelRunResult,
        void,
        unknown
      >) {
        snapshots.push(snapshot);
      }
    }

    expect(snapshots.length).toBeGreaterThan(0);
    const finalSnapshot = snapshots[snapshots.length - 1];
    const customMeta = finalSnapshot.metadata?.custom as
      Record<string, unknown> | undefined;

    expect(customMeta?.codeExecutionBlocks).toBeDefined();
    const blocks = customMeta?.codeExecutionBlocks as AgentCodeExecutionBlock[];
    expect(blocks.length).toBe(1);
    expect(blocks[0].language).toBe("PYTHON");
    expect(blocks[0].code).toContain("calculate_fibonacci");
    expect(blocks[0].result?.outcome).toBe("OUTCOME_OK");
    expect(blocks[0].result?.output).toContain("Fibonacci Sequence");
  });
});
