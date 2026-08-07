import { GoogleAuth } from "google-auth-library";
import {
  AgentSession,
  AgentSessionEvent,
  AgentStreamEvent,
  ChatRequestBody,
} from "@/types/agent";

// In-memory mock store for local development and unit tests
const mockSessionsStore = new Map<string, AgentSession>([
  [
    "1",
    {
      id: "1",
      name: "projects/mock-project/locations/us-central1/reasoningEngines/mock-engine/sessions/1",
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
      name: "projects/mock-project/locations/us-central1/reasoningEngines/mock-engine/sessions/2",
      userId: "test-user",
      title: "Architecture Review",
      createTime: new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString(),
      updateTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
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

export function isLocalSessionId(sessionId?: string): boolean {
  if (!sessionId) return true;
  return sessionId.startsWith("__LOCALID_") || sessionId.startsWith("local-");
}

export function formatAgentDisplayName(authorOrPath?: string): string {
  if (!authorOrPath) return "Assistant";
  const leaf = authorOrPath.split("/").pop() || authorOrPath;
  const clean = leaf.replace(/@\d+$/, "").replace(/[_-]/g, " ").trim();
  return clean.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isRootWorkflowOutput(rawEvt?: Record<string, unknown>): boolean {
  if (!rawEvt) return false;
  const nodeInfo = (rawEvt.nodeInfo ||
    (rawEvt.config as Record<string, unknown>)?.nodeInfo) as
    Record<string, unknown> | undefined;
  if (!nodeInfo) return false;

  const path = typeof nodeInfo.path === "string" ? nodeInfo.path : "";
  const outputFor = Array.isArray(nodeInfo.outputFor)
    ? (nodeInfo.outputFor as string[])
    : [];

  if (!path || outputFor.length === 0) return false;

  const rootContainer = path.split("/")[0];
  // If outputFor contains the root workflow and path is a child node
  return outputFor.includes(rootContainer) && path !== rootContainer;
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
            if (p.functionCall && typeof p.functionCall === "object") {
              const fn = p.functionCall as Record<string, unknown>;
              const name = String(fn.name || "agent_tool");
              const args = (fn.args as Record<string, unknown>) || {};
              parsedToolCalls.push({ name, args });
            }
            if (p.functionResponse && typeof p.functionResponse === "object") {
              const fn = p.functionResponse as Record<string, unknown>;
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

  constructor() {
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT || "";
    this.location = process.env.GOOGLE_CLOUD_LOCATION || "us-central1";
    this.reasoningEngineId = process.env.GOOGLE_REASONING_ENGINE_ID || "";

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

  private getNormalizedEngineResource(): string {
    if (this.reasoningEngineId.startsWith("projects/")) {
      return this.reasoningEngineId;
    }
    return `projects/${this.projectId}/locations/${this.location}/reasoningEngines/${this.reasoningEngineId}`;
  }

  private getSessionsBaseUrl(): string {
    return `https://${this.location}-aiplatform.googleapis.com/v1beta1/${this.getNormalizedEngineResource()}/sessions`;
  }

  /**
   * Retrieves past conversation sessions for the authenticated user.
   * Supports both Google sub ID and email filters.
   */
  async listSessions(userId: string, userEmail?: string): Promise<AgentSession[]> {
    if (this.isMock) {
      return Array.from(mockSessionsStore.values())
        .filter(
          (s) =>
            s.userId === userId ||
            (userEmail && s.userId === userEmail) ||
            userId === "test-user" ||
            s.userId === "mock-user"
        )
        .sort(
          (a, b) => new Date(b.updateTime).getTime() - new Date(a.updateTime).getTime()
        );
    }

    try {
      const accessToken = await this.getAccessToken();

      const fetchSessionsByFilter = async (filterVal: string) => {
        const url = new URL(this.getSessionsBaseUrl());
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
  async createSession(userId: string, title?: string): Promise<AgentSession> {
    if (this.isMock) {
      const id = `session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date().toISOString();
      const newSession: AgentSession = {
        id,
        name: `projects/mock-project/locations/us-central1/reasoningEngines/mock-engine/sessions/${id}`,
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
      const response = await fetch(this.getSessionsBaseUrl(), {
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

  private getSessionEndpoint(sessionId: string, subPath?: string): string {
    const cleanId = extractSessionIdFromResourceName(sessionId);
    const base = `${this.getSessionsBaseUrl()}/${encodeURIComponent(cleanId)}`;
    return subPath ? `${base}/${subPath}` : base;
  }

  /**
   * Retrieves a single session by ID.
   */
  async getSession(sessionId: string): Promise<AgentSession | null> {
    if (isLocalSessionId(sessionId)) {
      return null;
    }

    if (this.isMock) {
      return mockSessionsStore.get(sessionId) || null;
    }

    try {
      const accessToken = await this.getAccessToken();
      const response = await fetch(this.getSessionEndpoint(sessionId), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

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
        title: (raw.displayName as string) || `Chat ${id.substring(0, 8)}`,
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
    userId?: string
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
      const endpoint = `${this.getSessionEndpoint(sessionId)}?updateMask=displayName`;
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
  async deleteSession(sessionId: string): Promise<void> {
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
      const response = await fetch(this.getSessionEndpoint(sessionId), {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

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
  async listSessionEvents(sessionId: string): Promise<AgentSessionEvent[]> {
    if (isLocalSessionId(sessionId)) {
      return [];
    }

    if (this.isMock) {
      return mockSessionEventsStore.get(sessionId) || [];
    }

    try {
      const accessToken = await this.getAccessToken();
      const response = await fetch(this.getSessionEndpoint(sessionId, "events"), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

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

      const lastUserMessage =
        [...body.messages].reverse().find((m) => m.role === "user")?.content || "";

      const cleanSessionId =
        body.sessionId && !isLocalSessionId(body.sessionId)
          ? extractSessionIdFromResourceName(body.sessionId)
          : undefined;

      const inputPayload: Record<string, unknown> = {
        message: lastUserMessage,
        user_id: userId,
        ...(cleanSessionId ? { session_id: cleanSessionId } : {}),
      };

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

            // Handle ADK content.parts event schema
            if (parsed.content?.parts && Array.isArray(parsed.content.parts)) {
              for (const part of parsed.content.parts) {
                if (part.text) {
                  if (part.thought) {
                    yield { event_type: "thought", thought: part.text };
                  } else {
                    yield { event_type: "content", content: part.text };
                  }
                }
                const fnCall = part.function_call || part.functionCall;
                if (fnCall) {
                  yield {
                    event_type: "tool_call",
                    tool_call: {
                      name: fnCall.name,
                      args: fnCall.args,
                    },
                  };
                }
                const fnResp = part.function_response || part.functionResponse;
                if (fnResp) {
                  yield {
                    event_type: "tool_result",
                    tool_result: {
                      name: fnResp.name,
                      result: fnResp.response,
                    },
                  };
                }
              }
            } else if (parsed.text) {
              yield { event_type: "content", content: parsed.text };
            } else if (parsed.thought) {
              yield { event_type: "thought", thought: parsed.thought };
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
    const lastPrompt =
      [...body.messages].reverse().find((m) => m.role === "user")?.content || "Hello";

    // 1. Send simulated thought event
    yield {
      event_type: "thought",
      thought: `Analyzing prompt "${lastPrompt}" and evaluating Google Cloud Agent Runtime state...`,
    };
    await new Promise((r) => setTimeout(r, 100));

    // 2. Send simulated tool execution
    yield {
      event_type: "tool_call",
      tool_call: {
        name: "agent_runtime_query",
        args: { project: "gemini-enterprise", prompt: lastPrompt },
      },
    };
    await new Promise((r) => setTimeout(r, 150));

    // 3. Stream text tokens
    const sampleReply = `Hello! I am connected to your **ADK Agent** running on **Google Cloud Agent Runtime**.\n\nYou asked:\n> "${lastPrompt}"\n\n### System Capabilities:\n- Real-time streaming token generation\n- Google Cloud Agent Runtime Session Service\n- Collapsible thought process inspection\n- ADK tool invocation rendering\n\nHow else can I assist your team today?`;

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
