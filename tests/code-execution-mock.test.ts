import { describe, it, expect, beforeEach, vi } from "vitest";
import { MockAgentRuntimeProvider } from "@/lib/agent-runtime/mock/mock-provider";
import {
  mockSessionsStore,
  mockSessionEventsStore,
} from "@/lib/agent-runtime/mock/mock-store";

describe("MockAgentRuntimeProvider Code Execution", () => {
  let provider: MockAgentRuntimeProvider;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockSessionsStore.clear();
    mockSessionEventsStore.clear();
    provider = new MockAgentRuntimeProvider("europe-west1", "mock-agent");
  });

  it("emits executable_code and code_execution_result for calculation prompt", async () => {
    const generator = provider.streamQuery(
      {
        messages: [{ role: "user", content: "calculate fibonacci sequence in python" }],
      },
      "user-1"
    );

    const events = [];
    for await (const event of generator) {
      events.push(event);
    }

    const execCodeEvent = events.find((e) => e.event_type === "executable_code");
    expect(execCodeEvent).toBeDefined();
    expect(execCodeEvent?.executable_code?.language).toBe("PYTHON");
    expect(execCodeEvent?.executable_code?.code).toContain("calculate_fibonacci");

    const codeResultEvent = events.find((e) => e.event_type === "code_execution_result");
    expect(codeResultEvent).toBeDefined();
    expect(codeResultEvent?.code_execution_result?.outcome).toBe("OUTCOME_OK");
    expect(codeResultEvent?.code_execution_result?.output).toContain(
      "Fibonacci Sequence"
    );
  });

  it("emits plot image base64 data for plot prompt", async () => {
    const generator = provider.streamQuery(
      {
        messages: [{ role: "user", content: "plot a sine wave chart" }],
      },
      "user-1"
    );

    const events = [];
    for await (const event of generator) {
      events.push(event);
    }

    const codeResultEvent = events.find((e) => e.event_type === "code_execution_result");
    expect(codeResultEvent).toBeDefined();
    expect(codeResultEvent?.code_execution_result?.generatedImages?.length).toBe(1);
    expect(codeResultEvent?.code_execution_result?.generatedImages?.[0]).toContain(
      "data:image/png;base64"
    );
  });

  it("persists code execution blocks into session history", async () => {
    const session = await provider.createSession("user-1", "Code Session");

    const generator = provider.streamQuery(
      {
        sessionId: session.id,
        messages: [{ role: "user", content: "calculate python math" }],
      },
      "user-1"
    );

    for await (const chunk of generator) {
      void chunk;
    }

    const sessionEvents = await provider.listSessionEvents(session.id);
    const assistantEvt = sessionEvents.find(
      (e) => e.role === "assistant" || e.role === "model"
    );
    expect(assistantEvt).toBeDefined();
    expect(assistantEvt?.codeExecutionBlocks).toBeDefined();
    expect(assistantEvt?.codeExecutionBlocks?.length).toBe(1);
    expect(assistantEvt?.codeExecutionBlocks?.[0].language).toBe("PYTHON");
  });
});
