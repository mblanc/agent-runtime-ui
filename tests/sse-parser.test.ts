import { describe, it, expect } from "vitest";
import { parseSseStream } from "@/lib/agent-runtime/sse-parser";
import { AgentStreamEvent } from "@/types/agent";

describe("Agent Runtime SSE Parser", () => {
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

  it("parses single and multiple SSE data events cleanly", async () => {
    const ssePayload = [
      'data: {"thought":"Analyzing requirements..."}\n\n',
      'data: {"text":"Hello, I am ready to help."}\n\n',
      "data: [DONE]\n\n",
    ];

    const stream = createReadableStream(ssePayload);
    const events: AgentStreamEvent[] = [];

    for await (const evt of parseSseStream(stream)) {
      events.push(evt);
    }

    expect(events.length).toBe(3);
    expect(events[0]).toEqual({
      event_type: "thought",
      thought: "Analyzing requirements...",
    });
    expect(events[1]).toEqual({
      event_type: "content",
      content: "Hello, I am ready to help.",
      author: undefined,
    });
    expect(events[2]).toEqual({
      event_type: "done",
    });
  });

  it("handles fragmented chunk boundaries across network packets", async () => {
    const fragmentedChunks = [
      'data: {"thought"',
      ':"Part 1... ',
      'Part 2..."}\n\n',
      "data: [DONE]\n\n",
    ];

    const stream = createReadableStream(fragmentedChunks);
    const events: AgentStreamEvent[] = [];

    for await (const evt of parseSseStream(stream)) {
      events.push(evt);
    }

    expect(events.length).toBe(2);
    expect(events[0]).toEqual({
      event_type: "thought",
      thought: "Part 1... Part 2...",
    });
    expect(events[1]).toEqual({
      event_type: "done",
    });
  });

  it("ignores SSE comments and keepalive heartbeats", async () => {
    const chunksWithHeartbeats = [
      ": keepalive\n\n",
      ": ping\n\n",
      'data: {"text":"Active response"}\n\n',
      ": keepalive\n\n",
      "data: [DONE]\n\n",
    ];

    const stream = createReadableStream(chunksWithHeartbeats);
    const events: AgentStreamEvent[] = [];

    for await (const evt of parseSseStream(stream)) {
      events.push(evt);
    }

    expect(events.length).toBe(2);
    expect(events[0].event_type).toBe("content");
    expect(events[0].content).toBe("Active response");
    expect(events[1].event_type).toBe("done");
  });

  it("extracts nested content parts and function calls from SSE payloads", async () => {
    const geminiRawChunk = [
      JSON.stringify({
        content: {
          parts: [
            {
              functionCall: {
                name: "query_database",
                args: { query: "SELECT * FROM users" },
              },
            },
          ],
        },
      }),
    ];

    const ssePayload = [`data: ${geminiRawChunk[0]}\n\n`, "data: [DONE]\n\n"];
    const stream = createReadableStream(ssePayload);
    const events: AgentStreamEvent[] = [];

    for await (const evt of parseSseStream(stream)) {
      events.push(evt);
    }

    expect(events.length).toBe(2);
    expect(events[0].event_type).toBe("tool_call");
    expect(events[0].tool_call?.name).toBe("query_database");
    expect(events[0].tool_call?.args).toEqual({ query: "SELECT * FROM users" });
    expect(events[1].event_type).toBe("done");
  });

  it("extracts and propagates eventId from chunk id and event_id attributes", async () => {
    const ssePayload = [
      'data: {"id":"2a18cb74-f654-47f3-86ac-dbb6223bbf8b","content":{"parts":[{"text":"Hello from agent"}]}}\n\n',
      'data: {"event_id":"evt-999","thought":"Thinking..."}\n\n',
      'data: {"invocation_id":"inv-123","agent_call":{"agent":"subagent"}}\n\n',
      "data: [DONE]\n\n",
    ];

    const stream = createReadableStream(ssePayload);
    const events: AgentStreamEvent[] = [];

    for await (const evt of parseSseStream(stream)) {
      events.push(evt);
    }

    expect(events.length).toBe(4);
    expect(events[0].eventId).toBe("2a18cb74-f654-47f3-86ac-dbb6223bbf8b");
    expect(events[0].content).toBe("Hello from agent");
    expect(events[1].eventId).toBe("evt-999");
    expect(events[1].thought).toBe("Thinking...");
    expect(events[2].eventId).toBe("inv-123");
    expect(events[2].agent_call?.agent).toBe("subagent");
    expect(events[3].event_type).toBe("done");
  });

  it("distinguishes subagent stream chunks from root chairman agent stream chunks", async () => {
    const ssePayload = [
      // Subagent 1 chunk
      `data: ${JSON.stringify({
        author: "council_member_alpha",
        node_info: {
          path: "llm_council@1/council_member_alpha@1",
          output_for: ["llm_council@1/council_member_alpha@1"],
        },
        content: { parts: [{ text: "Alpha: History of AI starts in 1950." }] },
        partial: true,
      })}\n\n`,
      // Chairman agent chunk (root output)
      `data: ${JSON.stringify({
        author: "chairman_agent",
        node_info: {
          path: "llm_council@1/chairman_agent@1",
          output_for: ["llm_council@1/chairman_agent@1", "llm_council@1"],
        },
        content: { parts: [{ text: "Council Synthesis: 45-min Video Plan" }] },
        partial: true,
      })}\n\n`,
      "data: [DONE]\n\n",
    ];

    const stream = createReadableStream(ssePayload);
    const events: AgentStreamEvent[] = [];

    for await (const evt of parseSseStream(stream)) {
      events.push(evt);
    }

    expect(events.length).toBe(3);
    // Subagent chunk is routed to agent_response
    expect(events[0].event_type).toBe("agent_response");
    expect(events[0].agent_response?.agent).toBe("council_member_alpha");
    expect(events[0].agent_response?.displayName).toBe("Council Member Alpha");
    expect(events[0].agent_response?.response).toBe(
      "Alpha: History of AI starts in 1950."
    );

    // Chairman root chunk is routed to content (main message)
    expect(events[1].event_type).toBe("content");
    expect(events[1].content).toBe("Council Synthesis: 45-min Video Plan");
    expect(events[2].event_type).toBe("done");
  });

  it("extracts comprehensive telemetry and message info attributes specified in message_info.md", async () => {
    const rawChunk = {
      id: "2a18cb74-f654-47f3-86ac-dbb6223bbf8b",
      invocation_id: "e-2bb5c7b2-e5e6-4627-a57e-ee5f835a9bfa",
      author: "root_agent",
      model_version: "gemini-flash-latest",
      content: {
        parts: [
          {
            text: "Hello! How can I help you today?",
            thought_signature: "CtcHAY89a1--OtSEPZg...",
          },
        ],
        role: "model",
      },
      finish_reason: "STOP",
      usage_metadata: {
        candidates_token_count: 813,
        candidates_tokens_details: [{ modality: "TEXT", token_count: 813 }],
        prompt_token_count: 3002,
        prompt_tokens_details: [{ modality: "TEXT", token_count: 3002 }],
        thoughts_token_count: 275,
        total_token_count: 4090,
        traffic_type: "ON_DEMAND",
      },
      avg_logprobs: -0.20916793091270758,
      actions: {
        state_delta: { current_step: 2 },
        artifact_delta: { "report.md": "new report content" },
        requested_auth_configs: {},
        requested_tool_confirmations: {},
      },
      node_info: {
        path: "root_agent@1",
      },
      timestamp: 1786305763.3772614,
    };

    const ssePayload = [`data: ${JSON.stringify(rawChunk)}\n\n`, "data: [DONE]\n\n"];
    const stream = createReadableStream(ssePayload);
    const events: AgentStreamEvent[] = [];

    for await (const evt of parseSseStream(stream)) {
      events.push(evt);
    }

    expect(events.length).toBe(2);
    const first = events[0];
    expect(first.event_type).toBe("content");
    expect(first.content).toBe("Hello! How can I help you today?");
    expect(first.eventId).toBe("2a18cb74-f654-47f3-86ac-dbb6223bbf8b");
    expect(first.invocationId).toBe("e-2bb5c7b2-e5e6-4627-a57e-ee5f835a9bfa");
    expect(first.modelVersion).toBe("gemini-flash-latest");
    expect(first.usageMetadata?.total_token_count).toBe(4090);
    expect(first.usageMetadata?.prompt_token_count).toBe(3002);
    expect(first.usageMetadata?.candidates_token_count).toBe(813);
    expect(first.usageMetadata?.thoughts_token_count).toBe(275);
    expect(first.usageMetadata?.traffic_type).toBe("ON_DEMAND");
    expect(first.avgLogprobs).toBeCloseTo(-0.2091679);
    expect(first.nodeInfo?.path).toBe("root_agent@1");
    expect(first.nodePath).toBe("root_agent@1");
    expect(first.thoughtSignature).toBe("CtcHAY89a1--OtSEPZg...");
    expect(first.actions?.state_delta).toEqual({ current_step: 2 });
    expect(first.actions?.artifact_delta).toEqual({ "report.md": "new report content" });
    expect(first.finishReason).toBe("STOP");
    expect(first.timestamp).toBe(1786305763.3772614);
  });
});
