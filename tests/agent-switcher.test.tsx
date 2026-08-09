import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AgentHeaderSelector } from "@/components/agent-switcher/agent-header-selector";
import { AgentProvider } from "@/lib/agent-context";
import type { DeployedAgent } from "@/types/agent";

const mockAgents: DeployedAgent[] = [
  {
    id: "mock-arch-advisor",
    resourceName:
      "projects/mock-project/locations/us-central1/reasoningEngines/mock-arch-advisor",
    displayName: "ADK Architecture Advisor",
    description: "Specialized in cloud architecture patterns and security",
    location: "us-central1",
    model: "gemini-2.5-pro",
    isDefault: true,
  },
  {
    id: "mock-code-reviewer",
    resourceName:
      "projects/mock-project/locations/europe-west4/reasoningEngines/mock-code-reviewer",
    displayName: "Code Reviewer & Auditor",
    description: "Automated code review and security audits",
    location: "europe-west4",
    model: "gemini-2.5-flash",
    isDefault: false,
  },
  {
    id: "mock-cloud-ops",
    resourceName:
      "projects/mock-project/locations/us-central1/reasoningEngines/mock-cloud-ops",
    displayName: "Cloud Ops Assistant",
    description: "Infrastructure monitoring and log analysis",
    location: "us-central1",
    model: "gemini-2.5-flash",
    isDefault: false,
  },
];

describe("AgentHeaderSelector Component", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders active agent display name and region badge in header trigger", () => {
    render(
      <AgentProvider initialAgents={mockAgents}>
        <AgentHeaderSelector />
      </AgentProvider>
    );

    expect(screen.getByRole("button", { name: /select active agent/i })).toBeDefined();
    expect(screen.getByText("ADK Architecture Advisor")).toBeDefined();
    expect(screen.getByText("us-central1")).toBeDefined();
  });

  it("opens dropdown and displays all available deployed agents with descriptions", async () => {
    render(
      <AgentProvider initialAgents={mockAgents}>
        <AgentHeaderSelector />
      </AgentProvider>
    );

    const trigger = screen.getByRole("button", { name: /select active agent/i });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("Deployed Agents")).toBeDefined();
      expect(screen.getByText("Code Reviewer & Auditor")).toBeDefined();
      expect(screen.getByText("Cloud Ops Assistant")).toBeDefined();
      expect(screen.getByText("Automated code review and security audits")).toBeDefined();
    });
  });

  it("selects another agent and invokes onAgentChange callback", async () => {
    const onAgentChange = vi.fn();

    render(
      <AgentProvider initialAgents={mockAgents}>
        <AgentHeaderSelector onAgentChange={onAgentChange} />
      </AgentProvider>
    );

    const trigger = screen.getByRole("button", { name: /select active agent/i });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
    fireEvent.click(trigger);

    await waitFor(() => {
      expect(screen.getByText("Code Reviewer & Auditor")).toBeDefined();
    });

    const codeReviewerOption = screen.getByText("Code Reviewer & Auditor");
    fireEvent.click(codeReviewerOption);

    expect(onAgentChange).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "mock-code-reviewer",
        displayName: "Code Reviewer & Auditor",
      })
    );

    // Header updates to show new agent
    expect(screen.getByText("Code Reviewer & Auditor")).toBeDefined();
  });
});
