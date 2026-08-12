import { describe, it, expect } from "vitest";
import {
  extractReasoningEngineIdFromResourceName,
  extractSessionIdFromResourceName,
  extractTextFromQueryOutput,
  formatAgentDisplayName,
  formatSessionEventsToThreadMessages,
  groupTurnSessionEvents,
  isLocalSessionId,
  isRootWorkflowOutput,
  isSubagentNode,
  parseRawSessionEvent,
} from "@/lib/agent-runtime/event-normalizer";

describe("Agent Runtime Event Normalizer", () => {
  describe("Resource Name & ID Extraction", () => {
    it("extracts session ID from full resource name", () => {
      const resource =
        "projects/p1/locations/us-central1/reasoningEngines/re-123/sessions/session-456";
      expect(extractSessionIdFromResourceName(resource)).toBe("session-456");
    });

    it("returns simple session ID as-is if not in resource name format", () => {
      expect(extractSessionIdFromResourceName("session-789")).toBe("session-789");
    });

    it("extracts reasoning engine ID from full resource name", () => {
      const resource =
        "projects/p1/locations/us-central1/reasoningEngines/mock-arch-advisor";
      expect(extractReasoningEngineIdFromResourceName(resource)).toBe(
        "mock-arch-advisor"
      );
    });

    it("returns simple reasoning engine ID as-is", () => {
      expect(extractReasoningEngineIdFromResourceName("custom-engine")).toBe(
        "custom-engine"
      );
    });

    it("identifies local session IDs", () => {
      expect(isLocalSessionId("__LOCALID_12345")).toBe(true);
      expect(isLocalSessionId("local-12345")).toBe(true);
      expect(isLocalSessionId("session-12345")).toBe(false);
      expect(isLocalSessionId("")).toBe(true);
    });
  });

  describe("Agent Display Name Formatting", () => {
    it("formats snake_case and kebab-case agent names cleanly", () => {
      expect(formatAgentDisplayName("mock-arch-advisor")).toBe("Mock Arch Advisor");
      expect(formatAgentDisplayName("cloud_security_auditor")).toBe(
        "Cloud Security Auditor"
      );
      expect(formatAgentDisplayName("database-optimizer")).toBe("Database Optimizer");
    });
  });

  describe("Query Output Parsing (extractTextFromQueryOutput)", () => {
    it("extracts text and thoughts from standard dictionary payload", () => {
      const output = {
        output: "Here is the final response.",
        parts: [
          { text: "Here is the final response." },
          { thought: "First, analyze requirement." },
        ],
      };

      const result = extractTextFromQueryOutput(output);
      expect(result.text).toContain("Here is the final response.");
      expect(result.thoughts).toEqual(["First, analyze requirement."]);
    });

    it("extracts nested response text from query output", () => {
      const output = {
        output: {
          response: "Final answer text",
          parts: [{ thought: "Reasoning step" }],
        },
      };

      const result = extractTextFromQueryOutput(output);
      expect(result.text).toBe("Final answer text");
      expect(result.thoughts).toEqual(["Reasoning step"]);
    });
  });

  describe("Session Events Parsing & Turn Grouping", () => {
    it("parses raw user turn event with parts and timestamps", () => {
      const raw = {
        name: "projects/p1/locations/l1/reasoningEngines/re1/sessions/s1/events/e1",
        author: "USER",
        createTime: "2026-08-09T10:00:00Z",
        content: {
          parts: [{ text: "Hello, how can I configure Cloud Run?" }],
        },
      };

      const parsed = parseRawSessionEvent(raw, "s1", 0);
      expect(parsed.id).toBe("e1");
      expect(parsed.role).toBe("user");
      expect(parsed.content).toBe("Hello, how can I configure Cloud Run?");
    });

    it("groups multi-agent subagent execution events into single assistant turn", () => {
      const rawEvents = [
        {
          author: "USER",
          content: { parts: [{ text: "Evaluate my microservices design" }] },
          createTime: "2026-08-09T10:00:00Z",
        },
        {
          author: "security_auditor",
          node_info: { is_subagent: true, path: "root/sub", output_for: [] },
          content: { parts: [{ text: "Checking IAM policies and VPC firewall" }] },
          createTime: "2026-08-09T10:00:01Z",
        },
        {
          author: "AGENT",
          root_output: true,
          content: { parts: [{ text: "Your microservices design is approved." }] },
          createTime: "2026-08-09T10:00:02Z",
        },
      ];

      const grouped = groupTurnSessionEvents(rawEvents, "s1");
      expect(grouped.length).toBe(2);
      expect(grouped[0].role).toBe("user");
      expect(grouped[1].role).toBe("assistant");
      expect(grouped[1].content).toBe("Your microservices design is approved.");
      expect(grouped[1].thought).toContain("security_auditor");
    });

    it("formats session events to Assistant UI thread messages", () => {
      const events = [
        {
          id: "msg-1",
          sessionId: "s1",
          role: "user" as const,
          content: "What is Google Cloud Agent Runtime?",
          createTime: "2026-08-09T10:00:00Z",
        },
        {
          id: "msg-2",
          sessionId: "s1",
          role: "assistant" as const,
          content: "Agent Runtime provides managed agent execution.",
          thought: "Decomposing query...",
          createTime: "2026-08-09T10:00:02Z",
        },
      ];

      const threadMessages = formatSessionEventsToThreadMessages(events);
      expect(threadMessages.length).toBe(2);
      expect(threadMessages[0].role).toBe("user");
      expect(threadMessages[0].content).toBe("What is Google Cloud Agent Runtime?");
      expect(threadMessages[0].metadata?.custom?.eventId).toBe("msg-1");
      expect(threadMessages[1].role).toBe("assistant");
      expect(threadMessages[1].content).toBe(
        "Agent Runtime provides managed agent execution."
      );
      expect(threadMessages[1].thought).toBe("Decomposing query...");
      expect(threadMessages[1].metadata?.custom?.eventId).toBe("msg-2");
    });

    it("identifies root workflow outputs and subagent nodes correctly", () => {
      expect(isRootWorkflowOutput({ root_output: true })).toBe(true);
      expect(isRootWorkflowOutput({ is_final: true })).toBe(true);
      expect(
        isRootWorkflowOutput({
          node_info: { path: "workflow/root", output_for: ["workflow"] },
        })
      ).toBe(true);
      expect(isRootWorkflowOutput({})).toBe(false);

      expect(isSubagentNode({ is_subagent: true })).toBe(true);
      expect(
        isSubagentNode({
          node_info: { path: "workflow/subagent_1", output_for: [] },
        })
      ).toBe(true);
      expect(isSubagentNode({})).toBe(false);
    });

    it("prioritizes rawEvent.id OpenTelemetry UUID over numerical resource segment in parseRawSessionEvent", () => {
      const rawGcpEvent = {
        name: "projects/125188993477/locations/us-central1/reasoningEngines/1295472637392191488/sessions/5437844143411822592/events/5194088076300779520",
        invocationId: "e-4c95513b-95b8-4a70-8a67-73964abed08d",
        author: "root_agent",
        rawEvent: {
          id: "3319ac19-7ca8-4990-9e79-b38e1ec785f6",
          invocationId: "e-4c95513b-95b8-4a70-8a67-73964abed08d",
          content: {
            parts: [{ text: "Intel and AMD market analysis" }],
          },
        },
      };

      const parsed = parseRawSessionEvent(rawGcpEvent, "5437844143411822592", 0);
      expect(parsed.id).toBe("3319ac19-7ca8-4990-9e79-b38e1ec785f6");
      expect(parsed.content).toBe("Intel and AMD market analysis");
      expect(parsed.invocationId).toBe("e-4c95513b-95b8-4a70-8a67-73964abed08d");
    });

    it("extracts thoughts when part has boolean thought: true (Gemini 2.0/2.5 reasoning format)", () => {
      const rawGeminiReasoningEvent = {
        name: "projects/125188993477/locations/us-central1/reasoningEngines/1295472637392191488/sessions/4917427697799397376/events/101",
        author: "model",
        content: {
          role: "model",
          parts: [
            {
              thought: true,
              text: "The user is querying watch list status for semiconductor stocks. Let's analyze NVDA, AMD, INTC.",
              thoughtSignature: "CpQGAY89a184...",
            },
            {
              text: "Here is your current semiconductor watch list: NVDA, AMD, INTC, and MU.",
            },
          ],
        },
      };

      const parsed = parseRawSessionEvent(
        rawGeminiReasoningEvent,
        "4917427697799397376",
        0
      );
      expect(parsed.role).toBe("assistant");
      expect(parsed.thought).toBe(
        "The user is querying watch list status for semiconductor stocks. Let's analyze NVDA, AMD, INTC."
      );
      expect(parsed.content).toBe(
        "Here is your current semiconductor watch list: NVDA, AMD, INTC, and MU."
      );
    });

    it("groups multi-event turn where thought is in a separate event before final response", () => {
      const rawEvents = [
        {
          name: "projects/.../sessions/4917427697799397376/events/1",
          author: "user",
          content: { parts: [{ text: "What are semiconductor stocks doing today?" }] },
        },
        {
          name: "projects/.../sessions/4917427697799397376/events/2",
          author: "model",
          content: {
            parts: [
              {
                thought: true,
                text: "Retrieving industry watch updates and computing changes...",
              },
            ],
          },
        },
        {
          name: "projects/.../sessions/4917427697799397376/events/3",
          author: "model",
          content: {
            parts: [
              {
                text: "Semiconductor stocks are up 2.4% on strong earnings reports.",
              },
            ],
          },
        },
      ];

      const grouped = groupTurnSessionEvents(rawEvents, "4917427697799397376");
      expect(grouped.length).toBe(2);
      expect(grouped[0].role).toBe("user");
      expect(grouped[0].content).toBe("What are semiconductor stocks doing today?");

      expect(grouped[1].role).toBe("assistant");
      expect(grouped[1].thought).toBe(
        "Retrieving industry watch updates and computing changes..."
      );
      expect(grouped[1].content).toBe(
        "Semiconductor stocks are up 2.4% on strong earnings reports."
      );

      const threadMessages = formatSessionEventsToThreadMessages(grouped);
      expect(threadMessages.length).toBe(2);
      expect(threadMessages[1].thought).toBe(
        "Retrieving industry watch updates and computing changes..."
      );
      expect(threadMessages[1].content).toBe(
        "Semiconductor stocks are up 2.4% on strong earnings reports."
      );
    });
  });
});
