import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "@/components/ui/button";

describe("UI Components", () => {
  it("renders Gemini button variant correctly", () => {
    render(<Button variant="gemini">Ask Council</Button>);
    const button = screen.getByRole("button", { name: /ask council/i });
    expect(button).toBeDefined();
    expect(button.textContent).toBe("Ask Council");
  });
});
