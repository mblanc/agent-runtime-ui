import type { ReasoningTraceEntry } from "@/types/agent";

/**
 * The single producer of the `:::directive[label]{attrs}` reasoning DSL that
 * `components/assistant-ui/reasoning.tsx` regex-parses back into blocks.
 *
 * The DSL is now the *fallback* representation. The trace travels as
 * `ReasoningTraceEntry[]` and the renderer reads that when it has it; this
 * module renders the same entries to the string form, which is still needed for
 * two reasons: sessions persisted before the structured field existed carry
 * only the string, and the presence of a `reasoning` content part — whose only
 * payload is text — is what makes assistant-ui group and show the panel.
 *
 * There used to be two producers: the live stream in `adapters/chat-adapter.ts`
 * and the session-history replay in `group-turns.ts`. They emitted the same
 * blocks from the same model-supplied values, but only the streaming one
 * sanitized them, so a conversation that rendered correctly live came back
 * corrupted after a reload. Anything that renders this DSL goes through here.
 *
 * Two things coming off the wire can break a block:
 *
 *   - names, which land inside `[...]` and `{...}`, where `]` closes the label
 *     early, `"` escapes an attribute value and `:` can start a sibling
 *     directive;
 *   - bodies, where a line beginning with `:::` matches the consumer's
 *     terminator. The consumer's regex is not fence-aware, so being inside a
 *     ```json fence is no protection.
 *
 * Both are neutralised here rather than at the call sites, so a third producer
 * cannot reintroduce the divergence.
 */

/**
 * Strips characters that would break out of a `:::directive[name]{attrs}` block.
 *
 * The blast radius today is garbled UI, but it grows with every directive added,
 * and the cost of closing it is one replace at the single point where names are
 * rendered.
 */
export function sanitizeDirectiveName(name: string): string {
  return (
    name
      .replace(/[[\]{}":]/g, "")
      .replace(/\s+/g, " ")
      .trim() || "tool"
  );
}

/**
 * Attribute values other than names — currently only the event id on replayed
 * subagent blocks. Same escape characters, but an empty value is a legitimate
 * outcome here, where an empty *label* would leave an unnamed block.
 */
function sanitizeAttributeValue(value: string): string {
  return value
    .replace(/[[\]{}":]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Neutralises body lines that would terminate the block early.
 *
 * A zero-width space in front of the colons is enough — the consumer's
 * terminator is anchored on `\n:::`, and the reader sees the line unchanged,
 * which matters because the payload is usually a tool result someone is trying
 * to read. Escaping with a backslash or dropping the line would both show up in
 * the UI. Content without `:::` in it is returned untouched, so ordinary blocks
 * are byte-for-byte what they were before this existed.
 */
function sanitizeDirectiveBody(body: string): string {
  if (!body.includes(":::")) return body;
  return body
    .split("\n")
    .map((line) => (line.startsWith(":::") ? `\u200b${line}` : line))
    .join("\n");
}

function directive(
  kind: "tool" | "subagent",
  label: string,
  attrs: string,
  body: string
): string {
  return `:::${kind}[${sanitizeDirectiveName(label)}]{${attrs}}\n${sanitizeDirectiveBody(
    body.trim()
  )}\n:::`;
}

export interface ToolDirective {
  toolName: string;
  /** Pretty-printed JSON; omitted for a result that arrived without its call. */
  argsJson?: string;
  resultJson?: string;
  status: "running" | "requires-action" | "complete";
}

export function formatToolDirective(entry: ToolDirective): string {
  let body = "";
  if (entry.argsJson) {
    body += `**Arguments:**\n\`\`\`json\n${entry.argsJson}\n\`\`\`\n`;
  }
  if (entry.resultJson !== undefined) {
    body += `**Result:**\n\`\`\`json\n${entry.resultJson}\n\`\`\`\n`;
  }
  return directive("tool", entry.toolName, `status="${entry.status}"`, body);
}

export interface SubagentDirective {
  displayName: string;
  agentName: string;
  status: "running" | "complete";
  /** Pretty-printed JSON input; absent on the history-replay path. */
  input?: string;
  response?: string;
  /**
   * Source event id, emitted only by history replay. `reasoning.tsx` does not
   * read it, but it is the only link from a rendered block back to the event it
   * came from, so it is carried through rather than dropped.
   */
  id?: string;
}

export function formatSubagentDirective(sub: SubagentDirective): string {
  let body = "";
  if (sub.input) {
    body += `**Input:**\n\`\`\`json\n${sub.input}\n\`\`\`\n`;
  }
  if (sub.response) {
    body += sub.input ? `**Response:**\n${sub.response}` : sub.response;
  }

  const attrs =
    `status="${sub.status}" agent="${sanitizeDirectiveName(sub.agentName)}"` +
    (sub.id ? ` id="${sanitizeAttributeValue(sub.id)}"` : "");

  return directive("subagent", sub.displayName, attrs, body);
}

/**
 * Renders a whole trace to the DSL.
 *
 * Both producers call this rather than assembling blocks themselves, so the
 * string and the array can no longer describe different traces: the string is
 * defined as a projection of the array. A thought contributes its text
 * verbatim; empty thoughts contribute nothing, which is why the producers do
 * not emit them either.
 */
export function formatReasoningTrace(entries: readonly ReasoningTraceEntry[]): string {
  const parts: string[] = [];
  for (const entry of entries) {
    if (entry.type === "thought") {
      const trimmed = entry.text.trim();
      if (trimmed) parts.push(trimmed);
    } else if (entry.type === "subagent") {
      parts.push(formatSubagentDirective(entry));
    } else if (entry.type === "code_execution") {
      parts.push(
        `:::code_execution[Python Sandbox]{status="${entry.block.status}"}\n\`\`\`python\n${entry.block.code || ""}\n\`\`\`\n:::`
      );
    } else {
      parts.push(formatToolDirective(entry));
    }
  }
  return parts.join("\n\n");
}
