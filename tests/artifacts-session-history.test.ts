import { describe, expect, it } from "vitest";
import { formatSessionEventsToThreadMessages } from "@/lib/agent-runtime/to-thread-messages";
import { parseRawSessionEvent } from "@/lib/agent-runtime/parse-event";

describe("Session History Artifacts Hydration", () => {
  it("extracts and attaches artifacts to assistant messages formatted from session events", () => {
    const rawEvents = [
      {
        id: "evt-user-1",
        author: "user",
        content: "Generate a sales dashboard in HTML",
        createTime: "2026-08-18T10:00:00Z",
      },
      {
        id: "evt-model-1",
        author: "model",
        createTime: "2026-08-18T10:00:05Z",
        content:
          'I have generated the sales dashboard for you below:\n\n```html filename="sales_dashboard.html"\n<!DOCTYPE html>\n<html><body><h1>Sales Q3</h1></body></html>\n```',
        actions: {
          artifact: {
            filename: "sales_dashboard.html",
            title: "Sales Dashboard Q3",
            mimeType: "text/html",
            content: "<!DOCTYPE html>\n<html><body><h1>Sales Q3</h1></body></html>",
            version: 0,
          },
        },
      },
    ];

    const parsedEvents = rawEvents.map((evt, idx) =>
      parseRawSessionEvent(evt, "session-7547932851195346944", idx)
    );

    expect(parsedEvents[1].artifacts).toBeDefined();
    expect(parsedEvents[1].artifacts?.length).toBeGreaterThan(0);
    expect(parsedEvents[1].artifacts?.[0].filename).toBe("sales_dashboard.html");

    const threadMessages = formatSessionEventsToThreadMessages(parsedEvents);
    expect(threadMessages).toHaveLength(2);

    const assistantMsg = threadMessages[1];
    expect(assistantMsg.role).toBe("assistant");
    expect(assistantMsg.metadata?.custom?.artifacts).toBeDefined();
    expect(
      (assistantMsg.metadata?.custom?.artifacts as Array<{ filename: string }>)[0]
        .filename
    ).toBe("sales_dashboard.html");
  });
});
