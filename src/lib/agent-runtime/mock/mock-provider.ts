import {
  A2UIPartData,
  AgentArtifact,
  AgentCodeExecutionBlock,
  AgentFeedbackRequest,
  AgentFeedbackResponse,
  AgentMemory,
  AgentSession,
  AgentSessionEvent,
  AgentStreamEvent,
  ArtifactVersion,
  ChatRequestBody,
  GroundingMetadata,
  ListAgentsResponse,
  MemoryRetrievalItem,
  SessionStateMap,
} from "@/types/agent";
import { IAgentRuntimeProvider } from "../types";
import {
  mockAgentsStore,
  mockArtifactsStore,
  mockSessionsStore,
  mockSessionEventsStore,
  mockMemoriesStore,
  mockSessionStateStore,
} from "./mock-store";
import {
  extractReasoningEngineIdFromResourceName,
  extractSessionIdFromResourceName,
  groupTurnSessionEvents,
  isLocalSessionId,
} from "../event-normalizer";

/**
 * Abort-aware sleep used between mock stream events. A plain setTimeout would
 * make the mock ignore cancellation entirely, so a disconnected client would
 * still see the whole canned generation play out — which would hide exactly the
 * behaviour the real provider is meant to have.
 */
function mockDelay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export class MockAgentRuntimeProvider implements IAgentRuntimeProvider {
  private reasoningEngineId: string;
  private location: string;

  constructor(reasoningEngineId?: string, location?: string) {
    this.reasoningEngineId = reasoningEngineId || "mock-arch-advisor";
    this.location = location || "us-central1";

    const matchingMockAgent = mockAgentsStore.find(
      (a) => a.id === this.reasoningEngineId
    );
    if (matchingMockAgent) {
      this.location = matchingMockAgent.location;
    }
  }

  async listAgents(_locations?: string[]): Promise<ListAgentsResponse> {
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

    return Array.from(mockSessionsStore.values())
      .filter((s) => {
        const matchesUser =
          s.userId === userId ||
          (Boolean(userEmail) && s.userId === userEmail) ||
          ((userId === "test-user" || userId === "mock-user") &&
            (s.userId === "test-user" || s.userId === "mock-user"));
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

  async createSession(
    userId: string,
    title?: string,
    reasoningEngineId?: string
  ): Promise<AgentSession> {
    const targetEngine =
      reasoningEngineId || this.reasoningEngineId || "mock-arch-advisor";
    const normalizedEngine = extractReasoningEngineIdFromResourceName(targetEngine);
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

  async getSession(
    sessionId: string,
    _agentId?: string,
    _location?: string
  ): Promise<AgentSession | null> {
    if (isLocalSessionId(sessionId)) {
      return null;
    }
    const cleanId = extractSessionIdFromResourceName(sessionId);
    return mockSessionsStore.get(cleanId) || null;
  }

  async getSessionState(
    sessionId: string,
    _agentId?: string,
    _location?: string
  ): Promise<SessionStateMap> {
    if (isLocalSessionId(sessionId)) {
      return {};
    }
    const cleanId = extractSessionIdFromResourceName(sessionId);
    const state = mockSessionStateStore.get(cleanId);
    return state ? { ...state } : {};
  }

  async updateSessionState(
    sessionId: string,
    state: SessionStateMap,
    mode: "merge" | "replace" = "merge",
    _agentId?: string,
    _location?: string
  ): Promise<SessionStateMap> {
    if (isLocalSessionId(sessionId)) {
      return state;
    }
    const cleanId = extractSessionIdFromResourceName(sessionId);
    let finalState: SessionStateMap;
    if (mode === "replace") {
      finalState = { ...state };
    } else {
      const existing = mockSessionStateStore.get(cleanId) || {};
      finalState = { ...existing, ...state };
    }

    mockSessionStateStore.set(cleanId, finalState);

    const sess = mockSessionsStore.get(cleanId);
    if (sess) {
      sess.updateTime = new Date().toISOString();
    }

    return finalState;
  }

  async updateSessionTitle(
    sessionId: string,
    title: string,
    userId?: string,
    _agentId?: string,
    _location?: string
  ): Promise<void> {
    const cleanId = extractSessionIdFromResourceName(sessionId);
    const existing = mockSessionsStore.get(cleanId);
    if (existing) {
      existing.title = title;
      existing.updateTime = new Date().toISOString();
    } else {
      mockSessionsStore.set(cleanId, {
        id: cleanId,
        name: `projects/mock-project/locations/${this.location}/reasoningEngines/${this.reasoningEngineId}/sessions/${cleanId}`,
        userId: userId || "test-user",
        title,
        createTime: new Date().toISOString(),
        updateTime: new Date().toISOString(),
      });
    }
  }

  async deleteSession(
    sessionId: string,
    _agentId?: string,
    _location?: string
  ): Promise<void> {
    const cleanId = extractSessionIdFromResourceName(sessionId);
    mockSessionsStore.delete(cleanId);
    mockSessionEventsStore.delete(cleanId);
    mockSessionStateStore.delete(cleanId);
  }

  async listSessionEvents(
    sessionId: string,
    _agentId?: string,
    _location?: string
  ): Promise<AgentSessionEvent[]> {
    const cleanId = extractSessionIdFromResourceName(sessionId);
    const rawEvents = mockSessionEventsStore.get(cleanId) || [];
    return groupTurnSessionEvents(rawEvents, cleanId);
  }

  async submitFeedback(
    request: AgentFeedbackRequest,
    _userId: string
  ): Promise<AgentFeedbackResponse> {
    return {
      name: `projects/mock-project/locations/${this.location}/reasoningEngines/${this.reasoningEngineId}/feedbackEntries/mock-feedback-${Date.now()}`,
      createTime: new Date().toISOString(),
      feedbackType: request.feedbackType,
    };
  }

  async listMemories(
    userId: string,
    topic?: string,
    _agentId?: string,
    _location?: string
  ): Promise<AgentMemory[]> {
    const isMockUser = userId === "test-user" || userId === "mock-user";
    const memories = Array.from(mockMemoriesStore.values()).filter((m) => {
      const matchesUser =
        m.userId === userId ||
        (isMockUser && (m.userId === "test-user" || m.userId === "mock-user"));
      if (!matchesUser) return false;
      if (topic && topic !== "all") {
        return m.topic?.toLowerCase() === topic.toLowerCase();
      }
      return true;
    });

    return memories.sort(
      (a, b) => new Date(b.updateTime).getTime() - new Date(a.updateTime).getTime()
    );
  }

  async createMemory(
    userId: string,
    fact: string,
    topic?: string,
    _agentId?: string,
    _location?: string
  ): Promise<AgentMemory> {
    const id = `mem-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();
    const newMemory: AgentMemory = {
      id,
      userId,
      fact,
      topic: topic || "general",
      confidenceScore: 0.95,
      createTime: now,
      updateTime: now,
    };
    mockMemoriesStore.set(id, newMemory);
    return newMemory;
  }

  async updateMemory(
    userId: string,
    memoryId: string,
    fact: string,
    topic?: string,
    _agentId?: string,
    _location?: string
  ): Promise<AgentMemory> {
    const memory = mockMemoriesStore.get(memoryId);
    if (!memory) {
      throw new Error(`Memory with ID "${memoryId}" not found`);
    }

    const isMockUser = userId === "test-user" || userId === "mock-user";
    const matchesUser =
      memory.userId === userId ||
      (isMockUser && (memory.userId === "test-user" || memory.userId === "mock-user"));

    if (!matchesUser) {
      throw new Error("Unauthorized to update this memory");
    }

    const updated: AgentMemory = {
      ...memory,
      fact: fact || memory.fact,
      topic: topic !== undefined ? topic : memory.topic,
      updateTime: new Date().toISOString(),
    };
    mockMemoriesStore.set(memoryId, updated);
    return updated;
  }

  async deleteMemory(
    userId: string,
    memoryId: string,
    _agentId?: string,
    _location?: string
  ): Promise<void> {
    const memory = mockMemoriesStore.get(memoryId);
    if (!memory) {
      return;
    }

    const isMockUser = userId === "test-user" || userId === "mock-user";
    const matchesUser =
      memory.userId === userId ||
      (isMockUser && (memory.userId === "test-user" || memory.userId === "mock-user"));

    if (!matchesUser) {
      throw new Error("Unauthorized to delete this memory");
    }

    mockMemoriesStore.delete(memoryId);
  }

  async generateMemories(
    userId: string,
    sessionId: string,
    _agentId?: string,
    _location?: string
  ): Promise<AgentMemory[]> {
    const cleanSessionId = extractSessionIdFromResourceName(sessionId);
    const events = mockSessionEventsStore.get(cleanSessionId) || [];
    const generated: AgentMemory[] = [];

    // Extract facts from user/assistant conversation turns
    for (const evt of events) {
      if (evt.role === "user") {
        const text = evt.content.toLowerCase();
        let extractedFact = "";
        let topic: string = "general";

        if (
          text.includes("typescript") ||
          text.includes("bun") ||
          text.includes("react") ||
          text.includes("next.js")
        ) {
          extractedFact = `Prefers modern TypeScript and React/Next.js stack`;
          topic = "coding_preferences";
        } else if (
          text.includes("cloud") ||
          text.includes("vertex") ||
          text.includes("gcp") ||
          text.includes("security")
        ) {
          extractedFact = `Working on cloud infrastructure and security architectures`;
          topic = "enterprise_context";
        }

        if (extractedFact) {
          const id = `mem-gen-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
          const now = new Date().toISOString();
          const mem: AgentMemory = {
            id,
            userId,
            fact: extractedFact,
            topic,
            confidenceScore: 0.92,
            sourceSessionId: cleanSessionId,
            createTime: now,
            updateTime: now,
          };
          mockMemoriesStore.set(id, mem);
          generated.push(mem);
          break;
        }
      }
    }

    if (generated.length === 0) {
      const id = `mem-gen-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      const now = new Date().toISOString();
      const defaultGenerated: AgentMemory = {
        id,
        userId,
        fact: `Discussed technical specifications in session ${cleanSessionId}`,
        topic: "general",
        confidenceScore: 0.85,
        sourceSessionId: cleanSessionId,
        createTime: now,
        updateTime: now,
      };
      mockMemoriesStore.set(id, defaultGenerated);
      generated.push(defaultGenerated);
    }

    return generated;
  }

  async retrieveMemories(
    userId: string,
    query: string,
    _agentId?: string,
    _location?: string
  ): Promise<MemoryRetrievalItem[]> {
    const userMemories = await this.listMemories(userId);
    const lowerQuery = query.toLowerCase();
    const queryWords = lowerQuery.split(/\s+/).filter((w) => w.length > 2);

    const scored: MemoryRetrievalItem[] = [];
    for (const mem of userMemories) {
      const lowerFact = mem.fact.toLowerCase();
      const lowerTopic = (mem.topic || "").toLowerCase();

      let matchCount = 0;
      for (const word of queryWords) {
        if (lowerFact.includes(word) || lowerTopic.includes(word)) {
          matchCount++;
        }
      }

      if (matchCount > 0 || queryWords.length === 0) {
        const relevanceScore = Math.min(0.99, Math.max(0.75, 0.7 + matchCount * 0.1));
        scored.push({
          id: mem.id,
          fact: mem.fact,
          topic: mem.topic,
          relevanceScore: Number(relevanceScore.toFixed(2)),
        });
      }
    }

    if (scored.length === 0 && userMemories.length > 0) {
      // Return top 2 default memories with base relevance
      for (const mem of userMemories.slice(0, 2)) {
        scored.push({
          id: mem.id,
          fact: mem.fact,
          topic: mem.topic,
          relevanceScore: 0.78,
        });
      }
    }

    return scored.sort((a, b) => b.relevanceScore - a.relevanceScore).slice(0, 4);
  }

  async listArtifacts(
    sessionId: string,
    userId: string,
    _agentId?: string,
    _location?: string
  ): Promise<AgentArtifact[]> {
    const cleanSessionId = extractSessionIdFromResourceName(sessionId);
    const sessionArtifacts = mockArtifactsStore.get(cleanSessionId) || [];

    const isMockUser = userId === "test-user" || userId === "mock-user";
    const userScopedArtifacts: AgentArtifact[] = [];
    for (const [sId, arts] of mockArtifactsStore.entries()) {
      if (sId !== cleanSessionId) {
        for (const art of arts) {
          if (
            art.scope === "user" &&
            (art.userId === userId ||
              (isMockUser && (art.userId === "test-user" || art.userId === "mock-user")))
          ) {
            userScopedArtifacts.push(art);
          }
        }
      }
    }

    return [...sessionArtifacts, ...userScopedArtifacts];
  }

  async getArtifact(
    sessionId: string,
    filename: string,
    version?: number,
    userId?: string,
    _agentId?: string,
    _location?: string
  ): Promise<{ artifact: AgentArtifact; selectedVersion: ArtifactVersion } | null> {
    const artifacts = await this.listArtifacts(sessionId, userId || "");
    const cleanFilename = decodeURIComponent(filename);
    const artifact = artifacts.find(
      (a) => a.filename === cleanFilename || a.id === cleanFilename
    );
    if (!artifact) return null;

    const requestedVersion =
      version !== undefined
        ? artifact.versions.find((v) => v.version === version)
        : artifact.versions.find((v) => v.version === artifact.currentVersion) ||
          artifact.versions[artifact.versions.length - 1];

    if (!requestedVersion) return null;

    return {
      artifact,
      selectedVersion: requestedVersion,
    };
  }

  async *streamQuery(
    body: ChatRequestBody,
    _userId: string,
    signal?: AbortSignal
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    const lastUserMsg = [...body.messages].reverse().find((m) => m.role === "user");
    const lastPrompt = lastUserMsg?.content || "Hello";
    const fnResponsePart = [...body.messages]
      .reverse()
      .flatMap((m) => m.parts || [])
      .find((p) => p.function_response || p.functionResponse);

    const a2uiActionPart = [...body.messages]
      .reverse()
      .flatMap((m) => m.parts || [])
      .find((p) => p.type === "a2ui_action" || p.a2uiAction || p.a2ui_action);

    const a2uiActionFromText = lastPrompt.match(/^\[A2UI_ACTION:(.*?)\]$/);

    // 1. If this is an A2UI action submission:
    if (a2uiActionPart || a2uiActionFromText) {
      let actionPayload: Record<string, unknown> = {};
      let actionEvent = "action";
      let componentId = "";

      if (a2uiActionPart) {
        const act = (a2uiActionPart.a2uiAction ||
          a2uiActionPart.a2ui_action ||
          a2uiActionPart) as Record<string, unknown>;
        actionEvent = String(act.event || "action");
        componentId = String(act.componentId || "");
        actionPayload = (act.payload as Record<string, unknown>) || {};
      } else if (a2uiActionFromText) {
        try {
          const parsed = JSON.parse(a2uiActionFromText[1]);
          actionEvent = parsed.event || "action";
          componentId = parsed.componentId || "";
          actionPayload = parsed.payload || {};
        } catch {
          // fallback
        }
      }

      yield {
        event_type: "thought",
        thought: `Processing A2UI interactive action "${actionEvent}" (component: "${componentId}")...`,
      };
      await mockDelay(80, signal);

      const resolutionText = `Processed interactive A2UI action **${actionEvent}**${componentId ? ` on \`${componentId}\`` : ""}. The requested update was applied with payload:\n\n\`\`\`json\n${JSON.stringify(actionPayload, null, 2)}\n\`\`\``;

      const chunks = resolutionText.split(" ");
      for (const chunk of chunks) {
        yield {
          event_type: "content",
          content: chunk + " ",
        };
        await mockDelay(15, signal);
      }

      yield { event_type: "done" };
      return;
    }

    // 2. If this is a function response to a prior confirmation request:
    if (fnResponsePart) {
      const fnResp = fnResponsePart.function_response || fnResponsePart.functionResponse;
      const isConfirmed =
        fnResp?.response?.confirmed === true || fnResp?.response?.approved === true;

      yield {
        event_type: "thought",
        thought: `Received human authorization decision: ${isConfirmed ? "APPROVED" : "DECLINED"}. Resuming workflow execution...`,
      };
      await mockDelay(80, signal);

      yield {
        event_type: "tool_result",
        tool_result: {
          name: fnResp?.name || "adk_request_confirmation",
          result: fnResp?.response || { confirmed: isConfirmed },
        },
      };
      await mockDelay(80, signal);

      const resolutionText = isConfirmed
        ? "Human authorization received: **Approved**. The requested operation was completed successfully on Google Cloud Agent Runtime."
        : "Human authorization received: **Declined**. The operation was safely aborted.";

      const chunks = resolutionText.split(" ");
      for (const chunk of chunks) {
        yield {
          event_type: "content",
          content: chunk + " ",
        };
        await mockDelay(15, signal);
      }

      yield { event_type: "done" };
      return;
    }

    // 3. If prompt asks for confirmation or critical action:
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
      await mockDelay(80, signal);

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

    // 4. If prompt requests A2UI generative micro-UI:
    const isA2UITrigger =
      lowerPrompt.includes("a2ui") ||
      lowerPrompt.includes("micro-ui") ||
      lowerPrompt.includes("generative ui") ||
      lowerPrompt.includes("cluster status") ||
      lowerPrompt.includes("status card") ||
      lowerPrompt.includes("deploy form") ||
      lowerPrompt.includes("scale cluster");

    if (isA2UITrigger) {
      yield {
        event_type: "thought",
        thought: `Generating interactive A2UI micro-component tree for query "${lastPrompt}"...`,
      };
      await mockDelay(80, signal);

      const sampleA2UI: A2UIPartData = {
        version: "0.8",
        root: {
          type: "Card",
          props: {
            title: "Google Cloud Agent Runtime - Cluster Status",
            status: "Operational",
            statusVariant: "success",
            icon: "⚡",
          },
          children: [
            {
              type: "Heading",
              props: { level: 2 },
              children: "Cluster europe-west1-prod",
            },
            {
              type: "Text",
              children: "All Reasoning Engine instances and session workers are healthy.",
            },
            {
              type: "StatMetric",
              props: {
                label: "Active Invocations",
                value: "2,840",
                unit: "req/s",
                change: "+14%",
                changeType: "increase",
              },
            },
            {
              type: "ProgressBar",
              props: {
                label: "Memory Utilization",
                value: 68,
                variant: "primary",
              },
            },
            {
              type: "Table",
              props: {
                caption: "Active Reasoning Engine Instances",
                headers: ["Service", "Zone", "Instances", "Status"],
                rows: [
                  ["agent-runtime-gateway", "europe-west1-b", "6", "Ready"],
                  ["session-state-service", "europe-west1-c", "4", "Ready"],
                  ["citation-rag-service", "europe-west1-b", "2", "Ready"],
                ],
              },
            },
            {
              type: "Form",
              id: "scale_cluster_form",
              actions: [
                {
                  event: "scale_cluster",
                  payload: { cluster: "europe-west1-prod" },
                },
              ],
              children: [
                {
                  type: "TextInput",
                  props: {
                    name: "targetReplicas",
                    label: "Scale Replicas",
                    defaultValue: "8",
                    placeholder: "Enter target instance count...",
                  },
                },
                {
                  type: "SelectDropdown",
                  props: {
                    name: "trafficStrategy",
                    label: "Traffic Strategy",
                    defaultValue: "canary",
                    options: [
                      { label: "Canary (10% gradual)", value: "canary" },
                      { label: "Blue-Green Instant", value: "blue_green" },
                      { label: "Rolling Update", value: "rolling" },
                    ],
                  },
                },
                {
                  type: "Button",
                  props: {
                    label: "Apply Cluster Scaling",
                    type: "submit",
                    variant: "primary",
                  },
                },
              ],
            },
          ],
        },
      };

      yield {
        event_type: "a2ui",
        a2ui: sampleA2UI,
      };
      await mockDelay(60, signal);

      const explanation =
        "Here is the interactive cluster dashboard. You can inspect live metrics or submit scaling operations directly using the form below.";
      const chunks = explanation.split(" ");
      for (const chunk of chunks) {
        yield {
          event_type: "content",
          content: chunk + " ",
        };
        await mockDelay(15, signal);
      }

      yield { event_type: "done" };
      return;
    }

    // 5. Check for multimodal attachments
    const fileDataParts = lastUserMsg?.parts?.filter((p) => p.file_data || p.fileData);
    const hasAttachments = Boolean(fileDataParts && fileDataParts.length > 0);
    const fileUris = hasAttachments
      ? fileDataParts!
          .map(
            (p) => p.file_data?.file_uri || p.fileData?.file_uri || p.fileData?.fileUri
          )
          .filter(Boolean)
          .join(", ")
      : "";

    // 6. If prompt requests skill loading or references skill registry:
    const isSkillTrigger =
      lowerPrompt.includes("skill") ||
      lowerPrompt.includes("skills") ||
      lowerPrompt.includes("registry") ||
      lowerPrompt.includes("bigquery optimization") ||
      lowerPrompt.includes("bigquery-analyzer") ||
      lowerPrompt.includes("load_skill");

    if (isSkillTrigger && !hasAttachments && !isConfirmationTrigger && !isA2UITrigger) {
      yield {
        event_type: "thought",
        thought: `Analyzing request "${lastPrompt}" and searching Google Cloud Skill Registry for specialized skills...`,
      };
      await mockDelay(60, signal);

      yield {
        event_type: "tool_call",
        tool_call: {
          id: "call_search_skills_1",
          name: "search_skills",
          args: {
            query: "bigquery optimization",
          },
          status: "complete",
        },
      };
      await mockDelay(60, signal);

      yield {
        event_type: "tool_result",
        tool_result: {
          id: "call_search_skills_1",
          name: "search_skills",
          result: {
            matches: [
              {
                skill_name: "bigquery-analyzer",
                description:
                  "Optimizes and audits BigQuery SQL queries, slot usage, and partition filters.",
                version: "2.1.0",
              },
            ],
          },
        },
      };
      await mockDelay(60, signal);

      yield {
        event_type: "thought",
        thought: `Mounting remote skill "bigquery-analyzer" (v2.1.0) to load query optimization tools and guidelines...`,
      };
      await mockDelay(60, signal);

      yield {
        event_type: "tool_call",
        tool_call: {
          id: "call_load_skill_1",
          name: "load_skill",
          args: {
            skill_name: "bigquery-analyzer",
            version: "2.1.0",
          },
          status: "complete",
        },
      };
      await mockDelay(80, signal);

      yield {
        event_type: "tool_result",
        tool_result: {
          id: "call_load_skill_1",
          name: "load_skill",
          result: {
            name: "bigquery-analyzer",
            version: "2.1.0",
            description:
              "Optimizes and audits BigQuery SQL queries, slot usage, and partition filters.",
            author: "Google Cloud",
            license: "Apache-2.0",
            tools: ["bigquery_exec", "explain_sql", "estimate_cost"],
            instructions_snippet:
              "Always verify partition pruning on DATE or TIMESTAMP columns before executing full table scans.",
          },
        },
      };
      await mockDelay(80, signal);

      yield {
        event_type: "thought",
        thought: `Skill "bigquery-analyzer" mounted successfully. Tools unlocked: [bigquery_exec, explain_sql, estimate_cost]. Optimizing target query...`,
      };
      await mockDelay(60, signal);

      const skillResponse =
        `I have loaded the **BigQuery Analyzer** skill (v2.1.0) from the Google Cloud Skill Registry.\n\n` +
        `### Unlocked Capabilities\n` +
        `- **Tools:** \`bigquery_exec\`, \`explain_sql\`, \`estimate_cost\`\n` +
        `- **Optimization Rule:** Partition filter verified against date column \`event_date\`.\n\n` +
        `\`\`\`sql\n` +
        `-- Optimized BigQuery Query with Partition Pruning\n` +
        `SELECT\n` +
        `  user_id,\n` +
        `  COUNT(event_id) AS total_events,\n` +
        `  SUM(revenue_usd) AS total_revenue\n` +
        `FROM \`my-gcp-project.analytics.events_partitioned\`\n` +
        `WHERE event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)\n` +
        `GROUP BY user_id\n` +
        `ORDER BY total_revenue DESC\n` +
        `LIMIT 100;\n` +
        `\`\`\``;

      const chunks = skillResponse.split(" ");
      for (const chunk of chunks) {
        yield {
          event_type: "content",
          content: chunk + " ",
        };
        await mockDelay(15, signal);
      }

      yield { event_type: "done" };
      return;
    }

    // Simulated thought event
    // 4. Memory Bank Retrieval: Retrieve relevant memories for the user
    const retrievedMemories = await this.retrieveMemories(_userId, lastPrompt);
    if (retrievedMemories.length > 0) {
      yield {
        event_type: "thought",
        thought: `Retrieved ${retrievedMemories.length} relevant long-term memories from Memory Bank to personalize response.`,
        retrieved_memories: retrievedMemories,
      };
      await mockDelay(40, signal);
    }

    // 5. Google Search & Enterprise RAG Grounding: Simulate for search/specs/docs queries
    const lowerPromptForGrounding = lastPrompt.toLowerCase();
    const isGroundingTrigger =
      lowerPromptForGrounding.includes("ground") ||
      lowerPromptForGrounding.includes("citation") ||
      lowerPromptForGrounding.includes("spec") ||
      lowerPromptForGrounding.includes("search") ||
      lowerPromptForGrounding.includes("rag") ||
      lowerPromptForGrounding.includes("doc") ||
      lowerPromptForGrounding.includes("vertex") ||
      lowerPromptForGrounding.includes("cloud");

    let simulatedGroundingMetadata: GroundingMetadata | undefined;

    if (isGroundingTrigger && !hasAttachments) {
      simulatedGroundingMetadata = {
        webSearchQueries: [
          lastPrompt,
          "Vertex AI Agent Runtime specs & Private Service Connect",
        ],
        groundingChunks: [
          {
            web: {
              uri: "https://cloud.google.com/vertex-ai/docs/reasoning-engine/overview",
              title: "Vertex AI Agent Runtime Architecture & Overview",
              domain: "cloud.google.com",
            },
          },
          {
            web: {
              uri: "https://docs.cloud.google.com/gemini-enterprise-agent-platform/scale",
              title: "Sub-Second Cold Starts & Autoscaling Specifications",
              domain: "docs.cloud.google.com",
            },
          },
          {
            retrievedContext: {
              uri: "gs://corp-bucket/arch/agent-runtime-design.pdf",
              title: "Agent Runtime Security & Infrastructure Design",
              text: "Vertex AI Agent Runtime provides managed scaling, stateless session persistence, and enterprise security boundaries with sub-second cold starts.",
              ragCorpusId: "enterprise-kb-us",
              confidenceScore: 0.96,
            },
          },
        ],
        groundingSupports: [
          {
            groundingChunkIndices: [0],
            confidenceScores: [0.98],
            segment: {
              startIndex: 0,
              endIndex: 85,
              text: "Vertex AI Agent Runtime provides managed auto-scaling and native session persistence",
            },
          },
          {
            groundingChunkIndices: [1],
            confidenceScores: [0.95],
            segment: {
              startIndex: 86,
              endIndex: 165,
              text: "It supports sub-second cold starts and private VPC connectivity",
            },
          },
          {
            groundingChunkIndices: [2],
            confidenceScores: [0.96],
            segment: {
              startIndex: 166,
              endIndex: 260,
              text: "Verified against Google Cloud Architecture Framework policies",
            },
          },
        ],
        searchEntryPoint: {
          renderedContent: `<div class="google-search-suggestion" style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:16px;background:rgba(26,115,232,0.08);border:1px solid rgba(26,115,232,0.18);font-size:12px;color:#1a73e8;text-decoration:none;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg><span>Search: <strong>Vertex AI Agent Runtime</strong></span></div>`,
        },
      };

      yield {
        event_type: "thought",
        thought: `Grounding response with Google Search ("${lastPrompt}") and Enterprise RAG Vector Search (corpus: enterprise-kb-us). Found 3 authoritative sources.`,
        groundingMetadata: simulatedGroundingMetadata,
      };
      await mockDelay(60, signal);
    }

    let simulatedArtifactFilename: string | undefined;

    // 6. Python Code Execution Sandbox: Simulate for code/math/plot/fibonacci/weather queries
    const isWeatherPrompt =
      lowerPrompt.includes("weather") ||
      lowerPrompt.includes("marseille") ||
      lowerPrompt.includes("meteo");

    const isCodeExecutionTrigger =
      lowerPrompt.includes("code") ||
      lowerPrompt.includes("python") ||
      lowerPrompt.includes("calculate") ||
      lowerPrompt.includes("fibonacci") ||
      lowerPrompt.includes("plot") ||
      lowerPrompt.includes("chart") ||
      lowerPrompt.includes("graph") ||
      lowerPrompt.includes("sandbox") ||
      lowerPrompt.includes("execute") ||
      isWeatherPrompt;

    let simulatedCodeBlocks: AgentCodeExecutionBlock[] | undefined;

    if (isCodeExecutionTrigger && !hasAttachments) {
      const isPlotting =
        lowerPrompt.includes("plot") ||
        lowerPrompt.includes("chart") ||
        lowerPrompt.includes("graph") ||
        isWeatherPrompt;
      const dummyPlotBase64 =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      const codeToRun = isWeatherPrompt
        ? `import matplotlib.pyplot as plt\n\ndays = ['Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']\ntemps = [24, 26, 27, 25, 26, 28]\n\nplt.figure(figsize=(8, 4))\nplt.plot(days, temps, marker='o', color='#1a73e8', linewidth=2.5, label='Temperature (°C)')\nplt.title('Marseille Weather Forecast - Next 6 Days')\nplt.xlabel('Day')\nplt.ylabel('Temperature (°C)')\nplt.grid(True, linestyle='--', alpha=0.6)\nplt.legend()\nplt.tight_layout()\nplt.show()`
        : isPlotting
          ? `import matplotlib.pyplot as plt\nimport numpy as np\n\nx = np.linspace(0, 10, 100)\ny = np.sin(x)\n\nplt.figure(figsize=(8, 4))\nplt.plot(x, y, label='sin(x)', color='#1a73e8')\nplt.title('Trigonometric Waveform')\nplt.xlabel('x')\nplt.ylabel('sin(x)')\nplt.grid(True)\nplt.show()`
          : `def calculate_fibonacci(n: int) -> list[int]:\n    fib = [0, 1]\n    for i in range(2, n):\n        fib.append(fib[i-1] + fib[i-2])\n    return fib[:n]\n\nresult = calculate_fibonacci(10)\nprint(f"Fibonacci Sequence (first 10 terms): {result}")`;

      const outputText = isPlotting
        ? `Plot generated successfully.\n${dummyPlotBase64}`
        : "Fibonacci Sequence (first 10 terms): [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]\n";

      yield {
        event_type: "thought",
        thought: isWeatherPrompt
          ? `Looking up weather forecast for Marseille and executing Python code to plot temperature trends...`
          : `Generating and executing Python code sandbox to solve "${lastPrompt}" in secure Vertex AI environment...`,
      };
      await mockDelay(60, signal);

      yield {
        event_type: "executable_code",
        executable_code: {
          language: "PYTHON",
          code: codeToRun,
        },
      };
      await mockDelay(100, signal);

      yield {
        event_type: "code_execution_result",
        code_execution_result: {
          outcome: "OUTCOME_OK",
          output: outputText,
          durationMs: isPlotting ? 145 : 35,
          generatedImages: isPlotting ? [dummyPlotBase64] : [],
        },
      };
      await mockDelay(60, signal);

      if (isPlotting) {
        simulatedArtifactFilename = isWeatherPrompt
          ? "marseille_weather_forecast.png"
          : "weather_forecast_graph.png";

        yield {
          event_type: "artifact_created",
          artifact: {
            filename: simulatedArtifactFilename,
            title: isWeatherPrompt
              ? "Marseille Weather Forecast Graph"
              : "Weather Forecast Graph",
            mimeType: "image/png",
            version: 0,
            content: dummyPlotBase64,
            isComplete: true,
          },
        };
        await mockDelay(40, signal);
      }

      simulatedCodeBlocks = [
        {
          id: `code-mock-${Date.now()}`,
          language: "PYTHON",
          code: codeToRun,
          status: "complete",
          result: {
            outcome: "OUTCOME_OK",
            output: outputText,
            durationMs: isPlotting ? 145 : 35,
            generatedImages: isPlotting ? [dummyPlotBase64] : [],
          },
        },
      ];
    }

    // 7. Agent Platform Artifacts: Simulate for dashboard/canvas/artifact/html/csv/svg queries
    const isArtifactTrigger =
      lowerPrompt.includes("sales dashboard") ||
      lowerPrompt.includes("artifact") ||
      lowerPrompt.includes("dashboard") ||
      lowerPrompt.includes("canvas") ||
      lowerPrompt.includes("csv") ||
      lowerPrompt.includes("svg") ||
      lowerPrompt.includes("data table");

    if (
      isArtifactTrigger &&
      !hasAttachments &&
      !isConfirmationTrigger &&
      !simulatedCodeBlocks
    ) {
      const isCsv = lowerPrompt.includes("csv") || lowerPrompt.includes("data table");
      const isSvg = lowerPrompt.includes("svg") || lowerPrompt.includes("diagram");

      if (isCsv) {
        simulatedArtifactFilename = "quarterly_revenue.csv";
        yield {
          event_type: "thought",
          thought: `Synthesizing quarterly financial dataset and generating CSV artifact "${simulatedArtifactFilename}"...`,
        };
        await mockDelay(60, signal);

        const csvContent = `Quarter,Region,Product_Line,Target_Revenue_USD,Actual_Revenue_USD,Growth_Pct
Q1-2026,North America,Cloud AI Agents,120000,145000,20.8
Q1-2026,EMEA,Cloud AI Agents,85000,92000,8.2
Q1-2026,APAC,Cloud AI Agents,60000,78000,30.0
Q2-2026,North America,Reasoning Engines,150000,185000,23.3
Q2-2026,EMEA,Reasoning Engines,110000,128000,16.4
Q2-2026,APAC,Reasoning Engines,80000,99000,23.8
Q3-2026,North America,Enterprise Search,90000,105000,16.7
Q3-2026,EMEA,Enterprise Search,75000,82000,9.3`;

        yield {
          event_type: "artifact_created",
          artifact: {
            filename: "quarterly_revenue.csv",
            title: "Q1-Q4 Revenue Breakdown by Product & Region",
            mimeType: "text/csv",
            version: 0,
            content: csvContent,
            isComplete: true,
          },
        };
        await mockDelay(60, signal);
      } else if (isSvg) {
        simulatedArtifactFilename = "system_architecture.svg";
        yield {
          event_type: "thought",
          thought: `Rendering system architecture vector diagram as SVG artifact "${simulatedArtifactFilename}"...`,
        };
        await mockDelay(60, signal);

        const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 400" width="100%" height="100%">
  <defs>
    <linearGradient id="gcpGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1a73e8"/>
      <stop offset="100%" stop-color="#4285f4"/>
    </linearGradient>
    <linearGradient id="bffGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f9d58"/>
      <stop offset="100%" stop-color="#34a853"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#f8f9fa" rx="12"/>
  <text x="400" y="40" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="18" font-weight="bold" fill="#202124">Agent Runtime UI System Architecture</text>
  <rect x="60" y="100" width="200" height="220" rx="10" fill="url(#bffGrad)" opacity="0.9"/>
  <text x="160" y="130" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="16" font-weight="bold" fill="#ffffff">Next.js App Router (BFF)</text>
  <text x="160" y="165" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="#e8f0fe">• Web Crypto JWT Auth</text>
  <text x="160" y="195" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="#e8f0fe">• SSE Streaming Proxy</text>
  <text x="160" y="225" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="#e8f0fe">• Artifacts & Sessions API</text>
  <text x="160" y="255" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="#e8f0fe">• Memory & State Sync</text>
  <line x1="270" y1="210" x2="520" y2="210" stroke="#5f6368" stroke-width="3" stroke-dasharray="6,6"/>
  <polygon points="530,210 515,202 515,218" fill="#5f6368"/>
  <text x="395" y="195" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" font-weight="600" fill="#5f6368">REST / SSE :streamQuery</text>
  <rect x="540" y="100" width="200" height="220" rx="10" fill="url(#gcpGrad)" opacity="0.95"/>
  <text x="640" y="130" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="16" font-weight="bold" fill="#ffffff">Google Cloud Agent Runtime</text>
  <text x="640" y="165" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="#e8f0fe">• Vertex AI Reasoning Engine</text>
  <text x="640" y="195" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="#e8f0fe">• ADK Agent Orchestration</text>
  <text x="640" y="225" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="#e8f0fe">• GCS Artifact Storage</text>
  <text x="640" y="255" text-anchor="middle" font-family="-apple-system, sans-serif" font-size="12" fill="#e8f0fe">• Context Caching Service</text>
</svg>`;

        yield {
          event_type: "artifact_created",
          artifact: {
            filename: "system_architecture.svg",
            title: "Agent Platform Cloud Architecture",
            mimeType: "image/svg+xml",
            version: 0,
            content: svgContent,
            isComplete: true,
          },
        };
        await mockDelay(60, signal);
      } else {
        simulatedArtifactFilename = "sales_dashboard.html";
        yield {
          event_type: "thought",
          thought: `Designing and compiling interactive web application artifact "${simulatedArtifactFilename}" (v0 initial layout)...`,
        };
        await mockDelay(60, signal);

        yield {
          event_type: "artifact_created",
          artifact: {
            filename: "sales_dashboard.html",
            title: "Quarterly Sales Performance Dashboard",
            mimeType: "text/html",
            version: 0,
            content: `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Sales Dashboard</title><style>body{font-family:sans-serif;padding:20px;background:#f8fafc;} .card{background:#fff;padding:20px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1);}</style></head><body><h1>Quarterly Sales Overview</h1><div class="card"><h2>Total: $124,500</h2></div></body></html>`,
            isComplete: false,
          },
        };
        await mockDelay(80, signal);

        yield {
          event_type: "thought",
          thought: `Upgrading artifact "${simulatedArtifactFilename}" to v1: integrating responsive KPI cards and Chart.js telemetry visuals...`,
        };
        await mockDelay(80, signal);

        const v1Html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sales Performance Workspace</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root { --bg: #f8fafc; --card: #ffffff; --text: #0f172a; --text-muted: #64748b; --primary: #2563eb; --accent: #10b981; --border: #e2e8f0; }
    @media (prefers-color-scheme: dark) {
      :root { --bg: #0f172a; --card: #1e293b; --text: #f8fafc; --text-muted: #94a3b8; --primary: #60a5fa; --accent: #34d399; --border: #334155; }
    }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); padding: 24px; margin: 0; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
    .title { font-size: 24px; font-weight: 700; }
    .badge { background: rgba(37,99,235,0.1); color: var(--primary); padding: 4px 12px; border-radius: 9999px; font-size: 13px; font-weight: 600; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .kpi-card { background: var(--card); border: 1px solid var(--border); padding: 20px; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .kpi-label { font-size: 13px; color: var(--text-muted); text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em; }
    .kpi-value { font-size: 32px; font-weight: 800; color: var(--text); margin: 8px 0; }
    .kpi-change { font-size: 13px; color: var(--accent); font-weight: 600; display: flex; align-items: center; gap: 4px; }
    .chart-container { background: var(--card); border: 1px solid var(--border); padding: 24px; border-radius: 16px; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">Enterprise Sales Performance Dashboard</div>
    <div class="badge">Live Sync Active</div>
  </div>
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-label">Quarterly Revenue</div>
      <div class="kpi-value">$154,200</div>
      <div class="kpi-change">↑ +18.4% vs last quarter</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Target Attainment</div>
      <div class="kpi-value">123.5%</div>
      <div class="kpi-change">↑ Exceeded target</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Average Deal Size</div>
      <div class="kpi-value">$14,800</div>
      <div class="kpi-change">↑ +5.2% expansion</div>
    </div>
  </div>
  <div class="chart-container">
    <canvas id="mainChart" height="120"></canvas>
  </div>
  <script>
    const ctx = document.getElementById('mainChart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6'],
        datasets: [{
          label: 'Booked Revenue ($k)',
          data: [18, 42, 68, 95, 128, 154.2],
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37,99,235,0.1)',
          fill: true,
          tension: 0.4
        }]
      },
      options: { responsive: true, plugins: { legend: { position: 'top' } } }
    });
  </script>
</body>
</html>`;

        yield {
          event_type: "artifact_updated",
          artifact: {
            filename: "sales_dashboard.html",
            title: "Quarterly Sales Performance Dashboard",
            mimeType: "text/html",
            version: 1,
            content: v1Html,
            isComplete: true,
          },
        };
        await mockDelay(60, signal);
      }
    }

    yield {
      event_type: "thought",
      thought: hasAttachments
        ? `Inspecting uploaded multimodal GCS attachments (${fileUris}). Parsing document layout and extracting metadata...`
        : `Decomposing query "${lastPrompt}" and determining agent workflow steps...`,
    };
    await mockDelay(80, signal);

    // Simulated subagent trace for Architecture Advisor
    if (this.reasoningEngineId === "mock-arch-advisor" || !this.reasoningEngineId) {
      yield {
        event_type: "agent_call",
        agent_call: {
          agent: "cloud_arch_validator",
          displayName: "Cloud Architecture Validator",
          input: { query: lastPrompt },
        },
      };
      await mockDelay(60, signal);

      yield {
        event_type: "agent_response",
        agent_response: {
          agent: "cloud_arch_validator",
          displayName: "Cloud Architecture Validator",
          response:
            "Verified against Google Cloud Architecture Framework. Security, reliability, and cost-efficiency dimensions evaluated.",
        },
      };
      await mockDelay(60, signal);
    }

    // Streaming content chunks
    const responseText = hasAttachments
      ? `I have successfully analyzed the attached multimodal attachment (\`${fileUris || "file"}\`).\n\n### Document Analysis Summary\n- **Status:** Verified and ingested via Cloud Storage.\n- **Content Assessment:** Document contains structured engineering specifications and architectural requirements.\n- **Recommendation:** Integrate with Google Cloud Agent Runtime using Vertex AI Reasoning Engines.`
      : isWeatherPrompt
        ? `Here is the weather forecast for Marseille for the next days:\n\n- **Tuesday**: 24°C, Sunny ☀️\n- **Wednesday**: 26°C, Clear ☀️\n- **Thursday**: 27°C, Sunny ☀️\n- **Friday**: 25°C, Partly Cloudy ⛅\n- **Saturday**: 26°C, Sunny ☀️\n- **Sunday**: 28°C, Clear ☀️\n\nI have executed Python code to generate a temperature graph visualizing the forecast above.`
        : simulatedArtifactFilename && !simulatedCodeBlocks
          ? `I have created the interactive workspace artifact **${simulatedArtifactFilename}** [📄 ${simulatedArtifactFilename} • v1]. You can preview the live asset, inspect its code or data, switch versions, and export it using the workspace canvas on the right.`
          : simulatedCodeBlocks
            ? `I have executed the Python script in the secure Vertex AI Code Execution Sandbox.\n\n### Execution Summary\n- **Status:** Successfully executed with zero errors.\n- **Output:** The computation finished and produced clean results.\n- **Sandbox Environment:** Python 3.10 with NumPy, Pandas, and Matplotlib.`
            : simulatedGroundingMetadata
              ? `Vertex AI Agent Runtime provides managed auto-scaling and native session persistence [1]. It supports sub-second cold starts [2] and private VPC connectivity via Private Service Connect [3].\n\n### Architecture Highlights\n1. **Stateless BFF Layer**: Next.js App Router with Web Crypto JWT tokens.\n2. **Reasoning Engine Backend**: Fully managed agent runtime on Google Cloud.\n3. **Enterprise Grounding**: Direct verification against official Google documentation and private corporate knowledge base [1, 3].`
              : `Based on your request regarding **${lastPrompt}**, here is the recommended architecture:\n\n1. **Stateless BFF Layer**: Built using Next.js App Router and Edge/Serverless runtimes with Web Crypto JWT tokens.\n2. **Vertex AI Reasoning Engines**: Managed agent execution environment providing automatic session persistence.\n3. **Google Identity Auth**: Seamless OAuth 2.0 PKCE flow guaranteeing secure enterprise user scoping.\n\n\`\`\`typescript\n// Example: Initializing Vertex AI Agent Runtime Provider\nconst provider = createAgentRuntimeProvider();\nconst response = await provider.streamQuery({ messages }, userId);\n\`\`\``;

    const invocationId = `e-mock-${Math.random().toString(36).substring(2, 9)}`;
    const modelVersion = "gemini-2.5-flash";

    // Simulate Context Caching metrics
    const isCachePrompt =
      lowerPrompt.includes("cache") ||
      lowerPrompt.includes("cached") ||
      lowerPrompt.includes("arch") ||
      lowerPrompt.includes("review") ||
      lowerPrompt.includes("ground") ||
      lowerPrompt.includes("spec") ||
      lowerPrompt.length > 20;

    const cachedTokenCount = isCachePrompt ? 3420 : 0;
    const promptTokenCount = isCachePrompt ? 4200 : 1250;
    const candidatesTokenCount = 380;
    const thoughtsTokenCount = 95;
    const totalTokenCount = promptTokenCount + candidatesTokenCount + thoughtsTokenCount;

    const usageMetadata = {
      prompt_token_count: promptTokenCount,
      candidates_token_count: candidatesTokenCount,
      thoughts_token_count: thoughtsTokenCount,
      cached_content_token_count: cachedTokenCount,
      total_token_count: totalTokenCount,
      traffic_type: "ON_DEMAND",
      promptTokenCount,
      candidatesTokenCount,
      thoughtsTokenCount,
      cachedTokenCount,
      cachedContentTokenCount: cachedTokenCount,
      totalTokenCount,
      trafficType: "ON_DEMAND",
    };
    const avgLogprobs = -0.182;
    const nodeInfo = { path: "root_agent@1" };
    const thoughtSignature = "mock_sig_gemini_2_5_verified_crypto";

    // Simulate ADK Session State Delta mutations
    let simulatedStateDelta: SessionStateMap | undefined;
    const isStateMutationTrigger =
      lowerPrompt.includes("state") ||
      lowerPrompt.includes("staging") ||
      lowerPrompt.includes("cluster") ||
      lowerPrompt.includes("environment") ||
      lowerPrompt.includes("tier") ||
      lowerPrompt.includes("config");

    if (isStateMutationTrigger) {
      if (lowerPrompt.includes("staging")) {
        simulatedStateDelta = {
          environment: "staging",
          target_cluster: "staging-europe-west1",
          deployment_status: "pending_approval",
        };
      } else if (lowerPrompt.includes("prod")) {
        simulatedStateDelta = {
          environment: "production",
          target_cluster: "prod-europe-west1",
          deployment_status: "active",
        };
      } else {
        simulatedStateDelta = {
          active_tier: "enterprise",
          last_action: "session_state_inspection",
          sync_enabled: true,
        };
      }
    }

    const actionsPayload = simulatedStateDelta
      ? { state_delta: simulatedStateDelta }
      : { state_delta: { current_step: 1 } };

    const chunks = responseText.split(" ");
    for (let idx = 0; idx < chunks.length; idx++) {
      const chunk = chunks[idx];
      const isLast = idx === chunks.length - 1;
      yield {
        event_type: "content",
        content: chunk + " ",
        // The mock never goes through `parseSseStream`, so it is on its honour
        // to emit what the parser would: normalised camelCase, and an `eventId`
        // that falls back to the invocation id exactly as `extractEventId`
        // does — that id is what the feedback control submits against.
        eventId: invocationId,
        invocationId,
        modelVersion,
        nodeInfo,
        nodePath: "root_agent@1",
        ...(isLast
          ? {
              usageMetadata,
              avgLogprobs,
              thoughtSignature,
              actions: actionsPayload,
              finishReason: "STOP",
            }
          : {}),
      };
      await mockDelay(15, signal);
    }

    // Persist to in-memory mock history if sessionId provided
    if (body.sessionId && !isLocalSessionId(body.sessionId)) {
      const cleanId = extractSessionIdFromResourceName(body.sessionId);
      if (simulatedStateDelta) {
        const currState = mockSessionStateStore.get(cleanId) || {};
        mockSessionStateStore.set(cleanId, {
          ...currState,
          ...simulatedStateDelta,
        });
      }
      if (simulatedArtifactFilename) {
        const arts = mockArtifactsStore.get(cleanId) || [];
        if (!arts.some((a) => a.filename === simulatedArtifactFilename)) {
          const dummyPlotBase64 =
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
          arts.push({
            id: simulatedArtifactFilename,
            sessionId: cleanId,
            userId: _userId,
            filename: simulatedArtifactFilename,
            title: isWeatherPrompt
              ? "Marseille Weather Forecast Graph"
              : "Weather Forecast Graph",
            mimeType: simulatedArtifactFilename.endsWith(".svg")
              ? "image/svg+xml"
              : simulatedArtifactFilename.endsWith(".html")
                ? "text/html"
                : simulatedArtifactFilename.endsWith(".csv")
                  ? "text/csv"
                  : "image/png",
            scope: "session",
            currentVersion: 0,
            versions: [
              {
                version: 0,
                content: dummyPlotBase64,
                mimeType: "image/png",
                sizeBytes: dummyPlotBase64.length,
                createTime: new Date().toISOString(),
              },
            ],
            createTime: new Date().toISOString(),
            updateTime: new Date().toISOString(),
          });
          mockArtifactsStore.set(cleanId, arts);
        }
      }

      const events = mockSessionEventsStore.get(cleanId) || [];
      events.push(
        {
          id: `evt-${Date.now()}-user`,
          sessionId: cleanId,
          role: "user",
          content: lastPrompt,
          createTime: new Date().toISOString(),
        },
        {
          id: `evt-${Date.now()}-assistant`,
          sessionId: cleanId,
          role: "assistant",
          content: responseText,
          thought: hasAttachments
            ? `Inspecting uploaded multimodal GCS attachments (${fileUris})...`
            : `Decomposing query "${lastPrompt}"...`,
          thoughtSignature,
          thought_signature: thoughtSignature,
          groundingMetadata: simulatedGroundingMetadata,
          grounding_metadata: simulatedGroundingMetadata,
          ...(simulatedArtifactFilename
            ? {
                artifacts: [
                  {
                    filename: simulatedArtifactFilename,
                    title: isWeatherPrompt
                      ? "Marseille Weather Forecast Graph"
                      : "Weather Forecast Graph",
                    mimeType: "image/png",
                    version: 0,
                    content:
                      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                    isComplete: true,
                  },
                ],
              }
            : {}),
          ...(simulatedCodeBlocks
            ? {
                codeExecutionBlocks: simulatedCodeBlocks,
                code_execution_blocks: simulatedCodeBlocks,
              }
            : {}),
          invocationId,
          invocation_id: invocationId,
          modelVersion,
          model_version: modelVersion,
          usageMetadata,
          usage_metadata: usageMetadata,
          avgLogprobs,
          avg_logprobs: avgLogprobs,
          nodeInfo,
          node_info: nodeInfo,
          nodePath: "root_agent@1",
          node_path: "root_agent@1",
          actions: actionsPayload,
          finishReason: "STOP",
          finish_reason: "STOP",
          createTime: new Date(Date.now() + 1000).toISOString(),
        }
      );
      mockSessionEventsStore.set(cleanId, events);

      const sess = mockSessionsStore.get(cleanId);
      if (sess) {
        sess.updateTime = new Date().toISOString();
      }
    }

    yield {
      event_type: "done",
      eventId: invocationId,
      invocationId,
      modelVersion,
      usageMetadata,
      avgLogprobs,
    };
  }
}
