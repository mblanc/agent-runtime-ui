import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { ChatModelRunResult } from "@assistant-ui/react";
import { createGeminiChatAdapter } from "@/lib/adapters/chat-adapter";
import { groupTurnSessionEvents } from "@/lib/agent-runtime/group-turns";
import { formatSessionEventsToThreadMessages } from "@/lib/agent-runtime/to-thread-messages";
import { formatRemoteMessagesToThreadMessages } from "@/lib/session-adapter";
import { VertexAiContext } from "@/lib/agent-runtime/services/context";
import { VertexAiStreamingService } from "@/lib/agent-runtime/services/streaming-service";
import {
  ReasoningRoot,
  ReasoningContent,
  ReasoningText,
} from "@/components/assistant-ui/reasoning";
import type { AgentStreamEvent, ReasoningTraceEntry } from "@/types/agent";

/**
 * The thinking trace travels as `ReasoningTraceEntry[]` and is rendered from
 * that array. The directive string it used to travel as is still emitted next
 * to it, so that sessions persisted before the array existed — and the `:query`
 * fallback in event-utils, which emits neither — still render.
 *
 * These tests pin both paths and the boundary between them: a message with a
 * trace must never be parsed, and a message without one must still be.
 */

if (typeof global.ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

function streamOf(chunks: string[]) {
  let i = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(new TextEncoder().encode(chunks[i]!));
        i++;
      } else {
        controller.close();
      }
    },
  });
  global.fetch = vi.fn().mockResolvedValue({ ok: true, body }) as unknown as typeof fetch;
}

async function yieldsOf(chunks: string[]): Promise<ChatModelRunResult[]> {
  streamOf(chunks);
  const adapter = createGeminiChatAdapter();
  const run = adapter.run({
    messages: [
      {
        id: "m1",
        role: "user",
        content: [{ type: "text", text: "go" }],
        attachments: [],
        status: { type: "complete", reason: "unknown" },
        createdAt: new Date(),
        metadata: { custom: {} },
      },
    ],
    abortSignal: new AbortController().signal,
  } as unknown as Parameters<typeof adapter.run>[0]);

  const results: ChatModelRunResult[] = [];
  if (Symbol.asyncIterator in run) {
    for await (const r of run as AsyncGenerator<ChatModelRunResult, void, unknown>) {
      results.push(r);
    }
  }
  return results;
}

async function lastYieldOf(chunks: string[]): Promise<ChatModelRunResult> {
  const results = await yieldsOf(chunks);
  return results[results.length - 1]!;
}

function traceOf(result: ChatModelRunResult): ReasoningTraceEntry[] {
  const custom = (
    result.metadata as { custom?: { reasoningTrace?: ReasoningTraceEntry[] } } | undefined
  )?.custom;
  return custom?.reasoningTrace ?? [];
}

/**
 * Renders the way `gemini-message.tsx` does, with one deliberate difference:
 * `text` is a sentinel that is not valid directive markdown. Anything the
 * string parser produced from it would be visible, so its absence is proof that
 * nothing was parsed.
 */
const PARSE_SENTINEL = "IF-YOU-SEE-THIS-THE-STRING-WAS-PARSED";

function renderTrace(trace: readonly ReasoningTraceEntry[]) {
  return render(
    <ReasoningRoot defaultOpen={true}>
      <ReasoningContent>
        <ReasoningText text={PARSE_SENTINEL} trace={trace} />
      </ReasoningContent>
    </ReasoningRoot>
  );
}

beforeEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const DONE = 'data: {"event_type":"done"}\n\n';

