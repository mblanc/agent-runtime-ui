import { describe, expect, it, vi, beforeEach } from "vitest";
import { createGeminiChatAdapter } from "@/lib/adapters/chat-adapter";
import { MockAgentRuntimeProvider } from "@/lib/agent-runtime/mock/mock-provider";
import {
  mockSessionsStore,
  mockSessionEventsStore,
} from "@/lib/agent-runtime/mock/mock-store";
import type { ChatModelRunResult } from "@assistant-ui/react";
import type { GroundingMetadata } from "@/types/agent";

describe("End-to-End Grounding Stream & Adapter Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSessionsStore.clear();
    mockSessionEventsStore.clear();
  });

  it("yields realistic grounding metadata from MockAgentRuntimeProvider for search/specs queries", async () => {
    const provider = new MockAgentRuntimeProvider();
    const generator = provider.streamQuery(
      {
        messages: [
          {
            role: "user",
            content: "What are the latest Vertex AI specs and documentation?",
          },
        ],
      },
      "test-user"
    );

    const events = [];
    for await (const evt of generator) {
      events.push(evt);
    }

    const groundingEvt = events.find((e) => e.grounding_metadata || e.groundingMetadata);
    expect(groundingEvt).toBeDefined();

    const meta = (groundingEvt?.grounding_metadata ||
      groundingEvt?.groundingMetadata) as GroundingMetadata;
    expect(meta.groundingChunks).toHaveLength(3);
    expect(meta.groundingChunks?.[0].web?.domain).toBe("cloud.google.com");
    expect(meta.groundingChunks?.[2].retrievedContext?.ragCorpusId).toBe(
      "enterprise-kb-us"
    );
    expect(meta.searchEntryPoint?.renderedContent).toContain("google-search-suggestion");

    const contentEvents = events.filter((e) => e.event_type === "content");
    const fullText = contentEvents.map((e) => e.content).join("");
    expect(fullText).toContain("[1]");
    expect(fullText).toContain("[2]");
    expect(fullText).toContain("[3]");
  });

  it("chat adapter attaches groundingMetadata to message metadata custom field during streaming", async () => {
    const sseChunks = [
      'data: {"event_type":"thought","thought":"Retrieving Google Search grounding...","grounding_metadata":{"webSearchQueries":["vertex ai specs"],"groundingChunks":[{"web":{"uri":"https://cloud.google.com/vertex-ai","title":"Vertex AI"}},{"retrievedContext":{"uri":"gs://bucket/doc.pdf","title":"Doc","confidenceScore":0.95}}],"searchEntryPoint":{"renderedContent":"<div>Search widget</div>"}}}\n\n',
      'data: {"event_type":"content","content":"Vertex AI provides managed scaling [1] and RAG grounding [2]."}\n\n',
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

    const adapter = createGeminiChatAdapter();
    const runResult = adapter.run({
      messages: [
        {
          id: "msg-1",
          role: "user",
          content: [{ type: "text", text: "Explain specs" }],
          attachments: [],
          status: { type: "complete", reason: "unknown" },
          createdAt: new Date(),
          metadata: { custom: {} },
        },
      ],
      abortSignal: new AbortController().signal,
    } as unknown as Parameters<typeof adapter.run>[0]);

    const results: ChatModelRunResult[] = [];
    if (Symbol.asyncIterator in runResult) {
      for await (const res of runResult as AsyncGenerator<
        ChatModelRunResult,
        void,
        unknown
      >) {
        results.push(res);
      }
    }

    expect(results.length).toBeGreaterThan(0);
    const lastResult = results[results.length - 1];

    const customMeta = lastResult.metadata?.custom as Record<string, unknown>;
    expect(customMeta).toBeDefined();
    expect(customMeta.groundingMetadata).toBeDefined();

    const grounding = customMeta.groundingMetadata as GroundingMetadata;
    expect(grounding.webSearchQueries).toEqual(["vertex ai specs"]);
    expect(grounding.groundingChunks).toHaveLength(2);
    expect(grounding.searchEntryPoint?.renderedContent).toBe("<div>Search widget</div>");
  });

  it("persists groundingMetadata in mock session events for session history", async () => {
    const provider = new MockAgentRuntimeProvider();
    const sessionId = "session-test-grounding-123";
    mockSessionsStore.set(sessionId, {
      id: sessionId,
      name: `projects/mock/locations/us-central1/reasoningEngines/mock-arch-advisor/sessions/${sessionId}`,
      userId: "test-user",
      title: "Grounded Conversation",
      createTime: new Date().toISOString(),
      updateTime: new Date().toISOString(),
    });

    const generator = provider.streamQuery(
      {
        sessionId,
        messages: [{ role: "user", content: "Vertex specs and security" }],
      },
      "test-user"
    );

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _unused of generator) {
      // consume generator
    }

    const events = mockSessionEventsStore.get(sessionId);
    expect(events).toBeDefined();
    expect(events?.length).toBe(2);

    const assistantEvent = events?.find((e) => e.role === "assistant");
    expect(assistantEvent?.groundingMetadata).toBeDefined();
    expect(assistantEvent?.groundingMetadata?.groundingChunks?.length).toBe(3);
  });

  it("parseSseStream extracts grounding metadata from ADK google_search_agent and google_search events", async () => {
    const { parseSseStream } = await import("@/lib/agent-runtime/sse-parser");

    const ssePayload = [
      'data: {"event_type":"agent_call","agent_call":{"agent":"google_search_agent","input":{"query":"weather in Copenhagen today"}}}\n\n',
      'data: {"event_type":"agent_response","agent_response":{"agent":"google_search_agent","response":{"search_results":[{"title":"Copenhagen Weather","url":"https://weather.com/copenhagen","snippet":"Sunny 18°C"}]}}}\n\n',
      'data: {"event_type":"content","content":"Today in Copenhagen the weather is sunny with a temperature of 18°C [1]."}\n\n',
      "data: [DONE]\n\n",
    ].join("");

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(ssePayload));
        controller.close();
      },
    });

    const parsedEvents = [];
    for await (const evt of parseSseStream(stream)) {
      parsedEvents.push(evt);
    }

    const groundedEvents = parsedEvents.filter((e) => e.groundingMetadata);
    expect(groundedEvents.length).toBeGreaterThan(0);

    const allQueries = groundedEvents.flatMap(
      (e) => e.groundingMetadata?.webSearchQueries || []
    );
    expect(allQueries).toContain("weather in Copenhagen today");

    const allChunks = groundedEvents.flatMap(
      (e) => e.groundingMetadata?.groundingChunks || []
    );
    expect(allChunks[0]?.web?.domain).toBe("weather.com");
  });

  it("groupTurnSessionEvents and formatSessionEventsToThreadMessages preserve grounding citations for multi-turn sessions", async () => {
    const { groupTurnSessionEvents, formatSessionEventsToThreadMessages } =
      await import("@/lib/agent-runtime/event-normalizer");

    const rawSessionEvents = [
      {
        id: "evt-user-1",
        author: "user",
        content: "What is the weather in Copenhagen today?",
        createTime: "2026-08-14T10:00:00Z",
      },
      {
        id: "evt-agent-1",
        author: "google_search_agent",
        tool_results: [
          {
            name: "google_search",
            result: {
              query: "weather in Copenhagen today",
              search_results: [
                {
                  title: "DMI Weather Copenhagen",
                  url: "https://www.dmi.dk/copenhagen",
                  snippet: "Partly cloudy 18C",
                },
              ],
            },
          },
        ],
        createTime: "2026-08-14T10:00:01Z",
      },
      {
        id: "evt-agent-final",
        author: "model",
        content: "The weather in Copenhagen today is partly cloudy and 18°C [1].",
        createTime: "2026-08-14T10:00:02Z",
      },
    ];

    const grouped = groupTurnSessionEvents(rawSessionEvents, "3907632920315035648");
    expect(grouped).toHaveLength(2);

    const assistantTurn = grouped.find((e) => e.role === "assistant");
    expect(assistantTurn?.groundingMetadata).toBeDefined();
    expect(assistantTurn?.groundingMetadata?.webSearchQueries).toEqual([
      "weather in Copenhagen today",
    ]);
    expect(assistantTurn?.groundingMetadata?.groundingChunks?.[0].web?.domain).toBe(
      "dmi.dk"
    );

    const threadMessages = formatSessionEventsToThreadMessages(grouped);
    expect(threadMessages).toHaveLength(2);

    const assistantMsg = threadMessages.find((m) => m.role === "assistant");
    const customMeta = assistantMsg?.metadata?.custom as
      Record<string, unknown> | undefined;
    const grounding = customMeta?.groundingMetadata as GroundingMetadata | undefined;
    expect(grounding).toBeDefined();
    expect(grounding?.groundingChunks?.[0].web?.title).toBe("DMI Weather Copenhagen");
  });
});
