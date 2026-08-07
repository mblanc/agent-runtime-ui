import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgentRuntimeClient,
  parseRawSessionEvent,
  formatAgentDisplayName,
  isRootWorkflowOutput,
  groupTurnSessionEvents,
} from "@/lib/agent-runtime-client";
import { appendToolResultToReasoning } from "@/lib/gemini-runtime-adapter";

describe("AgentRuntimeClient", () => {
  it("appends tool results inside running tool blocks and converts status to complete", () => {
    const initialReasoning =
      'Analyzing query...\n\n:::tool[fetch_public_claims]{status="running"}\n**Arguments:**\n```json\n{\n  "ticker": "INTC"\n}\n```\n:::';
    const resultJson = JSON.stringify({ status: "success", count: 5 });

    const updated = appendToolResultToReasoning(
      initialReasoning,
      "fetch_public_claims",
      resultJson
    );

    expect(updated).toContain(':::tool[fetch_public_claims]{status="complete"}');
    expect(updated).toContain(
      '**Result:**\n```json\n{"status":"success","count":5}\n```'
    );
    expect(updated.endsWith(":::")).toBe(true);
    expect(updated).not.toContain('status="running"');
  });
  beforeEach(() => {
    process.env.MOCK_AGENT_RUNTIME = "true";
  });

  it("initializes in mock mode when credentials are not configured", () => {
    const client = new AgentRuntimeClient();
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

      const client = new AgentRuntimeClient();
      // Access normalized resource
      const resource = (
        client as unknown as { getNormalizedEngineResource: () => string }
      ).getNormalizedEngineResource();
      const sessionsUrl = (
        client as unknown as { getSessionsBaseUrl: () => string }
      ).getSessionsBaseUrl();

      expect(resource).toBe(
        "projects/custom-project-123/locations/us-east1/reasoningEngines/custom-engine-456"
      );
      expect(sessionsUrl).toContain("https://us-east1-aiplatform.googleapis.com");
      expect(sessionsUrl).toContain("/locations/us-east1/");
    } finally {
      process.env.GOOGLE_REASONING_ENGINE_ID = originalEngine;
      process.env.GOOGLE_CLOUD_LOCATION = originalLocation;
      process.env.GOOGLE_CLOUD_PROJECT = originalProject;
    }
  });

  it("lists sessions for the user in mock mode", async () => {
    const client = new AgentRuntimeClient();
    const sessions = await client.listSessions("test-user");

    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessions[0]).toHaveProperty("id");
    expect(sessions[0]).toHaveProperty("title");
    expect(sessions[0]).toHaveProperty("createTime");
  });

  it("creates a new session in mock mode", async () => {
    const client = new AgentRuntimeClient();
    const newSession = await client.createSession("test-user", "Custom Thread Test");

    expect(newSession).toBeDefined();
    expect(newSession.title).toBe("Custom Thread Test");
    expect(newSession.userId).toBe("test-user");

    const fetched = await client.getSession(newSession.id);
    expect(fetched).toBeDefined();
    expect(fetched?.title).toBe("Custom Thread Test");
  });

  it("retrieves session events history in mock mode", async () => {
    const client = new AgentRuntimeClient();
    const events = await client.listSessionEvents("1");

    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(events[0].role).toBe("user");
    expect(events[1].role).toBe("assistant");
  });

  it("deletes a session in mock mode", async () => {
    const client = new AgentRuntimeClient();
    const created = await client.createSession("test-user", "To be deleted");
    expect(await client.getSession(created.id)).toBeDefined();

    await client.deleteSession(created.id);
    const afterDelete = await client.getSession(created.id);
    expect(afterDelete).toBeNull();
  });

  it("yields streaming events in mock mode and records to session history", async () => {
    const client = new AgentRuntimeClient();
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
    const client = new AgentRuntimeClient();
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

  it("updates running subagent block with appendAgentResponseToReasoning in adapter", async () => {
    const { appendAgentResponseToReasoning } =
      await import("@/lib/gemini-runtime-adapter");

    const initialReasoning =
      'Analyzing workflow...\n\n:::subagent[Financial Analyst]{status="running" agent="financial_analyst"}\n**Task Input:**\nAnalyze Q3 revenue\n:::';

    const updated = appendAgentResponseToReasoning(
      initialReasoning,
      "financial_analyst",
      "Q3 revenue increased by 14% YoY driven by data center AI chips.",
      "Financial Analyst"
    );

    expect(updated).toContain(
      ':::subagent[Financial Analyst]{status="complete" agent="financial_analyst"}'
    );
    expect(updated).toContain("**Task Input:**\nAnalyze Q3 revenue");
    expect(updated).toContain(
      "**Response:**\nQ3 revenue increased by 14% YoY driven by data center AI chips."
    );
    expect(updated).not.toContain('status="running"');
  });

  describe("AgentRuntimeClient.submitFeedback", () => {
    it("submits feedback in mock mode and returns AgentFeedbackResponse", async () => {
      const client = new AgentRuntimeClient();
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

      const client = new AgentRuntimeClient();
      vi.spyOn(
        client as unknown as { getAccessToken: () => Promise<string> },
        "getAccessToken"
      ).mockResolvedValue("mock-access-token");

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
      expect(parsedBody.session_id).toBe("sess-1");
      expect(parsedBody.event_id).toBe("evt-2");
      expect(parsedBody.feedback_type).toBe("THUMBS_DOWN");
    });
  });
});
