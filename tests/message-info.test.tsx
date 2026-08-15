import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MessageInfoPopover } from "@/components/assistant-ui/message-info-popover";
import { ThoughtSignatureBadge } from "@/components/assistant-ui/thought-signature-badge";
import type { AgentMessageInfoMetadata } from "@/types/agent";

describe("Message Info & Stream Telemetry UI", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  describe("MessageInfoPopover Component", () => {
    const mockTelemetry: AgentMessageInfoMetadata = {
      id: "2a18cb74-f654-47f3-86ac-dbb6223bbf8b",
      invocationId: "e-2bb5c7b2-e5e6-4627-a57e-ee5f835a9bfa",
      modelVersion: "gemini-2.5-flash",
      usageMetadata: {
        prompt_token_count: 3002,
        candidates_token_count: 813,
        thoughts_token_count: 275,
        total_token_count: 4090,
        traffic_type: "ON_DEMAND",
      },
      avgLogprobs: -0.2091679,
      nodePath: "root_agent@1",
      finishReason: "STOP",
      actions: {
        state_delta: { current_step: 2 },
        artifact_delta: { "report.md": "# Report" },
      },
    };

    it("renders trigger button with model version and token summary", () => {
      render(<MessageInfoPopover metadata={mockTelemetry} />);

      expect(screen.getByText("gemini-2.5-flash")).toBeDefined();
      expect(screen.getByText(/4,090 tok/)).toBeDefined();
    });

    it("opens popover dialog on click and displays comprehensive execution details", () => {
      render(<MessageInfoPopover metadata={mockTelemetry} />);

      const trigger = screen.getByRole("button", {
        name: /View model execution telemetry/i,
      });
      fireEvent.click(trigger);

      expect(
        screen.getByRole("dialog", { name: /Message Execution Telemetry/i })
      ).toBeDefined();
      expect(screen.getByText("Execution & Telemetry")).toBeDefined();
      expect(screen.getByText("STOP")).toBeDefined();
      expect(screen.getByText("root_agent@1")).toBeDefined();
      expect(screen.getByText("e-2bb5c7b2-e5e6-4627-a57e-ee5f835a9bfa")).toBeDefined();
      expect(screen.getByText("3,002")).toBeDefined();
      expect(screen.getByText("813")).toBeDefined();
      expect(screen.getByText("275")).toBeDefined();
      expect(screen.getByText("ON_DEMAND")).toBeDefined();
      expect(screen.getByText("81.1%")).toBeDefined();
    });

    it("copies invocation ID to clipboard when copy button is clicked", async () => {
      render(<MessageInfoPopover metadata={mockTelemetry} />);

      const trigger = screen.getByRole("button", {
        name: /View model execution telemetry/i,
      });
      fireEvent.click(trigger);

      const copyBtn = screen.getByRole("button", { name: /Copy Invocation ID/i });
      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "e-2bb5c7b2-e5e6-4627-a57e-ee5f835a9bfa"
      );
    });

    it("copies full metadata JSON to clipboard when copy JSON is clicked", async () => {
      render(<MessageInfoPopover metadata={mockTelemetry} />);

      const trigger = screen.getByRole("button", {
        name: /View model execution telemetry/i,
      });
      fireEvent.click(trigger);

      const copyJsonBtn = screen.getByRole("button", {
        name: /Copy Metadata JSON/i,
      });
      await act(async () => {
        fireEvent.click(copyJsonBtn);
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        expect.stringContaining("gemini-2.5-flash")
      );
    });

    it("supports camelCase telemetry properties (stateDelta, artifactDelta, node_info)", () => {
      const camelCaseTelemetry = {
        model_version: "gemini-2.5-pro",
        invocation_id: "inv-camel-123",
        node_info: { path: "subagent_analyst@2" },
        actions: {
          stateDelta: { stage: "evaluation" },
          artifactDelta: { "metrics.json": "{}" },
        },
      };

      render(
        <MessageInfoPopover
          metadata={camelCaseTelemetry as unknown as AgentMessageInfoMetadata}
        />
      );

      const trigger = screen.getByRole("button", {
        name: /View model execution telemetry/i,
      });
      fireEvent.click(trigger);

      expect(screen.getAllByText("gemini-2.5-pro").length).toBeGreaterThan(0);
      expect(screen.getByText("subagent_analyst@2")).toBeDefined();
      expect(screen.getByText(/evaluation/)).toBeDefined();
      expect(screen.getByText(/metrics.json/)).toBeDefined();
    });

    it("returns null when no telemetry metadata is available", () => {
      const { container } = render(<MessageInfoPopover metadata={undefined} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("ThoughtSignatureBadge Component", () => {
    const mockSig = "CtcHAY89a1--OtSEPZgmockSignatureGemini25VerifiedCrypto==";

    it("renders verified reasoning trigger badge", () => {
      render(<ThoughtSignatureBadge signature={mockSig} />);

      expect(screen.getByText("Verified Reasoning")).toBeDefined();
    });

    it("opens verified signature popover and displays provenance info", () => {
      render(<ThoughtSignatureBadge signature={mockSig} />);

      const trigger = screen.getByRole("button", {
        name: /Verified reasoning signature details/i,
      });
      fireEvent.click(trigger);

      expect(
        screen.getByRole("dialog", { name: /Cryptographic Reasoning Signature/i })
      ).toBeDefined();
      expect(screen.getByText("Verified Reasoning Trace")).toBeDefined();
      expect(screen.getByText(/Vertex AI Cryptographic Signature/i)).toBeDefined();
    });

    it("copies thought signature to clipboard when copy button is clicked", async () => {
      render(<ThoughtSignatureBadge signature={mockSig} />);

      const trigger = screen.getByRole("button", {
        name: /Verified reasoning signature details/i,
      });
      fireEvent.click(trigger);

      const copyBtn = screen.getByRole("button", {
        name: /Copy Thought Signature/i,
      });
      await act(async () => {
        fireEvent.click(copyBtn);
      });

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(mockSig);
    });

    it("returns null when signature is absent", () => {
      const { container } = render(<ThoughtSignatureBadge signature={undefined} />);
      expect(container.firstChild).toBeNull();
    });
  });
});
