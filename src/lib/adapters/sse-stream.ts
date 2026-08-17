import type { AgentMessage, AgentStreamEvent } from "@/types/agent";

import { debugStream } from "./debug-stream";

export interface StreamChatOptions {
  messages: AgentMessage[];
  sessionId?: string;
  agentId?: string;
  location?: string;
  abortSignal?: AbortSignal;
}

/** One SSE frame: the event it decoded to, and the payload it decoded from. */
export interface SseFrame {
  event: AgentStreamEvent;
  /**
   * The raw `data:` payload. Carried alongside the event so the consumer can
   * name the offending frame in `warnMalformedFrame` when *dispatching* it
   * throws — the guard around parsing and the guard around dispatch have to
   * log the same thing, and only this side has the text.
   */
  raw: string;
}

/**
 * A frame that could not be turned into a snapshot, at any stage.
 *
 * Both guards call this so the message, the level and the arguments cannot
 * drift apart: one warning shape for "this frame was dropped, the stream
 * continues", whether it died in `JSON.parse` or in the state machine.
 */
export function warnMalformedFrame(raw: string, error: unknown): void {
  console.warn(
    "[createGeminiChatAdapter] Malformed or non-JSON SSE payload ignored:",
    raw,
    error
  );
}

/**
 * Decodes one frame, or drops it.
 *
 * The trace call is inside the guard on purpose: reading `parsed.event_type`
 * is what throws on a `data: null` frame, and it throws while evaluating the
 * argument, so it throws whether or not tracing is enabled.
 */
function parseFrame(jsonStr: string): AgentStreamEvent | undefined {
  try {
    // Typed, not `any`: the payload on this wire is whatever
    // `api/chat/route.ts` stringified, and that is exactly what a
    // provider yielded. Declaring it makes the normalised spelling
    // the compiler's business — a snake_case read downstream is now a
    // type error rather than a field that silently never arrives.
    const parsed = JSON.parse(jsonStr) as AgentStreamEvent;

    // Once per SSE event: hundreds of lines for a long generation.
    debugStream("sse.event", parsed.event_type);

    return parsed;
  } catch (e: unknown) {
    warnMalformedFrame(jsonStr, e);
    return undefined;
  }
}

/**
 * The wire half of a streaming turn: POST /api/chat, then read the response
 * body as SSE and yield one parsed `AgentStreamEvent` per frame.
 *
 * This is everything the adapter's `run()` used to do between `fetch` and the
 * dispatch chain — reader, decoder, the `\n\n` frame buffer, the `data: `
 * prefix, the `[DONE]` sentinel and `JSON.parse` — and nothing else. It holds
 * no accumulated state, so the state machine on the other side of it
 * (`StreamAccumulator`) can be exercised without a fetch mock.
 *
 * The reader's lock is released in a `finally`, which covers the consumer
 * breaking out of the `for await` early (a terminal event) and an abort
 * rejecting `read()`, exactly as the generator-local `finally` did before.
 */
export async function* streamChat({
  messages,
  sessionId,
  agentId,
  location,
  abortSignal,
}: StreamChatOptions): AsyncGenerator<SseFrame, void, unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (agentId) headers["x-reasoning-engine-id"] = agentId;
  if (location) headers["x-location"] = location;

  const response = await fetch("/api/chat", {
    method: "POST",
    headers,
    body: JSON.stringify({
      messages,
      sessionId,
      reasoningEngineId: agentId,
      location,
      streamingMode: "sse",
      runConfig: {
        streaming_mode: "sse",
      },
    }),
    signal: abortSignal,
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error(
      `[createGeminiChatAdapter] API chat returned ${response.status}: ${errText}`
    );
    throw new Error(`Chat API error (${response.status}): ${errText}`);
  }

  if (!response.body) {
    throw new Error("Chat API returned empty response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;

        const dataPrefix = "data: ";
        if (!trimmed.startsWith(dataPrefix)) continue;

        const jsonStr = trimmed.substring(dataPrefix.length).trim();
        if (jsonStr === "[DONE]") {
          debugStream("sse.done");
          // The sentinel and a `done` event mean the same thing to the state
          // machine, and the two branches that handled them were duplicates
          // line for line. Yielding a synthetic terminal event keeps the one
          // implementation on the accumulator; the distinct `sse.done` trace
          // label stays here, where the distinction actually exists.
          yield { event: { event_type: "done" }, raw: jsonStr };
          return;
        }

        const parsed = parseFrame(jsonStr);
        // Dropped by the guard, or a payload with no fields to dispatch on —
        // `false`, `0`, `""` all reached the dispatch chain before and matched
        // nothing, so skipping them here yields the same nothing.
        if (!parsed) continue;

        yield { event: parsed, raw: jsonStr };
      }
    }
  } finally {
    if (typeof reader?.releaseLock === "function") {
      try {
        reader.releaseLock();
      } catch {
        // Ignore
      }
    }
  }
}
