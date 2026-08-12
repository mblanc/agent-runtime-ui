import { AgentSessionEvent } from "@/types/agent";
import { FormattedSessionThreadMessage } from "./types";
import { formatAgentDisplayName } from "@/lib/utils";

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
    const afterSessions = nameStr.split("/sessions/")[1];
    return afterSessions.split("/")[0];
  }
  const parts = nameStr.split("/");
  return parts[parts.length - 1] || nameStr;
}

export function extractReasoningEngineIdFromResourceName(nameStr: string): string {
  if (!nameStr) return "";
  if (nameStr.includes("/reasoningEngines/")) {
    const after = nameStr.split("/reasoningEngines/")[1];
    return after.split("/")[0];
  }
  const parts = nameStr.split("/");
  return parts[parts.length - 1] || nameStr;
}

export function isLocalSessionId(sessionId?: string): boolean {
  if (!sessionId) return true;
  return sessionId.startsWith("__LOCALID_") || sessionId.startsWith("local-");
}

export function isRootWorkflowOutput(rawEvt?: Record<string, unknown>): boolean {
  if (!rawEvt) return false;

  const config = (rawEvt.config || {}) as Record<string, unknown>;
  const rawEvent = (rawEvt.raw_event || rawEvt.rawEvent || {}) as Record<string, unknown>;

  const nodeInfo = (rawEvt.node_info ||
    rawEvt.nodeInfo ||
    config.node_info ||
    config.nodeInfo ||
    rawEvent.node_info ||
    rawEvent.nodeInfo) as Record<string, unknown> | undefined;

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

  if (
    rawEvt.root_output === true ||
    rawEvt.is_final === true ||
    config.root_output === true ||
    config.is_final === true ||
    rawEvent.root_output === true ||
    rawEvent.is_final === true
  ) {
    return true;
  }

  return false;
}

export function isSubagentNode(rawEvt?: Record<string, unknown>): boolean {
  if (!rawEvt) return false;

  const config = (rawEvt.config || {}) as Record<string, unknown>;
  const rawEvent = (rawEvt.raw_event || rawEvt.rawEvent || {}) as Record<string, unknown>;

  const nodeInfo = (rawEvt.node_info ||
    rawEvt.nodeInfo ||
    config.node_info ||
    config.nodeInfo ||
    rawEvent.node_info ||
    rawEvent.nodeInfo) as Record<string, unknown> | undefined;

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

  if (
    rawEvt.is_subagent === true ||
    config.is_subagent === true ||
    rawEvent.is_subagent === true
  ) {
    return true;
  }

  return false;
}

function getEventToolCalls(evt: AgentSessionEvent) {
  return evt.tool_calls && evt.tool_calls.length > 0
    ? evt.tool_calls
    : evt.tool_call
      ? [evt.tool_call]
      : [];
}

function getEventToolResults(evt: AgentSessionEvent) {
  return evt.tool_results && evt.tool_results.length > 0
    ? evt.tool_results
    : evt.tool_result
      ? [evt.tool_result]
      : [];
}

