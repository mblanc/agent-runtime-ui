import { AgentSessionEvent } from "@/types/agent";
import { formatAgentDisplayName } from "@/lib/utils";

export { formatAgentDisplayName };

/**
 * Shared helpers for reading untyped Vertex session events.
 *
 * Split out of the 1341-line event-normalizer, which held four independent
 * reasons to change. These are the predicates and accessors the other three
 * modules build on: JSON coercion, resource-name extraction, node/subagent
 * classification, and tool call/result accessors.
 */

export function safeParseJson(val: unknown): unknown {
  if (typeof val !== "string") return val;
  const trimmed = val.trim();
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return val;
    }
  }
  return val;
}

export function extractTextFromQueryOutput(output: unknown): {
  text: string;
  thoughts: string[];
} {
  let text = "";
  const thoughts: string[] = [];

  if (typeof output === "string") {
    return { text: output, thoughts };
  }

  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>;

    if (typeof obj.output === "string") {
      text = obj.output;
    } else if (typeof obj.response === "string") {
      text = obj.response;
    } else if (typeof obj.content === "string") {
      text = obj.content;
    } else if (typeof obj.text === "string") {
      text = obj.text;
    }

    if (Array.isArray(obj.parts)) {
      for (const part of obj.parts) {
        if (typeof part === "string") {
          text += (text ? "\n" : "") + part;
        } else if (part && typeof part === "object") {
          const p = part as Record<string, unknown>;
          if (p.thought) thoughts.push(String(p.thought));
          if (p.text) text += (text ? "\n" : "") + String(p.text);
          if (p.functionCall) {
            const fn = p.functionCall as Record<string, unknown>;
            thoughts.push(`[Tool Executed]: ${fn.name || "tool"}`);
          }
        }
      }
    }

    if (obj.output && typeof obj.output === "object" && !text) {
      const nested = extractTextFromQueryOutput(obj.output);
      text = nested.text;
      thoughts.push(...nested.thoughts);
    }
  }

  return { text: text || (output ? JSON.stringify(output) : ""), thoughts };
}

export function extractSessionIdFromResourceName(nameStr: string): string {
  if (!nameStr) return "";
  if (nameStr.includes("/sessions/")) {
    return nameStr.split("/sessions/")[1].split("/")[0];
  }
  const parts = nameStr.split("/");
  return parts[parts.length - 1] || nameStr;
}

export function extractReasoningEngineIdFromResourceName(nameStr: string): string {
  if (!nameStr) return "";
  if (nameStr.includes("/reasoningEngines/")) {
    return nameStr.split("/reasoningEngines/")[1].split("/")[0];
  }
  const parts = nameStr.split("/");
  return parts[parts.length - 1] || nameStr;
}

export function isLocalSessionId(sessionId?: string): boolean {
  if (!sessionId) return true;
  return sessionId.startsWith("__LOCALID_") || sessionId.startsWith("local-");
}

export function getNodeInfo(
  rawEvt?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!rawEvt) return undefined;
  const config = (rawEvt.config || {}) as Record<string, unknown>;
  const rawEvent = (rawEvt.raw_event || rawEvt.rawEvent || {}) as Record<string, unknown>;

  return (rawEvt.node_info ||
    rawEvt.nodeInfo ||
    config.node_info ||
    config.nodeInfo ||
    rawEvent.node_info ||
    rawEvent.nodeInfo) as Record<string, unknown> | undefined;
}

export function isTargetRootContainer(target: string, rootContainer: string): boolean {
  if (!target) return false;
  if (target.includes("/")) {
    return target === rootContainer;
  }
  const baseTarget = target.split("@")[0];
  const baseRoot = rootContainer.split("@")[0];
  return (
    target === rootContainer ||
    baseTarget === baseRoot ||
    target === "root" ||
    baseTarget === "root" ||
    target === "*" ||
    target === "workflow" ||
    baseTarget === "workflow"
  );
}

export function isRootWorkflowOutput(rawEvt?: Record<string, unknown>): boolean {
  if (!rawEvt) return false;

  const config = (rawEvt.config || {}) as Record<string, unknown>;
  const rawEvent = (rawEvt.raw_event || rawEvt.rawEvent || {}) as Record<string, unknown>;
  const nodeInfo = getNodeInfo(rawEvt);

  if (nodeInfo) {
    const path = typeof nodeInfo.path === "string" ? nodeInfo.path : "";
    const outputForRaw = nodeInfo.output_for || nodeInfo.outputFor;
    const outputFor = Array.isArray(outputForRaw)
      ? (outputForRaw as string[])
      : typeof outputForRaw === "string"
        ? [outputForRaw]
        : [];

    if (path && outputFor.length > 0) {
      const rootContainer = path.split("/")[0];
      const matchesRoot = outputFor.some((target) =>
        isTargetRootContainer(target, rootContainer)
      );

      if (matchesRoot && path !== rootContainer) {
        return true;
      }
    }
  }

  return Boolean(
    rawEvt.root_output ||
    rawEvt.is_final ||
    rawEvt.final_response ||
    config.root_output ||
    config.is_final ||
    config.final_response ||
    rawEvent.root_output ||
    rawEvent.is_final ||
    rawEvent.final_response
  );
}

