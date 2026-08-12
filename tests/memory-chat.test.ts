import { describe, expect, it, vi, beforeEach } from "vitest";
import { createGeminiChatAdapter } from "@/lib/adapters/chat-adapter";
import { MockAgentRuntimeProvider } from "@/lib/agent-runtime/mock/mock-provider";
import { mockMemoriesStore } from "@/lib/agent-runtime/mock/mock-store";
import type { ChatModelRunResult } from "@assistant-ui/react";
import type { MemoryRetrievalItem } from "@/types/agent";

describe("End-to-End Chat & Memory Bank Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockMemoriesStore.clear();
    mockMemoriesStore.set("mem-user-1", {
      id: "mem-user-1",
      userId: "test-user",
      fact: "Prefers TypeScript with strict typing",
      topic: "coding_preferences",
      confidenceScore: 0.95,
      createTime: new Date().toISOString(),
      updateTime: new Date().toISOString(),
    });
    mockMemoriesStore.set("mem-user-2", {
      id: "mem-user-2",
      userId: "test-user",
      fact: "Enterprise Cloud Architect for Vertex AI",
      topic: "enterprise_context",
      confidenceScore: 0.9,
      createTime: new Date().toISOString(),
      updateTime: new Date().toISOString(),
    });
  });

  it("retrieves relevant memories during streaming query in mock provider", async () => {
    const provider = new MockAgentRuntimeProvider();
    const generator = provider.streamQuery(
      {
        messages: [{ role: "user", content: "Tell me about TypeScript architecture" }],
      },
      "test-user"
    );

    const events = [];
    for await (const evt of generator) {
      events.push(evt);
    }

    const memoryEvent = events.find(
      (e) => e.retrieved_memories && e.retrieved_memories.length > 0
    );
    expect(memoryEvent).toBeDefined();
    expect(memoryEvent?.retrieved_memories?.[0].fact).toContain("TypeScript");
  });

  it("chat adapter attaches retrieved memories to message metadata custom field", async () => {
    const sseChunks = [
      'data: {"event_type":"thought","thought":"Checking user context...","retrieved_memories":[{"id":"mem-user-1","fact":"Prefers TypeScript with strict typing","topic":"coding_preferences","relevanceScore":0.95}]}\n\n',
      'data: {"event_type":"content","content":"Here is the TypeScript recommendation."}\n\n',
      "data: [DONE]\n\n",
    ];

    let chunkIndex = 0;
    const mockStream = new ReadableStream({
      pull(controller) {
        if (chunkIndex < sseChunks.length) {
          controller.enqueue(new TextEncoder().encode(sseChunks[chunkIndex]));
          chunkIndex++;
        } else {
          controller.close();
        }
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: mockStream,
    }) as unknown as typeof fetch;

    const adapter = createGeminiChatAdapter(() => "session-123");
    const runResult = adapter.run({
      messages: [
        {
          id: "msg-1",
          role: "user",
          content: [{ type: "text", text: "Help me write TypeScript code" }],
          attachments: [],
          status: { type: "complete", reason: "unknown" },
          createdAt: new Date(),
          metadata: { custom: {} },
        },
      ],
      abortSignal: new AbortController().signal,
    } as unknown as Parameters<typeof adapter.run>[0]);

    const yields: ChatModelRunResult[] = [];
    if (Symbol.asyncIterator in runResult) {
      for await (const res of runResult as AsyncGenerator<
        ChatModelRunResult,
        void,
        unknown
      >) {
        yields.push(res);
      }
    }

    expect(yields.length).toBeGreaterThan(0);
    const lastYield = yields[yields.length - 1];
    const retrieved = lastYield.metadata?.custom?.retrievedMemories as
      MemoryRetrievalItem[] | undefined;
    expect(retrieved).toBeDefined();
    expect(retrieved).toHaveLength(1);
    expect(retrieved?.[0].fact).toBe("Prefers TypeScript with strict typing");
  });

  it("extracts and consolidates facts from a session with generateMemories", async () => {
    const provider = new MockAgentRuntimeProvider();
    const result = await provider.generateMemories("test-user", "session-arch-1");

    expect(result.length).toBeGreaterThan(0);
    expect(result[0].userId).toBe("test-user");
    expect(mockMemoriesStore.size).toBeGreaterThanOrEqual(3);
  });
});
