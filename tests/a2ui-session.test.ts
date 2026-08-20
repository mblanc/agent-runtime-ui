import { describe, it, expect } from "vitest";
import { parseRawSessionEvent } from "@/lib/agent-runtime/parse-event";
import { groupTurnSessionEvents } from "@/lib/agent-runtime/group-turns";
import { formatRemoteMessagesToThreadMessages } from "@/lib/session-adapter";
import type { A2UIPartData } from "@/types/agent";

describe("A2UI Session Rehydration & Persistence", () => {
  const sampleA2UI: A2UIPartData = {
    version: "0.8",
    root: {
      type: "Card",
      props: { title: "Cluster Status", status: "Operational" },
      children: [
        {
          type: "StatMetric",
          props: { label: "Nodes", value: 12 },
        },
      ],
    },
  };

  it("parses raw session event containing a2ui payload", () => {
    const rawEvt = {
      id: "evt-1",
      role: "assistant",
      content: "Here is your dashboard",
      a2ui: sampleA2UI,
    };

    const parsed = parseRawSessionEvent(rawEvt, "sess-1", 0);
    expect(parsed.a2ui).toBeDefined();
    expect(parsed.a2ui?.root).toBeDefined();
  });

  it("groups turn session events preserving a2ui data in the assistant turn", () => {
    const rawEvents = [
      {
        id: "evt-user-1",
        role: "user",
        content: "Show cluster status",
      },
      {
        id: "evt-asst-1",
        role: "assistant",
        content: "Here is the cluster status",
        a2ui: sampleA2UI,
      },
    ];

    const turns = groupTurnSessionEvents(rawEvents, "sess-1");
    expect(turns.length).toBe(2);
    const asstTurn = turns[1];
    expect(asstTurn.role).toBe("assistant");
    expect(asstTurn.a2ui).toBeDefined();
    expect(asstTurn.a2ui?.root).toBeDefined();
  });

  it("formatRemoteMessagesToThreadMessages maps a2ui into message metadata.custom.a2ui", () => {
    const rawMessages = [
      {
        id: "msg-1",
        role: "assistant",
        content: "Here is your dashboard",
        a2ui: sampleA2UI,
      },
    ];

    const threadMessages = formatRemoteMessagesToThreadMessages(rawMessages);
    expect(threadMessages.length).toBe(1);
    const custom = (threadMessages[0].metadata as { custom?: Record<string, unknown> })
      ?.custom;
    expect(custom?.a2ui).toBeDefined();
    expect(custom?.a2ui).toEqual(sampleA2UI);
  });

  it("extracts and strips ---a2ui_JSON--- from historical session event content", () => {
    const rawEvt = {
      id: "evt-survey-1",
      role: "assistant",
      content: `Certainly, here is a quick survey about your vacation preferences! Just fill out the fields and hit 'Submit'.

---a2ui_JSON--- {"components": [{"component": {"Text": {"text": {"literalString": "Quick Vacation Survey"}, "variant": "h2"}}, "id": "text-47d0ed79"}, {"component": {"Slider": {"label": {"literalString": "Budget"}, "maxValue": 5000, "minValue": 500, "value": {"literalNumber": 2000}}}, "id": "budget"}, {"component": {"Button": {"action": {"name": "submit_form", "params": {}}, "primary": true}}, "id": "btn-1"}], "root": "text-47d0ed79", "title": "Quick Vacation Survey", "type": "Form"}`,
    };

    const parsed = parseRawSessionEvent(rawEvt, "sess-survey", 0);
    expect(parsed.a2ui).toBeDefined();
    expect(parsed.content).toBe(
      "Certainly, here is a quick survey about your vacation preferences! Just fill out the fields and hit 'Submit'."
    );

    const threadMessages = formatRemoteMessagesToThreadMessages([
      parsed as unknown as Record<string, unknown>,
    ]);
    expect(threadMessages.length).toBe(1);
    const contentParts = Array.isArray(threadMessages[0].content)
      ? (threadMessages[0].content as Array<{ type: string; text?: string }>)
      : [];
    const textPart = contentParts.find((p) => p.type === "text");
    expect(textPart?.text).toBe(
      "Certainly, here is a quick survey about your vacation preferences! Just fill out the fields and hit 'Submit'."
    );
    const custom = (threadMessages[0].metadata as { custom?: Record<string, unknown> })
      ?.custom;
    expect(custom?.a2ui).toBeDefined();
  });
});
