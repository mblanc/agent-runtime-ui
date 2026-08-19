import { describe, expect, it } from "vitest";
import { groupTurnSessionEvents } from "@/lib/agent-runtime/group-turns";
import { StreamAccumulator } from "@/lib/adapters/stream-accumulator";
import { parseSseStream } from "@/lib/agent-runtime/sse-parser";
import { extractArtifactFromTool } from "@/lib/artifacts/artifact-extractor";
import { AgentStreamEvent } from "@/types/agent";

describe("generate_image tool artifact integration", () => {
  function createReadableStream(chunks: string[]): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });
  }

  it("extracts artifact from generate_image tool call arguments and results", () => {
    const artFromArgs = extractArtifactFromTool("generate_image", {
      Prompt: "A cute fluffy kitten playing with yarn",
      ImageName: "cute_cat",
    });

    // Even if args only has Prompt and ImageName, it is recognized
    expect(artFromArgs).toBeNull(); // No image content yet

    const artFromResp = extractArtifactFromTool("generate_image", {
      Prompt: "A cute fluffy kitten playing with yarn",
      ImageName: "cute_cat",
      image:
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    });

    expect(artFromResp).not.toBeNull();
    expect(artFromResp?.filename).toBe("cute_cat.png");
    expect(artFromResp?.title).toBe("A cute fluffy kitten playing with yarn");
    expect(artFromResp?.mimeType).toBe("image/png");
    expect(artFromResp?.content).toContain("data:image/png;base64,");
  });

  it("yields artifact_created during SSE stream processing of generate_image tool_result", async () => {
    const rawEvents = [
      {
        event_type: "tool_call",
        tool_call: {
          name: "generate_image",
          args: {
            Prompt: "Generate an image of a cute cat",
            ImageName: "cute_cat",
          },
        },
      },
      {
        event_type: "tool_result",
        tool_result: {
          name: "generate_image",
          result: {
            image:
              "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            ImageName: "cute_cat",
          },
        },
      },
      {
        event_type: "text",
        text: "Here is the image of a cute cat you requested!",
      },
    ];

    const sseChunks = rawEvents.map((e) => `data: ${JSON.stringify(e)}\n\n`);
    const stream = createReadableStream(sseChunks);
    const parsedEvents: AgentStreamEvent[] = [];
    for await (const event of parseSseStream(stream)) {
      parsedEvents.push(event);
    }

    const artifactEvent = parsedEvents.find((e) => e.event_type === "artifact_created");

    expect(artifactEvent).toBeDefined();
    expect(artifactEvent?.artifact).toBeDefined();
    expect(artifactEvent?.artifact?.filename).toBe("cute_cat.png");
    expect(artifactEvent?.artifact?.mimeType).toBe("image/png");
    expect(artifactEvent?.artifact?.content).toBe(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    );
  });

  it("accumulates image artifact in StreamAccumulator when generate_image runs", () => {
    const acc = new StreamAccumulator([]);

    acc.handle({
      event_type: "tool_call",
      tool_call: {
        id: "call_123",
        name: "generate_image",
        args: {
          Prompt: "Generate an image of a cute cat",
          ImageName: "cute_cat",
        },
      },
    });

    acc.handle({
      event_type: "tool_result",
      tool_result: {
        id: "call_123",
        name: "generate_image",
        result: {
          image:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          ImageName: "cute_cat",
        },
      },
    });

    acc.handle({
      event_type: "content",
      content: "I have generated the image for you.",
    });

    const result = acc.snapshot();
    const custom = (result.metadata?.custom ?? {}) as {
      artifacts?: Array<{ filename: string; mimeType: string }>;
    };
    expect(custom.artifacts).toHaveLength(1);
    expect(custom.artifacts?.[0].filename).toBe("cute_cat.png");
    expect(custom.artifacts?.[0].mimeType).toBe("image/png");
  });

  it("extracts generate_image artifact when reloading session turns", () => {
    const sessionHistory = [
      {
        id: "evt-user",
        sessionId: "2593146428343713792",
        role: "user",
        content: "Generate an image of a cute cat",
      },
      {
        id: "evt-model-call",
        sessionId: "2593146428343713792",
        role: "assistant",
        rawEvent: {
          content: {
            parts: [
              {
                function_call: {
                  name: "generate_image",
                  args: {
                    Prompt: "Generate an image of a cute cat",
                    ImageName: "cute_cat",
                  },
                },
              },
            ],
          },
        },
      },
      {
        id: "evt-tool-res",
        sessionId: "2593146428343713792",
        role: "assistant",
        rawEvent: {
          content: {
            parts: [
              {
                function_response: {
                  name: "generate_image",
                  response: {
                    ImageName: "cute_cat",
                    image:
                      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                  },
                },
              },
            ],
          },
        },
      },
      {
        id: "evt-model-final",
        sessionId: "2593146428343713792",
        role: "assistant",
        content: "I have generated an image of a cute cat for you!",
      },
    ];

    const turns = groupTurnSessionEvents(sessionHistory, "2593146428343713792");
    expect(turns).toHaveLength(2);
    const assistantTurn = turns[1];
    expect(assistantTurn.artifacts).toHaveLength(1);
    expect(assistantTurn.artifacts?.[0].filename).toBe("cute_cat.png");
  });

  it("places initial deliberation thought BEFORE tool call and extracts single GCS artifact without phantom graph_1.png", () => {
    const sessionHistory = [
      {
        id: "evt-user",
        sessionId: "1991889489810685952",
        role: "user",
        content: "Generate an image of a cute cat",
      },
      {
        id: "evt-model-call",
        sessionId: "1991889489810685952",
        role: "assistant",
        rawEvent: {
          content: {
            parts: [
              {
                function_call: {
                  name: "generate_image",
                  args: {
                    filename: "cute_cat.png",
                    prompt: "a cute cat, photorealistic, high detail",
                  },
                },
              },
            ],
          },
        },
      },
      {
        id: "evt-tool-res",
        sessionId: "1991889489810685952",
        role: "assistant",
        rawEvent: {
          content: {
            parts: [
              {
                function_response: {
                  name: "generate_image",
                  response: {
                    status: "success",
                    message:
                      "Image generated successfully and saved as artifact 'cute_cat.png'.",
                    filename: "cute_cat.png",
                    artifact_version: 0,
                    gcs_uri:
                      "gs://svc-demo-vertex-generic-agent-logs/app/107197175468507396372/1991889489810685952/cute_cat.png/0",
                    canonical_uri:
                      "gs://svc-demo-vertex-generic-agent-logs/app/107197175468507396372/1991889489810685952/cute_cat.png/0",
                    model: "gemini-3.1-flash-image",
                  },
                },
              },
            ],
          },
        },
      },
      {
        id: "evt-model-final",
        sessionId: "1991889489810685952",
        role: "assistant",
        thought: "Generating Adorable Feline\n\nI will use generate_image tool.",
        content: "I have generated the image of a cute cat and saved it as cute_cat.png.",
      },
    ];

    const turns = groupTurnSessionEvents(sessionHistory, "1991889489810685952");
    expect(turns).toHaveLength(2);

    const assistantTurn = turns[1];
    expect(assistantTurn.role).toBe("assistant");

    const firstTrace = assistantTurn.reasoningTrace?.[0];
    const secondTrace = assistantTurn.reasoningTrace?.[1];
    expect(firstTrace?.type).toBe("thought");
    if (firstTrace && firstTrace.type === "thought") {
      expect(firstTrace.text).toContain("Generating Adorable Feline");
    }
    expect(secondTrace?.type).toBe("tool");
    if (secondTrace && secondTrace.type === "tool") {
      expect(secondTrace.toolName).toBe("generate_image");
    }

    // 2. There should only be 1 artifact (cute_cat.png) with GCS URI, NO phantom graph_1.png
    expect(assistantTurn.artifacts).toBeDefined();
    expect(assistantTurn.artifacts).toHaveLength(1);
    expect(assistantTurn.artifacts?.[0].filename).toBe("cute_cat.png");
    expect(assistantTurn.artifacts?.[0].gcsUri).toBe(
      "gs://svc-demo-vertex-generic-agent-logs/app/107197175468507396372/1991889489810685952/cute_cat.png/0"
    );
  });
});
