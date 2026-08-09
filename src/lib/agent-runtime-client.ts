import { GoogleAuth } from "google-auth-library";
import {
  AgentFeedbackRequest,
  AgentFeedbackResponse,
  AgentSession,
  AgentSessionEvent,
  AgentStreamEvent,
  ChatRequestBody,
  DeployedAgent,
  FeedbackType,
  ListAgentsResponse,
} from "@/types/agent";

export const mockAgentsStore: DeployedAgent[] = [
  {
    id: "mock-arch-advisor",
    resourceName:
      "projects/mock-project/locations/us-central1/reasoningEngines/mock-arch-advisor",
    displayName: "ADK Architecture Advisor",
    description:
      "Specialized in cloud architecture patterns, scalability, and security best practices",
    location: "us-central1",
    model: "gemini-2.5-pro",
    isDefault: true,
    createTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    updateTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "mock-code-reviewer",
    resourceName:
      "projects/mock-project/locations/europe-west4/reasoningEngines/mock-code-reviewer",
    displayName: "Code Reviewer & Auditor",
    description:
      "Automated code review, security audits, and style compliance for enterprise repos",
    location: "europe-west4",
    model: "gemini-2.5-flash",
    isDefault: false,
    createTime: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    updateTime: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "mock-cloud-ops",
    resourceName:
      "projects/mock-project/locations/us-central1/reasoningEngines/mock-cloud-ops",
    displayName: "Cloud Ops Assistant",
    description:
      "Infrastructure monitoring, log analysis, and incident triage for GCP environments",
    location: "us-central1",
    model: "gemini-2.5-flash",
    isDefault: false,
    createTime: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString(),
    updateTime: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// In-memory mock store for local development and unit tests
const mockSessionsStore = new Map<string, AgentSession>([
  [
    "1",
    {
      id: "1",
      name: "projects/mock-project/locations/us-central1/reasoningEngines/mock-arch-advisor/sessions/1",
      userId: "test-user",
      title: "ADK Agent Architecture",
      createTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      updateTime: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    },
  ],
  [
    "2",
    {
      id: "2",
      name: "projects/mock-project/locations/us-central1/reasoningEngines/mock-arch-advisor/sessions/2",
      userId: "test-user",
      title: "Architecture Review",
      createTime: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
      updateTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    },
  ],
  [
    "3",
    {
      id: "3",
      name: "projects/mock-project/locations/europe-west4/reasoningEngines/mock-code-reviewer/sessions/3",
      userId: "test-user",
      title: "PR #42 Security Audit",
      createTime: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      updateTime: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
    },
  ],
  [
    "4",
    {
      id: "4",
      name: "projects/mock-project/locations/us-central1/reasoningEngines/mock-cloud-ops/sessions/4",
      userId: "test-user",
      title: "GKE Cluster High Memory Alert",
      createTime: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
      updateTime: new Date(Date.now() - 7 * 60 * 60 * 1000).toISOString(),
    },
  ],
]);

const mockSessionEventsStore = new Map<string, AgentSessionEvent[]>([
  [
    "1",
    [
      {
        id: "evt-1-1",
        sessionId: "1",
        role: "user",
        content: "What is the recommended architecture for a multi-agent ADK system?",
        createTime: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "evt-1-2",
        sessionId: "1",
        role: "assistant",
        content:
          "In Google Cloud ADK, we recommend structuring agents using Vertex AI Reasoning Engines with hierarchical subagents and stateless BFF proxy orchestration.",
        thought:
          "Analyzing Google ADK multi-agent architecture guidelines and best practices...",
        createTime: new Date(Date.now() - 2 * 60 * 60 * 1000 + 5000).toISOString(),
      },
    ],
  ],
  [
    "2",
    [
      {
        id: "evt-2-1",
        sessionId: "2",
        role: "user",
        content: "Review the cloud run container security configurations.",
        createTime: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "evt-2-2",
        sessionId: "2",
        role: "assistant",
        content:
          "Container security review completed: Non-root execution enabled, read-only root filesystem configured, and minimal IAM permissions verified.",
        createTime: new Date(Date.now() - 26 * 60 * 60 * 1000 + 4000).toISOString(),
      },
    ],
  ],
  [
    "3",
    [
      {
        id: "evt-3-1",
        sessionId: "3",
        role: "user",
        content:
          "Please audit the authentication middleware PR #42 for potential vulnerabilities.",
        createTime: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "evt-3-2",
        sessionId: "3",
        role: "assistant",
        content:
          "Security audit of PR #42 completed. Found 0 critical issues and 1 suggestion regarding token expiration handling.",
        thought: "Reviewing AST, checking JWT verification and timing attack vectors...",
        createTime: new Date(Date.now() - 5 * 60 * 60 * 1000 + 4000).toISOString(),
      },
    ],
  ],
  [
    "4",
    [
      {
        id: "evt-4-1",
        sessionId: "4",
        role: "user",
        content:
          "Check why nodes in us-central1-a are experiencing high memory pressure.",
        createTime: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
      },
      {
        id: "evt-4-2",
        sessionId: "4",
        role: "assistant",
        content:
          "Identified a memory leak in the metrics-collector daemonset causing buffer bloat. Recommend restarting the pod and updating resource limits.",
        thought:
          "Querying Cloud Monitoring metrics and node daemonset memory consumption logs...",
        createTime: new Date(Date.now() - 8 * 60 * 60 * 1000 + 3500).toISOString(),
      },
    ],
  ],
]);

function safeParseJson(val: unknown): unknown {
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

import { formatAgentDisplayName } from "@/lib/utils";
export { formatAgentDisplayName };

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

  // Group events into turns bounded by user prompts
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

    // If only 1 assistant event, pass through directly
    if (turn.assistantEvents.length === 1) {
      result.push(turn.assistantEvents[0]);
      continue;
    }

    // Multiple assistant/model events in the turn: Determine final response agent vs intermediate sub-agents
    let finalIdx = turn.assistantEvents.findIndex((e) =>
      isRootWorkflowOutput(e.rawEvent)
    );

    // Fallback if no explicit graph root output marker: pick terminal event with non-empty content
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

    // Process intermediate events in chronological order
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

        // Structured markdown tag representation for reasoning accordion
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

        // Look for matching result in subsequent intermediate events
        let matchedResultStr: string | undefined;
        for (let j = i + 1; j < intermediateEvents.length; j++) {
          const nextResults = getEventToolResults(intermediateEvents[j]);

          const resIdx = nextResults.findIndex(
            (r, idx) => r.name === toolName && !usedResultKeys.has(`${j}-${idx}`)
          );
          if (resIdx !== -1) {
            usedResultKeys.add(`${j}-${resIdx}`);
            matchedResultStr = JSON.stringify(nextResults[resIdx].result || {}, null, 2);
            break;
          }
        }

        if (matchedResultStr !== undefined) {
          reasoningBlocks.push(
            `:::tool[${toolName}]{status="complete"}\n**Arguments:**\n\`\`\`json\n${argsStr}\n\`\`\`\n**Result:**\n\`\`\`json\n${matchedResultStr}\n\`\`\`\n:::`
          );
        } else {
          reasoningBlocks.push(
            `:::tool[${toolName}]{status="complete"}\n**Arguments:**\n\`\`\`json\n${argsStr}\n\`\`\`\n:::`
          );
        }
      }

      if (calls.length === 0 && results.length > 0) {
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
    }

    // Include any thought from the final event itself
    if (finalEvent.thought && finalEvent.thought.trim()) {
      reasoningBlocks.push(finalEvent.thought.trim());
    }

    const unifiedThought =
      reasoningBlocks.length > 0 ? reasoningBlocks.join("\n\n") : undefined;

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
      rawEvent: finalEvent.rawEvent,
    });
  }

  return result;
}

