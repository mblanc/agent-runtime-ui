import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CodeEditorPanel } from "@/components/code-execution/code-editor-panel";
import { ConsoleOutputPanel } from "@/components/code-execution/console-output-panel";
import { PlotViewerPanel } from "@/components/code-execution/plot-viewer-panel";
import { CodeExecutionCard } from "@/components/code-execution/code-execution-card";
import type { AgentCodeExecutionBlock } from "@/types/agent";

describe("CodeEditorPanel", () => {
  it("renders python code and language header", () => {
    render(<CodeEditorPanel code="import math\nprint(math.pi)" language="python" />);
    expect(screen.getAllByText(/python/i).length).toBeGreaterThan(0);
    expect(screen.getByText("Copy")).toBeDefined();
  });
});

describe("ConsoleOutputPanel", () => {
  it("renders stdout and duration", () => {
    render(
      <ConsoleOutputPanel
        stdout="Calculated sum: 42"
        outcome="OUTCOME_OK"
        durationMs={85}
      />
    );
    expect(screen.getByText("Console Output")).toBeDefined();
    expect(screen.getByText("85ms")).toBeDefined();
    expect(screen.getByText("Calculated sum: 42")).toBeDefined();
  });

  it("renders error outcome badge", () => {
    render(
      <ConsoleOutputPanel
        stdout="ZeroDivisionError: division by zero"
        outcome="OUTCOME_FAILED"
      />
    );
    expect(screen.getByText("Error")).toBeDefined();
    expect(screen.getByText(/ZeroDivisionError/)).toBeDefined();
  });
});

describe("PlotViewerPanel", () => {
  it("renders empty state when no images are given", () => {
    render(<PlotViewerPanel images={[]} />);
    expect(
      screen.getByText("No plots or visual outputs generated for this execution.")
    ).toBeDefined();
  });

  it("renders plot images and opens lightbox on click", () => {
    const dummyImage =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    render(<PlotViewerPanel images={[dummyImage]} />);

    expect(screen.getByText("Generated Plots (1)")).toBeDefined();
    const img = screen.getByAltText("Generated Plot 1");
    expect(img).toBeDefined();

    // Click to open lightbox
    fireEvent.click(img);
    expect(screen.getByAltText("Full size plot preview")).toBeDefined();

    // Press Escape to close lightbox
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByAltText("Full size plot preview")).toBeNull();
  });

  it("filters out unsafe image URIs (e.g. javascript: schemes)", () => {
    const unsafeUri = "javascript:alert(1)";
    render(<PlotViewerPanel images={[unsafeUri]} />);
    expect(
      screen.getByText("No plots or visual outputs generated for this execution.")
    ).toBeDefined();
  });
});

describe("CodeExecutionCard", () => {
  it("renders complete card with tabs and switches between Code and Output", () => {
    const block: AgentCodeExecutionBlock = {
      id: "block-1",
      language: "PYTHON",
      code: "print('Hello world')",
      status: "complete",
      result: {
        outcome: "OUTCOME_OK",
        output: "Hello world\n",
        durationMs: 30,
        generatedImages: [],
      },
    };

    render(<CodeExecutionCard block={block} defaultOpen={true} />);

    expect(screen.getByText("Python Sandbox Execution")).toBeDefined();
    expect(screen.getByText("30ms")).toBeDefined();

    // Tab buttons
    const codeTab = screen.getByRole("button", { name: /^Code$/i });
    const outputTab = screen.getByRole("button", { name: /^Output$/i });
    expect(codeTab).toBeDefined();
    expect(outputTab).toBeDefined();

    // Click Output tab
    fireEvent.click(outputTab);
    expect(screen.getByText("Hello world")).toBeDefined();
  });

  it("renders plot tab when generatedImages exist and defaults to plots", () => {
    const dummyImage =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const block: AgentCodeExecutionBlock = {
      id: "block-2",
      language: "PYTHON",
      code: "plt.plot([1, 2], [3, 4])",
      status: "complete",
      result: {
        outcome: "OUTCOME_OK",
        output: "Plot created\n",
        durationMs: 120,
        generatedImages: [dummyImage],
      },
    };

    render(<CodeExecutionCard block={block} defaultOpen={true} />);
    expect(screen.getByText("Plot (1)")).toBeDefined();
    expect(screen.getByAltText("Generated Plot 1")).toBeDefined();
  });

  it("dynamically shows plots when block updates during streaming", () => {
    const dummyImage =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const runningBlock: AgentCodeExecutionBlock = {
      id: "block-stream",
      language: "PYTHON",
      code: "plt.plot([1, 2])",
      status: "running",
    };

    const { rerender } = render(
      <CodeExecutionCard block={runningBlock} defaultOpen={true} />
    );
    expect(screen.getByText("Running Python Sandbox...")).toBeDefined();

    // When result with images arrives
    const completedBlock: AgentCodeExecutionBlock = {
      ...runningBlock,
      status: "complete",
      result: {
        outcome: "OUTCOME_OK",
        output: "Plot done\n",
        generatedImages: [dummyImage],
      },
    };

    rerender(<CodeExecutionCard block={completedBlock} defaultOpen={true} />);
    expect(screen.getByText("Plot (1)")).toBeDefined();
    expect(screen.getByAltText("Generated Plot 1")).toBeDefined();
  });

  it("is closed by default and opens on header toggle click", () => {
    const block: AgentCodeExecutionBlock = {
      id: "block-closed",
      language: "PYTHON",
      code: "print('Closed by default')",
      status: "complete",
      result: {
        outcome: "OUTCOME_OK",
        output: "Closed by default\n",
        durationMs: 20,
      },
    };

    render(<CodeExecutionCard block={block} />);
    expect(screen.getByText("Python Sandbox Execution")).toBeDefined();
    // Body is closed by default, so code text is not visible initially
    expect(screen.queryByText("Closed by default")).toBeNull();

    // Click header toggle button to open
    const toggleButton = screen.getByRole("button", {
      name: /Python Sandbox Execution/i,
    });
    fireEvent.click(toggleButton);

    // Now body is rendered
    expect(screen.getByText("Copy")).toBeDefined();
  });

  it("renders running state with spinner", () => {
    const block: AgentCodeExecutionBlock = {
      id: "block-3",
      language: "PYTHON",
      code: "time.sleep(5)",
      status: "running",
    };

    render(<CodeExecutionCard block={block} />);
    expect(screen.getByText("Running Python Sandbox...")).toBeDefined();
  });
});

describe("ReasoningText with Code Execution", () => {
  it("renders code execution inside the thinking process trace", async () => {
    const { ReasoningText } = await import("@/components/assistant-ui/reasoning");

    const block: AgentCodeExecutionBlock = {
      id: "block-in-trace",
      language: "PYTHON",
      code: "import math\nmath.sqrt(16)",
      status: "complete",
      result: {
        outcome: "OUTCOME_OK",
        output: "4.0\n",
        durationMs: 15,
      },
    };

    render(
      <ReasoningText
        defaultOpen={true}
        trace={[
          { type: "thought", text: "Planning computation" },
          { type: "code_execution", block },
        ]}
      />
    );

    expect(screen.getByText("Planning computation")).toBeDefined();
    expect(screen.getByText("Python Sandbox Execution")).toBeDefined();
  });
});
