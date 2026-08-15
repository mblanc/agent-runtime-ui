import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ContextCachePopover } from "@/components/context-caching/context-cache-popover";
import type { AgentUsageMetadata } from "@/types/agent";

describe("Context Cache UI Components", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("returns null when no cached tokens exist in usageMetadata", () => {
    const usage: AgentUsageMetadata = {
      prompt_token_count: 1500,
      cached_content_token_count: 0,
      candidates_token_count: 300,
      total_token_count: 1800,
    };

    const { container } = render(<ContextCachePopover usageMetadata={usage} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders cache badge with hit percentage and token count when cached tokens exist", () => {
    const usage: AgentUsageMetadata = {
      prompt_token_count: 4200,
      cached_content_token_count: 3420,
      candidates_token_count: 380,
      total_token_count: 4675,
    };

    render(<ContextCachePopover usageMetadata={usage} />);

    const badge = screen.getByRole("button", {
      name: /View Vertex AI context caching savings/i,
    });
    expect(badge).toBeDefined();
    // 3420 / 4200 = 81.428% -> 81.4%
    expect(badge.textContent).toContain("81.4% cached");
    expect(badge.textContent).toContain("3,420 tok");
  });

  it("opens popover on click and shows breakdown with progress bar and copy button", async () => {
    const usage: AgentUsageMetadata = {
      prompt_token_count: 5000,
      cached_content_token_count: 4000,
      candidates_token_count: 500,
      total_token_count: 5600,
    };

    render(<ContextCachePopover usageMetadata={usage} />);

    const badge = screen.getByRole("button", {
      name: /View Vertex AI context caching savings/i,
    });

    await act(async () => {
      fireEvent.click(badge);
    });

    const dialog = screen.getByRole("dialog", {
      name: /Context Caching Savings Details/i,
    });
    expect(dialog).toBeDefined();
    expect(dialog.textContent).toContain("Context Caching Savings");
    expect(dialog.textContent).toContain("80% Hit");
    expect(dialog.textContent).toContain("5,000 Total");
    expect(dialog.textContent).toContain("Cached (4,000)");
    expect(dialog.textContent).toContain("Fresh (1,000)");

    // Test copy telemetry
    const copyBtn = screen.getByText("Copy telemetry");
    await act(async () => {
      fireEvent.click(copyBtn);
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("Vertex AI Context Caching Telemetry:")
    );
  });
});
