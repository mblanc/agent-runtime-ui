import { beforeEach, describe, expect, it, vi } from "vitest";
import { VertexAiContext } from "@/lib/agent-runtime/services/context";
import { VertexAiStreamingService } from "@/lib/agent-runtime/services/streaming-service";
import type { AgentStreamEvent } from "@/types/agent";

/**
 * When both `:streamQuery` and the `:query` fallback fail, the thrown error is
 * the only place the upstream message surfaces. It used to re-read the
 * `:streamQuery` Response a second time to build that message — a body can only
 * be read once, so the read rejected, the `.catch(() => "")` swallowed it, and
 * the real error was replaced by a bare `statusText`.
 */
function makeContext() {
  process.env.GOOGLE_CLOUD_PROJECT = "test-project";
  process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
  process.env.GOOGLE_REASONING_ENGINE_ID = "123456";
  return new VertexAiContext("123456", undefined, async () => "fake-token");
}

describe("streamQuery error when both endpoints fail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the :streamQuery body when the :query fallback fails with an empty one", async () => {
    const ctx = makeContext();
    const streamErrBody = "Agent engine 123456 is not deployed in us-central1";
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(streamErrBody, { status: 400, statusText: "Bad Request" })
      )
      .mockResolvedValueOnce(
        new Response("", { status: 500, statusText: "Server Error" })
      );

    const events: AgentStreamEvent[] = [];
    for await (const evt of new VertexAiStreamingService(ctx).streamQuery(
      { messages: [{ role: "user", content: "hi" }] },
      "test-user"
    )) {
      events.push(evt);
    }

    const errorEvent = events.find((e) => e.event_type === "error");
    expect(errorEvent).toBeDefined();
    expect(errorEvent!.error).toContain(streamErrBody);
    expect(errorEvent!.error).toContain("500");
  });
});
