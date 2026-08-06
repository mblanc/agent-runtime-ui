import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { GeminiThinkingIndicator } from "@/components/assistant-ui/gemini-thinking-indicator";
import {
  ReasoningRoot,
  ReasoningTrigger,
  ReasoningContent,
  ReasoningText,
} from "@/components/assistant-ui/reasoning";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import {
  ToolGroupRoot,
  ToolGroupTrigger,
  ToolGroupContent,
} from "@/components/assistant-ui/tool-group";
import { SyntaxHighlighter } from "@/components/assistant-ui/shiki-highlighter";
import { GeminiMessageTiming } from "@/components/assistant-ui/gemini-message-timing";

function TestWrapper({ children }: { children: React.ReactNode }) {
  const runtime = useLocalRuntime({
    async *run() {
      yield { content: [{ type: "text", text: "ok" }] };
    },
  });
  return (
    <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>
  );
}

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

  it("renders ReasoningRoot and expands with animated dots during streaming", () => {
    render(
      <ReasoningRoot streaming={true}>
        <ReasoningTrigger active={true} />
        <ReasoningContent aria-busy={true}>
          <ReasoningText>Detailed Council Deliberation Trace</ReasoningText>
        </ReasoningContent>
      </ReasoningRoot>
    );

    expect(screen.getByText("Agent is working...")).toBeDefined();
    expect(screen.getByText("Detailed Council Deliberation Trace")).toBeDefined();

    const trigger = screen.getByRole("button", { name: /thinking/i });
    fireEvent.click(trigger);
    expect(screen.queryByText("Detailed Council Deliberation Trace")).toBeNull();
  });

  it("renders ToolFallback with arguments and result inspection", () => {
    render(
      <ToolFallback
        toolName="fetch_company_disclosures"
        args={{ ticker: "NVDA", limit: 5 }}
        result={{ status: "200 OK", count: 5 }}
        status={{ type: "complete" }}
      />
    );

    expect(screen.getByText("fetch_company_disclosures")).toBeDefined();
    expect(screen.getByText("Executed")).toBeDefined();

    const trigger = screen.getByRole("button", { name: /fetch_company_disclosures/i });
    fireEvent.click(trigger);

    expect(screen.getByText(/NVDA/)).toBeDefined();
    expect(screen.getByText(/200 OK/)).toBeDefined();
  });

  it("renders ToolGroup with multiple tool counts", () => {
    render(
      <ToolGroupRoot defaultOpen={true}>
        <ToolGroupTrigger count={3} active={false} />
        <ToolGroupContent>
          <ToolFallback toolName="tool_1" />
          <ToolFallback toolName="tool_2" />
          <ToolFallback toolName="tool_3" />
        </ToolGroupContent>
      </ToolGroupRoot>
    );

    expect(screen.getByText("Executed 3 tools")).toBeDefined();
    expect(screen.getByText("tool_1")).toBeDefined();
    expect(screen.getByText("tool_2")).toBeDefined();
    expect(screen.getByText("tool_3")).toBeDefined();
  });

  it("renders SyntaxHighlighter code container", () => {
    render(
      <TestWrapper>
        <SyntaxHighlighter
          code="const greet = () => 'Hello Gemini';"
          language="typescript"
        />
      </TestWrapper>
    );

    expect(screen.getByTestId("shiki-container")).toBeDefined();
    expect(screen.getByText(/typescript/i)).toBeDefined();
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