export interface FormattedSessionThreadMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content:
    string | Array<{ type: "reasoning"; text: string } | { type: "text"; text: string }>;
  createdAt?: string;
}

/**
 * Converts unified AgentSessionEvent entries into standardized thread message structures
 * for assistant-ui history loading.
 */
export function formatSessionEventsToThreadMessages(
  events: AgentSessionEvent[]
): FormattedSessionThreadMessage[] {
  const threadMessages: FormattedSessionThreadMessage[] = [];
  let accumulatedThoughts: string[] = [];

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const content = (e.content || "").trim();
    const thought = (e.thought || "").trim();

    if (thought) {
      accumulatedThoughts.push(thought);
    }

    // User turn
    if (e.role === "user") {
      if (content) {
        threadMessages.push({
          id: e.id || `msg-${i}`,
          role: "user",
          content,
          createdAt: e.createTime,
        });
      }
      continue;
    }

    // Assistant turn with content
    if (content) {
      const parts: Array<
        { type: "reasoning"; text: string } | { type: "text"; text: string }
      > = [];

      if (accumulatedThoughts.length > 0) {
        parts.push({
          type: "reasoning",
          text: accumulatedThoughts.join("\n\n"),
        });
        accumulatedThoughts = [];
      }

      parts.push({ type: "text", text: content });

      threadMessages.push({
        id: e.id || `msg-${i}`,
        role: "assistant",
        content: parts,
        createdAt: e.createTime,
      });
    }
  }

  if (accumulatedThoughts.length > 0) {
    threadMessages.push({
      id: "msg-trailing-reasoning",
      role: "assistant",
      content: [
        {
          type: "reasoning",
          text: accumulatedThoughts.join("\n\n"),
        },
      ],
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

  // Unpack common GCP Agent Platform wrappers (config, content, raw_event)
  const config = (safeParseJson(root.config) || {}) as Record<string, unknown>;
  const rawEvent = (safeParseJson(
    root.raw_event || root.rawEvent || config.raw_event || config.rawEvent
  ) || {}) as Record<string, unknown>;
  const contentObj = (safeParseJson(root.content || config.content) || {}) as Record<
    string,
    unknown
  >;

  // Determine author / role
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

      // Check parts array (Gemini standard)
      if (Array.isArray(record.parts)) {
        for (const part of record.parts) {
          if (typeof part === "string") {
            textPieces.push(part);
          } else if (part && typeof part === "object") {
            const p = part as Record<string, unknown>;
            if (typeof p.thought === "string" && p.thought.trim()) {
              thoughtPieces.push(p.thought.trim());
            }
            if (typeof p.text === "string" && p.text.trim()) {
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

      // Check specific text fields
      if (typeof record.text === "string" && record.text.trim()) {
        textPieces.push(record.text.trim());
      }
      if (typeof record.thought === "string" && record.thought.trim()) {
        thoughtPieces.push(record.thought.trim());
      }
      if (typeof record.query === "string" && record.query.trim()) {
        textPieces.push(record.query.trim());
      }
      if (typeof record.response === "string" && record.response.trim()) {
        textPieces.push(record.response.trim());
      }
    }
  };

  // Inspect config.content, config.raw_event, raw_event, contentObj, userQuery, modelResponse, root
  if (config.content) inspectObject(config.content);
  if (config.raw_event || config.rawEvent)
    inspectObject(config.raw_event || config.rawEvent);
  if (root.content && root.content !== config.content) inspectObject(root.content);
  if (root.raw_event || root.rawEvent) inspectObject(root.raw_event || root.rawEvent);
  if (root.userQuery || root.user_query) inspectObject(root.userQuery || root.user_query);
  if (root.modelResponse || root.model_response)
    inspectObject(root.modelResponse || root.model_response);

  // If textPieces is still empty, inspect the entire root object
  if (textPieces.length === 0) {
    inspectObject(root);
  }

  const uniqueTextPieces = Array.from(new Set(textPieces));
  const uniqueThoughtPieces = Array.from(new Set(thoughtPieces));

  const content = uniqueTextPieces.join("\n").trim();
  const thought =
    uniqueThoughtPieces.length > 0 ? uniqueThoughtPieces.join("\n").trim() : undefined;

  // Extract ID from resource name or id
  const nameStr = (root.name as string) || "";
  const parts = nameStr.split("/");
  const id =
    (root.id as string) || parts[parts.length - 1] || `event-${sessionId}-${fallbackIdx}`;

  // Extract timestamp
  const createTime =
    (root.timestamp as string) ||
    (root.createTime as string) ||
    (root.create_time as string) ||
    (config.timestamp as string) ||
    new Date().toISOString();

  const finalRole =
    parsedToolCalls.length > 0 || parsedToolResults.length > 0 ? "assistant" : role;

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
    ...(parsedToolCalls.length > 0 ? { tool_calls: parsedToolCalls } : {}),
    ...(parsedToolResults.length > 0 ? { tool_results: parsedToolResults } : {}),
    ...(parsedToolCalls.length > 0 ? { tool_call: parsedToolCalls[0] } : {}),
    ...(parsedToolResults.length > 0 ? { tool_result: parsedToolResults[0] } : {}),
    rawEvent: Object.keys(rawEvent).length > 0 ? rawEvent : root,
  };
}

export class AgentRuntimeClient {
  private auth: GoogleAuth;
  private projectId: string;
  private location: string;
  private reasoningEngineId: string;
  private isMock: boolean;

  constructor(overrideEngineId?: string, overrideLocation?: string) {
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT || "";
    this.location =
      overrideLocation || process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
    this.reasoningEngineId =
      overrideEngineId || process.env.GOOGLE_REASONING_ENGINE_ID || "";

    // Automatically sync location and projectId from full resource name if provided
    if (this.reasoningEngineId.startsWith("projects/")) {
      const match = this.reasoningEngineId.match(
        /^projects\/([^/]+)\/locations\/([^/]+)\/reasoningEngines\/([^/]+)$/
      );
      if (match) {
        if (match[1]) this.projectId = match[1];
        if (match[2]) this.location = match[2];
      }
    }

    // Auto-sync location if a mock agent ID was passed
    const matchingMockAgent = mockAgentsStore.find(
      (a) => a.id === this.reasoningEngineId
    );
    if (matchingMockAgent) {
      this.location = matchingMockAgent.location;
    }

    this.isMock =
      process.env.MOCK_AGENT_RUNTIME === "true" ||
      !this.projectId ||
      !this.reasoningEngineId;

    this.auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    });
  }

  private async getAccessToken(): Promise<string> {
    const client = await this.auth.getClient();
    const tokenResponse = await client.getAccessToken();
    if (!tokenResponse.token) {
      throw new Error("Failed to obtain Google Cloud IAM access token");
    }
    return tokenResponse.token;
  }

  private getNormalizedEngineResource(customEngineId?: string): string {
    const targetEngine = customEngineId || this.reasoningEngineId;
    if (targetEngine.startsWith("projects/")) {
      return targetEngine;
    }
    return `projects/${this.projectId}/locations/${this.location}/reasoningEngines/${targetEngine}`;
  }

  private getSessionsBaseUrl(customEngineId?: string): string {
    const targetEngine = customEngineId || this.reasoningEngineId;
    let loc = this.location;
    if (targetEngine.startsWith("projects/")) {
      const match = targetEngine.match(/^projects\/[^/]+\/locations\/([^/]+)\//);
      if (match && match[1]) loc = match[1];
    }
    return `https://${loc}-aiplatform.googleapis.com/v1beta1/${this.getNormalizedEngineResource(targetEngine)}/sessions`;
  }

  private getFeedbackBaseUrl(): string {
    return `https://${this.location}-aiplatform.googleapis.com/v1beta1/${this.getNormalizedEngineResource()}/feedbackEntries`;
  }

  /**
   * Discovers and lists deployed Reasoning Engines across configured locations.
   */
  async listReasoningEngines(locations?: string[]): Promise<ListAgentsResponse> {
    if (this.isMock) {
      const activeAgentId =
        this.reasoningEngineId &&
        mockAgentsStore.some((a) => a.id === this.reasoningEngineId)
          ? this.reasoningEngineId
          : mockAgentsStore[0].id;

      return {
        agents: mockAgentsStore.map((a) => ({
          ...a,
          isDefault: a.id === activeAgentId,
        })),
        activeAgentId,
      };
    }

    try {
      const accessToken = await this.getAccessToken();
      const envLocations = process.env.GOOGLE_CLOUD_LOCATIONS
        ? process.env.GOOGLE_CLOUD_LOCATIONS.split(",")
            .map((l) => l.trim())
            .filter(Boolean)
        : [this.location || "us-central1"];
      const targetLocations =
        locations && locations.length > 0 ? locations : envLocations;

      const fetchLocationEngines = async (loc: string): Promise<DeployedAgent[]> => {
        const url = `https://${loc}-aiplatform.googleapis.com/v1beta1/projects/${this.projectId}/locations/${loc}/reasoningEngines`;
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn(
            `Reasoning Engines query for location ${loc} returned ${response.status}: ${errText}`
          );
          return [];
        }

        const data = await response.json();
        const rawEngines = (data.reasoningEngines || []) as Array<
          Record<string, unknown>
        >;

        return rawEngines.map((raw) => {
          const resourceName = (raw.name as string) || "";
          const id =
            extractReasoningEngineIdFromResourceName(resourceName) || resourceName;
          const displayName =
            (raw.displayName as string) ||
            (raw.display_name as string) ||
            formatAgentDisplayName(id) ||
            `Agent ${id.substring(0, 8)}`;
          const description = (raw.description as string) || undefined;
          const createTime =
            (raw.createTime as string) || (raw.create_time as string) || undefined;
          const updateTime =
            (raw.updateTime as string) || (raw.update_time as string) || undefined;
          const spec = (raw.spec || {}) as Record<string, unknown>;
          const model = (spec.model as string) || (raw.model as string) || undefined;

          return {
            id,
            resourceName,
            displayName,
            description,
            location: loc,
            createTime,
            updateTime,
            model,
          };
        });
      };

      const results = await Promise.allSettled(
        targetLocations.map((loc) => fetchLocationEngines(loc))
      );

      const engines: DeployedAgent[] = [];
      for (const res of results) {
        if (res.status === "fulfilled") {
          engines.push(...res.value);
        }
      }

      if (engines.length === 0) {
        const configuredId = this.reasoningEngineId || "default-agent";
        engines.push({
          id: configuredId,
          resourceName: this.getNormalizedEngineResource(),
          displayName: formatAgentDisplayName(configuredId) || "Deployed Agent",
          description: "Primary Vertex AI Reasoning Engine",
          location: this.location || "us-central1",
          isDefault: true,
        });
      }

      const defaultEngineId =
        this.reasoningEngineId ||
        process.env.GOOGLE_REASONING_ENGINE_ID ||
        engines[0]?.id;
      const activeAgent =
        engines.find(
          (e) => e.id === defaultEngineId || e.resourceName === defaultEngineId
        ) || engines[0];
      const activeAgentId = activeAgent?.id || engines[0]?.id;

      return {
        agents: engines.map((e) => ({
          ...e,
          isDefault: e.id === activeAgentId,
        })),
        activeAgentId,
      };
    } catch (err: unknown) {
      console.error("Error listing reasoning engines from Vertex AI:", err);
      throw err;
    }
  }

  /**
   * Retrieves past conversation sessions for the authenticated user.
   * Supports both Google sub ID and email filters, scoped by reasoningEngineId.
   */
  async listSessions(
    userId: string,
    userEmail?: string,
    reasoningEngineId?: string
  ): Promise<AgentSession[]> {
    const targetEngine = reasoningEngineId
      ? extractReasoningEngineIdFromResourceName(reasoningEngineId)
      : this.reasoningEngineId
        ? extractReasoningEngineIdFromResourceName(this.reasoningEngineId)
        : "";

    if (this.isMock) {
      return Array.from(mockSessionsStore.values())
        .filter((s) => {
          const matchesUser =
            s.userId === userId ||
            (userEmail && s.userId === userEmail) ||
            userId === "test-user" ||
            s.userId === "mock-user";
          if (!matchesUser) return false;

          if (targetEngine) {
            const sessionEngine = extractReasoningEngineIdFromResourceName(s.name);
            if (targetEngine === sessionEngine) {
              return true;
            }

            const isDefaultSession =
              sessionEngine === "mock-arch-advisor" || sessionEngine === "mock-engine";
            const isDefaultTarget =
              targetEngine === "mock-arch-advisor" ||
              targetEngine === "mock-engine" ||
              !mockAgentsStore.some((a) => a.id === targetEngine);

            return isDefaultSession && isDefaultTarget;
          }

          return true;
        })
        .sort(
          (a, b) => new Date(b.updateTime).getTime() - new Date(a.updateTime).getTime()
        );
    }

    try {
      const accessToken = await this.getAccessToken();

      const fetchSessionsByFilter = async (filterVal: string) => {
        const url = new URL(this.getSessionsBaseUrl(reasoningEngineId));
        if (filterVal) {
          url.searchParams.set("filter", `user_id="${filterVal}"`);
        }
        const response = await fetch(url.toString(), {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          const errText = await response.text();
          console.warn(
            `Sessions query for filter ${filterVal} returned ${response.status}: ${errText}`
          );
          return [];
        }

        const data = await response.json();
        return (data.sessions || []) as Array<Record<string, unknown>>;
      };

      let rawSessions = await fetchSessionsByFilter(userId);

      // If no sessions found with sub ID and userEmail is provided, check userEmail as well
      if (rawSessions.length === 0 && userEmail && userEmail !== userId) {
        const emailSessions = await fetchSessionsByFilter(userEmail);
        if (emailSessions.length > 0) {
          rawSessions = emailSessions;
        }
      }

      const mappedSessions: AgentSession[] = rawSessions.map((raw) => {
        const sessionObj = ((raw.response as Record<string, unknown>) || raw) as Record<
          string,
          unknown
        >;
        const nameStr = (sessionObj.name as string) || (raw.name as string) || "";
        const id = extractSessionIdFromResourceName(nameStr) || String(Math.random());
        const rawTitle =
          (sessionObj.displayName as string) ||
          (raw.displayName as string) ||
          (sessionObj.title as string) ||
          (raw.title as string);
        const displayName =
          rawTitle &&
          rawTitle !== "New conversation" &&
          rawTitle !== "Untitled chat" &&
          !/^Chat [a-zA-Z0-9_-]+$/i.test(rawTitle)
            ? rawTitle
            : `Chat ${id.substring(0, 8)}`;

        return {
          id,
          name: nameStr,
          userId:
            (sessionObj.userId as string) ||
            (raw.userId as string) ||
            (raw.user_id as string) ||
            userId,
          title: displayName,
          createTime:
            (sessionObj.createTime as string) ||
            (raw.createTime as string) ||
            new Date().toISOString(),
          updateTime:
            (sessionObj.updateTime as string) ||
            (raw.updateTime as string) ||
            new Date().toISOString(),
          expireTime: (sessionObj.expireTime as string) || (raw.expireTime as string),
        };
      });

      return mappedSessions;
    } catch (err: unknown) {
      console.error("Error listing sessions from Agent Runtime:", err);
      throw err;
    }
  }

  /**
   * Creates a new conversation session on Agent Runtime.
   */
  async createSession(
    userId: string,
    title?: string,
    reasoningEngineId?: string
  ): Promise<AgentSession> {
    const targetEngine =
      reasoningEngineId || this.reasoningEngineId || "mock-arch-advisor";
    const normalizedEngine = extractReasoningEngineIdFromResourceName(targetEngine);

    if (this.isMock) {
      const id = `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date().toISOString();
      const mockAgent = mockAgentsStore.find((a) => a.id === normalizedEngine);
      const loc = mockAgent?.location || this.location || "us-central1";

      const newSession: AgentSession = {
        id,
        name: `projects/mock-project/locations/${loc}/reasoningEngines/${normalizedEngine}/sessions/${id}`,
        userId,
        title: title || "New conversation",
        createTime: now,
        updateTime: now,
      };
      mockSessionsStore.set(id, newSession);
      mockSessionEventsStore.set(id, []);
      return newSession;
    }

    try {
      const accessToken = await this.getAccessToken();
      const response = await fetch(this.getSessionsBaseUrl(reasoningEngineId), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          user_id: userId,
          ...(title ? { displayName: title } : {}),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to create session (${response.status}): ${errText}`);
      }

      const raw = (await response.json()) as Record<string, unknown>;
      const sessionObj = ((raw.response as Record<string, unknown>) || raw) as Record<
        string,
        unknown
      >;
      const nameStr = (sessionObj.name as string) || (raw.name as string) || "";
      const id = extractSessionIdFromResourceName(nameStr) || `session-${Date.now()}`;

      return {
        id,
        name: nameStr,
        userId,
        title:
          (sessionObj.displayName as string) ||
          (raw.displayName as string) ||
          title ||
          "New conversation",
        createTime:
          (sessionObj.createTime as string) ||
          (raw.createTime as string) ||
          new Date().toISOString(),
        updateTime:
          (sessionObj.updateTime as string) ||
          (raw.updateTime as string) ||
          new Date().toISOString(),
        expireTime: (sessionObj.expireTime as string) || (raw.expireTime as string),
      };
    } catch (err: unknown) {
      console.error("Error creating session on Agent Runtime:", err);
      throw err;
    }
  }

  private getSessionEndpoint(
    sessionId: string,
    subPath?: string,
    customEngineId?: string,
    customLocation?: string
  ): string {
    if (sessionId.startsWith("projects/")) {
      const match = sessionId.match(
        /^projects\/([^/]+)\/locations\/([^/]+)\/reasoningEngines\/([^/]+)\/sessions\/([^/]+)/
      );
      if (match) {
        const [, proj, loc, engine, sId] = match;
        const base = `https://${loc}-aiplatform.googleapis.com/v1beta1/projects/${proj}/locations/${loc}/reasoningEngines/${engine}/sessions/${encodeURIComponent(sId)}`;
        return subPath ? `${base}/${subPath}` : base;
      }
    }

    const cleanId = extractSessionIdFromResourceName(sessionId);
    const targetEngine = customEngineId || this.reasoningEngineId;
    let loc = customLocation || this.location;
    if (targetEngine.startsWith("projects/")) {
      const match = targetEngine.match(/^projects\/[^/]+\/locations\/([^/]+)\//);
      if (match && match[1]) loc = match[1];
    }
    const base = `https://${loc}-aiplatform.googleapis.com/v1beta1/${this.getNormalizedEngineResource(targetEngine)}/sessions/${encodeURIComponent(cleanId)}`;
    return subPath ? `${base}/${subPath}` : base;
  }

  /**
   * Retrieves a single session by ID.
   */
  async getSession(
    sessionId: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<AgentSession | null> {
    if (isLocalSessionId(sessionId)) {
      return null;
    }

    if (this.isMock) {
      return mockSessionsStore.get(sessionId) || null;
    }

    try {
      const accessToken = await this.getAccessToken();
      const endpoint = this.getSessionEndpoint(
        sessionId,
        undefined,
        customEngineId,
        customLocation
      );
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (
        response.status === 404 &&
        !customEngineId &&
        !sessionId.startsWith("projects/")
      ) {
        // If not found on default engine, search across deployed reasoning engines
        const agentsResult = await this.listReasoningEngines().catch(() => ({
          agents: [],
        }));
        for (const agent of agentsResult.agents) {
          if (agent.id === this.reasoningEngineId) continue;
          try {
            const fallbackEndpoint = this.getSessionEndpoint(
              sessionId,
              undefined,
              agent.resourceName || agent.id,
              agent.location
            );
            const fallbackRes = await fetch(fallbackEndpoint, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            });
            if (fallbackRes.ok) {
              const raw = (await fallbackRes.json()) as Record<string, unknown>;
              const nameStr = (raw.name as string) || "";
              const parts = nameStr.split("/");
              const id = parts[parts.length - 1] || sessionId;
              return {
                id,
                name: nameStr,
                userId: (raw.userId as string) || "",
                title:
                  (raw.displayName as string) ||
                  (raw.title as string) ||
                  `Chat ${id.substring(0, 8)}`,
                createTime: (raw.createTime as string) || new Date().toISOString(),
                updateTime: (raw.updateTime as string) || new Date().toISOString(),
              };
            }
          } catch {
            // try next agent
          }
        }
        return null;
      }

      if (response.status === 404) return null;
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to get session (${response.status}): ${errText}`);
      }

      const raw = (await response.json()) as Record<string, unknown>;
      const nameStr = (raw.name as string) || "";
      const parts = nameStr.split("/");
      const id = parts[parts.length - 1] || sessionId;

      return {
        id,
        name: nameStr,
        userId: (raw.userId as string) || "",
        title:
          (raw.displayName as string) ||
          (raw.title as string) ||
          `Chat ${id.substring(0, 8)}`,
        createTime: (raw.createTime as string) || new Date().toISOString(),
        updateTime: (raw.updateTime as string) || new Date().toISOString(),
      };
    } catch (err: unknown) {
      console.error("Error getting session from Agent Runtime:", err);
      throw err;
    }
  }

  /**
   * Updates the display title for a given session.
   */
  async updateSessionTitle(
    sessionId: string,
    title: string,
    userId?: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<void> {
    if (isLocalSessionId(sessionId)) {
      return;
    }

    if (this.isMock) {
      const existing = mockSessionsStore.get(sessionId);
      if (existing) {
        existing.title = title;
        existing.updateTime = new Date().toISOString();
      }
      return;
    }

    try {
      const accessToken = await this.getAccessToken();
      const endpoint = `${this.getSessionEndpoint(
        sessionId,
        undefined,
        customEngineId,
        customLocation
      )}?updateMask=displayName`;
      const response = await fetch(endpoint, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          displayName: title,
          ...(userId ? { userId, user_id: userId } : {}),
        }),
      });

      if (!response.ok && response.status !== 404) {
        const errText = await response.text();
        console.warn(
          `Could not update session title on Vertex AI (${response.status}): ${errText}`
        );
      }
    } catch (err: unknown) {
      console.warn("Could not update session title on Agent Runtime:", err);
    }
  }

  /**
   * Deletes a session and all its associated events.
   */
  async deleteSession(
    sessionId: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<void> {
    if (isLocalSessionId(sessionId)) {
      return;
    }

    if (this.isMock) {
      mockSessionsStore.delete(sessionId);
      mockSessionEventsStore.delete(sessionId);
      return;
    }

    try {
      const accessToken = await this.getAccessToken();
      const response = await fetch(
        this.getSessionEndpoint(sessionId, undefined, customEngineId, customLocation),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );

      if (!response.ok && response.status !== 404) {
        const errText = await response.text();
        throw new Error(`Failed to delete session (${response.status}): ${errText}`);
      }
    } catch (err: unknown) {
      console.error("Error deleting session on Agent Runtime:", err);
      throw err;
    }
  }

  /**
   * Lists history events for a given session.
   */
  async listSessionEvents(
    sessionId: string,
    customEngineId?: string,
    customLocation?: string
  ): Promise<AgentSessionEvent[]> {
    if (isLocalSessionId(sessionId)) {
      return [];
    }

    if (this.isMock) {
      return mockSessionEventsStore.get(sessionId) || [];
    }

    try {
      const accessToken = await this.getAccessToken();
      const endpoint = this.getSessionEndpoint(
        sessionId,
        "events",
        customEngineId,
        customLocation
      );
      const response = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (
        response.status === 404 &&
        !customEngineId &&
        !sessionId.startsWith("projects/")
      ) {
        // Fallback across deployed engines if not found on primary engine
        const agentsResult = await this.listReasoningEngines().catch(() => ({
          agents: [],
        }));
        for (const agent of agentsResult.agents) {
          if (agent.id === this.reasoningEngineId) continue;
          try {
            const fallbackEndpoint = this.getSessionEndpoint(
              sessionId,
              "events",
              agent.resourceName || agent.id,
              agent.location
            );
            const fallbackRes = await fetch(fallbackEndpoint, {
              headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
              },
            });
            if (fallbackRes.ok) {
              const data = await fallbackRes.json();
              const rawEvents = (
                data.sessionEvents && data.sessionEvents.length > 0
                  ? data.sessionEvents
                  : data.events || []
              ) as Array<Record<string, unknown>>;
              return groupTurnSessionEvents(rawEvents, sessionId);
            }
          } catch {
            // try next agent
          }
        }
        return [];
      }

      if (response.status === 404) return [];
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to list session events (${response.status}): ${errText}`);
      }

      const data = await response.json();
      const rawEvents = (
        data.sessionEvents && data.sessionEvents.length > 0
          ? data.sessionEvents
          : data.events || []
      ) as Array<Record<string, unknown>>;

      return groupTurnSessionEvents(rawEvents, sessionId);
    } catch (err: unknown) {
      console.error("Error listing session events from Agent Runtime:", err);
      throw err;
    }
  }

  /**
   * Submits user feedback to Vertex AI Reasoning Engine Feedback Service.
   */
  async submitFeedback(
    request: AgentFeedbackRequest,
    userId: string
  ): Promise<AgentFeedbackResponse> {
    if (this.isMock) {
      return {
        name: `projects/mock-project/locations/us-central1/reasoningEngines/mock-engine/feedbackEntries/feedback-${Date.now()}`,
        createTime: new Date().toISOString(),
        feedbackType: request.feedbackType,
      };
    }

    try {
      const accessToken = await this.getAccessToken();
      const endpoint = this.getFeedbackBaseUrl();

      const cleanSessionId =
        extractSessionIdFromResourceName(request.sessionId) || request.sessionId;

      const payload = {
        session_id: cleanSessionId,
        ...(request.eventId ? { event_id: request.eventId } : {}),
        feedback_type: request.feedbackType,
        config: {
          ...(request.feedbackText ? { feedback_text: request.feedbackText } : {}),
          ...(request.feedbackLabels && request.feedbackLabels.length > 0
            ? { feedback_labels: request.feedbackLabels }
            : {}),
          user_id: userId,
          source: "Agent Runtime UI",
        },
      };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(
          `Failed to submit feedback to Vertex AI (${response.status}): ${errText}`
        );
      }

      const raw = (await response.json()) as Record<string, unknown>;
      return {
        name:
          (raw.name as string) ||
          `projects/${this.projectId}/locations/${this.location}/reasoningEngines/${this.reasoningEngineId}/feedbackEntries/feedback-${Date.now()}`,
        createTime:
          (raw.createTime as string) ||
          (raw.create_time as string) ||
          new Date().toISOString(),
        feedbackType:
          (raw.feedbackType as FeedbackType) ||
          (raw.feedback_type as FeedbackType) ||
          request.feedbackType,
      };
    } catch (err: unknown) {
      console.error("Error submitting feedback to Agent Runtime:", err);
      throw err;
    }
  }

  /**
   * Dispatches a streaming prompt to Google Cloud Agent Runtime.
   */
  async *streamQuery(
    body: ChatRequestBody,
    userId: string
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    if (this.isMock) {
      yield* this.mockStreamQuery(body);
      return;
    }

    try {
      // Instant zero-latency handshake event for immediate UI feedback
      yield {
        event_type: "thought",
        thought: `Connecting to Agent Runtime (${this.location}) and analyzing prompt...`,
      };

      const accessToken = await this.getAccessToken();

      // Endpoint for Vertex AI Reasoning Engine streamQuery
      const endpoint = `https://${this.location}-aiplatform.googleapis.com/v1/${this.getNormalizedEngineResource()}:streamQuery`;

      const lastUserMsgObj = [...body.messages].reverse().find((m) => m.role === "user");
      const lastUserMessage = lastUserMsgObj?.content || "";
      const fnResponsePart = lastUserMsgObj?.parts?.find(
        (p) => p.function_response || p.functionResponse
      );

      const cleanSessionId =
        body.sessionId && !isLocalSessionId(body.sessionId)
          ? extractSessionIdFromResourceName(body.sessionId)
          : undefined;

      const inputPayload: Record<string, unknown> = {
        message: lastUserMessage,
        user_id: userId,
        ...(cleanSessionId ? { session_id: cleanSessionId } : {}),
      };

      const nonTextParts = lastUserMsgObj?.parts?.filter(
        (p) =>
          p.file_data ||
          p.fileData ||
          p.image ||
          p.file ||
          p.function_response ||
          p.functionResponse ||
          p.function_call ||
          p.functionCall
      );

      if (nonTextParts && nonTextParts.length > 0 && lastUserMsgObj?.parts) {
        inputPayload.parts = lastUserMsgObj.parts.map((p) => {
          if (p.file_data) {
            return {
              file_data: {
                file_uri: p.file_data.file_uri,
                mime_type: p.file_data.mime_type,
              },
            };
          }
          if (p.fileData) {
            return {
              file_data: {
                file_uri: p.fileData.file_uri || p.fileData.fileUri || "",
                mime_type: p.fileData.mime_type || p.fileData.mimeType || "",
              },
            };
          }
          if (p.function_response || p.functionResponse) {
            return {
              function_response: p.function_response || p.functionResponse,
            };
          }
          if (p.function_call || p.functionCall) {
            return {
              function_call: p.function_call || p.functionCall,
            };
          }
          return { text: p.text || "" };
        });
      }

      if (fnResponsePart) {
        const fnResp =
          fnResponsePart.function_response || fnResponsePart.functionResponse;
        inputPayload.function_response = fnResp;
        inputPayload.functionResponse = fnResp;
      }

      // ADK Reasoning Engine contract expects class_method + input
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          class_method: "async_stream_query",
          input: inputPayload,
        }),
      });

      // If streaming is not supported by container (e.g. 404 or 400), fallback to :query
      if (!response.ok) {
        const queryEndpoint = `https://${this.location}-aiplatform.googleapis.com/v1/${this.getNormalizedEngineResource()}:query`;
        const queryResponse = await fetch(queryEndpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            class_method: "query",
            input: inputPayload,
          }),
        });

        if (queryResponse.ok) {
          const result = await queryResponse.json();
          const parsed = extractTextFromQueryOutput(result);

          if (parsed.thoughts.length > 0) {
            yield {
              event_type: "thought",
              thought: parsed.thoughts.join("\n\n"),
            };
          }

          if (parsed.text) {
            yield {
              event_type: "content",
              content: parsed.text,
            };
          }

          yield { event_type: "done" };
          return;
        } else {
          const streamErrText = await response.text().catch(() => "");
          const queryErrText = await queryResponse.text().catch(() => "");
          throw new Error(
            `Agent Runtime error (${queryResponse.status}): ${queryErrText || streamErrText || response.statusText}`
          );
        }
      }

      if (!response.body) {
        throw new Error("Empty response body from Agent Runtime");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(":")) continue;

          const dataStr = trimmed.startsWith("data: ") ? trimmed.slice(6) : trimmed;

          if (dataStr === "[DONE]") {
            yield { event_type: "done" };
            return;
          }

          try {
            const parsed = JSON.parse(dataStr);

            if (parsed.agent_call) {
              yield { event_type: "agent_call", agent_call: parsed.agent_call };
            } else if (parsed.agent_response) {
              yield {
                event_type: "agent_response",
                agent_response: parsed.agent_response,
              };
            } else if (parsed.content?.parts && Array.isArray(parsed.content.parts)) {
              const author =
                (parsed.author as string) ||
                (parsed.content?.author as string) ||
                (parsed.config?.author as string);
              const isSubAgent = isSubagentNode(parsed);

              for (const part of parsed.content.parts) {
                if (part.text) {
                  if (part.thought) {
                    yield { event_type: "thought", thought: part.text };
                  } else if (isSubAgent) {
                    yield {
                      event_type: "agent_response",
                      agent_response: {
                        agent: author || "sub_agent",
                        displayName: formatAgentDisplayName(author),
                        response: part.text,
                      },
                    };
                  } else {
                    yield { event_type: "content", content: part.text, author };
                  }
                }
                const fnCall = part.function_call || part.functionCall;
                if (fnCall) {
                  const name = String(fnCall.name || "");
                  yield {
                    event_type: "tool_call",
                    tool_call: {
                      name,
                      args: fnCall.args,
                    },
                  };
                }
                const fnResp = part.function_response || part.functionResponse;
                if (fnResp) {
                  const name = String(fnResp.name || "");
                  yield {
                    event_type: "tool_result",
                    tool_result: {
                      name,
                      result: (fnResp.response as Record<string, unknown>) || {},
                    },
                  };
                }
              }
            } else if (parsed.text) {
              const author =
                (parsed.author as string) ||
                (parsed.config?.author as string) ||
                (parsed.agent as string);
              const isSubAgent = isSubagentNode(parsed);

              if (isSubAgent) {
                yield {
                  event_type: "agent_response",
                  agent_response: {
                    agent: author || "sub_agent",
                    displayName: formatAgentDisplayName(author),
                    response: parsed.text,
                  },
                };
              } else {
                yield { event_type: "content", content: parsed.text, author };
              }
            } else if (parsed.thought) {
              yield { event_type: "thought", thought: parsed.thought };
            } else if (parsed.function_call || parsed.functionCall) {
              const fnCall = parsed.function_call || parsed.functionCall;
              const name = String(fnCall.name || "");
              yield {
                event_type: "tool_call",
                tool_call: { name, args: fnCall.args },
              };
            } else if (parsed.function_response || parsed.functionResponse) {
              const fnResp = parsed.function_response || parsed.functionResponse;
              const name = String(fnResp.name || "");
              yield {
                event_type: "tool_result",
                tool_result: {
                  name,
                  result: (fnResp.response as Record<string, unknown>) || {},
                },
              };
            } else if (parsed.tool_call) {
              yield { event_type: "tool_call", tool_call: parsed.tool_call };
            } else if (parsed.tool_result) {
              yield { event_type: "tool_result", tool_result: parsed.tool_result };
            } else if (parsed.error_message) {
              yield {
                event_type: "content",
                content: `\n\n*Agent message: ${parsed.error_message}*`,
              };
            }
          } catch {
            yield { event_type: "content", content: dataStr };
          }
        }
      }

      yield { event_type: "done" };
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to stream from Agent Runtime";
      console.error("Agent Runtime stream error:", errorMessage);
      yield {
        event_type: "error",
        error: errorMessage,
      };
    }
  }

  /**
   * Realistic mock streaming generator for local testing.
   */
  private async *mockStreamQuery(
    body: ChatRequestBody
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    const lastUserMsg = [...body.messages].reverse().find((m) => m.role === "user");
    const lastPrompt = lastUserMsg?.content || "Hello";
    const fnResponsePart = lastUserMsg?.parts?.find(
      (p) => p.function_response || p.functionResponse
    );

    // 1. If this is a function response to a prior confirmation request:
    if (fnResponsePart) {
      const fnResp = fnResponsePart.function_response || fnResponsePart.functionResponse;
      const isConfirmed =
        fnResp?.response?.confirmed === true || fnResp?.response?.approved === true;

      yield {
        event_type: "thought",
        thought: `Received human authorization decision: ${isConfirmed ? "APPROVED" : "DECLINED"}. Resuming workflow execution...`,
      };
      await new Promise((r) => setTimeout(r, 80));

      yield {
        event_type: "tool_result",
        tool_result: {
          name: fnResp?.name || "adk_request_confirmation",
          result: fnResp?.response || { confirmed: isConfirmed },
        },
      };
      await new Promise((r) => setTimeout(r, 80));

      const resolutionText = isConfirmed
        ? "Human authorization received: **Approved**. The requested operation was completed successfully on Google Cloud Agent Runtime."
        : "Human authorization received: **Declined**. The operation was safely aborted.";

      const chunks = resolutionText.split(" ");
      for (const chunk of chunks) {
        yield {
          event_type: "content",
          content: chunk + " ",
        };
        await new Promise((r) => setTimeout(r, 15));
      }

      yield { event_type: "done" };
      return;
    }

    // 2. If prompt asks for confirmation or critical action:
    const lowerPrompt = lastPrompt.toLowerCase();
    const isConfirmationTrigger =
      lowerPrompt.includes("confirm") ||
      lowerPrompt.includes("delete") ||
      lowerPrompt.includes("approval") ||
      lowerPrompt.includes("hitl") ||
      lowerPrompt.includes("adk_request_confirmation");

    if (isConfirmationTrigger) {
      yield {
        event_type: "thought",
        thought: `Analyzing action "${lastPrompt}" requiring human authorization...`,
      };
      await new Promise((r) => setTimeout(r, 80));

      yield {
        event_type: "tool_call",
        tool_call: {
          name: "adk_request_confirmation",
          args: {
            prompt: `Do you approve the execution of: "${lastPrompt}"?`,
            action_description: `Authorize execution: ${lastPrompt}`,
          },
          status: "requires-action",
          requires_confirmation: true,
          requires_action: true,
        },
      };

      yield {
        event_type: "content",
        content:
          "This tool operation requires human approval to proceed. Please review and approve or decline above.",
      };

      yield { event_type: "done" };
      return;
    }

    // 3. Check for multimodal attachments
    const fileDataParts = lastUserMsg?.parts?.filter((p) => p.file_data || p.fileData);
    const hasAttachments = fileDataParts && fileDataParts.length > 0;
    const fileUris = hasAttachments
      ? fileDataParts
          .map(
            (p) => p.file_data?.file_uri || p.fileData?.file_uri || p.fileData?.fileUri
          )
          .filter(Boolean)
          .join(", ")
      : "";

    // Simulated thought event
    yield {
      event_type: "thought",
      thought: hasAttachments
        ? `Analyzing prompt "${lastPrompt}" and evaluating multimodal GCS attachment(s): ${fileUris}...`
        : `Analyzing prompt "${lastPrompt}" and evaluating Google Cloud Agent Runtime state...`,
    };
    await new Promise((r) => setTimeout(r, 100));

    // 4. Simulated tool execution
    yield {
      event_type: "tool_call",
      tool_call: {
        name: hasAttachments ? "multimodal_gcs_analyzer" : "agent_runtime_query",
        args: hasAttachments
          ? { project: "gemini-enterprise", prompt: lastPrompt, files: fileUris }
          : { project: "gemini-enterprise", prompt: lastPrompt },
      },
    };
    await new Promise((r) => setTimeout(r, 150));

    // 5. Stream text tokens
    const sampleReply = hasAttachments
      ? `Hello! I have received and analyzed your multimodal attachment(s):\n> \`${fileUris}\`\n\nPrompt: "${lastPrompt}"\n\n### Multimodal Inspection Summary:\n- File payload successfully verified in Google Cloud Storage\n- Multimodal embeddings processed via Vertex AI Reasoning Engine\n- Real-time streaming response active\n\nHow else can I assist you with this file?`
      : `Hello! I am connected to your **ADK Agent** running on **Google Cloud Agent Runtime**.\n\nYou asked:\n> "${lastPrompt}"\n\n### System Capabilities:\n- Real-time streaming token generation\n- Google Cloud Agent Runtime Session Service\n- Collapsible thought process inspection\n- ADK tool invocation rendering\n\nHow else can I assist your team today?`;

    const chunks = sampleReply.split(" ");
    for (const chunk of chunks) {
      yield {
        event_type: "content",
        content: chunk + " ",
      };
      await new Promise((r) => setTimeout(r, 15));
    }

    // Persist to mock store if sessionId is present
    if (body.sessionId && mockSessionsStore.has(body.sessionId)) {
      const existing = mockSessionsStore.get(body.sessionId)!;
      existing.updateTime = new Date().toISOString();
      if (existing.title === "New conversation") {
        existing.title =
          lastPrompt.substring(0, 35) + (lastPrompt.length > 35 ? "..." : "");
      }

      const events = mockSessionEventsStore.get(body.sessionId) || [];
      events.push(
        {
          id: `evt-${Date.now()}-user`,
          sessionId: body.sessionId,
          role: "user",
          content: lastPrompt,
          createTime: new Date().toISOString(),
        },
        {
          id: `evt-${Date.now()}-assistant`,
          sessionId: body.sessionId,
          role: "assistant",
          content: sampleReply,
          thought: `Analyzing prompt "${lastPrompt}"...`,
          createTime: new Date().toISOString(),
        }
      );
      mockSessionEventsStore.set(body.sessionId, events);
    }

    yield { event_type: "done" };
  }
}
