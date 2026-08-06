import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Button } from "@/components/ui/button";
import { GeminiThinkingIndicator } from "@/components/assistant-ui/gemini-thinking-indicator";
import { GeminiReasoningAccordion } from "@/components/assistant-ui/gemini-reasoning";
import { GeminiMessageTiming } from "@/components/assistant-ui/gemini-message-timing";

describe("UI Components", () => {
  it("renders Gemini button variant correctly", () => {
    render(<Button variant="gemini">Ask Council</Button>);
    const button = screen.getByRole("button", { name: /ask council/i });
    expect(button).toBeDefined();
    expect(button.textContent).toBe("Ask Council");
  });

  it("renders GeminiThinkingIndicator with status text and timer", () => {
    render(<GeminiThinkingIndicator statusText="Consulting Council members..." />);
    expect(screen.getByText("Consulting Council members...")).toBeDefined();
  });

  it("renders GeminiReasoningAccordion and toggles expansion", () => {
    render(
      <GeminiReasoningAccordion
        thoughtText="Detailed reasoning trace for LLM Council deliberation"
        durationSeconds={3.2}
        stepsCount={3}
        isStreaming={true}
      />
    );

    expect(screen.getByText("Agent is working...")).toBeDefined();
    expect(
      screen.getByText("Detailed reasoning trace for LLM Council deliberation")
    ).toBeDefined();

    const toggleButton = screen.getByRole("button", { name: /thinking/i });
    expect(toggleButton).toBeDefined();

    // Toggle close
    fireEvent.click(toggleButton);
    expect(
      screen.queryByText("Detailed reasoning trace for LLM Council deliberation")
    ).toBeNull();
  });

  it("renders GeminiMessageTiming badge", () => {
    render(
      <GeminiMessageTiming
        durationSeconds={1.9}
        tokensPerSecond={52}
        engineName="Vertex AI"
      />
    );
    expect(screen.getByText("1.9s")).toBeDefined();
    expect(screen.getByText("52 tok/s")).toBeDefined();
    expect(screen.getByText("Vertex AI")).toBeDefined();
  });
});
