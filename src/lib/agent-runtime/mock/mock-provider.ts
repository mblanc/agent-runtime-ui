import {
  AgentFeedbackRequest,
  AgentFeedbackResponse,
  AgentMemory,
  AgentSession,
  AgentSessionEvent,
  AgentStreamEvent,
  ChatRequestBody,
  GroundingMetadata,
  ListAgentsResponse,
  MemoryRetrievalItem,
  SessionStateMap,
} from "@/types/agent";
import { IAgentRuntimeProvider } from "../types";
import {
  mockAgentsStore,
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

  async *streamQuery(
    body: ChatRequestBody,
    _userId: string
  ): AsyncGenerator<AgentStreamEvent, void, unknown> {
    const lastUserMsg = [...body.messages].reverse().find((m) => m.role === "user");
    const lastPrompt = lastUserMsg?.content || "Hello";
    const fnResponsePart = [...body.messages]
      .reverse()
      .flatMap((m) => m.parts || [])
      .find((p) => p.function_response || p.functionResponse);

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
    // 4. Memory Bank Retrieval: Retrieve relevant memories for the user
    const retrievedMemories = await this.retrieveMemories(_userId, lastPrompt);
    if (retrievedMemories.length > 0) {
      yield {
        event_type: "thought",
        thought: `Retrieved ${retrievedMemories.length} relevant long-term memories from Memory Bank to personalize response.`,
        retrieved_memories: retrievedMemories,
      };
      await new Promise((r) => setTimeout(r, 40));
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
        grounding_metadata: simulatedGroundingMetadata,
        groundingMetadata: simulatedGroundingMetadata,
      };
      await new Promise((r) => setTimeout(r, 60));
    }

    yield {
      event_type: "thought",
      thought: hasAttachments
        ? `Inspecting uploaded multimodal GCS attachments (${fileUris}). Parsing document layout and extracting metadata...`
        : `Decomposing query "${lastPrompt}" and determining agent workflow steps...`,
    };
    await new Promise((r) => setTimeout(r, 80));

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
      await new Promise((r) => setTimeout(r, 60));

      yield {
        event_type: "agent_response",
        agent_response: {
          agent: "cloud_arch_validator",
          displayName: "Cloud Architecture Validator",
          response:
            "Verified against Google Cloud Architecture Framework. Security, reliability, and cost-efficiency dimensions evaluated.",
        },
      };
      await new Promise((r) => setTimeout(r, 60));
    }

    // Streaming content chunks
    const responseText = hasAttachments
      ? `I have successfully analyzed the attached multimodal attachment (\`${fileUris || "file"}\`).\n\n### Document Analysis Summary\n- **Status:** Verified and ingested via Cloud Storage.\n- **Content Assessment:** Document contains structured engineering specifications and architectural requirements.\n- **Recommendation:** Integrate with Google Cloud Agent Runtime using Vertex AI Reasoning Engines.`
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
        invocation_id: invocationId,
        invocationId,
        model_version: modelVersion,
        modelVersion,
        node_info: nodeInfo,
        nodePath: "root_agent@1",
        ...(isLast
          ? {
              usage_metadata: usageMetadata,
              usageMetadata,
              avg_logprobs: avgLogprobs,
              avgLogprobs,
              thought_signature: thoughtSignature,
              thoughtSignature,
              actions: actionsPayload,
              finish_reason: "STOP",
              finishReason: "STOP",
            }
          : {}),
      };
      await new Promise((r) => setTimeout(r, 15));
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
      invocation_id: invocationId,
      invocationId,
      model_version: modelVersion,
      modelVersion,
      usage_metadata: usageMetadata,
      usageMetadata,
      avg_logprobs: avgLogprobs,
      avgLogprobs,
    };
  }
}
