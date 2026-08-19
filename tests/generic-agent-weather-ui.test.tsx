import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { ArtifactProvider } from "@/lib/artifacts/artifact-context";
import { ArtifactsCanvas } from "@/components/artifacts/artifacts-canvas";
import { ArtifactChip } from "@/components/artifacts/artifact-chip";
import { CodeExecutionCard } from "@/components/code-execution/code-execution-card";
import { ReasoningTraceBlocks } from "@/components/assistant-ui/reasoning";
import type { AgentArtifact, ReasoningTraceEntry } from "@/types/agent";

describe("Generic Agent Weather & Graph UI Components", () => {
  const mockArtifact: AgentArtifact = {
    id: "marseille_weather_forecast.png",
    sessionId: "7547932851195346944",
    userId: "test-user",
    filename: "marseille_weather_forecast.png",
    title: "Marseille Weather Forecast Graph",
    mimeType: "image/png",
    currentVersion: 0,
    createTime: new Date().toISOString(),
    updateTime: new Date().toISOString(),
    scope: "session",
    versions: [
      {
        version: 0,
        content:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        sizeBytes: 120,
        mimeType: "image/png",
        createTime: new Date().toISOString(),
      },
    ],
  };

  const mockTrace: ReasoningTraceEntry[] = [
    {
      type: "thought",
      text: "Looking up weather forecast for Marseille and generating graph...",
    },
    {
      type: "code_execution",
      block: {
        id: "code-7547932851195346944-1",
        language: "PYTHON",
        code: "import matplotlib.pyplot as plt\ndays = ['Tue', 'Wed', 'Thu']\ntemps = [24, 26, 27]\nplt.plot(days, temps)\nplt.show()",
        status: "complete",
        result: {
          outcome: "OUTCOME_OK",
          output: "Plot generated successfully.",
          generatedImages: [mockArtifact.versions[0].content],
        },
      },
    },
  ];

  it("renders CodeExecutionCard with Python code and output image", () => {
    const codeTrace = mockTrace[1] as Extract<
      ReasoningTraceEntry,
      { type: "code_execution" }
    >;
    render(<CodeExecutionCard block={codeTrace.block} defaultOpen={true} />);

    expect(screen.getByText("Python Sandbox Execution")).toBeDefined();
    // Default smart tab with plot images is 'Plot (1)'
    expect(screen.getByAltText("Generated Plot 1")).toBeDefined();

    // Click 'Code' tab
    fireEvent.click(screen.getByRole("button", { name: /Code/i }));
    expect(screen.getByTestId("shiki-container")).toBeDefined();

    // Click 'Output' tab
    fireEvent.click(screen.getByRole("button", { name: /Output/i }));
    expect(screen.getByText(/Plot generated successfully/)).toBeDefined();
  });

  it("renders ReasoningTraceBlocks without duplicate code cards", () => {
    render(<ReasoningTraceBlocks trace={mockTrace} defaultOpen={true} />);

    // Exactly 1 code execution card in reasoning trace
    expect(screen.getAllByText("Python Sandbox Execution").length).toBe(1);
  });

  it("renders ArtifactChip and opens ArtifactsCanvas showing image preview", () => {
    const TestComponent = () => {
      return (
        <ArtifactProvider initialArtifacts={[mockArtifact]}>
          <div className="flex">
            <div className="flex-1">
              <ArtifactChip
                artifact={{
                  filename: mockArtifact.filename,
                  title: mockArtifact.title,
                  mimeType: mockArtifact.mimeType,
                  version: 0,
                  content: mockArtifact.versions[0].content,
                  isComplete: true,
                }}
              />
            </div>
            <div className="w-96">
              <ArtifactsCanvas />
            </div>
          </div>
        </ArtifactProvider>
      );
    };

    render(<TestComponent />);

    // 1. Verify artifact chip is rendered in chat message
    const chip = screen.getByText("Marseille Weather Forecast Graph");
    expect(chip).toBeDefined();
    expect(screen.getByText("marseille_weather_forecast.png")).toBeDefined();

    // 2. Click chip to open ArtifactsCanvas
    fireEvent.click(chip);

    // 3. Verify ArtifactsCanvas is opened with the image
    expect(
      screen.getByRole("img", { name: /Marseille Weather Forecast Graph/i })
    ).toBeDefined();
    expect(screen.getByLabelText("Zoom In")).toBeDefined();
    expect(screen.getByLabelText("Download Image")).toBeDefined();
  });

  it("opens ArtifactsCanvas even when starting with empty artifacts list and artifact is ingested live", () => {
    const TestDynamicComponent = () => {
      return (
        <ArtifactProvider initialArtifacts={[]}>
          <div className="flex">
            <div className="flex-1">
              <ArtifactChip
                artifact={{
                  filename: "marseille_weather_forecast.png",
                  title: "Marseille Weather Forecast Graph",
                  mimeType: "image/png",
                  version: 0,
                  content:
                    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                  isComplete: true,
                }}
              />
            </div>
            <div className="w-96">
              <ArtifactsCanvas />
            </div>
          </div>
        </ArtifactProvider>
      );
    };

    render(<TestDynamicComponent />);

    const chip = screen.getByText("Marseille Weather Forecast Graph");
    expect(chip).toBeDefined();

    // Click chip - should ingest artifact on-the-fly and open canvas
    fireEvent.click(chip);

    expect(
      screen.getByRole("img", { name: /Marseille Weather Forecast Graph/i })
    ).toBeDefined();
  });
});
