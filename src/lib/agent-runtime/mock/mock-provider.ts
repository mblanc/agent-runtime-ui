import {
  AgentFeedbackRequest,
  AgentFeedbackResponse,
  AgentSession,
  AgentSessionEvent,
  AgentStreamEvent,
  ChatRequestBody,
  ListAgentsResponse,
} from "@/types/agent";
import { IAgentRuntimeProvider } from "../types";
import { mockAgentsStore, mockSessionsStore, mockSessionEventsStore } from "./mock-store";
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

  async *streamQuery(
    body: ChatRequestBody,
    _userId: string
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
      : `Based on your request regarding **${lastPrompt}**, here is the recommended architecture:\n\n1. **Stateless BFF Layer**: Built using Next.js App Router and Edge/Serverless runtimes with Web Crypto JWT tokens.\n2. **Vertex AI Reasoning Engines**: Managed agent execution environment providing automatic session persistence.\n3. **Google Identity Auth**: Seamless OAuth 2.0 PKCE flow guaranteeing secure enterprise user scoping.\n\n\`\`\`typescript\n// Example: Initializing Vertex AI Agent Runtime Provider\nconst provider = createAgentRuntimeProvider();\nconst response = await provider.streamQuery({ messages }, userId);\n\`\`\``;

    const chunks = responseText.split(" ");
    for (const chunk of chunks) {
      yield {
        event_type: "content",
        content: chunk + " ",
      };
      await new Promise((r) => setTimeout(r, 15));
    }

    // Persist to in-memory mock history if sessionId provided
    if (body.sessionId && !isLocalSessionId(body.sessionId)) {
      const cleanId = extractSessionIdFromResourceName(body.sessionId);
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
          createTime: new Date(Date.now() + 1000).toISOString(),
        }
      );
      mockSessionEventsStore.set(cleanId, events);

      const sess = mockSessionsStore.get(cleanId);
      if (sess) {
        sess.updateTime = new Date().toISOString();
      }
    }

    yield { event_type: "done" };
  }
}
