import { describe, it, expect } from "vitest";
import { parseSseStream } from "@/lib/agent-runtime/sse-parser";
import { parseRawSessionEvent } from "@/lib/agent-runtime/parse-event";
import { formatSessionEventsToThreadMessages } from "@/lib/agent-runtime/to-thread-messages";

describe("SSE Stream Parser with Code Execution", () => {
  function createStreamFromLines(lines: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream({
      start(controller) {
        for (const line of lines) {
          controller.enqueue(encoder.encode(line + "\n"));
        }
        controller.close();
      },
    });
  }

  it("yields executable_code and code_execution_result events from parts", async () => {
    const sseLines = [
      `data: ${JSON.stringify({
        content: {
          parts: [
            {
              executable_code: {
                language: "PYTHON",
                code: "print('Hello from Vertex')",
              },
            },
            {
              code_execution_result: {
                outcome: "OUTCOME_OK",
                output: "Hello from Vertex\n",
              },
            },
          ],
        },
      })}`,
      "data: [DONE]",
    ];

    const stream = createStreamFromLines(sseLines);
    const events = [];
    for await (const event of parseSseStream(stream)) {
      events.push(event);
    }

    expect(events.length).toBe(3); // executable_code, code_execution_result, done
    expect(events[0].event_type).toBe("executable_code");
    expect(events[0].executable_code?.language).toBe("PYTHON");
    expect(events[0].executable_code?.code).toBe("print('Hello from Vertex')");

    expect(events[1].event_type).toBe("code_execution_result");
    expect(events[1].code_execution_result?.outcome).toBe("OUTCOME_OK");
    expect(events[1].code_execution_result?.output).toBe("Hello from Vertex\n");
  });

  it("yields executable_code and code_execution_result from top-level event fields", async () => {
    const sseLines = [
      `data: ${JSON.stringify({
        executable_code: {
          language: "PYTHON",
          code: "import math\nprint(math.sqrt(16))",
        },
      })}`,
      `data: ${JSON.stringify({
        code_execution_result: {
          outcome: "OUTCOME_OK",
          output: "4.0\n",
          durationMs: 120,
        },
      })}`,
      "data: [DONE]",
    ];

    const stream = createStreamFromLines(sseLines);
    const events = [];
    for await (const event of parseSseStream(stream)) {
      events.push(event);
    }

    expect(events.length).toBe(3);
    expect(events[0].event_type).toBe("executable_code");
    expect(events[0].executable_code?.code).toContain("sqrt(16)");
    expect(events[1].event_type).toBe("code_execution_result");
    expect(events[1].code_execution_result?.durationMs).toBe(120);
  });
});

describe("Session History Parser with Code Execution", () => {
  it("normalizes historical code execution parts into codeExecutionBlocks", () => {
    const rawHistoryEvent = {
      id: "event-123",
      role: "model",
      content: {
        parts: [
          {
            executable_code: {
              language: "PYTHON",
              code: "print(2 + 2)",
            },
          },
          {
            code_execution_result: {
              outcome: "OUTCOME_OK",
              output: "4\n",
            },
          },
        ],
      },
    };

    const sessionEvent = parseRawSessionEvent(rawHistoryEvent, "sess-1", 0);
    expect(sessionEvent.codeExecutionBlocks).toBeDefined();
    expect(sessionEvent.codeExecutionBlocks?.length).toBe(1);
    expect(sessionEvent.codeExecutionBlocks?.[0].code).toBe("print(2 + 2)");
    expect(sessionEvent.codeExecutionBlocks?.[0].result?.output).toBe("4\n");
    expect(sessionEvent.codeExecutionBlocks?.[0].status).toBe("complete");

    // Format to thread message
    const threadMessages = formatSessionEventsToThreadMessages([sessionEvent]);
    expect(threadMessages.length).toBe(1);
    expect(threadMessages[0].codeExecutionBlocks).toBeDefined();
    expect(threadMessages[0].codeExecutionBlocks?.length).toBe(1);
    expect(threadMessages[0].metadata?.custom?.codeExecutionBlocks).toBeDefined();
  });

  it("pairs separate executable_code and code_execution_result events across turn history", async () => {
    const { groupTurnSessionEvents } = await import("@/lib/agent-runtime/group-turns");

    const rawUserEvent = {
      id: "evt-user",
      role: "user",
      content: { text: "Calculate math" },
    };

    // Event 1: Emits only executable_code
    const rawAssistantEvent1 = {
      id: "evt-model-1",
      role: "model",
      content: {
        parts: [
          {
            executable_code: {
              language: "PYTHON",
              code: "print(10 * 10)",
            },
          },
        ],
      },
    };

    // Event 2: Emits only code_execution_result
    const rawAssistantEvent2 = {
      id: "evt-model-2",
      role: "model",
      content: {
        parts: [
          {
            code_execution_result: {
              outcome: "OUTCOME_OK",
              output: "100\n",
              durationMs: 40,
            },
          },
          {
            text: "The calculated product is 100.",
          },
        ],
      },
    };

    const grouped = groupTurnSessionEvents(
      [rawUserEvent, rawAssistantEvent1, rawAssistantEvent2],
      "sess-multi"
    );

    expect(grouped.length).toBe(2); // user turn, assistant turn
    const assistantTurn = grouped[1];
    expect(assistantTurn.codeExecutionBlocks).toBeDefined();
    expect(assistantTurn.codeExecutionBlocks?.length).toBe(1);
    expect(assistantTurn.codeExecutionBlocks?.[0].code).toBe("print(10 * 10)");
    expect(assistantTurn.codeExecutionBlocks?.[0].result?.output).toBe("100\n");
    expect(assistantTurn.codeExecutionBlocks?.[0].status).toBe("complete");
  });
});
