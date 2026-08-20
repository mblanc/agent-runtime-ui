import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { A2UIMessagePart } from "@/components/a2ui/a2ui-message-part";
import type { A2UIPartData } from "@/types/agent";

describe("A2UIMessagePart Integration", () => {
  it("renders micro-ui from A2UIPartData and triggers onAction callback", async () => {
    const handleAction = vi.fn();
    const data: A2UIPartData = {
      version: "0.8",
      root: {
        type: "Card",
        props: { title: "Confirm Deployment" },
        children: [
          {
            type: "Button",
            id: "btn_action_1",
            props: { label: "Deploy to Production", variant: "primary" },
            actions: [{ event: "trigger_deploy", payload: { cluster: "gke-eu" } }],
          },
        ],
      },
    };

    render(<A2UIMessagePart data={data} onAction={handleAction} />);

    expect(screen.getByText("Confirm Deployment")).toBeDefined();
    const btn = screen.getByRole("button", { name: /Deploy to Production/i });
    expect(btn).toBeDefined();

    await act(async () => {
      fireEvent.click(btn);
    });

    expect(handleAction).toHaveBeenCalledTimes(1);
    expect(handleAction).toHaveBeenCalledWith(
      { event: "trigger_deploy", payload: { cluster: "gke-eu" } },
      "btn_action_1"
    );
  });
});
