/**
 * Minimal structured logger for server-side code.
 *
 * Emits one line of JSON per call. Cloud Logging parses that natively into
 * structured fields, so `severity` and any extra keys become queryable rather
 * than being buried in a message string. `severity` is Cloud Logging's own
 * field name; using it means entries are levelled correctly without a parser.
 *
 * The point of this over bare console.log is correlation: every entry carries a
 * requestId, so one failed conversation can be reconstructed from the logs.
 * Per-event logging is deliberately absent — a long generation emits hundreds of
 * events, and a line each is cost without insight.
 */

export type LogLevel = "DEBUG" | "INFO" | "WARNING" | "ERROR";

export interface LogFields {
  /** Correlates every line belonging to one request. */
  requestId?: string;
  /** Short, stable, greppable event name, e.g. "chat.stream.complete". */
  event: string;
  [key: string]: unknown;
}

function emit(severity: LogLevel, fields: LogFields): void {
  const entry = { severity, ...fields };
  const line = JSON.stringify(entry);
  if (severity === "ERROR") {
    console.error(line);
  } else if (severity === "WARNING") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const log = {
  debug: (fields: LogFields) => emit("DEBUG", fields),
  info: (fields: LogFields) => emit("INFO", fields),
  warn: (fields: LogFields) => emit("WARNING", fields),
  error: (fields: LogFields) => emit("ERROR", fields),
};

/**
 * Correlation id for one request. Prefers the platform-supplied trace header so
 * app logs line up with Cloud Run's own request logs.
 */
export function requestIdFrom(headers: Headers): string {
  const traceHeader = headers.get("x-cloud-trace-context");
  if (traceHeader) {
    const [trace] = traceHeader.split("/");
    if (trace) return trace;
  }
  const existing = headers.get("x-request-id");
  if (existing) return existing;

  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `req-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
