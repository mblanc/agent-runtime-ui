import { AgentSessionEvent } from "@/types/agent";
import { FormattedSessionThreadMessage } from "./types";
import { formatAgentDisplayName } from "@/lib/utils";
import { extractGroundingMetadata } from "@/lib/grounding/citation-parser";

export { formatAgentDisplayName };

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

function getNodeInfo(
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

export function isRootWorkflowOutput(rawEvt?: Record<string, unknown>): boolean {
  if (!rawEvt) return false;

  const config = (rawEvt.config || {}) as Record<string, unknown>;
  const rawEvent = (rawEvt.raw_event || rawEvt.rawEvent || {}) as Record<string, unknown>;
  const nodeInfo = getNodeInfo(rawEvt);

  if (nodeInfo) {
    const path = typeof nodeInfo.path === "string" ? nodeInfo.path : "";
    const outputForRaw = nodeInfo.output_for || nodeInfo.outputFor;
    const outputFor = Array.isArray(outputForRaw) ? (outputForRaw as string[]) : [];

    if (path && outputFor.length > 0) {
      const rootContainer = path.split("/")[0];
      if (outputFor.includes(rootContainer) && path !== rootContainer) {
        return true;
      }
    }
  }

  return Boolean(
    rawEvt.root_output ||
    rawEvt.is_final ||
    config.root_output ||
    config.is_final ||
    rawEvent.root_output ||
    rawEvent.is_final
  );
}

export function isSubagentNode(rawEvt?: Record<string, unknown>): boolean {
  if (!rawEvt) return false;

  const config = (rawEvt.config || {}) as Record<string, unknown>;
  const rawEvent = (rawEvt.raw_event || rawEvt.rawEvent || {}) as Record<string, unknown>;
  const nodeInfo = getNodeInfo(rawEvt);

  if (nodeInfo) {
    const path = typeof nodeInfo.path === "string" ? nodeInfo.path : "";
    const outputForRaw = nodeInfo.output_for || nodeInfo.outputFor;
    const outputFor = Array.isArray(outputForRaw) ? (outputForRaw as string[]) : [];

    if (path && path.includes("/")) {
      const rootContainer = path.split("/")[0];
      if (path !== rootContainer && !outputFor.includes(rootContainer)) {
        return true;
      }
    }
  }

  return Boolean(rawEvt.is_subagent || config.is_subagent || rawEvent.is_subagent);
}

function getEventToolCalls(evt: AgentSessionEvent) {
  return evt.tool_calls?.length ? evt.tool_calls : evt.tool_call ? [evt.tool_call] : [];
}

function getEventToolResults(evt: AgentSessionEvent) {
  return evt.tool_results?.length
    ? evt.tool_results
    : evt.tool_result
      ? [evt.tool_result]
      : [];
}

function extractToolCall(
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

function extractToolResult(
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

export function groupTurnSessionEvents(
  rawEvents: unknown[],
  sessionId: string
): AgentSessionEvent[] {
  if (!rawEvents || rawEvents.length === 0) return [];

  const parsedEvents = rawEvents.map((evt, idx) =>
    parseRawSessionEvent(evt, sessionId, idx)
  );

  const turns: Array<{
    userEvent?: AgentSessionEvent;
    assistantEvents: AgentSessionEvent[];
  }> = [];

  let currentTurn: {
    userEvent?: AgentSessionEvent;
    assistantEvents: AgentSessionEvent[];
  } = { assistantEvents: [] };

  for (const evt of parsedEvents) {
    if (evt.role === "user") {
      if (currentTurn.userEvent || currentTurn.assistantEvents.length > 0) {
        turns.push(currentTurn);
      }
      currentTurn = { userEvent: evt, assistantEvents: [] };
    } else {
      currentTurn.assistantEvents.push(evt);
    }
  }

  if (currentTurn.userEvent || currentTurn.assistantEvents.length > 0) {
    turns.push(currentTurn);
  }

  const result: AgentSessionEvent[] = [];

  for (const turn of turns) {
    if (turn.userEvent) {
      result.push(turn.userEvent);
    }

    if (turn.assistantEvents.length === 0) {
      continue;
    }

    if (turn.assistantEvents.length === 1) {
      result.push(turn.assistantEvents[0]);
      continue;
    }

    let finalIdx = turn.assistantEvents.findIndex((e) =>
      isRootWorkflowOutput(e.rawEvent)
    );

    if (finalIdx === -1) {
      for (let i = turn.assistantEvents.length - 1; i >= 0; i--) {
        if (turn.assistantEvents[i].content?.trim()) {
          finalIdx = i;
          break;
        }
      }
    }

    if (finalIdx === -1) {
      finalIdx = turn.assistantEvents.length - 1;
    }

    const finalEvent = turn.assistantEvents[finalIdx];
    const intermediateEvents = turn.assistantEvents.filter((_, idx) => idx !== finalIdx);

    const reasoningBlocks: string[] = [];
    const subAgentsList = [];
    const usedResultKeys = new Set<string>();
    const processedCallKeys = new Set<string>();

    for (let i = 0; i < intermediateEvents.length; i++) {
      const inter = intermediateEvents[i];
      const author = inter.author || "sub_agent";
      const displayName = formatAgentDisplayName(author);
      const content = inter.content?.trim() || "";
      const thought = inter.thought?.trim() || "";

      if (content) {
        subAgentsList.push({
          id: inter.id,
          agentName: author,
          displayName,
          status: "complete" as const,
          content,
          thought: thought || undefined,
          timestamp: inter.createTime,
        });

        reasoningBlocks.push(
          `:::subagent[${displayName}]{id="${inter.id}" agent="${author}" status="complete"}\n${content}\n:::`
        );
      }

      if (thought) {
        reasoningBlocks.push(thought);
      }

      const calls = getEventToolCalls(inter);
      const results = getEventToolResults(inter);

      for (const call of calls) {
        const toolName = call.name || "tool";
        const argsStr = JSON.stringify(call.args || {}, null, 2);
        const callKey = `${toolName}-${argsStr}`;

        let matchedResultStr: string | undefined;

        // 1. Check if the result is in the same event
        const sameEventResIdx = results.findIndex(
          (r, idx) => r.name === toolName && !usedResultKeys.has(`${i}-${idx}`)
        );
        if (sameEventResIdx !== -1) {
          usedResultKeys.add(`${i}-${sameEventResIdx}`);
          matchedResultStr = JSON.stringify(
            results[sameEventResIdx].result || {},
            null,
            2
          );
        } else {
          // 2. Look ahead in subsequent intermediate events
          for (let j = i + 1; j < intermediateEvents.length; j++) {
            const nextResults = getEventToolResults(intermediateEvents[j]);
            const resIdx = nextResults.findIndex(
              (r, idx) => r.name === toolName && !usedResultKeys.has(`${j}-${idx}`)
            );
            if (resIdx !== -1) {
              usedResultKeys.add(`${j}-${resIdx}`);
              matchedResultStr = JSON.stringify(
                nextResults[resIdx].result || {},
                null,
                2
              );
              break;
            }
          }
        }

        if (matchedResultStr !== undefined) {
          processedCallKeys.add(callKey);
          reasoningBlocks.push(
            `:::tool[${toolName}]{status="complete"}\n**Arguments:**\n\`\`\`json\n${argsStr}\n\`\`\`\n**Result:**\n\`\`\`json\n${matchedResultStr}\n\`\`\`\n:::`
          );
        } else if (!processedCallKeys.has(callKey)) {
          processedCallKeys.add(callKey);
          reasoningBlocks.push(
            `:::tool[${toolName}]{status="complete"}\n**Arguments:**\n\`\`\`json\n${argsStr}\n\`\`\`\n:::`
          );
        }
      }

      for (let resIdx = 0; resIdx < results.length; resIdx++) {
        if (usedResultKeys.has(`${i}-${resIdx}`)) continue;
        const res = results[resIdx];
        const toolName = res.name || "tool";
        const resStr = JSON.stringify(res.result || {}, null, 2);
        reasoningBlocks.push(
          `:::tool[${toolName}]{status="complete"}\n**Result:**\n\`\`\`json\n${resStr}\n\`\`\`\n:::`
        );
      }
    }

    if (finalEvent.thought?.trim()) {
      reasoningBlocks.push(finalEvent.thought.trim());
    }

    const unifiedThought =
      reasoningBlocks.length > 0 ? reasoningBlocks.join("\n\n") : undefined;

    const finalEventToolCalls = getEventToolCalls(finalEvent);
    const finalEventToolResults = getEventToolResults(finalEvent);
    const groundingMeta =
      finalEvent.groundingMetadata ||
      finalEvent.grounding_metadata ||
      extractGroundingMetadata(finalEvent) ||
      turn.assistantEvents
        .map(
          (e) =>
            e.groundingMetadata || e.grounding_metadata || extractGroundingMetadata(e)
        )
        .find(Boolean);

    result.push({
      id: finalEvent.id,
      name: finalEvent.name,
      sessionId,
      createTime: finalEvent.createTime,
      role: "assistant",
      author: finalEvent.author,
      invocationId: finalEvent.invocationId,
      content: finalEvent.content,
      ...(unifiedThought ? { thought: unifiedThought } : {}),
      ...(subAgentsList.length > 0 ? { subAgents: subAgentsList } : {}),
      ...(finalEventToolCalls.length > 0 ? { tool_calls: finalEventToolCalls } : {}),
      ...(finalEventToolResults.length > 0
        ? { tool_results: finalEventToolResults }
        : {}),
      ...(finalEvent.tool_call ? { tool_call: finalEvent.tool_call } : {}),
      ...(finalEvent.tool_result ? { tool_result: finalEvent.tool_result } : {}),
      ...(groundingMeta
        ? { groundingMetadata: groundingMeta, grounding_metadata: groundingMeta }
        : {}),
      rawEvent: finalEvent.rawEvent,
    });
  }

  return result;
}

export function formatSessionEventsToThreadMessages(
  events: AgentSessionEvent[]
): FormattedSessionThreadMessage[] {
  const threadMessages: FormattedSessionThreadMessage[] = [];
  let accumulatedThoughts: string[] = [];

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const content = (e.content || "").trim();
    const thought = (e.thought || "").trim();
    const hasToolCalls = Boolean(
      (e.tool_calls && e.tool_calls.length > 0) || e.tool_call
    );
    const hasToolResults = Boolean(
      (e.tool_results && e.tool_results.length > 0) || e.tool_result
    );
    const groundingMetadata =
      e.groundingMetadata || e.grounding_metadata || extractGroundingMetadata(e);

    if (thought) {
      accumulatedThoughts.push(thought);
    }

    if (e.role === "user") {
      if (content) {
        threadMessages.push({
          id: e.id || `msg-${i}`,
          role: "user",
          content,
          createdAt: e.createTime,
          metadata: {
            custom: {
              ...(e.id ? { eventId: e.id } : {}),
              ...(e.invocationId ? { invocationId: e.invocationId } : {}),
            },
          },
        });
      }
      continue;
    }

    if (
      content ||
      thought ||
      accumulatedThoughts.length > 0 ||
      hasToolCalls ||
      hasToolResults ||
      groundingMetadata
    ) {
      threadMessages.push({
        id: e.id || `msg-${i}`,
        role: "assistant",
        content: content || "",
        createdAt: e.createTime,
        thought:
          accumulatedThoughts.length > 0 ? accumulatedThoughts.join("\n\n") : undefined,
        subAgents: e.subAgents,
        toolCalls: e.tool_calls,
        toolResults: e.tool_results,
        toolCall: e.tool_call,
        toolResult: e.tool_result,
        metadata: {
          custom: {
            ...(e.id ? { eventId: e.id } : {}),
            ...(e.invocationId ? { invocationId: e.invocationId } : {}),
            ...(groundingMetadata ? { groundingMetadata } : {}),
          },
        },
      });
      accumulatedThoughts = [];
    }
  }

  if (accumulatedThoughts.length > 0) {
    threadMessages.push({
      id: "msg-trailing-reasoning",
      role: "assistant",
      content: "",
      thought: accumulatedThoughts.join("\n\n"),
      createdAt: new Date().toISOString(),
    });
  }

  return threadMessages;
}

export function parseRawSessionEvent(
  rawEvt: unknown,
  sessionId: string,
  fallbackIdx: number
): AgentSessionEvent {
  const parsed = safeParseJson(rawEvt);
  const root = (
    parsed && typeof parsed === "object" ? parsed : { content: rawEvt }
  ) as Record<string, unknown>;

  const config = (safeParseJson(root.config) || {}) as Record<string, unknown>;
  const rawEvent = (safeParseJson(
    root.raw_event || root.rawEvent || config.raw_event || config.rawEvent
  ) || {}) as Record<string, unknown>;
  const contentObj = (safeParseJson(root.content || config.content) || {}) as Record<
    string,
    unknown
  >;

  const authorCandidates = [
    root.author,
    root.role,
    config.author,
    config.role,
    contentObj.role,
    contentObj.author,
    rawEvent.role,
    rawEvent.author,
    root.userQuery || root.user_query ? "user" : null,
    root.modelResponse || root.model_response ? "model" : null,
  ].filter(Boolean) as string[];

  const isUser = authorCandidates.some(
    (a) => String(a).toLowerCase() === "user" || String(a).toLowerCase() === "human"
  );
  const role: "user" | "assistant" = isUser ? "user" : "assistant";

  const authorStr =
    (root.author as string) ||
    (config.author as string) ||
    (rawEvent.author as string) ||
    (contentObj.author as string) ||
    undefined;

  const invocationIdStr =
    (root.invocationId as string) ||
    (rawEvent.invocationId as string) ||
    (config.invocationId as string) ||
    undefined;

  const textPieces: string[] = [];
  const thoughtPieces: string[] = [];
  const parsedToolCalls: Array<{
    name: string;
    id?: string;
    args: Record<string, unknown>;
  }> = [];
  const parsedToolResults: Array<{
    name: string;
    id?: string;
    result: Record<string, unknown>;
  }> = [];

  const visitedObjects = new Set<unknown>();

  const inspectObject = (obj: unknown) => {
    if (!obj) return;
    const parsedObj = safeParseJson(obj);
    if (!parsedObj) return;

    if (typeof parsedObj === "object" && parsedObj !== null) {
      if (visitedObjects.has(parsedObj)) return;
      visitedObjects.add(parsedObj);
    }

    if (typeof parsedObj === "string") {
      const trimmed = parsedObj.trim();
      if (trimmed && !trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        textPieces.push(trimmed);
      }
      return;
    }

    if (Array.isArray(parsedObj)) {
      for (const item of parsedObj) {
        inspectObject(item);
      }
      return;
    }

    if (typeof parsedObj === "object") {
      const record = parsedObj as Record<string, unknown>;

      if (Array.isArray(record.parts)) {
        for (const part of record.parts) {
          if (typeof part === "string") {
            textPieces.push(part);
          } else if (part && typeof part === "object") {
            const p = part as Record<string, unknown>;
            const isPartThought =
              p.thought === true ||
              (typeof p.thought === "string" && Boolean(p.thought.trim())) ||
              (p.thought && typeof p.thought === "object");

            if (isPartThought) {
              if (typeof p.thought === "string" && p.thought.trim()) {
                thoughtPieces.push(p.thought.trim());
              } else if (p.thought && typeof p.thought === "object") {
                const t = p.thought as Record<string, unknown>;
                if (typeof t.text === "string" && t.text.trim()) {
                  thoughtPieces.push(t.text.trim());
                }
              } else if (typeof p.text === "string" && p.text.trim()) {
                thoughtPieces.push(p.text.trim());
              }
            } else if (typeof p.text === "string" && p.text.trim()) {
              textPieces.push(p.text.trim());
            }

            const tc = extractToolCall(p.functionCall || p.function_call);
            if (tc) parsedToolCalls.push(tc);

            const tr = extractToolResult(p.functionResponse || p.function_response);
            if (tr) parsedToolResults.push(tr);
          }
        }
        return;
      }

      const isRecordThought =
        record.thought === true ||
        (typeof record.thought === "string" && Boolean(record.thought.trim())) ||
        (record.thought && typeof record.thought === "object") ||
        (typeof record.reasoning === "string" && Boolean(record.reasoning.trim()));

      if (isRecordThought) {
        if (typeof record.thought === "string" && record.thought.trim()) {
          thoughtPieces.push(record.thought.trim());
        } else if (record.thought && typeof record.thought === "object") {
          const t = record.thought as Record<string, unknown>;
          if (typeof t.text === "string" && t.text.trim()) {
            thoughtPieces.push(t.text.trim());
          }
        } else if (typeof record.reasoning === "string" && record.reasoning.trim()) {
          thoughtPieces.push(record.reasoning.trim());
        } else if (typeof record.text === "string" && record.text.trim()) {
          thoughtPieces.push(record.text.trim());
        } else if (typeof record.content === "string" && record.content.trim()) {
          thoughtPieces.push(record.content.trim());
        }
      } else {
        if (typeof record.text === "string" && record.text.trim()) {
          textPieces.push(record.text.trim());
        }
      }

      const tc = extractToolCall(
        record.function_call || record.functionCall || record.tool_call
      );
      if (tc) parsedToolCalls.push(tc);

      const tr = extractToolResult(
        record.function_response || record.functionResponse || record.tool_result
      );
      if (tr) parsedToolResults.push(tr);

      if (Array.isArray(record.tool_calls)) {
        for (const item of record.tool_calls) {
          const extracted = extractToolCall(item);
          if (extracted) parsedToolCalls.push(extracted);
        }
      }

      if (Array.isArray(record.tool_results)) {
        for (const item of record.tool_results) {
          const extracted = extractToolResult(item);
          if (extracted) parsedToolResults.push(extracted);
        }
      }

      if (typeof record.query === "string" && record.query.trim()) {
        textPieces.push(record.query.trim());
      }
      if (typeof record.response === "string" && record.response.trim()) {
        textPieces.push(record.response.trim());
      }
      if (record.actions && typeof record.actions === "object") {
        inspectObject(record.actions);
      }
      if (record.content && record.content !== obj) {
        inspectObject(record.content);
      }
      if (
        (record.raw_event || record.rawEvent) &&
        (record.raw_event || record.rawEvent) !== obj
      ) {
        inspectObject(record.raw_event || record.rawEvent);
      }
    }
  };

  if (config.content) inspectObject(config.content);
  if (config.raw_event || config.rawEvent)
    inspectObject(config.raw_event || config.rawEvent);
  if (root.content && root.content !== config.content) inspectObject(root.content);
  if (root.raw_event || root.rawEvent) inspectObject(root.raw_event || root.rawEvent);
  if (root.userQuery || root.user_query) inspectObject(root.userQuery || root.user_query);
  if (root.modelResponse || root.model_response)
    inspectObject(root.modelResponse || root.model_response);

  if (Array.isArray(root.tool_calls)) {
    for (const item of root.tool_calls) {
      const extracted = extractToolCall(item);
      if (extracted) parsedToolCalls.push(extracted);
    }
  }
  if (root.tool_call) {
    const extracted = extractToolCall(root.tool_call);
    if (extracted) parsedToolCalls.push(extracted);
  }
  if (Array.isArray(root.tool_results)) {
    for (const item of root.tool_results) {
      const extracted = extractToolResult(item);
      if (extracted) parsedToolResults.push(extracted);
    }
  }
  if (root.tool_result) {
    const extracted = extractToolResult(root.tool_result);
    if (extracted) parsedToolResults.push(extracted);
  }

  if (textPieces.length === 0) {
    inspectObject(root);
  }

  const uniqueTextPieces = Array.from(new Set(textPieces));
  const uniqueThoughtPieces = Array.from(new Set(thoughtPieces));

  const uniqueToolCalls: Array<{
    name: string;
    id?: string;
    args: Record<string, unknown>;
  }> = [];
  const seenCalls = new Set<string>();
  for (const call of parsedToolCalls) {
    const key = `${call.name}:${JSON.stringify(call.args || {})}`;
    if (!seenCalls.has(key)) {
      seenCalls.add(key);
      uniqueToolCalls.push(call);
    }
  }

  const uniqueToolResults: Array<{
    name: string;
    id?: string;
    result: Record<string, unknown>;
  }> = [];
  const seenResults = new Set<string>();
  for (const res of parsedToolResults) {
    const key = `${res.name}:${JSON.stringify(res.result || {})}`;
    if (!seenResults.has(key)) {
      seenResults.add(key);
      uniqueToolResults.push(res);
    }
  }

  const content = uniqueTextPieces.join("\n").trim();
  const thought =
    uniqueThoughtPieces.length > 0 ? uniqueThoughtPieces.join("\n").trim() : undefined;

  const nameStr = (root.name as string) || "";
  const parts = nameStr.split("/");
  const id =
    (typeof rawEvent.id === "string" && rawEvent.id ? rawEvent.id : undefined) ||
    (typeof rawEvent.event_id === "string" && rawEvent.event_id
      ? rawEvent.event_id
      : undefined) ||
    (typeof root.id === "string" && root.id ? root.id : undefined) ||
    (typeof root.event_id === "string" && root.event_id ? root.event_id : undefined) ||
    parts[parts.length - 1] ||
    `event-${sessionId}-${fallbackIdx}`;

  const createTime =
    (root.timestamp as string) ||
    (root.createTime as string) ||
    (root.create_time as string) ||
    (config.timestamp as string) ||
    new Date().toISOString();

  const finalRole =
    uniqueToolCalls.length > 0 || uniqueToolResults.length > 0 ? "assistant" : role;

  const groundingMeta = extractGroundingMetadata(
    root.groundingMetadata ||
      root.grounding_metadata ||
      rawEvent.groundingMetadata ||
      rawEvent.grounding_metadata ||
      config.groundingMetadata ||
      config.grounding_metadata ||
      root
  );

  return {
    id,
    name: nameStr || undefined,
    sessionId,
    createTime,
    role: finalRole,
    author: authorStr,
    invocationId: invocationIdStr,
    content,
    ...(thought ? { thought } : {}),
    ...(uniqueToolCalls.length > 0 ? { tool_calls: uniqueToolCalls } : {}),
    ...(uniqueToolResults.length > 0 ? { tool_results: uniqueToolResults } : {}),
    ...(uniqueToolCalls.length > 0 ? { tool_call: uniqueToolCalls[0] } : {}),
    ...(uniqueToolResults.length > 0 ? { tool_result: uniqueToolResults[0] } : {}),
    ...(groundingMeta
      ? { groundingMetadata: groundingMeta, grounding_metadata: groundingMeta }
      : {}),
    rawEvent: Object.keys(rawEvent).length > 0 ? rawEvent : root,
  };
}
