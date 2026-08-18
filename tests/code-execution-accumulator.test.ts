import { describe, it, expect } from "vitest";
import { StreamAccumulator } from "@/lib/adapters/stream-accumulator";

describe("StreamAccumulator with Code Execution", () => {
  it("accumulates executable_code and pairs with code_execution_result", () => {
    const acc = new StreamAccumulator();

    // 1. Send executable_code
    const outcome1 = acc.handle({
      event_type: "executable_code",
      executable_code: {
        language: "PYTHON",
        code: "import numpy as np\nprint(np.sum([1, 2, 3]))",
      },
    });
    expect(outcome1).toBe("yield");

    let snap = acc.snapshot();
    let customMeta = snap.metadata?.custom as Record<string, unknown>;
    expect(customMeta.codeExecutionBlocks).toBeDefined();
    let blocks = customMeta.codeExecutionBlocks as Array<Record<string, unknown>>;
    expect(blocks.length).toBe(1);
    expect(blocks[0].code).toContain("np.sum");
    expect(blocks[0].status).toBe("running");

    // 2. Send code_execution_result
    const outcome2 = acc.handle({
      event_type: "code_execution_result",
      code_execution_result: {
        outcome: "OUTCOME_OK",
        output: "6\n",
        durationMs: 45,
      },
    });
    expect(outcome2).toBe("yield");

    snap = acc.snapshot();
    customMeta = snap.metadata?.custom as Record<string, unknown>;
    blocks = customMeta.codeExecutionBlocks as Array<Record<string, unknown>>;
    expect(blocks.length).toBe(1);
    expect(blocks[0].status).toBe("complete");
    expect(blocks[0].result).toEqual({
      outcome: "OUTCOME_OK",
      output: "6\n",
      durationMs: 45,
      generatedImages: [],
    });
  });

  it("handles failed execution outcome and extracts generated base64 plots", () => {
    const acc = new StreamAccumulator();
    const plotData =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    acc.handle({
      event_type: "executable_code",
      executable_code: {
        language: "PYTHON",
        code: "plt.plot([1, 2], [3, 4])",
      },
    });

    acc.handle({
      event_type: "code_execution_result",
      code_execution_result: {
        outcome: "OUTCOME_FAILED",
        output: `Traceback:\nNameError: name 'plt' is not defined\n${plotData}`,
      },
    });

    const snap = acc.snapshot();
    const customMeta = snap.metadata?.custom as Record<string, unknown>;
    const blocks = customMeta.codeExecutionBlocks as Array<Record<string, unknown>>;
    expect(blocks[0].status).toBe("error");
    expect((blocks[0].result as Record<string, unknown>).generatedImages).toEqual([
      plotData,
    ]);
  });

  it("handles OUTCOME_DEADLINE_EXCEEDED as an error status", () => {
    const acc = new StreamAccumulator();

    acc.handle({
      event_type: "executable_code",
      executable_code: {
        language: "PYTHON",
        code: "while True: pass",
      },
    });

    acc.handle({
      event_type: "code_execution_result",
      code_execution_result: {
        outcome: "OUTCOME_DEADLINE_EXCEEDED",
        output: "Execution timed out after 30000ms\n",
      },
    });

    const snap = acc.snapshot();
    const customMeta = snap.metadata?.custom as Record<string, unknown>;
    const blocks = customMeta.codeExecutionBlocks as Array<Record<string, unknown>>;
    expect(blocks[0].status).toBe("error");
    expect((blocks[0].result as Record<string, unknown>).outcome).toBe(
      "OUTCOME_DEADLINE_EXCEEDED"
    );
  });

  it("transitions running block without result to error when stream receives done event", () => {
    const acc = new StreamAccumulator();

    acc.handle({
      event_type: "executable_code",
      executable_code: {
        language: "PYTHON",
        code: "print('unfinished')",
      },
    });

    // Stream closes with done
    acc.handle({
      event_type: "done",
    });

    const snap = acc.snapshot();
    const customMeta = snap.metadata?.custom as Record<string, unknown>;
    const blocks = customMeta.codeExecutionBlocks as Array<Record<string, unknown>>;
    expect(blocks[0].status).toBe("error");
  });
});
