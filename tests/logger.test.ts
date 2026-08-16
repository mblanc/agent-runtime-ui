import { afterEach, describe, expect, it, vi } from "vitest";
import { log, requestIdFrom } from "@/lib/logger";

/**
 * The streaming path used to log once per SSE event with a user id attached and
 * no correlation id, producing hundreds of unstructured lines per message that
 * could not be tied back to a single conversation.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

function captureLine(fn: () => void, method: "log" | "warn" | "error" = "log") {
  const spy = vi.spyOn(console, method).mockImplementation(() => {});
  fn();
  expect(spy).toHaveBeenCalledTimes(1);
  return JSON.parse(spy.mock.calls[0]![0] as string);
}

describe("structured logger", () => {
  it("emits a single line of parseable JSON", () => {
    const entry = captureLine(() =>
      log.info({ event: "chat.stream.start", requestId: "req-1", sessionId: "s-1" })
    );

    expect(entry).toEqual({
      severity: "INFO",
      event: "chat.stream.start",
      requestId: "req-1",
      sessionId: "s-1",
    });
  });

  it("uses Cloud Logging's own severity field so levels are not lost", () => {
    expect(captureLine(() => log.warn({ event: "e" }), "warn").severity).toBe("WARNING");
    expect(captureLine(() => log.error({ event: "e" }), "error").severity).toBe("ERROR");
    expect(captureLine(() => log.debug({ event: "e" })).severity).toBe("DEBUG");
  });

  it("routes errors to console.error so they are not swallowed by log filters", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    log.error({ event: "boom" });

    expect(errSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("keeps arbitrary fields queryable rather than flattening them into a message", () => {
    const entry = captureLine(() =>
      log.info({ event: "chat.stream.end", durationMs: 1234, eventCount: 87 })
    );

    expect(entry.durationMs).toBe(1234);
    expect(entry.eventCount).toBe(87);
  });
});

describe("requestIdFrom", () => {
  it("prefers Cloud Run's trace header so app logs line up with request logs", () => {
    const headers = new Headers({
      "x-cloud-trace-context": "abc123def456/9876543210;o=1",
    });
    expect(requestIdFrom(headers)).toBe("abc123def456");
  });

  it("falls back to an explicit x-request-id", () => {
    expect(requestIdFrom(new Headers({ "x-request-id": "given-id" }))).toBe("given-id");
  });

  it("generates a distinct id when neither header is present", () => {
    const a = requestIdFrom(new Headers());
    const b = requestIdFrom(new Headers());

    expect(a).toBeTruthy();
    expect(a).not.toBe(b);
  });
});
