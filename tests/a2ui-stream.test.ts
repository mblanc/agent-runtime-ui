import { describe, it, expect } from "vitest";
import { StreamAccumulator } from "@/lib/adapters/stream-accumulator";
import { toAgentMessages } from "@/lib/adapters/chat-adapter";
import type { AgentStreamEvent } from "@/types/agent";
import type { ThreadMessage } from "@assistant-ui/react";

describe("A2UI Stream Accumulator & Ingestion", () => {
  it("accumulates dedicated a2ui event into snapshot metadata", () => {
    const accumulator = new StreamAccumulator();

    const event: AgentStreamEvent = {
      event_type: "a2ui",
      a2ui: {
        version: "0.8",
        root: {
          type: "Card",
          props: { title: "Deployment Preview" },
          children: [
            {
              type: "Button",
              id: "deploy_btn",
              props: { label: "Confirm Deployment" },
              actions: [{ event: "deploy", payload: { target: "prod" } }],
            },
          ],
        },
      },
    };

    const outcome = accumulator.handle(event);
    expect(outcome).toBe("yield");

    const snapshot = accumulator.snapshot();
    const customMeta = snapshot.metadata?.custom as Record<string, unknown>;
    expect(customMeta?.a2ui).toBeDefined();
    const a2uiData = customMeta?.a2ui as { root: { type: string } };
    expect(a2uiData.root.type).toBe("Card");
  });

  it("accumulates A2UI payload embedded in tool_result", () => {
    const accumulator = new StreamAccumulator();

    accumulator.handle({
      event_type: "tool_call",
      tool_call: {
        id: "call_a2ui_1",
        name: "render_cluster_card",
        args: { cluster: "gke-prod" },
      },
    });

    accumulator.handle({
      event_type: "tool_result",
      tool_result: {
        id: "call_a2ui_1",
        name: "render_cluster_card",
        result: {
          type: "StatMetric",
          props: { label: "Pods", value: 32 },
        },
      },
    });

    const snapshot = accumulator.snapshot();
    const customMeta = snapshot.metadata?.custom as Record<string, unknown>;
    expect(customMeta?.a2ui).toBeDefined();
    const a2uiData = customMeta?.a2ui as { root: { type: string } };
    expect(a2uiData.root.type).toBe("StatMetric");
  });

  it("toAgentMessages transforms [A2UI_ACTION:...] text into structured a2ui_action part", () => {
    const messages = [
      {
        id: "msg_user_1",
        role: "user",
        createdAt: new Date(),
        content: [
          {
            type: "text",
            text: '[A2UI_ACTION:{"componentId":"btn_1","event":"approve","payload":{"env":"staging"}}]',
          },
        ],
        attachments: [],
        metadata: {},
      },
    ] as unknown as ThreadMessage[];

    const agentMessages = toAgentMessages(messages);
    expect(agentMessages.length).toBe(1);
    expect(agentMessages[0].parts?.length).toBe(1);
    const part = agentMessages[0].parts?.[0];
    expect(part?.type).toBe("a2ui_action");
    expect(part?.a2uiAction).toEqual({
      componentId: "btn_1",
      event: "approve",
      payload: { env: "staging" },
    });
  });
});
