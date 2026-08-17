import { beforeEach, describe, expect, it, vi } from "vitest";
import { VertexAiContext } from "@/lib/agent-runtime/services/context";
import { createAgentRuntimeProvider } from "@/lib/agent-runtime/factory";
import { parseRawSessionEvent } from "@/lib/agent-runtime/parse-event";
import { isRootWorkflowOutput } from "@/lib/agent-runtime/event-utils";
import { groupTurnSessionEvents } from "@/lib/agent-runtime/group-turns";
import { formatAgentDisplayName } from "@/lib/utils";
import { createYieldContent } from "@/lib/adapters/yield-content";

describe("agent runtime provider", () => {
  it("deduplicates repeated tool calls across intermediate session events in groupTurnSessionEvents", () => {
    const rawEvents = [
      {
        name: "events/0",
        author: "user",
        content: { role: "user", parts: [{ text: "Fetch claims" }] },
      },
      {
        name: "events/1",
        author: "assistant",
        content: {
          parts: [
            {
              functionCall: {
                name: "fetch_public_claims",
                args: { ticker: "NVDA" },
              },
            },
          ],
        },
      },
      {
        name: "events/2",
        author: "assistant",
        content: {
          parts: [
            {
              functionCall: {
                name: "fetch_public_claims",
                args: { ticker: "NVDA" },
              },
            },
            {
              functionResponse: {
                name: "fetch_public_claims",
                response: { claims: 12 },
              },
            },
          ],
        },
      },
      {
        name: "events/3",
        author: "assistant",
        content: {
          parts: [{ text: "Analysis complete with 12 claims." }],
        },
      },
    ];

    const grouped = groupTurnSessionEvents(rawEvents, "session-1");
    expect(grouped.length).toBe(2); // 1 user turn + 1 consolidated assistant turn
    const assistantTurn = grouped[1];
    expect(assistantTurn.thought).toBeDefined();

    // Verify there is only ONE tool block in thought, and it contains both Arguments and Result
    const toolOccurrences = assistantTurn.thought?.match(
      /:::tool\[fetch_public_claims\]/g
    );
    expect(toolOccurrences?.length).toBe(1);
    expect(assistantTurn.thought).toContain("**Arguments:**");
    expect(assistantTurn.thought).toContain("**Result:**");
  });
  beforeEach(() => {
    process.env.MOCK_AGENT_RUNTIME = "true";
  });

  it("initializes in mock mode when credentials are not configured", () => {
    const client = createAgentRuntimeProvider();
    expect(client).toBeDefined();
  });

  it("auto-extracts location and project from full reasoning engine resource name", () => {
    const originalEngine = process.env.GOOGLE_REASONING_ENGINE_ID;
    const originalLocation = process.env.GOOGLE_CLOUD_LOCATION;
    const originalProject = process.env.GOOGLE_CLOUD_PROJECT;

    try {
      process.env.GOOGLE_CLOUD_PROJECT = "default-project";
      process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
      process.env.GOOGLE_REASONING_ENGINE_ID =
        "projects/custom-project-123/locations/us-east1/reasoningEngines/custom-engine-456";

      // Asserted against VertexAiContext, which is the implementation the
      // services actually use. The facade carried its own copy of this logic
      // that nothing called and that ignored customLocation, so the two
      // disagreed for any cross-region call; it has been removed.
      const ctx = new VertexAiContext(undefined, undefined, async () => "t");
      const resource = ctx.getNormalizedEngineResource();

      expect(resource).toBe(
        "projects/custom-project-123/locations/us-east1/reasoningEngines/custom-engine-456"
      );
      expect(ctx.projectId).toBe("custom-project-123");
      expect(ctx.location).toBe("us-east1");
    } finally {
      process.env.GOOGLE_REASONING_ENGINE_ID = originalEngine;
      process.env.GOOGLE_CLOUD_LOCATION = originalLocation;
      process.env.GOOGLE_CLOUD_PROJECT = originalProject;
    }
  });

  it("lists sessions for the user in mock mode", async () => {
    const client = createAgentRuntimeProvider();
    const sessions = await client.listSessions("test-user");

    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions[0]).toHaveProperty("id");
    expect(sessions[0]).toHaveProperty("title");
    expect(sessions[0]).toHaveProperty("createTime");
  });

  it("creates a new session in mock mode", async () => {
    const client = createAgentRuntimeProvider();
    const newSession = await client.createSession("test-user", "Custom Thread Test");

    expect(newSession).toBeDefined();
    expect(newSession.title).toBe("Custom Thread Test");
    expect(newSession.userId).toBe("test-user");

    const fetched = await client.getSession(newSession.id);
    expect(fetched).toBeDefined();
    expect(fetched?.title).toBe("Custom Thread Test");
  });

  it("retrieves session events history in mock mode", async () => {
    const client = createAgentRuntimeProvider();
    const events = await client.listSessionEvents("1");

    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0].role).toBe("user");
    expect(events[1].role).toBe("assistant");
  });

  it("deletes a session in mock mode", async () => {
    const client = createAgentRuntimeProvider();
    const created = await client.createSession("test-user", "To be deleted");
    expect(await client.getSession(created.id)).toBeDefined();

    await client.deleteSession(created.id);
    const afterDelete = await client.getSession(created.id);
    expect(afterDelete).toBeNull();
  });

  it("yields streaming events in mock mode and records to session history", async () => {
    const client = createAgentRuntimeProvider();
    const session = await client.createSession("test-user", "Streaming Session");
    const events = [];

    for await (const event of client.streamQuery(
      {
        messages: [{ role: "user", content: "Explain agent sessions" }],
        sessionId: session.id,
      },
      "test-user"
    )) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
    const hasContent = events.some((e) => e.event_type === "content");
    expect(hasContent).toBe(true);

    const history = await client.listSessionEvents(session.id);
    expect(history.length).toBe(2);
    expect(history[0].content).toBe("Explain agent sessions");
  });

  it("isolates sessions per user and supports email fallback", async () => {
    const client = createAgentRuntimeProvider();
    const userASession = await client.createSession("user-a-sub", "User A Chat");
    const userBSession = await client.createSession(
      "user-b-email@example.com",
      "User B Chat"
    );

    // Query with User A sub
    const userASessions = await client.listSessions("user-a-sub", "user-a@example.com");
    expect(userASessions.some((s) => s.id === userASession.id)).toBe(true);
    expect(userASessions.some((s) => s.id === userBSession.id)).toBe(false);

    // Query with User B sub (fallback to email)
    const userBSessions = await client.listSessions(
      "user-b-sub",
      "user-b-email@example.com"
    );
    expect(userBSessions.some((s) => s.id === userBSession.id)).toBe(true);
    expect(userBSessions.some((s) => s.id === userASession.id)).toBe(false);
  });

  it("cleanly parses raw Gemini turn payloads with parts and thoughtSignature", () => {
    const rawUserEvt = {
      role: "user",
      parts: [{ text: "what is my watch list?" }],
    };
    const parsedUser = parseRawSessionEvent(rawUserEvt, "session-1", 0);
    expect(parsedUser.role).toBe("user");
    expect(parsedUser.content).toBe("what is my watch list?");
    expect(parsedUser.thought).toBeUndefined();

    const rawModelEvt = {
      role: "model",
      parts: [
        {
          text: "Your current default watch-list consists of US-listed semiconductor companies: NVIDIA (NVDA), Advanced Micro Devices (AMD), Intel (INTC), Micron Technology (MU), and Broadcom (AVGO).",
          thoughtSignature:
            "CpQGAY89a184R/PZ+8OUaBBZWTaMIaYTLhY2l81AhbVnwQu3NBUbOcFiTKRY...",
        },
      ],
    };
    const parsedModel = parseRawSessionEvent(rawModelEvt, "session-1", 1);
    expect(parsedModel.role).toBe("assistant");
    expect(parsedModel.content).toContain("NVIDIA (NVDA)");
    expect(parsedModel.content).not.toContain("thoughtSignature");
    expect(parsedModel.content).not.toContain("CpQGAY89");

    const rawReasoningEvt = {
      role: "model",
      parts: [
        { thought: "Analyzing semiconductor portfolio..." },
        { text: "Here is your updated list." },
      ],
    };
    const parsedReasoning = parseRawSessionEvent(rawReasoningEvt, "session-1", 2);
    expect(parsedReasoning.role).toBe("assistant");
    expect(parsedReasoning.thought).toBe("Analyzing semiconductor portfolio...");
    expect(parsedReasoning.content).toBe("Here is your updated list.");

    const rawStringifiedEvt = {
      content: JSON.stringify({
        role: "user",
        parts: [{ text: "tell me about NVDA" }],
      }),
    };
    const parsedStringified = parseRawSessionEvent(rawStringifiedEvt, "session-1", 3);
    expect(parsedStringified.role).toBe("user");
    expect(parsedStringified.content).toBe("tell me about NVDA");

    // Exact Google Cloud Agent Platform session event structure
    const rawGcpUserEvt = {
      name: "projects/125188993477/locations/us-central1/reasoningEngines/1295472637392191488/sessions/3966466688005701632/events/1721280943567667200",
      author: "user",
      invocationId: "1",
      timestamp: "2026-08-06T18:03:56.718Z",
      config: {
        content: {
          role: "user",
          parts: [{ text: "what is my watch list?" }],
        },
      },
    };
    const parsedGcpUser = parseRawSessionEvent(rawGcpUserEvt, "3966466688005701632", 0);
    expect(parsedGcpUser.id).toBe("1721280943567667200");
    expect(parsedGcpUser.role).toBe("user");
    expect(parsedGcpUser.content).toBe("what is my watch list?");

    const rawGcpModelEvt = {
      name: "projects/125188993477/locations/us-central1/reasoningEngines/1295472637392191488/sessions/3966466688005701632/events/6506355547648819200",
      author: "model",
      invocationId: "1",
      timestamp: "2026-08-06T18:03:58.718Z",
      config: {
        content: {
          role: "model",
          parts: [
            {
              text: "Your current default watch-list consists of US-listed semiconductor companies: NVIDIA (NVDA), Advanced Micro Devices (AMD), Intel (INTC), Micron Technology (MU), and Broadcom (AVGO).\n\nIs there any company you would like to add, remove, or monitor specifically today?",
              thoughtSignature:
                "CpQGAY89a184R/PZ+8OUaBBZWTaMIaYTLhY2l81AhbVnwQu3NBUbOcFiTKRY...",
            },
          ],
        },
      },
    };
    const parsedGcpModel = parseRawSessionEvent(rawGcpModelEvt, "3966466688005701632", 1);
    expect(parsedGcpModel.id).toBe("6506355547648819200");
    expect(parsedGcpModel.role).toBe("assistant");
    expect(parsedGcpModel.content).toContain("NVIDIA (NVDA)");
    expect(parsedGcpModel.content).not.toContain("thoughtSignature");
  });

  it("dynamically formats agent display names cleanly without hardcoding", () => {
    expect(formatAgentDisplayName("council_member_alpha")).toBe("Council Member Alpha");
    expect(formatAgentDisplayName("reviewer_1@1")).toBe("Reviewer 1");
    expect(formatAgentDisplayName("workflow@1/financial_analyst_agent@2")).toBe(
      "Financial Analyst Agent"
    );
    expect(formatAgentDisplayName("sql_query_generator")).toBe("Sql Query Generator");
    expect(formatAgentDisplayName(undefined)).toBe("Assistant");
  });

  it("identifies root workflow outputs generically from nodeInfo graph metadata", () => {
    const intermediateNode = {
      nodeInfo: {
        path: "llm_council_workflow@1/council_member_alpha@1",
        outputFor: ["llm_council_workflow@1/council_member_alpha@1"],
      },
    };
    expect(isRootWorkflowOutput(intermediateNode)).toBe(false);

    const rootOutputNode = {
      nodeInfo: {
        path: "llm_council_workflow@1/chairman_agent@1",
        outputFor: ["llm_council_workflow@1/chairman_agent@1", "llm_council_workflow@1"],
      },
    };
    expect(isRootWorkflowOutput(rootOutputNode)).toBe(true);
  });

  it("groups multi-agent session events into single assistant turn with structured sub-agent reasoning", () => {
    const rawMultiAgentEvents = [
      {
        name: "events/0",
        author: "user",
        content: { role: "user", parts: [{ text: "What is agentic AI?" }] },
      },
      {
        name: "events/1",
        author: "llm_council_workflow",
        rawEvent: {
          nodeInfo: {
            path: "llm_council_workflow@1/init_state_node@1",
            outputFor: ["llm_council_workflow@1/init_state_node@1"],
          },
        },
      },
      {
        name: "events/2",
        author: "council_member_alpha",
        content: {
          role: "model",
          parts: [{ text: "Alpha: Agentic AI enables autonomous action." }],
        },
        rawEvent: {
          nodeInfo: {
            path: "llm_council_workflow@1/council_member_alpha@1",
            outputFor: ["llm_council_workflow@1/council_member_alpha@1"],
          },
        },
      },
      {
        name: "events/3",
        author: "council_member_beta",
        content: {
          role: "model",
          parts: [{ text: "Beta: Agentic AI involves tool-calling loops." }],
        },
        rawEvent: {
          nodeInfo: {
            path: "llm_council_workflow@1/council_member_beta@1",
            outputFor: ["llm_council_workflow@1/council_member_beta@1"],
          },
        },
      },
      {
        name: "events/4",
        author: "reviewer_1",
        content: {
          role: "model",
          parts: [
            { text: "Reviewer 1: Both Alpha and Beta provide accurate perspectives." },
          ],
        },
        rawEvent: {
          nodeInfo: {
            path: "llm_council_workflow@1/reviewer_1@1",
            outputFor: ["llm_council_workflow@1/reviewer_1@1"],
          },
        },
      },
      {
        name: "events/5",
        author: "chairman_agent",
        content: {
          role: "model",
          parts: [
            { text: "Council Synthesis: Agentic AI combines autonomy and tool loops." },
          ],
        },
        rawEvent: {
          nodeInfo: {
            path: "llm_council_workflow@1/chairman_agent@1",
            outputFor: [
              "llm_council_workflow@1/chairman_agent@1",
              "llm_council_workflow@1",
            ],
          },
        },
      },
    ];

    const grouped = groupTurnSessionEvents(rawMultiAgentEvents, "session-test");

    // 6 raw events collapse into exactly 1 user event + 1 assistant event
    expect(grouped.length).toBe(2);
    expect(grouped[0].role).toBe("user");
    expect(grouped[0].content).toBe("What is agentic AI?");

    const assistantMsg = grouped[1];
    expect(assistantMsg.role).toBe("assistant");
    expect(assistantMsg.author).toBe("chairman_agent");
    expect(assistantMsg.content).toBe(
      "Council Synthesis: Agentic AI combines autonomy and tool loops."
    );

    // Thought contains structured sub-agent blocks
    expect(assistantMsg.thought).toBeDefined();
    expect(assistantMsg.thought).toContain(":::subagent[Council Member Alpha]");
    expect(assistantMsg.thought).toContain(
      "Alpha: Agentic AI enables autonomous action."
    );
    expect(assistantMsg.thought).toContain(":::subagent[Council Member Beta]");
    expect(assistantMsg.thought).toContain(":::subagent[Reviewer 1]");

    // SubAgents structured list
    expect(assistantMsg.subAgents).toBeDefined();
    expect(assistantMsg.subAgents?.length).toBe(3);
    expect(assistantMsg.subAgents?.[0].displayName).toBe("Council Member Alpha");
    expect(assistantMsg.subAgents?.[1].displayName).toBe("Council Member Beta");
    expect(assistantMsg.subAgents?.[2].displayName).toBe("Reviewer 1");
  });

  it("handles arbitrary agent names without nodeInfo via terminal fallback", () => {
    const rawEvents = [
      {
        name: "events/0",
        author: "user",
        content: { role: "user", parts: [{ text: "Analyze market" }] },
      },
      {
        name: "events/1",
        author: "specialist_a",
        content: { role: "model", parts: [{ text: "Specialist A market data" }] },
      },
      {
        name: "events/2",
        author: "specialist_b",
        content: { role: "model", parts: [{ text: "Specialist B risk analysis" }] },
      },
      {
        name: "events/3",
        author: "lead_orchestrator",
        content: {
          role: "model",
          parts: [{ text: "Final Comprehensive Market Report" }],
        },
      },
    ];

    const grouped = groupTurnSessionEvents(rawEvents, "session-test-fallback");
    expect(grouped.length).toBe(2);
    expect(grouped[1].content).toBe("Final Comprehensive Market Report");
    expect(grouped[1].thought).toContain(":::subagent[Specialist A]");
    expect(grouped[1].thought).toContain(":::subagent[Specialist B]");
  });

  it("streams council subagents and Chairman final response into unified thread parts", async () => {
    const { createGeminiChatAdapter } = await import("@/lib/adapters/chat-adapter");

    const councilStreamChunks = [
      // 1. Council member Alpha called
      'data: {"event_type":"agent_call","agent_call":{"agent":"alpha","displayName":"Council Member Alpha","input":{"topic":"history of AI"}}}\n\n',
      // 2. Council member Alpha response chunk 1
      'data: {"event_type":"agent_response","agent_response":{"agent":"alpha","displayName":"Council Member Alpha","response":"Part 1: 1950s Dartmouth "},"partial":true}\n\n',
      // 3. Council member Alpha response chunk 2
      'data: {"event_type":"agent_response","agent_response":{"agent":"alpha","displayName":"Council Member Alpha","response":"and early symbolic AI."},"partial":false}\n\n',
      // 4. Council member Beta called
      'data: {"event_type":"agent_call","agent_call":{"agent":"beta","displayName":"Council Member Beta","input":{"topic":"modern era"}}}\n\n',
      // 5. Council member Beta response chunk 1
      'data: {"event_type":"agent_response","agent_response":{"agent":"beta","displayName":"Council Member Beta","response":"Part 2: 2012 AlexNet & Deep Learning."},"partial":false}\n\n',
      // 6. Chairman final synthesis (main content)
      'data: {"event_type":"content","content":"# Complete 45-min AI Video Structure\\n\\n1. 1950-1970: Birth of AI\\n2. 2012-Present: Deep Learning","partial":false}\n\n',
      "data: [DONE]\n\n",
    ];

    const encoder = new TextEncoder();
    const mockStream = new ReadableStream({
      start(controller) {
        for (const c of councilStreamChunks) {
          controller.enqueue(encoder.encode(c));
        }
        controller.close();
      },
    });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      body: mockStream,
    } as unknown as Response);

    const adapter = createGeminiChatAdapter();
    const yieldedResults = [];

    const runResult = adapter.run({
      messages: [
        {
          id: "msg-1",
          role: "user",
          content: [{ type: "text", text: "Create video structure on AI history" }],
          createdAt: new Date(),
          attachments: [],
          metadata: { custom: {} },
        },
      ],
      abortSignal: new AbortController().signal,
    } as unknown as Parameters<typeof adapter.run>[0]) as AsyncGenerator<
      { content?: readonly { type: string; [k: string]: unknown }[] },
      void,
      unknown
    >;

    for await (const result of runResult) {
      yieldedResults.push(result);
    }

    expect(yieldedResults.length).toBeGreaterThan(0);
    const lastResult = yieldedResults[yieldedResults.length - 1];

    const reasoningPart = lastResult.content?.find(
      (p: { type: string }) => p.type === "reasoning"
    ) as { text: string } | undefined;
    const textPart = lastResult.content?.find(
      (p: { type: string }) => p.type === "text"
    ) as { text: string } | undefined;

    // Main content has Chairman's video structure
    expect(textPart).toBeDefined();
    expect(textPart?.text).toContain("# Complete 45-min AI Video Structure");

    // Reasoning has exactly ONE block for Alpha and ONE block for Beta
    expect(reasoningPart).toBeDefined();
    const reasoningText = reasoningPart?.text || "";
    const alphaMatches = reasoningText.match(/:::subagent\[Council Member Alpha\]/g);
    const betaMatches = reasoningText.match(/:::subagent\[Council Member Beta\]/g);
    expect(alphaMatches?.length).toBe(1);
    expect(betaMatches?.length).toBe(1);

    // Alpha block contains the full concatenated response text from both chunks
    expect(reasoningText).toContain("Part 1: 1950s Dartmouth and early symbolic AI.");
    expect(reasoningText).toContain("Part 2: 2012 AlexNet & Deep Learning.");
  });

  describe("provider.submitFeedback", () => {
    it("submits feedback in mock mode and returns AgentFeedbackResponse", async () => {
      const client = createAgentRuntimeProvider();
      const res = await client.submitFeedback(
        {
          sessionId: "session-123",
          eventId: "evt-456",
          feedbackType: "THUMBS_UP",
          feedbackText: "Great output",
          feedbackLabels: ["accurate"],
        },
        "test-user"
      );

      expect(res).toBeDefined();
      expect(res.feedbackType).toBe("THUMBS_UP");
      expect(res.name).toContain("feedbackEntries");
      expect(res.createTime).toBeDefined();
    });

    it("submits feedback to GCP Vertex AI Reasoning Engine endpoint", async () => {
      process.env.MOCK_AGENT_RUNTIME = "false";
      process.env.GOOGLE_CLOUD_PROJECT = "my-gcp-project";
      process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
      process.env.GOOGLE_REASONING_ENGINE_ID = "engine-888";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          name: "projects/my-gcp-project/locations/us-central1/reasoningEngines/engine-888/feedbackEntries/fb-001",
          createTime: "2026-08-07T14:30:00Z",
          feedbackType: "THUMBS_DOWN",
        }),
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        mockFetch as unknown as typeof fetch
      );

      const client = createAgentRuntimeProvider();
      vi.spyOn(VertexAiContext.prototype, "getAccessToken").mockResolvedValue(
        "mock-access-token"
      );

      const res = await client.submitFeedback(
        {
          sessionId:
            "projects/my-gcp-project/locations/us-central1/reasoningEngines/engine-888/sessions/sess-1",
          eventId: "evt-2",
          feedbackType: "THUMBS_DOWN",
          feedbackText: "Too brief",
        },
        "user-1"
      );

      expect(res.feedbackType).toBe("THUMBS_DOWN");
      expect(res.name).toBe(
        "projects/my-gcp-project/locations/us-central1/reasoningEngines/engine-888/feedbackEntries/fb-001"
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://us-central1-aiplatform.googleapis.com/v1beta1/projects/my-gcp-project/locations/us-central1/reasoningEngines/engine-888/feedbackEntries"
      );
      expect(opts.headers.Authorization).toBe("Bearer mock-access-token");
      const parsedBody = JSON.parse(opts.body);
      expect(parsedBody.sessionId).toBe("sess-1");
      expect(parsedBody.eventId).toBe("evt-2");
      expect(parsedBody.feedbackType).toBe("THUMBS_DOWN");
      expect(parsedBody.userId).toBe("user-1");
      expect(parsedBody.source).toBe("Agent Runtime UI");
      expect(parsedBody.feedbackText).toBe("Too brief");
      expect(parsedBody.config).toBeUndefined();
    });

    it("resolves numerical event IDs to OpenTelemetry UUIDs from session events", async () => {
      process.env.MOCK_AGENT_RUNTIME = "false";
      process.env.GOOGLE_CLOUD_PROJECT = "my-gcp-project";
      process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
      process.env.GOOGLE_REASONING_ENGINE_ID = "engine-888";

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/events")) {
          return {
            ok: true,
            json: async () => ({
              sessionEvents: [
                {
                  name: "projects/my-gcp-project/locations/us-central1/reasoningEngines/engine-888/sessions/sess-100/events/5194088076300779520",
                  rawEvent: {
                    id: "3319ac19-7ca8-4990-9e79-b38e1ec785f6",
                    content: { parts: [{ text: "Analysis" }] },
                  },
                },
              ],
            }),
          };
        }
        return {
          ok: true,
          json: async () => ({
            name: "projects/my-gcp-project/locations/us-central1/reasoningEngines/engine-888/feedbackEntries/fb-002",
            createTime: "2026-08-09T10:00:00Z",
            feedbackType: "THUMBS_UP",
          }),
        };
      });

      vi.spyOn(globalThis, "fetch").mockImplementation(
        mockFetch as unknown as typeof fetch
      );

      const client = createAgentRuntimeProvider();
      await client.submitFeedback(
        {
          sessionId: "sess-100",
          eventId: "5194088076300779520",
          feedbackType: "THUMBS_UP",
        },
        "user-1"
      );

      const postCall = mockFetch.mock.calls.find((c) =>
        c[0].includes("/feedbackEntries")
      );
      expect(postCall).toBeDefined();
      const body = JSON.parse(postCall![1].body);
      expect(body.sessionId).toBe("sess-100");
      expect(body.eventId).toBe("3319ac19-7ca8-4990-9e79-b38e1ec785f6");
    });
  });

  describe("provider multimodal streamQuery", () => {
    it("forwards file_data parts in input payload to Vertex AI Reasoning Engine", async () => {
      process.env.MOCK_AGENT_RUNTIME = "false";
      process.env.GOOGLE_CLOUD_PROJECT = "test-project";
      process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
      process.env.GOOGLE_REASONING_ENGINE_ID = "multimodal-engine";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"text":"Multimodal analysis complete."}\n\ndata: [DONE]\n\n'
              )
            );
            controller.close();
          },
        }),
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        mockFetch as unknown as typeof fetch
      );

      const client = createAgentRuntimeProvider();
      vi.spyOn(VertexAiContext.prototype, "getAccessToken").mockResolvedValue(
        "mock-token"
      );

      const events = [];
      for await (const event of client.streamQuery(
        {
          messages: [
            {
              role: "user",
              content: "Analyze this image",
              parts: [
                { text: "Analyze this image" },
                {
                  file_data: {
                    file_uri: "gs://bucket/users/u1/photo.png",
                    mime_type: "image/png",
                  },
                },
              ],
            },
          ],
        },
        "u1"
      )) {
        events.push(event);
      }

      expect(events.length).toBeGreaterThan(0);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain(":streamQuery");
      const body = JSON.parse(opts.body);
      expect(body.class_method).toBe("async_stream_query");
      expect(body.input.message).toEqual({
        role: "user",
        parts: [
          { text: "Analyze this image" },
          {
            file_data: {
              file_uri: "gs://bucket/users/u1/photo.png",
              mime_type: "image/png",
            },
          },
        ],
      });
      expect(body.input.run_config).toEqual({ streaming_mode: "sse" });
      expect(body.input.message.parts).toHaveLength(2);
      expect(body.input.message.parts[0]).toEqual({ text: "Analyze this image" });
      expect(body.input.message.parts[1]).toEqual({
        file_data: {
          file_uri: "gs://bucket/users/u1/photo.png",
          mime_type: "image/png",
        },
      });
    });

    it("passes custom run_config and streaming_mode when specified in ChatRequestBody", async () => {
      process.env.MOCK_AGENT_RUNTIME = "false";
      process.env.GOOGLE_CLOUD_PROJECT = "test-project";
      process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
      process.env.GOOGLE_REASONING_ENGINE_ID = "multimodal-engine";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('data: {"text":"Done"}\n\ndata: [DONE]\n\n')
            );
            controller.close();
          },
        }),
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        mockFetch as unknown as typeof fetch
      );

      const client = createAgentRuntimeProvider();
      vi.spyOn(VertexAiContext.prototype, "getAccessToken").mockResolvedValue(
        "mock-token"
      );

      const events = [];
      for await (const event of client.streamQuery(
        {
          messages: [{ role: "user", content: "Test query" }],
          runConfig: {
            streaming_mode: "sse",
            max_llm_calls: 100,
            support_cfc: true,
          },
        },
        "u1"
      )) {
        events.push(event);
      }

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, opts] = mockFetch.mock.calls[0];
      const parsedBody = JSON.parse(opts.body);
      expect(parsedBody.input.run_config).toEqual({
        streaming_mode: "sse",
        max_llm_calls: 100,
        support_cfc: true,
      });
    });

    it("streams mock multimodal evaluation response in mock mode", async () => {
      process.env.MOCK_AGENT_RUNTIME = "true";
      const client = createAgentRuntimeProvider();

      const events = [];
      for await (const event of client.streamQuery(
        {
          messages: [
            {
              role: "user",
              content: "Review chart",
              parts: [
                { text: "Review chart" },
                {
                  file_data: {
                    file_uri: "gs://mock-bucket/users/u1/chart.png",
                    mime_type: "image/png",
                  },
                },
              ],
            },
          ],
        },
        "u1"
      )) {
        events.push(event);
      }

      const thoughtEvent = events.find(
        (e) => e.event_type === "thought" && e.thought?.includes("multimodal GCS")
      );
      expect(thoughtEvent).toBeDefined();

      const contentEvents = events.filter((e) => e.event_type === "content");
      const fullText = contentEvents.map((e) => e.content).join("");
      expect(fullText).toContain("multimodal attachment");
      expect(fullText).toContain("gs://mock-bucket/users/u1/chart.png");
    });
  });

  describe("Multi-Agent Backend Discovery & Scoping", () => {
    it("discovers available reasoning engines in mock mode", async () => {
      const client = createAgentRuntimeProvider();
      const result = await client.listAgents();

      expect(result).toBeDefined();
      expect(Array.isArray(result.agents)).toBe(true);
      expect(result.agents.length).toBe(4);
      expect(result.agents.some((a) => a.id === "mock-arch-advisor")).toBe(true);
      expect(result.agents.some((a) => a.id === "mock-code-reviewer")).toBe(true);
      expect(result.agents.some((a) => a.id === "mock-cloud-ops")).toBe(true);
      expect(result.agents.some((a) => a.id === "mock-generic-agent")).toBe(true);
      expect(result.activeAgentId).toBe("mock-arch-advisor");
    });

    it("filters sessions strictly by reasoningEngineId in mock mode", async () => {
      const client = createAgentRuntimeProvider();
      const archSessions = await client.listSessions(
        "test-user",
        undefined,
        "mock-arch-advisor"
      );
      const codeSessions = await client.listSessions(
        "test-user",
        undefined,
        "mock-code-reviewer"
      );
      const opsSessions = await client.listSessions(
        "test-user",
        undefined,
        "mock-cloud-ops"
      );

      expect(archSessions.length).toBeGreaterThanOrEqual(2);
      expect(
        archSessions.every(
          (s) => s.name.includes("mock-arch-advisor") || s.name.includes("mock-engine")
        )
      ).toBe(true);

      expect(codeSessions.length).toBeGreaterThanOrEqual(1);
      expect(codeSessions.every((s) => s.name.includes("mock-code-reviewer"))).toBe(true);

      expect(opsSessions.length).toBeGreaterThanOrEqual(1);
      expect(opsSessions.every((s) => s.name.includes("mock-cloud-ops"))).toBe(true);
    });

    it("creates session scoped to the selected reasoningEngineId in mock mode", async () => {
      const client = createAgentRuntimeProvider();
      const newSession = await client.createSession(
        "test-user",
        "Security Audit #99",
        "mock-code-reviewer"
      );

      expect(newSession).toBeDefined();
      expect(newSession.name).toContain("mock-code-reviewer");
      expect(newSession.title).toBe("Security Audit #99");

      const codeSessions = await client.listSessions(
        "test-user",
        undefined,
        "mock-code-reviewer"
      );
      expect(codeSessions.some((s) => s.id === newSession.id)).toBe(true);
    });
  });

  describe("Vertex AI Memory Bank Scope-based Retrieval", () => {
    it("fetches memories via POST :retrieve scope endpoint and normalizes Vertex AI resource format", async () => {
      const { VertexAiReasoningEngineProvider } =
        await import("@/lib/agent-runtime/client");

      const provider = new VertexAiReasoningEngineProvider(
        "projects/test-proj/locations/us-central1/reasoningEngines/industry-watch",
        "us-central1",
        () => Promise.resolve("mock-token")
      );

      let requestedUrl = "";
      let requestedBody: Record<string, unknown> = {};

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        requestedUrl = url;
        requestedBody = JSON.parse((init?.body as string) || "{}");

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              retrievedMemories: [
                {
                  memory: {
                    name: "projects/test-proj/locations/us-central1/reasoningEngines/industry-watch/memories/mem-12345",
                    fact: "Focuses on enterprise semiconductor market trends",
                    scope: {
                      user_id: "107197175468507396372",
                    },
                    topics: {
                      managedMemoryTopic: "USER_PREFERENCES",
                    },
                    createTime: "2026-08-10T12:00:00Z",
                    updateTime: "2026-08-10T12:00:00Z",
                  },
                  distance: 0.15,
                },
              ],
            }),
        });
      }) as unknown as typeof fetch;

      const memories = await provider.listMemories("107197175468507396372");

      expect(requestedUrl).toContain("/memories:retrieve");
      expect(requestedBody).toEqual({
        scope: {
          user_id: "107197175468507396372",
        },
      });

      expect(memories.length).toBe(1);
      expect(memories[0].id).toBe("mem-12345");
      expect(memories[0].userId).toBe("107197175468507396372");
      expect(memories[0].fact).toBe("Focuses on enterprise semiconductor market trends");
      expect(memories[0].topic).toBe("user_preferences");
      expect(memories[0].confidenceScore).toBeCloseTo(0.85);
    });

    it("sends valid Memory protobuf payload on PATCH updateMemory with updateMask and without unknown fields", async () => {
      const { VertexAiReasoningEngineProvider } =
        await import("@/lib/agent-runtime/client");

      const provider = new VertexAiReasoningEngineProvider(
        "projects/test-proj/locations/us-central1/reasoningEngines/industry-watch",
        "us-central1",
        () => Promise.resolve("mock-token")
      );

      let requestedUrl = "";
      let requestedMethod = "";
      let requestedBody: Record<string, unknown> = {};

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        requestedUrl = url;
        requestedMethod = init?.method || "GET";
        requestedBody = JSON.parse((init?.body as string) || "{}");

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              name: "projects/test-proj/locations/us-central1/reasoningEngines/industry-watch/memories/mem-12345",
              fact: "Prefers concise weekly summaries of semiconductor market",
              scope: {
                user_id: "107197175468507396372",
              },
              topics: {
                managedMemoryTopic: "USER_PREFERENCES",
              },
              createTime: "2026-08-10T12:00:00Z",
              updateTime: "2026-08-10T12:30:00Z",
            }),
        });
      }) as unknown as typeof fetch;

      const updated = await provider.updateMemory(
        "107197175468507396372",
        "mem-12345",
        "Prefers concise weekly summaries of semiconductor market",
        "user_preferences"
      );

      expect(requestedMethod).toBe("PATCH");
      expect(requestedUrl).toContain("updateMask=fact%2Ctopics");
      // Must NOT contain unknown fields userId, user_id, topic
      expect(requestedBody).not.toHaveProperty("userId");
      expect(requestedBody).not.toHaveProperty("user_id");
      expect(requestedBody).not.toHaveProperty("topic");
      // Must contain fact and topics
      expect(requestedBody).toHaveProperty("fact");
      expect(requestedBody).toHaveProperty("topics");
      expect(requestedBody.topics).toEqual({
        managed_memory_topic: "USER_PREFERENCES",
      });

      expect(updated.id).toBe("mem-12345");
      expect(updated.fact).toBe(
        "Prefers concise weekly summaries of semiconductor market"
      );
      expect(updated.topic).toBe("user_preferences");
    });

    it("sends valid scalar managed_memory_topic payload on POST createMemory", async () => {
      const { VertexAiReasoningEngineProvider } =
        await import("@/lib/agent-runtime/client");

      const provider = new VertexAiReasoningEngineProvider(
        "projects/test-proj/locations/us-central1/reasoningEngines/industry-watch",
        "us-central1",
        () => Promise.resolve("mock-token")
      );

      let requestedUrl = "";
      let requestedMethod = "";
      let requestedBody: Record<string, unknown> = {};

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        requestedUrl = url;
        requestedMethod = init?.method || "GET";
        requestedBody = JSON.parse((init?.body as string) || "{}");

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              name: "projects/test-proj/locations/us-central1/reasoningEngines/industry-watch/memories/mem-67890",
              fact: "Always uses strict TypeScript",
              scope: {
                user_id: "107197175468507396372",
              },
              topics: {
                managedMemoryTopic: "EXPLICIT_INSTRUCTIONS",
              },
              createTime: "2026-08-13T20:00:00Z",
              updateTime: "2026-08-13T20:00:00Z",
            }),
        });
      }) as unknown as typeof fetch;

      const created = await provider.createMemory(
        "107197175468507396372",
        "Always uses strict TypeScript",
        "explicit_instructions"
      );

      expect(requestedMethod).toBe("POST");
      expect(requestedUrl).toContain("/memories");
      expect(requestedBody).toEqual({
        fact: "Always uses strict TypeScript",
        scope: { user_id: "107197175468507396372", app_name: "app" },
        topics: {
          managed_memory_topic: "EXPLICIT_INSTRUCTIONS",
        },
      });

      expect(created.id).toBe("mem-67890");
      expect(created.topic).toBe("explicit_instructions");
    });

    it("sends custom_memory_topic_label payload on POST createMemory for custom topics", async () => {
      const { VertexAiReasoningEngineProvider } =
        await import("@/lib/agent-runtime/client");

      const provider = new VertexAiReasoningEngineProvider(
        "projects/test-proj/locations/us-central1/reasoningEngines/industry-watch",
        "us-central1",
        () => Promise.resolve("mock-token")
      );

      let requestedBody: Record<string, unknown> = {};

      global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        requestedBody = JSON.parse((init?.body as string) || "{}");

        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              name: "projects/test-proj/locations/us-central1/reasoningEngines/industry-watch/memories/mem-99999",
              fact: "Prefers dark mode UI",
              scope: {
                user_id: "107197175468507396372",
                app_name: "app",
              },
              topics: {
                customMemoryTopicLabel: "ui_preferences",
              },
              createTime: "2026-08-13T20:00:00Z",
              updateTime: "2026-08-13T20:00:00Z",
            }),
        });
      }) as unknown as typeof fetch;

      const created = await provider.createMemory(
        "107197175468507396372",
        "Prefers dark mode UI",
        "ui_preferences"
      );

      expect(requestedBody).toEqual({
        fact: "Prefers dark mode UI",
        scope: { user_id: "107197175468507396372", app_name: "app" },
        topics: {
          custom_memory_topic_label: "ui_preferences",
        },
      });

      expect(created.id).toBe("mem-99999");
      expect(created.topic).toBe("ui_preferences");
    });
  });

  describe("Stream Telemetry & Message Info Propagation", () => {
    it("packs message info telemetry into metadata.custom via createYieldContent", () => {
      const result = createYieldContent({
        reasoning: "Reasoning thought",
        text: "Final response text",
        eventId: "evt-123",
        messageInfo: {
          invocationId: "e-inv-456",
          modelVersion: "gemini-2.5-pro",
          usageMetadata: {
            prompt_token_count: 1500,
            candidates_token_count: 500,
            thoughts_token_count: 150,
            total_token_count: 2150,
          },
          avgLogprobs: -0.198,
          nodePath: "root_agent@1",
          thoughtSignature: "Sig-XYZ-789",
          finishReason: "STOP",
        },
      });

      const custom = result.metadata?.custom as Record<string, unknown>;
      expect(custom).toBeDefined();
      expect(custom.eventId).toBe("evt-123");
      expect(custom.invocationId).toBe("e-inv-456");
      expect(custom.modelVersion).toBe("gemini-2.5-pro");
      expect((custom.usageMetadata as Record<string, unknown>).total_token_count).toBe(
        2150
      );
      expect(custom.avgLogprobs).toBe(-0.198);
      expect(custom.nodePath).toBe("root_agent@1");
      expect(custom.thoughtSignature).toBe("Sig-XYZ-789");
      expect(custom.finishReason).toBe("STOP");
    });
  });

  describe("provider.getSessionState & updateSessionState", () => {
    it("retrieves session state in mock mode", async () => {
      const client = createAgentRuntimeProvider();
      const state = await client.getSessionState("1");

      expect(state).toBeDefined();
      expect(state.target_cluster).toBe("prod-europe-west1");
      expect(state.deployment_status).toBe("active");
      expect(Array.isArray(state.active_services)).toBe(true);
    });

    it("updates session state in mock mode with merge and replace options", async () => {
      const client = createAgentRuntimeProvider();
      const session = await client.createSession("test-user", "State Test Session");

      // Seed initial state
      await client.updateSessionState(
        session.id,
        { target_cluster: "prod-europe-west1", deployment_status: "active" },
        "replace"
      );

      // Test merge
      const merged = await client.updateSessionState(
        session.id,
        { environment: "staging", temp_flag: true },
        "merge"
      );
      expect(merged.environment).toBe("staging");
      expect(merged.target_cluster).toBe("prod-europe-west1");
      expect(merged.temp_flag).toBe(true);

      // Verify persistence in getSessionState
      const fetched = await client.getSessionState(session.id);
      expect(fetched.environment).toBe("staging");

      // Test replace
      const replaced = await client.updateSessionState(
        session.id,
        { fresh_key: "single_val" },
        "replace"
      );
      expect(replaced).toEqual({ fresh_key: "single_val" });
      expect(replaced.target_cluster).toBeUndefined();
    });
  });
});