export function groupTurnSessionEvents(
  rawEvents: unknown[],
  sessionId: string
): AgentSessionEvent[] {
  if (!rawEvents || rawEvents.length === 0) return [];

  const parsedEvents: AgentSessionEvent[] = rawEvents.map((evt, idx) =>
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
        if (turn.assistantEvents[i].content && turn.assistantEvents[i].content.trim()) {
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
    const usedIndices = new Set<number>();
    const usedResultKeys = new Set<string>();
    const processedCallKeys = new Set<string>();

    for (let i = 0; i < intermediateEvents.length; i++) {
      if (usedIndices.has(i)) continue;
      const inter = intermediateEvents[i];

      const author = inter.author || "sub_agent";
      const displayName = formatAgentDisplayName(author);
      const content = inter.content ? inter.content.trim() : "";
      const thought = inter.thought ? inter.thought.trim() : "";

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

    if (finalEvent.thought && finalEvent.thought.trim()) {
      reasoningBlocks.push(finalEvent.thought.trim());
    }

    const unifiedThought =
      reasoningBlocks.length > 0 ? reasoningBlocks.join("\n\n") : undefined;

    const finalEventToolCalls = getEventToolCalls(finalEvent);
    const finalEventToolResults = getEventToolResults(finalEvent);

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
      ...(finalEventToolResults.length > 0 ? { tool_results: finalEventToolResults } : {}),
      ...(finalEvent.tool_call ? { tool_call: finalEvent.tool_call } : {}),
      ...(finalEvent.tool_result ? { tool_result: finalEvent.tool_result } : {}),
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
      hasToolResults
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

  let role: "user" | "assistant" | "model" | "system" = "assistant";
  const authorCandidates = [
    root.author,
    root.role,
    config.author,
    config.role,
    contentObj.role,
    contentObj.author,
    rawEvent.role,
    rawEvent.author,
    root.userQuery ? "user" : null,
    root.user_query ? "user" : null,
    root.modelResponse ? "model" : null,
    root.model_response ? "model" : null,
  ].filter(Boolean) as string[];

  if (
    authorCandidates.some(
      (a) => String(a).toLowerCase() === "user" || String(a).toLowerCase() === "human"
    )
  ) {
    role = "user";
  } else {
    role = "assistant";
  }

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
  const parsedToolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const parsedToolResults: Array<{ name: string; result: Record<string, unknown> }> = [];

  const inspectObject = (obj: unknown) => {
    if (!obj) return;
    const parsedObj = safeParseJson(obj);
    if (!parsedObj) return;

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

            const fnCall = p.functionCall || p.function_call;
            if (fnCall && typeof fnCall === "object") {
              const fn = fnCall as Record<string, unknown>;
              const name = String(fn.name || "agent_tool");
              const args = (fn.args as Record<string, unknown>) || {};
              parsedToolCalls.push({ name, args });
            }
            const fnResp = p.functionResponse || p.function_response;
            if (fnResp && typeof fnResp === "object") {
              const fn = fnResp as Record<string, unknown>;
              const name = String(fn.name || "tool");
              const result = (fn.response as Record<string, unknown>) || {};
              parsedToolResults.push({ name, result });
            }
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

      if (record.function_call || record.functionCall) {
        const fnCall = (record.function_call || record.functionCall) as Record<string, unknown>;
        const name = String(fnCall.name || "tool");
        const args = (fnCall.args as Record<string, unknown>) || {};
        parsedToolCalls.push({ name, args });
      }
      if (record.function_response || record.functionResponse) {
        const fnResp = (record.function_response || record.functionResponse) as Record<string, unknown>;
        const name = String(fnResp.name || "tool");
        const result = (fnResp.response as Record<string, unknown>) || {};
        parsedToolResults.push({ name, result });
      }
      if (Array.isArray(record.tool_calls)) {
        for (const tc of record.tool_calls) {
          if (tc && typeof tc === "object") {
            const t = tc as Record<string, unknown>;
            parsedToolCalls.push({
              name: String(t.name || "tool"),
              args: (t.args as Record<string, unknown>) || {},
            });
          }
        }
      }
      if (record.tool_call && typeof record.tool_call === "object") {
        const t = record.tool_call as Record<string, unknown>;
        parsedToolCalls.push({
          name: String(t.name || "tool"),
          args: (t.args as Record<string, unknown>) || {},
        });
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
    for (const tc of root.tool_calls) {
      if (tc && typeof tc === "object") {
        const t = tc as Record<string, unknown>;
        parsedToolCalls.push({
          name: String(t.name || "tool"),
          args: (t.args as Record<string, unknown>) || {},
        });
      }
    }
  }
  if (root.tool_call && typeof root.tool_call === "object") {
    const t = root.tool_call as Record<string, unknown>;
    parsedToolCalls.push({
      name: String(t.name || "tool"),
      args: (t.args as Record<string, unknown>) || {},
    });
  }
  if (Array.isArray(root.tool_results)) {
    for (const tr of root.tool_results) {
      if (tr && typeof tr === "object") {
        const t = tr as Record<string, unknown>;
        parsedToolResults.push({
          name: String(t.name || "tool"),
          result: (t.result as Record<string, unknown>) || {},
        });
      }
    }
  }
  if (root.tool_result && typeof root.tool_result === "object") {
    const t = root.tool_result as Record<string, unknown>;
    parsedToolResults.push({
      name: String(t.name || "tool"),
      result: (t.result as Record<string, unknown>) || {},
    });
  }

  if (textPieces.length === 0) {
    inspectObject(root);
  }

  const uniqueTextPieces = Array.from(new Set(textPieces));
  const uniqueThoughtPieces = Array.from(new Set(thoughtPieces));

  const uniqueToolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const seenCalls = new Set<string>();
  for (const tc of parsedToolCalls) {
    const key = `${tc.name}:${JSON.stringify(tc.args || {})}`;
    if (!seenCalls.has(key)) {
      seenCalls.add(key);
      uniqueToolCalls.push(tc);
    }
  }

  const uniqueToolResults: Array<{ name: string; result: Record<string, unknown> }> = [];
  const seenResults = new Set<string>();
  for (const tr of parsedToolResults) {
    const key = `${tr.name}:${JSON.stringify(tr.result || {})}`;
    if (!seenResults.has(key)) {
      seenResults.add(key);
      uniqueToolResults.push(tr);
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
    rawEvent: Object.keys(rawEvent).length > 0 ? rawEvent : root,
  };
}
