import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRetrievalBadge } from "@/components/memory/memory-retrieval-badge";
import { createYieldContent } from "@/lib/adapters/chat-adapter";
import type { MemoryRetrievalItem } from "@/types/agent";

const mockRetrievedMemories: MemoryRetrievalItem[] = [
  {
    id: "mem-1",
    fact: "Prefers TypeScript with strict typing",
    topic: "coding_preferences",
    relevanceScore: 0.96,
  },
  {
    id: "mem-2",
    fact: "Uses Bun runtime and package manager",
    topic: "coding_preferences",
    relevanceScore: 0.88,
  },
];

describe("MemoryRetrievalBadge Component", () => {
  it("renders nothing when memories list is empty or undefined", () => {
    const { container: c1 } = render(<MemoryRetrievalBadge memories={[]} />);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(<MemoryRetrievalBadge />);
    expect(c2.firstChild).toBeNull();
  });

  it("renders badge with count and fact preview", () => {
    render(<MemoryRetrievalBadge memories={mockRetrievedMemories} />);

    expect(screen.getByText("2")).toBeDefined();
    expect(screen.getByText(/Memories Applied/)).toBeDefined();
    expect(
      screen.getByText(/: "Prefers TypeScript with s...", "Uses Bun runtime and pack..."/)
    ).toBeDefined();
  });

  it("toggles details popover with scores and topic tags on click", () => {
    render(<MemoryRetrievalBadge memories={mockRetrievedMemories} />);

    const badgeBtn = screen.getByRole("button", {
      name: /Toggle applied memories list/i,
    });
    fireEvent.click(badgeBtn);

    expect(screen.getByText("Retrieved Memory Context")).toBeDefined();
    expect(screen.getByText(/Prefers TypeScript with strict typing/)).toBeDefined();
    expect(screen.getByText(/Uses Bun runtime and package manager/)).toBeDefined();
    expect(screen.getByText("96% match")).toBeDefined();
    expect(screen.getByText("88% match")).toBeDefined();
  });
});

describe("Chat Adapter createYieldContent with Memory Context", () => {
  it("includes retrievedMemories inside metadata.custom", () => {
    const result = createYieldContent(
      "Thinking...",
      "Hello world",
      [],
      "event-123",
      mockRetrievedMemories
    );

    expect(result.metadata?.custom?.eventId).toBe("event-123");
    expect(result.metadata?.custom?.retrievedMemories).toEqual(mockRetrievedMemories);
    expect(result.metadata?.custom?.retrievedMemories).toHaveLength(2);
  });
});