export function extractSubagentName(rawEvt?: Record<string, unknown>): string {
  if (!rawEvt) return "sub_agent";
  const author =
    (rawEvt.author as string) ||
    (rawEvt.content && typeof rawEvt.content === "object"
      ? ((rawEvt.content as Record<string, unknown>).author as string)
      : undefined) ||
    (rawEvt.config && typeof rawEvt.config === "object"
      ? ((rawEvt.config as Record<string, unknown>).author as string)
      : undefined) ||
    (rawEvt.agent as string);

  const genericAuthors = new Set([
    "agent",
    "sub_agent",
    "subagent",
    "root",
    "workflow",
    "model",
    "assistant",
    "user",
  ]);

  if (author && !genericAuthors.has(author.toLowerCase())) {
    return author;
  }

  const nodeInfo = getNodeInfo(rawEvt);
  if (nodeInfo && typeof nodeInfo.path === "string" && nodeInfo.path.includes("/")) {
    const segments = nodeInfo.path.split("/");
    const leaf = segments[segments.length - 1] || "";
    const cleanLeaf = leaf.split("@")[0];
    if (cleanLeaf && !genericAuthors.has(cleanLeaf.toLowerCase())) {
      return cleanLeaf;
    }
  }

  return author || "sub_agent";
}

export function isSubagentNode(rawEvt?: Record<string, unknown>): boolean {
  if (!rawEvt) return false;

  if (isRootWorkflowOutput(rawEvt)) {
    return false;
  }

  const config = (rawEvt.config || {}) as Record<string, unknown>;
  const rawEvent = (rawEvt.raw_event || rawEvt.rawEvent || {}) as Record<string, unknown>;
  const nodeInfo = getNodeInfo(rawEvt);

  if (nodeInfo) {
    const path = typeof nodeInfo.path === "string" ? nodeInfo.path : "";
    const outputForRaw = nodeInfo.output_for || nodeInfo.outputFor;
    const outputFor = Array.isArray(outputForRaw)
      ? (outputForRaw as string[])
      : typeof outputForRaw === "string"
        ? [outputForRaw]
        : [];

    if (path && path.includes("/")) {
      const rootContainer = path.split("/")[0];
      const matchesRoot = outputFor.some((target) =>
        isTargetRootContainer(target, rootContainer)
      );

      if (path !== rootContainer && !matchesRoot) {
        return true;
      }
    }
  }

  return Boolean(
    rawEvt.is_subagent ||
    config.is_subagent ||
    rawEvent.is_subagent ||
    rawEvt.isSubagent ||
    config.isSubagent ||
    rawEvent.isSubagent
  );
}

export function getEventToolCalls(evt: AgentSessionEvent) {
  return evt.tool_calls?.length ? evt.tool_calls : evt.tool_call ? [evt.tool_call] : [];
}

export function getEventToolResults(evt: AgentSessionEvent) {
  return evt.tool_results?.length
    ? evt.tool_results
    : evt.tool_result
      ? [evt.tool_result]
      : [];
}

export function extractToolCall(
  fn: unknown
): { name: string; id?: string; args: Record<string, unknown> } | null {
  if (!fn || typeof fn !== "object") return null;
  const obj = fn as Record<string, unknown>;
  const name = String(obj.name || "tool");
  const id =
    obj.id || obj.call_id || obj.callId
      ? String(obj.id || obj.call_id || obj.callId)
      : undefined;
  const args = (obj.args as Record<string, unknown>) || {};
  return { name, id, args };
}

export function extractToolResult(
  fn: unknown
): { name: string; id?: string; result: Record<string, unknown> } | null {
  if (!fn || typeof fn !== "object") return null;
  const obj = fn as Record<string, unknown>;
  const name = String(obj.name || "tool");
  const id =
    obj.id || obj.call_id || obj.callId
      ? String(obj.id || obj.call_id || obj.callId)
      : undefined;
  const result =
    (obj.response as Record<string, unknown>) ||
    (obj.result as Record<string, unknown>) ||
    {};
  return { name, id, result };
}
