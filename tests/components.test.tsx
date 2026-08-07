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

import { SubAgentCollapsible } from "@/components/assistant-ui/subagent-collapsible";
import { ToolCollapsible } from "@/components/assistant-ui/tool-collapsible";

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
    render(<Button variant="gemini">Ask Agent</Button>);
    const button = screen.getByRole("button", { name: /ask agent/i });
    expect(button).toBeDefined();
    expect(button.textContent).toBe("Ask Agent");
  });

  it("renders GeminiThinkingIndicator with status text and timer", () => {
    render(<GeminiThinkingIndicator statusText="Consulting agent..." />);
    expect(screen.getByText("Consulting agent...")).toBeDefined();
  });

  it("renders ReasoningRoot and expands with animated dots during streaming", () => {
    render(
      <ReasoningRoot streaming={true}>
        <ReasoningTrigger active={true} />
        <ReasoningContent aria-busy={true}>
          <ReasoningText>Detailed Agent Deliberation Trace</ReasoningText>
        </ReasoningContent>
      </ReasoningRoot>
    );

    expect(screen.getByText("Agent is working...")).toBeDefined();
    expect(screen.getByText("Detailed Agent Deliberation Trace")).toBeDefined();

    const trigger = screen.getByRole("button", { name: /thinking/i });
    fireEvent.click(trigger);
    expect(screen.queryByText("Detailed Agent Deliberation Trace")).toBeNull();
  });

  it("renders SubAgentCollapsible with disclosure triangle toggle and badges", () => {
    render(
      <SubAgentCollapsible
        displayName="Council Member Alpha"
        agentName="council_member_alpha"
        role="Council Member"
        status="complete"
      >
        <div>Alpha individual analysis opinion</div>
      </SubAgentCollapsible>
    );

    expect(screen.getByText("Council Member Alpha")).toBeDefined();
    expect(screen.getByText("Council Member")).toBeDefined();
    expect(screen.getByText("Completed")).toBeDefined();

    // Body is collapsed by default
    expect(screen.queryByText("Alpha individual analysis opinion")).toBeNull();

    // Click disclosure trigger to expand
    const trigger = screen.getByRole("button", { name: /council member alpha/i });
    fireEvent.click(trigger);
    expect(screen.getByText("Alpha individual analysis opinion")).toBeDefined();

    // Click disclosure trigger to collapse
    fireEvent.click(trigger);
    expect(screen.queryByText("Alpha individual analysis opinion")).toBeNull();
  });

  it("renders ReasoningText and parses structured subagent and tool tags into interactive components", () => {
    const rawReasoning = `Workflow starting...

:::subagent[Council Member Beta]{id="evt-3" agent="council_member_beta" status="complete"}
Beta opinion on agentic systems
:::

:::tool[search_documents]{status="complete"}
**Result:** Found 3 relevant papers
:::

Synthesis completed.`;

    render(
      <ReasoningRoot defaultOpen={true}>
        <ReasoningContent>
          <ReasoningText>{rawReasoning}</ReasoningText>
        </ReasoningContent>
      </ReasoningRoot>
    );

    expect(screen.getByText("Workflow starting...")).toBeDefined();
    expect(screen.getByText("Council Member Beta")).toBeDefined();
    expect(screen.getByText("search_documents")).toBeDefined();
    expect(screen.getByText("Synthesis completed.")).toBeDefined();

    // Expand subagent card
    const agentTrigger = screen.getByRole("button", { name: /council member beta/i });
    fireEvent.click(agentTrigger);
    expect(screen.getByText("Beta opinion on agentic systems")).toBeDefined();
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

  it("renders GeminiMessageTiming badge on completed message", () => {
    render(
      <TestWrapper>
        <GeminiMessageTiming
          durationSeconds={1.9}
          tokensPerSecond={52}
          engineName="Vertex AI"
        />
      </TestWrapper>
    );
    expect(screen.getByText("1.9s")).toBeDefined();
    expect(screen.getByText("52 tok/s")).toBeDefined();
    expect(screen.getByText("Vertex AI")).toBeDefined();
  });

  it("calculates default timing and engine on completed message", () => {
    render(
      <TestWrapper>
        <GeminiMessageTiming />
      </TestWrapper>
    );
    expect(screen.getByText(/Vertex AI Reasoning Engine/i)).toBeDefined();
    expect(screen.getByText(/tok\/s/i)).toBeDefined();
  });

  it("renders ToolCollapsible with arguments and results and toggles disclosure triangle", () => {
    render(
      <ToolCollapsible
        toolName="fetch_public_claims"
        args={{ ticker_or_company: "INTC", limit: 5 }}
        result={{ claims: ["Patent approval", "Q3 Revenue"] }}
        status="complete"
      />
    );

    expect(screen.getByText("fetch_public_claims")).toBeDefined();
    expect(screen.getByText("Executed")).toBeDefined();

    // Default closed
    expect(screen.queryByText(/Patent approval/)).toBeNull();

    // Expand
    const trigger = screen.getByRole("button", { name: /fetch_public_claims/i });
    fireEvent.click(trigger);

    expect(screen.getByText(/INTC/)).toBeDefined();
    expect(screen.getByText(/Patent approval/)).toBeDefined();

    // Collapse
    fireEvent.click(trigger);
    expect(screen.queryByText(/Patent approval/)).toBeNull();
  });

  it("renders multiple sequential tool calls during execution without raw markdown syntax", () => {
    const rawStreamingTools = `:::tool[fetch_public_claims]{status="running"}
**Arguments:**
\`\`\`json
{
  "ticker_or_company": "INTC",
  "limit": 5
}
\`\`\`
:::

:::tool[fetch_public_claims]{status="running"}
**Arguments:**
\`\`\`json
{
  "ticker_or_company": "MU",
  "limit": 5
}
\`\`\`
:::`;

    const { container } = render(
      <ReasoningRoot defaultOpen={true}>
        <ReasoningContent>
          <ReasoningText text={rawStreamingTools} />
        </ReasoningContent>
      </ReasoningRoot>
    );

    // Raw markdown tag should NOT be visible
    expect(container.textContent).not.toContain(":::tool");
    expect(container.textContent).not.toContain(":::subagent");

    // Both tool cards should be rendered
    const toolButtons = screen.getAllByRole("button", {
      name: /fetch_public_claims/i,
    });
    expect(toolButtons.length).toBe(2);

    // Running indicators should be present
    const runningBadges = screen.getAllByText("Running");
    expect(runningBadges.length).toBe(2);

    // Both tools are collapsed by default with disclosure triangles
    expect(screen.queryByText(/INTC/)).toBeNull();
    expect(screen.queryByText(/MU/)).toBeNull();

    // Click first tool disclosure triangle to expand
    fireEvent.click(toolButtons[0]);
    expect(screen.getByText(/INTC/)).toBeDefined();

    // Click second tool disclosure triangle to expand
    fireEvent.click(toolButtons[1]);
    expect(screen.getByText(/MU/)).toBeDefined();

    // Click first tool to collapse
    fireEvent.click(toolButtons[0]);
    expect(screen.queryByText(/INTC/)).toBeNull();
  });

  it("automatically converts legacy [Tool Executed] session history traces into ToolCollapsible disclosure cards", () => {
    const legacySessionText = `Starting deliberation...

[Tool Executed]: fetch_public_claims (limit: 5, ticker_or_company: INTC)

[Tool Completed]: fetch_public_claims

[Tool Executed]: fetch_public_claims (limit: 5, ticker_or_company: MU)

[Tool Completed]: fetch_public_claims

All evidence collected.`;

    const { container } = render(
      <ReasoningRoot defaultOpen={true}>
        <ReasoningContent>
          <ReasoningText text={legacySessionText} />
        </ReasoningContent>
      </ReasoningRoot>
    );

    // Legacy plaintext markers should NOT be rendered literally
    expect(container.textContent).not.toContain("[Tool Executed]");
    expect(container.textContent).not.toContain("[Tool Completed]");

    // Collapsible tool cards should exist
    const toolButtons = screen.getAllByRole("button", {
      name: /fetch_public_claims/i,
    });
    expect(toolButtons.length).toBe(2);

    // Expand first tool card
    fireEvent.click(toolButtons[0]);
    expect(screen.getByText(/INTC/)).toBeDefined();
  });
});
