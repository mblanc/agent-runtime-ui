/**
 * Client-side stream tracing, off unless NEXT_PUBLIC_DEBUG_STREAM is "true".
 *
 * These call sites used to log unconditionally: the whole outbound conversation
 * on every turn, and one line per parsed SSE event. That put message content and
 * attachment URIs in the browser console of any shared machine, and ran a
 * pretty-printing JSON.stringify of a growing history on the main thread.
 *
 * It lives in its own module because the call sites now straddle two files —
 * the adapter (`run.start`, `run.messages`, `run.aborted`) and the SSE
 * transport (`sse.done`, `sse.event`) — while the `[chat-adapter]` prefix they
 * share is what makes the trace readable as one stream.
 */
const DEBUG_STREAM = process.env.NEXT_PUBLIC_DEBUG_STREAM === "true";

export function debugStream(event: string, detail?: unknown): void {
  if (!DEBUG_STREAM) return;
  if (detail === undefined) {
    console.debug(`[chat-adapter] ${event}`);
  } else {
    console.debug(`[chat-adapter] ${event}`, detail);
  }
}
