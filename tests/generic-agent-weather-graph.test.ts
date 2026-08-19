import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockAgentRuntimeProvider } from "@/lib/agent-runtime/mock/mock-provider";
import {
  mockSessionsStore,
  mockSessionEventsStore,
  mockArtifactsStore,
} from "@/lib/agent-runtime/mock/mock-store";
import {
  groupTurnSessionEvents,
  formatSessionEventsToThreadMessages,
  extractArtifactsFromSessionEvent,
} from "@/lib/agent-runtime/event-normalizer";
import { formatRemoteMessagesToThreadMessages } from "@/lib/session-adapter";
import type { AgentSessionEvent } from "@/types/agent";

describe("Generic Agent - Weather & Graph E2E Scenario", () => {
  let provider: MockAgentRuntimeProvider;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockSessionsStore.clear();
    mockSessionEventsStore.clear();
    mockArtifactsStore.clear();
    provider = new MockAgentRuntimeProvider("3817127788905758720", "us-central1");
  });

  it("executes weather lookup and Python plotting, creates an artifact, and renders final answer as content (not a thought)", async () => {
    const prompt =
      "look a the weather in the nex days in Marseille and execute some code to generate a graph of it";

    const session = await provider.createSession(
      "test-user",
      "Marseille Weather & Graph",
      "3817127788905758720"
    );

    const stream = provider.streamQuery(
      {
        sessionId: session.id,
        reasoningEngineId: "3817127788905758720",
        messages: [{ role: "user", content: prompt }],
      },
      "test-user"
    );

    const events = [];
    for await (const evt of stream) {
      events.push(evt);
    }

    // 1. Verify thought event is present
    const thoughtEvt = events.find(
      (e) =>
        e.event_type === "thought" &&
        e.thought?.includes("weather forecast for Marseille")
    );
    expect(thoughtEvt).toBeDefined();

    // 2. Verify executable code event
    const execCodeEvt = events.find((e) => e.event_type === "executable_code");
    expect(execCodeEvt).toBeDefined();
    expect(execCodeEvt?.executable_code?.language).toBe("PYTHON");
    expect(execCodeEvt?.executable_code?.code).toContain("matplotlib");
    expect(execCodeEvt?.executable_code?.code).toContain("Marseille");

    // 3. Verify code execution result with plot image
    const codeResEvt = events.find((e) => e.event_type === "code_execution_result");
    expect(codeResEvt).toBeDefined();
    expect(codeResEvt?.code_execution_result?.outcome).toBe("OUTCOME_OK");
    expect(codeResEvt?.code_execution_result?.generatedImages?.length).toBeGreaterThan(0);

    // 4. Verify artifact creation event
    const artifactEvt = events.find((e) => e.event_type === "artifact_created");
    expect(artifactEvt).toBeDefined();
    expect(artifactEvt?.artifact?.mimeType).toBe("image/png");
    expect(artifactEvt?.artifact?.filename).toContain(".png");

    // 5. Verify final answer content chunks are user-facing content (NOT a thought)
    const contentEvts = events.filter((e) => e.event_type === "content");
    expect(contentEvts.length).toBeGreaterThan(0);
    const aggregatedContent = contentEvts.map((e) => e.content).join("");
    expect(aggregatedContent).toContain("Marseille");
    expect(aggregatedContent).toContain("forecast");
  });

  it("correctly separates thoughts, deduplicates code blocks, and retains artifacts when loading session 7547932851195346944", async () => {
    // Simulated raw Vertex AI session events matching session 7547932851195346944
    const rawEvents: AgentSessionEvent[] = [
      {
        id: "evt-user-1",
        name: "projects/svc-demo-vertex/locations/us-central1/reasoningEngines/3817127788905758720/sessions/7547932851195346944/events/1",
        sessionId: "7547932851195346944",
        role: "user",
        content:
          "look a the weather in the nex days in Marseille and execute some code to generate a graph of it",
        createTime: "2026-08-18T14:00:00Z",
      },
      // Event 1: Model thoughts + Python code to execute
      {
        id: "evt-model-1",
        name: "projects/svc-demo-vertex/locations/us-central1/reasoningEngines/3817127788905758720/sessions/7547932851195346944/events/2",
        sessionId: "7547932851195346944",
        role: "model",
        author: "model",
        content: {
          role: "model",
          parts: [
            {
              thought: true,
              text: "I need to check the weather forecast for Marseille and generate a temperature plot.",
            },
            {
              executable_code: {
                language: "PYTHON",
                code: "import matplotlib.pyplot as plt\ndays = ['Tue', 'Wed', 'Thu']\ntemps = [24, 26, 27]\nplt.plot(days, temps)\nplt.show()",
              },
            },
          ],
        } as unknown as string,
        rawEvent: {
          author: "model",
          content: {
            role: "model",
            parts: [
              {
                thought: true,
                text: "I need to check the weather forecast for Marseille and generate a temperature plot.",
              },
              {
                executable_code: {
                  language: "PYTHON",
                  code: "import matplotlib.pyplot as plt\ndays = ['Tue', 'Wed', 'Thu']\ntemps = [24, 26, 27]\nplt.plot(days, temps)\nplt.show()",
                },
              },
            ],
          },
        },
        createTime: "2026-08-18T14:00:05Z",
      },
      // Event 2: Tool execution result containing generated image
      {
        id: "evt-tool-1",
        name: "projects/svc-demo-vertex/locations/us-central1/reasoningEngines/3817127788905758720/sessions/7547932851195346944/events/3",
        sessionId: "7547932851195346944",
        role: "model",
        author: "tool",
        content: {
          role: "tool",
          parts: [
            {
              code_execution_result: {
                outcome: "OUTCOME_OK",
                output:
                  "Plot generated successfully.\ndata:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                generatedImages: [
                  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                ],
              },
            },
          ],
        } as unknown as string,
        createTime: "2026-08-18T14:00:10Z",
      },
      // Event 3: Model final answer
      {
        id: "evt-model-2",
        name: "projects/svc-demo-vertex/locations/us-central1/reasoningEngines/3817127788905758720/sessions/7547932851195346944/events/4",
        sessionId: "7547932851195346944",
        role: "model",
        author: "model",
        content: {
          role: "model",
          parts: [
            {
              text: "Here is the weather forecast for Marseille for the next days:\n- Tuesday: 24°C, Sunny\n- Wednesday: 26°C, Clear\n- Thursday: 27°C, Sunny\n\nI have generated a graph showing the temperature trends.",
            },
          ],
        } as unknown as string,
        createTime: "2026-08-18T14:00:15Z",
      },
    ];

    // 1. Test groupTurnSessionEvents
    const grouped = groupTurnSessionEvents(rawEvents, "7547932851195346944");
    expect(grouped.length).toBe(2);

    const userTurn = grouped[0];
    expect(userTurn.role).toBe("user");

    const assistantTurn = grouped[1];
    expect(assistantTurn.role).toBe("assistant");

    // Verify final answer is in content, NOT in thought
    expect(assistantTurn.content).toContain("Here is the weather forecast for Marseille");
    expect(assistantTurn.content).not.toContain("I need to check the weather");

    // Verify thoughts are in thought / reasoningTrace
    expect(assistantTurn.thought).toContain("I need to check the weather forecast");
    expect(assistantTurn.reasoningTrace).toBeDefined();

    // Verify code execution blocks are deduplicated (exactly 1 block, not 2 or 4)
    expect(assistantTurn.codeExecutionBlocks).toBeDefined();
    expect(assistantTurn.codeExecutionBlocks?.length).toBe(1);
    expect(assistantTurn.codeExecutionBlocks?.[0].code).toContain("plt.plot");
    expect(assistantTurn.codeExecutionBlocks?.[0].status).toBe("complete");
    expect(assistantTurn.codeExecutionBlocks?.[0].result?.outcome).toBe("OUTCOME_OK");

    // Verify code execution is in reasoning trace exactly once
    const codeExecTraces = assistantTurn.reasoningTrace?.filter(
      (t) => t.type === "code_execution"
    );
    expect(codeExecTraces?.length).toBe(1);

    // 2. Test formatSessionEventsToThreadMessages
    const formattedMessages = formatSessionEventsToThreadMessages(grouped);
    expect(formattedMessages.length).toBe(2);

    const assistantMsg = formattedMessages[1];
    expect(assistantMsg.role).toBe("assistant");
    expect(assistantMsg.content).toContain("Here is the weather forecast for Marseille");
    expect(assistantMsg.thought).toContain("I need to check the weather forecast");
    expect(assistantMsg.codeExecutionBlocks?.length).toBe(1);

    // Verify artifact extraction from session event
    const extractedArtifacts = extractArtifactsFromSessionEvent(rawEvents[2]);
    expect(extractedArtifacts.length).toBeGreaterThan(0);
    expect(extractedArtifacts[0].mimeType).toBe("image/png");
    expect(extractedArtifacts[0].filename).toContain(".png");

    // 3. Test remote thread message adapter formatRemoteMessagesToThreadMessages
    const remotePayload = [
      {
        id: "msg-0",
        role: "user",
        content: "look a the weather in Marseille and plot a graph",
      },
      {
        id: "msg-1",
        role: "assistant",
        content: assistantMsg.content,
        thought: assistantMsg.thought,
        reasoningTrace: assistantMsg.reasoningTrace,
        codeExecutionBlocks: assistantMsg.codeExecutionBlocks,
        artifacts: extractedArtifacts,
      },
    ];

    const threadMessages = formatRemoteMessagesToThreadMessages(remotePayload);
    expect(threadMessages.length).toBe(2);

    const assistantThreadMsg = threadMessages[1];
    expect(assistantThreadMsg.role).toBe("assistant");

    // Parts should contain text part and reasoning part
    const contentParts = (
      Array.isArray(assistantThreadMsg.content) ? assistantThreadMsg.content : []
    ) as Array<{ type: string; text?: string }>;
    const textPart = contentParts.find((p) => p.type === "text");
    expect(textPart).toBeDefined();
    expect(textPart?.text).toContain("Here is the weather forecast for Marseille");

    const reasoningPart = contentParts.find((p) => p.type === "reasoning");
    expect(reasoningPart).toBeDefined();
    expect(reasoningPart?.text).toContain("I need to check the weather forecast");

    // Custom metadata carries reasoning trace, code execution blocks, and artifacts
    const custom = assistantThreadMsg.metadata?.custom as Record<string, unknown>;
    expect(custom).toBeDefined();
    expect(Array.isArray(custom.reasoningTrace)).toBe(true);
    expect(Array.isArray(custom.codeExecutionBlocks)).toBe(true);
    expect((custom.codeExecutionBlocks as unknown[]).length).toBe(1);
    expect(Array.isArray(custom.artifacts)).toBe(true);
    expect((custom.artifacts as unknown[]).length).toBeGreaterThan(0);
  });

  it("handles session 4912130800532586496 where final answer is emitted with thought:true and code execution contains stdout base64 image", () => {
    // Exact Vertex AI Sessions payload structure where all parts carry thought: true
    const session491Events: AgentSessionEvent[] = [
      {
        id: "evt-user",
        sessionId: "4912130800532586496",
        role: "user",
        content:
          "look a the weather in the nex days in Marseille and execute some code to generate a graph of it",
        createTime: "2026-08-18T14:30:00Z",
      },
      {
        id: "evt-model-step1",
        sessionId: "4912130800532586496",
        role: "model",
        content: {
          role: "model",
          parts: [
            {
              thought: true,
              text: "Fetching weather data for Marseille and preparing Python plot...",
            },
            {
              executable_code: {
                language: "PYTHON",
                code: "import matplotlib.pyplot as plt\nplt.plot([1, 2, 3], [24, 26, 27])\nplt.show()",
              },
            },
          ],
        } as unknown as string,
        createTime: "2026-08-18T14:30:05Z",
      },
      {
        id: "evt-tool-step2",
        sessionId: "4912130800532586496",
        role: "assistant",
        content: {
          role: "tool",
          parts: [
            {
              code_execution_result: {
                outcome: "OUTCOME_OK",
                output:
                  "Saved artifacts:\noutput_2026-08-18-13-50-21-330452.png\n\n<Figure size 640x480 with 1 Axes>\ndata:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
              },
            },
          ],
        } as unknown as string,
        createTime: "2026-08-18T14:30:10Z",
      },
      {
        id: "evt-model-step3",
        sessionId: "4912130800532586496",
        role: "model",
        content: {
          role: "model",
          parts: [
            {
              text: "Here is the weather forecast for Marseille for the next days:\n- Tuesday: 24°C\n- Wednesday: 26°C\n- Thursday: 27°C\n\nThe graph has been plotted and saved.",
            },
          ],
        } as unknown as string,
        createTime: "2026-08-18T14:30:15Z",
      },
    ];

    const grouped = groupTurnSessionEvents(session491Events, "4912130800532586496");
    expect(grouped.length).toBe(2);

    const assistantTurn = grouped[1];
    expect(assistantTurn.role).toBe("assistant");

    // The final answer MUST appear in content in the main chat area
    expect(assistantTurn.content).toContain(
      "Here is the weather forecast for Marseille for the next days"
    );
    // Intermediate thought MUST stay in reasoning trace
    expect(assistantTurn.thought).toContain("Fetching weather data for Marseille");

    // Artifact MUST be extracted from Saved artifacts output
    expect(assistantTurn.artifacts).toBeDefined();
    expect(assistantTurn.artifacts?.length).toBeGreaterThan(0);
    expect(
      assistantTurn.artifacts?.some(
        (a) => a.filename === "output_2026-08-18-13-50-21-330452.png"
      )
    ).toBe(true);

    // Formatting to thread messages produces text part for main area and reasoning part for trace
    const threadMsgs = formatSessionEventsToThreadMessages(grouped);
    expect(threadMsgs.length).toBe(2);
    expect(threadMsgs[1].content).toContain("Here is the weather forecast for Marseille");

    const remoteFormatted = formatRemoteMessagesToThreadMessages(
      threadMsgs as unknown as Array<Record<string, unknown>>
    );
    expect(remoteFormatted.length).toBe(2);

    const parts = remoteFormatted[1].content as Array<{ type: string; text?: string }>;
    const textPart = parts.find((p) => p.type === "text");
    expect(textPart).toBeDefined();
    expect(textPart?.text).toContain("Here is the weather forecast for Marseille");

    const customMeta = remoteFormatted[1].metadata?.custom as Record<string, unknown>;
    expect(customMeta.artifacts).toBeDefined();
    expect((customMeta.artifacts as unknown[]).length).toBeGreaterThan(0);
  });
});
