import { beforeEach, describe, expect, it } from "vitest";
import { toAgentMessages } from "@/lib/adapters/chat-adapter";
import { defaultAttachmentStore } from "@/lib/attachments/attachment-store";
import type { ThreadMessage } from "@assistant-ui/react";

/**
 * Direct tests for message shaping.
 *
 * This logic used to live inside `run()`'s async generator, so exercising it
 * meant driving a whole streaming turn against a mocked fetch. As a plain
 * function it can be called with an input and asserted on its output, which is
 * the point of the extraction.
 */

function msg(partial: Record<string, unknown>): ThreadMessage {
  return {
    id: "m",
    role: "user",
    content: [],
    attachments: [],
    status: { type: "complete", reason: "unknown" },
    createdAt: new Date(),
    metadata: { custom: {} },
    ...partial,
  } as unknown as ThreadMessage;
}

beforeEach(() => {
  defaultAttachmentStore.clear();
});

describe("text", () => {
  it("maps a simple user turn", () => {
    const out = toAgentMessages([msg({ content: [{ type: "text", text: "hello" }] })]);

    expect(out).toHaveLength(1);
    expect(out[0].role).toBe("user");
    expect(out[0].content).toBe("hello");
  });

  it("preserves conversation order across roles", () => {
    const out = toAgentMessages([
      msg({ id: "a", role: "user", content: [{ type: "text", text: "q1" }] }),
      msg({ id: "b", role: "assistant", content: [{ type: "text", text: "a1" }] }),
      msg({ id: "c", role: "user", content: [{ type: "text", text: "q2" }] }),
    ]);

    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(out.map((m) => m.content)).toEqual(["q1", "a1", "q2"]);
  });

  it("concatenates multiple text parts within one message", () => {
    const out = toAgentMessages([
      msg({
        content: [
          { type: "text", text: "first " },
          { type: "text", text: "second" },
        ],
      }),
    ]);

    expect(out[0].content).toContain("first");
    expect(out[0].content).toContain("second");
  });

  it("returns an empty array for no messages", () => {
    expect(toAgentMessages([])).toEqual([]);
  });
});

describe("attachments", () => {
  it("emits a file_data part for a gs:// image", () => {
    const out = toAgentMessages([
      msg({
        content: [
          { type: "image", image: "gs://b/users/u/p.png", filename: "p.png" },
          { type: "text", text: "what is this" },
        ],
      }),
    ]);

    const fileData = out[0].parts?.find((p) => p.file_data);
    expect(fileData?.file_data?.file_uri).toBe("gs://b/users/u/p.png");
  });

  it("resolves an unresolved image through the attachment store", () => {
    defaultAttachmentStore.set("att-1", {
      gcsUri: "gs://b/users/u/stored.png",
      contentType: "image/png",
      readUrl: "",
      previewUrl: "",
    });

    const out = toAgentMessages([
      msg({
        content: [{ type: "image", image: "blob:local", filename: "stored.png" }],
        attachments: [{ id: "att-1", type: "image", name: "stored.png" }],
      }),
    ]);

    const fileData = out[0].parts?.find((p) => p.file_data);
    expect(fileData?.file_data?.file_uri).toBe("gs://b/users/u/stored.png");
    expect(fileData?.file_data?.mime_type).toBe("image/png");
  });

  it("does not emit a file_data part when nothing resolves", () => {
    const out = toAgentMessages([
      msg({ content: [{ type: "image", image: "blob:unknown", filename: "x.png" }] }),
    ]);

    expect(out[0].parts?.some((p) => p.file_data)).toBeFalsy();
  });
});

describe("tool calls", () => {
  it("carries an assistant tool call through as a function_call part", () => {
    const out = toAgentMessages([
      msg({
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "search",
            args: { q: "vertex" },
          },
        ],
      }),
    ]);

    const call = out.flatMap((m) => m.parts || []).find((p) => p.function_call);
    expect(call?.function_call?.name).toBe("search");
    expect(call?.function_call?.id).toBe("call-1");
  });

  it("emits a function_response for a completed tool call", () => {
    const out = toAgentMessages([
      msg({
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "search",
            args: { q: "x" },
            result: { hits: 3 },
          },
        ],
      }),
    ]);

    const resp = out.flatMap((m) => m.parts || []).find((p) => p.function_response);
    expect(resp?.function_response?.name).toBe("search");
  });
});

describe("purity", () => {
  it("does not mutate the input messages", () => {
    const input = [msg({ content: [{ type: "text", text: "hello" }], attachments: [] })];
    const snapshot = JSON.stringify(input);

    toAgentMessages(input);

    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("returns equal output for equal input", () => {
    const build = () => [msg({ content: [{ type: "text", text: "same" }] })];
    expect(JSON.stringify(toAgentMessages(build()))).toBe(
      JSON.stringify(toAgentMessages(build()))
    );
  });
});
