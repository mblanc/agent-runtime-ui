import { describe, expect, it } from "vitest";
import { AgentRuntimeClient } from "@/lib/agent-runtime-client";

describe("AgentRuntimeClient", () => {
  it("initializes in mock mode when credentials are not configured", () => {
    const client = new AgentRuntimeClient();
    expect(client).toBeDefined();
  });

  it("yields streaming events in mock mode", async () => {
    const client = new AgentRuntimeClient();
    const events = [];

    for await (const event of client.streamQuery(
      {
        messages: [{ role: "user", content: "Test ping" }],
      },
      "test-user"
    )) {
      events.push(event);
    }

    expect(events.length).toBeGreaterThan(0);
    const hasContent = events.some((e) => e.event_type === "content");
    expect(hasContent).toBe(true);
  });
});