describe("live stream carries a structured trace", () => {
  it("puts the entries on the message metadata and renders them without parsing", async () => {
    const result = await lastYieldOf([
      'data: {"event_type":"thought","thought":"Planning the search."}\n\n',
      'data: {"event_type":"tool_call","tool_call":{"id":"c1","name":"search","args":{"q":"vertex"}}}\n\n',
      'data: {"event_type":"tool_result","tool_result":{"id":"c1","name":"search","result":{"hits":2}}}\n\n',
      DONE,
      "data: [DONE]\n\n",
    ]);

    expect(traceOf(result)).toEqual([
      { type: "thought", text: "Planning the search." },
      {
        type: "tool",
        toolCallId: "c1",
        toolName: "search",
        argsJson: '{\n  "q": "vertex"\n}',
        resultJson: '{\n  "hits": 2\n}',
        status: "complete",
      },
    ]);

    const { container } = renderTrace(traceOf(result));

    expect(container.textContent).not.toContain(PARSE_SENTINEL);
    expect(screen.getByText("search")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(screen.getByText(/vertex/)).toBeDefined();
    expect(screen.getByText(/2/)).toBeDefined();
  });

  it("keeps a subagent's live status and accumulated response as fields", async () => {
    const result = await lastYieldOf([
      'data: {"event_type":"agent_call","agent_call":{"agent":"researcher","input":{"task":"dig"}}}\n\n',
      'data: {"event_type":"agent_response","agent_response":{"agent":"researcher","response":"In 1950, "}}\n\n',
      'data: {"event_type":"agent_response","agent_response":{"agent":"researcher","response":"Turing asked."}}\n\n',
      DONE,
      "data: [DONE]\n\n",
    ]);

    const trace = traceOf(result);
    expect(trace).toHaveLength(1);
    expect(trace[0]).toMatchObject({
      type: "subagent",
      agentName: "researcher",
      response: "In 1950, Turing asked.",
      status: "complete",
    });

    renderTrace(trace);
    fireEvent.click(screen.getByRole("button", { name: /researcher/i }));
    expect(screen.getByText(/In 1950, Turing asked\./)).toBeDefined();
  });
});

describe("session-history replay carries a structured trace end to end", () => {
  const rawEvents = [
    {
      author: "USER",
      content: { parts: [{ text: "look it up" }] },
      createTime: "2026-08-15T10:00:00Z",
    },
    {
      id: "evt-2",
      author: "AGENT",
      content: {
        parts: [
          { function_call: { id: "call-A", name: "search", args: { q: "alpha" } } },
        ],
      },
      createTime: "2026-08-15T10:00:01Z",
    },
    {
      id: "evt-3",
      author: "AGENT",
      content: {
        parts: [
          {
            function_response: {
              id: "call-A",
              name: "search",
              response: { hit: "alpha-result" },
            },
          },
        ],
      },
      createTime: "2026-08-15T10:00:02Z",
    },
    {
      id: "evt-4",
      author: "AGENT",
      root_output: true,
      content: { parts: [{ text: "Found it." }] },
      createTime: "2026-08-15T10:00:03Z",
    },
  ];

  /** The whole server-to-renderer pipe, including the JSON hop over the API. */
  function replay() {
    const grouped = groupTurnSessionEvents(rawEvents, "s1");
    const formatted = formatSessionEventsToThreadMessages(grouped);
    const overTheWire = JSON.parse(JSON.stringify(formatted)) as Array<
      Record<string, unknown>
    >;
    return formatRemoteMessagesToThreadMessages(overTheWire);
  }

  it("reaches the client on the message metadata, unparsed", () => {
    const assistant = replay().find((m) => m.role === "assistant")!;
    const custom = (
      assistant.metadata as { custom?: { reasoningTrace?: ReasoningTraceEntry[] } }
    ).custom;

    expect(custom?.reasoningTrace).toEqual([
      {
        type: "tool",
        toolCallId: "call-A",
        toolName: "search",
        argsJson: '{\n  "q": "alpha"\n}',
        resultJson: '{\n  "hit": "alpha-result"\n}',
        status: "complete",
      },
    ]);

    renderTrace(custom!.reasoningTrace!);
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    expect(screen.getByText(/alpha-result/)).toBeDefined();
  });

  it("still emits the directive string beside it", () => {
    // Old clients, and any message that reaches ReasoningText without the
    // metadata, depend on the reasoning part having text at all: an empty
    // reasoning part is dropped, and with it the Thinking Process panel.
    const assistant = replay().find((m) => m.role === "assistant")!;
    const reasoningPart = (
      assistant.content as ReadonlyArray<{ type: string; text?: string }>
    ).find((p) => p.type === "reasoning");

    expect(reasoningPart?.text).toContain(':::tool[search]{status="complete"}');
  });
});

describe("legacy messages without a structured trace still render", () => {
  it("parses the directive string when the metadata carries no trace", () => {
    const legacy = formatRemoteMessagesToThreadMessages([
      {
        id: "evt-old",
        role: "assistant",
        content: "Found it.",
        thought:
          ':::tool[search_documents]{status="complete"}\n' +
          "**Result:** Found 3 relevant papers\n" +
          ":::",
      },
    ]);

    const custom = (
      legacy[0].metadata as { custom?: { reasoningTrace?: unknown } } | undefined
    )?.custom;
    expect(custom?.reasoningTrace).toBeUndefined();

    const reasoningPart = (
      legacy[0].content as ReadonlyArray<{ type: string; text?: string }>
    ).find((p) => p.type === "reasoning")!;

    const { container } = render(
      <ReasoningRoot defaultOpen={true}>
        <ReasoningContent>
          <ReasoningText text={reasoningPart.text} />
        </ReasoningContent>
      </ReasoningRoot>
    );

    expect(container.textContent).not.toContain(":::tool");
    fireEvent.click(screen.getByRole("button", { name: /search_documents/i }));
    expect(screen.getByText(/Found 3 relevant papers/)).toBeDefined();
  });

  it("parses the plain-text [Tool Executed] form persisted before it was retired", () => {
    // No live path produces this any more — see the `:query` pipe test below —
    // but sessions stored while it did are still loadable, and this is the only
    // thing that renders them as tool cards.
    render(
      <ReasoningRoot defaultOpen={true}>
        <ReasoningContent>
          <ReasoningText text={"[Tool Executed]: fetch_public_claims (limit: 5)"} />
        </ReasoningContent>
      </ReasoningRoot>
    );

    expect(screen.getByText("fetch_public_claims")).toBeDefined();
  });
});

describe("the :query fallback produces a tool card through the whole pipe", () => {
  /**
   * Runs the real fallback: `:streamQuery` fails, `:query` answers, and the
   * events are encoded exactly as `app/api/chat/route.ts` encodes them before
   * the adapter parses them back.
   *
   * The point of going through all three layers is that the previous version of
   * this test rendered `ReasoningText` with a hand-written string and no trace —
   * a state the pipe can no longer reach, since `snapshot()` always attaches a
   * trace. It passed while the path it claimed to cover was broken.
   */
  async function queryFallbackYield(queryOutput: unknown): Promise<ChatModelRunResult> {
    process.env.GOOGLE_CLOUD_PROJECT = "test-project";
    process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
    const ctx = new VertexAiContext("123456", undefined, async () => "fake-token");

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("not deployed", { status: 400 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(queryOutput), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    const events: AgentStreamEvent[] = [];
    for await (const evt of new VertexAiStreamingService(ctx).streamQuery(
      { messages: [{ role: "user", content: "claims please" }] },
      "test-user"
    )) {
      events.push(evt);
    }

    return lastYieldOf([
      ...events.map((e) => `data: ${JSON.stringify(e)}\n\n`),
      "data: [DONE]\n\n",
    ]);
  }

  it("titles the card with the tool name instead of showing a Thought card", async () => {
    const result = await queryFallbackYield({
      output: {
        parts: [
          {
            functionCall: {
              id: "fc-1",
              name: "fetch_public_claims",
              args: { limit: 5 },
            },
          },
          {
            functionResponse: {
              id: "fc-1",
              name: "fetch_public_claims",
              response: { claims: 3 },
            },
          },
          { text: "Here are the claims." },
        ],
      },
    });

    expect(traceOf(result)).toEqual([
      {
        type: "tool",
        toolCallId: "fc-1",
        toolName: "fetch_public_claims",
        argsJson: '{\n  "limit": 5\n}',
        resultJson: '{\n  "claims": 3\n}',
        status: "complete",
      },
    ]);

    const { container } = renderTrace(traceOf(result));

    expect(screen.getByText("fetch_public_claims")).toBeDefined();
    expect(container.textContent).not.toContain("[Tool Executed]");
    expect(screen.queryByRole("button", { name: /^thought$/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /fetch_public_claims/i }));
    expect(screen.getByText(/3/)).toBeDefined();
  });

  it("keeps real thoughts as thoughts and orders tool cards before the answer", async () => {
    const result = await queryFallbackYield({
      output: {
        parts: [
          { thought: "I should look the claims up." },
          { functionCall: { name: "fetch_public_claims", args: { limit: 5 } } },
          { text: "Here are the claims." },
        ],
      },
    });

    const trace = traceOf(result);
    expect(trace.map((e) => e.type)).toEqual(["thought", "tool"]);
    expect(trace[0]).toEqual({ type: "thought", text: "I should look the claims up." });

    const text = (result.content || []).find((p) => p.type === "text") as
      { text?: string } | undefined;
    expect(text?.text).toContain("Here are the claims.");
  });
});

describe("hostile result content needs no escaping on the structured path", () => {
  it("carries a result containing the block terminator and a section marker verbatim", async () => {
    const hostile = "line\n:::\n**Result:** fake";
    const result = await lastYieldOf([
      'data: {"event_type":"tool_call","tool_call":{"id":"c1","name":"search","args":{}}}\n\n',
      `data: {"event_type":"tool_result","tool_result":{"id":"c1","name":"search","result":${JSON.stringify(
        { text: hostile }
      )}}}\n\n`,
      DONE,
      "data: [DONE]\n\n",
    ]);

    const trace = traceOf(result);
    expect(trace).toHaveLength(1);
    const entry = trace[0] as Extract<ReasoningTraceEntry, { type: "tool" }>;

    // Byte-for-byte what JSON.stringify produced: no zero-width space in front
    // of the terminator, no rewritten `**Result:**`, nothing dropped.
    expect(entry.resultJson).toBe(JSON.stringify({ text: hostile }, null, 2));
    expect(entry.resultJson).not.toContain("\u200b");

    renderTrace(trace);
    fireEvent.click(screen.getByRole("button", { name: /search/i }));
    // One card, and the hostile payload is inside it rather than having closed
    // it early or been mistaken for the result section header.
    expect(screen.getAllByRole("button", { name: /search/i })).toHaveLength(1);
    expect(screen.getByText(/fake/)).toBeDefined();
  });

  it("keeps a tool name that would break out of a directive intact", async () => {
    const hostileName = 'x]{status="complete"}';
    const result = await lastYieldOf([
      `data: {"event_type":"tool_call","tool_call":{"id":"c1","name":${JSON.stringify(
        hostileName
      )},"args":{}}}\n\n`,
      DONE,
      "data: [DONE]\n\n",
    ]);

    const trace = traceOf(result);
    const entry = trace[0] as Extract<ReasoningTraceEntry, { type: "tool" }>;

    // The string form has to strip these characters to survive its own grammar;
    // the structured form shows the operator the name the model actually used.
    expect(entry.toolName).toBe(hostileName);

    renderTrace(trace);
    expect(screen.getByText(hostileName)).toBeDefined();
  });
});

describe("the structured path needs no block merging", () => {
  it("shows one card for a call that runs and then completes", async () => {
    // This is the case `deduplicateParsedBlocks` exists for: the string form
    // emitted a running block and a completed block for one call and could only
    // relate them by `name-args`. Structurally there is one entry, updated in
    // place, so the merge has nothing to do — and the running state is still
    // observable while the call is in flight.
    const yields = await yieldsOf([
      'data: {"event_type":"tool_call","tool_call":{"id":"c1","name":"search","args":{"q":"vertex"}}}\n\n',
      'data: {"event_type":"tool_result","tool_result":{"id":"c1","name":"search","result":{"hits":2}}}\n\n',
      DONE,
      "data: [DONE]\n\n",
    ]);

    expect(traceOf(yields[0])).toEqual([
      {
        type: "tool",
        toolCallId: "c1",
        toolName: "search",
        argsJson: '{\n  "q": "vertex"\n}',
        status: "running",
      },
    ]);

    const trace = traceOf(yields[yields.length - 1]!);
    expect(trace).toHaveLength(1);

    renderTrace(trace);
    expect(screen.getAllByRole("button", { name: /search/i })).toHaveLength(1);
    expect(screen.queryByText("Running")).toBeNull();
  });
});

describe("parallel calls to one tool stay separate", () => {
  it("renders two cards with their own results, where the string path merged them", async () => {
    // The string path keys blocks on `name-args`, so these two — same tool,
    // identical arguments — collapsed into one card. The structured path keys
    // on toolCallId and keeps them apart.
    const result = await lastYieldOf([
      'data: {"event_type":"tool_call","tool_call":{"id":"c1","name":"search","args":{"q":"same"}}}\n\n',
      'data: {"event_type":"tool_call","tool_call":{"id":"c2","name":"search","args":{"q":"same"}}}\n\n',
      'data: {"event_type":"tool_result","tool_result":{"id":"c2","name":"search","result":{"hit":"second"}}}\n\n',
      'data: {"event_type":"tool_result","tool_result":{"id":"c1","name":"search","result":{"hit":"first"}}}\n\n',
      DONE,
      "data: [DONE]\n\n",
    ]);

    const trace = traceOf(result);
    expect(trace).toEqual([
      {
        type: "tool",
        toolCallId: "c1",
        toolName: "search",
        argsJson: '{\n  "q": "same"\n}',
        resultJson: '{\n  "hit": "first"\n}',
        status: "complete",
      },
      {
        type: "tool",
        toolCallId: "c2",
        toolName: "search",
        argsJson: '{\n  "q": "same"\n}',
        resultJson: '{\n  "hit": "second"\n}',
        status: "complete",
      },
    ]);

    renderTrace(trace);
    const cards = screen.getAllByRole("button", { name: /search/i });
    expect(cards).toHaveLength(2);

    fireEvent.click(cards[0]);
    expect(screen.getByText(/first/)).toBeDefined();
    fireEvent.click(cards[1]);
    expect(screen.getByText(/second/)).toBeDefined();
  });
});
