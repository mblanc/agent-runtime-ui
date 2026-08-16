import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NextRequest } from "next/server";
import { useLocalRuntime, AssistantRuntimeProvider } from "@assistant-ui/react";
import type { ToolCallMessagePartProps } from "@assistant-ui/react";
import { GeminiThread } from "@/components/assistant-ui/gemini-thread";
import { ToolFallback } from "@/components/assistant-ui/tool-fallback";
import { createGeminiChatAdapter } from "@/lib/gemini-runtime-adapter";
import { createAgentRuntimeProvider } from "@/lib/agent-runtime/factory";
import { POST as chatRoute } from "@/app/api/chat/route";
import { auth } from "@/lib/auth";

if (typeof global.ResizeObserver === "undefined") {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

describe("ToolFallback & ADK HITL Integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("ToolFallback Rendering & States", () => {
    it("renders running state with animated loader and running badge", () => {
      render(
        <ToolFallback toolName="query_enterprise_database" status={{ type: "running" }} />
      );

      expect(screen.getByText("query_enterprise_database")).toBeDefined();
      expect(screen.getByText("Running")).toBeDefined();
      expect(screen.getByText("View Details")).toBeDefined();
    });

    it("renders complete state with executed badge and checkmark", () => {
      render(
        <ToolFallback
          toolName="compute_metrics"
          status={{ type: "complete" }}
          result={{ cpu: "12%", memory: "450MB" }}
        />
      );

      expect(screen.getByText("compute_metrics")).toBeDefined();
      expect(screen.getByText("Executed")).toBeDefined();
    });

    it("renders error state when status is incomplete or has error", () => {
      render(
        <ToolFallback
          toolName="failing_tool"
          status={{ type: "incomplete", error: "Permission denied" }}
        />
      );

      expect(screen.getByText("failing_tool")).toBeDefined();
      expect(screen.getByText("Error")).toBeDefined();
    });

    it("renders requires-action state with amber alert badge and card", () => {
      render(
        <ToolFallback
          toolName="adk_request_confirmation"
          status={{ type: "requires-action" }}
          args={{
            prompt: "Do you confirm terminating instance test-vm-01?",
            action_description: "Delete VM instance",
          }}
        />
      );

      expect(screen.getByText("adk_request_confirmation")).toBeDefined();
      expect(screen.getByText("Requires Approval")).toBeDefined();
      expect(
        screen.getByText("Do you confirm terminating instance test-vm-01?")
      ).toBeDefined();
      expect(
        screen.getByRole("button", { name: /approve tool execution/i })
      ).toBeDefined();
      expect(
        screen.getByRole("button", { name: /decline tool execution/i })
      ).toBeDefined();
    });
  });

  describe("Expand/Collapse Details", () => {
    it("toggles argument and result inspection on header click", () => {
      render(
        <ToolFallback
          toolName="fetch_weather"
          args={{ location: "San Francisco, CA", units: "metric" }}
          result={{ temperature: 19, conditions: "Sunny" }}
          status={{ type: "complete" }}
        />
      );

      // Collapsed by default
      expect(screen.queryByText(/San Francisco, CA/)).toBeNull();
      expect(screen.queryByText(/Sunny/)).toBeNull();
      expect(screen.getByText("View Details")).toBeDefined();

      // Click to expand
      const trigger = screen.getByRole("button", { name: /fetch_weather/i });
      fireEvent.click(trigger);

      expect(screen.getByText("Collapse")).toBeDefined();
      expect(screen.getByText(/San Francisco, CA/)).toBeDefined();
      expect(screen.getByText(/Sunny/)).toBeDefined();

      // Click to collapse
      fireEvent.click(trigger);
      expect(screen.getByText("View Details")).toBeDefined();
      expect(screen.queryByText(/San Francisco, CA/)).toBeNull();
    });

    it("handles raw string args and argsText correctly", () => {
      render(
        <ToolFallback
          toolName="parse_json"
          argsText='{"dataset": "customer_records", "rows": 100}'
          result='{"processed": true}'
          defaultOpen={true}
        />
      );

      expect(screen.getByText(/customer_records/)).toBeDefined();
      expect(screen.getByText(/processed/)).toBeDefined();
    });
  });

  describe("HITL Approval & Decline Actions", () => {
    it("invokes addResult and respondToApproval with confirmed: true on Approve click", () => {
      const addResult = vi.fn();
      const respondToApproval = vi.fn();

      render(
        <ToolFallback
          toolName="adk_request_confirmation"
          status={{ type: "requires-action" }}
          args={{ prompt: "Authorize critical database drop table?" }}
          addResult={addResult}
          respondToApproval={respondToApproval}
        />
      );

      const approveBtn = screen.getByRole("button", {
        name: /approve tool execution/i,
      });
      fireEvent.click(approveBtn);

      expect(addResult).toHaveBeenCalledWith({ confirmed: true });

      // Shows approved confirmation message
      expect(screen.getByText(/approved by user/i)).toBeDefined();
    });

    it("invokes addResult and updates state on Decline click", () => {
      const addResult = vi.fn();
      const respondToApproval = vi.fn();

      render(
        <ToolFallback
          toolName="adk_request_confirmation"
          status={{ type: "requires-action" }}
          args={{ prompt: "Authorize critical database drop table?" }}
          addResult={addResult}
          respondToApproval={respondToApproval}
        />
      );

      const declineBtn = screen.getByRole("button", {
        name: /decline tool execution/i,
      });
      fireEvent.click(declineBtn);

      expect(addResult).toHaveBeenCalledWith({ confirmed: false });

      // Shows declined confirmation message
      expect(screen.getByText(/declined by user/i)).toBeDefined();
    });

    it("falls back to default prompt when args contains no custom message", () => {
      render(
        <ToolFallback
          toolName="custom_tool"
          status={{ type: "requires-action" }}
          args={{ randomKey: 123 }}
        />
      );

      expect(
        screen.getByText(/requests authorization to execute "custom_tool"/i)
      ).toBeDefined();
    });

    it("displays existing resolved state if result is provided with confirmed: true", () => {
      render(
        <ToolFallback
          toolName="adk_request_confirmation"
          status={{ type: "requires-action" }}
          args={{ prompt: "Authorize migration" }}
          result={{ confirmed: true }}
        />
      );

      expect(screen.getByText(/approved by user/i)).toBeDefined();
      expect(
        screen.queryByRole("button", { name: /approve tool execution/i })
      ).toBeNull();
    });

    it("displays existing resolved state if result is provided with confirmed: false", () => {
      render(
        <ToolFallback
          toolName="adk_request_confirmation"
          status={{ type: "requires-action" }}
          args={{ prompt: "Authorize migration" }}
          result={{ confirmed: false }}
        />
      );

      expect(screen.getByText(/declined by user/i)).toBeDefined();
      expect(
        screen.queryByRole("button", { name: /decline tool execution/i })
      ).toBeNull();
    });
  });

  describe("Stream Integration & Payload Formatting", () => {
    it("formats function_response and functionResponse payload when tool result is present", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader() {
            let done = false;
            return {
              async read() {
                if (done) return { done: true, value: undefined };
                done = true;
                const encoder = new TextEncoder();
                return {
                  done: false,
                  value: encoder.encode(
                    'data: {"event_type":"content","content":"Approval acknowledged"}\n\ndata: [DONE]\n\n'
                  ),
                };
              },
            };
          },
        },
      });
      global.fetch = mockFetch as unknown as typeof fetch;

      const testMessages = [
        {
          id: "m-1",
          role: "assistant" as const,
          content: [
            {
              type: "tool-call" as const,
              toolCallId: "call-12345",
              toolName: "adk_request_confirmation",
              args: { prompt: "Confirm drop" },
              argsText: '{"prompt":"Confirm drop"}',
              result: { confirmed: true },
            },
          ],
          attachments: [],
          metadata: { custom: {} },
          createdAt: new Date(),
          status: { type: "complete" as const, reason: "stop" as const },
        },
      ];

      const runOptions = {
        messages: testMessages,
        abortSignal: new AbortController().signal,
        runConfig: {},
        context: undefined,
        unstable_getMessage: () => undefined,
      };

      const adapter = createGeminiChatAdapter();
      const generator = adapter.run(
        runOptions as unknown as Parameters<typeof adapter.run>[0]
      );

      const results = [];
      if (Symbol.asyncIterator in generator) {
        for await (const res of generator) {
          results.push(res);
        }
      }

      expect(mockFetch).toHaveBeenCalled();
      const callArgs = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callArgs.messages.length).toBe(2);
      expect(callArgs.messages[0].role).toBe("assistant");
      expect(callArgs.messages[0].parts[0].function_call).toEqual({
        id: "call-12345",
        name: "adk_request_confirmation",
        args: { prompt: "Confirm drop" },
      });
      expect(callArgs.messages[1].role).toBe("user");
      expect(callArgs.messages[1].parts[0].function_response).toEqual({
        id: "call-12345",
        name: "adk_request_confirmation",
        response: { confirmed: true },
      });
    });
  });

  describe("Provider & Mock Mode HITL", () => {
    it("yields tool_call with requires-action on prompt requesting confirmation", async () => {
      const client = createAgentRuntimeProvider();
      const events = [];

      for await (const evt of client.streamQuery(
        {
          messages: [
            {
              role: "user",
              content: "Please delete the production database records",
            },
          ],
        },
        "test-user"
      )) {
        events.push(evt);
      }

      const toolCallEvt = events.find((e) => e.event_type === "tool_call");
      expect(toolCallEvt).toBeDefined();
      expect(toolCallEvt?.tool_call?.name).toBe("adk_request_confirmation");
      expect(toolCallEvt?.tool_call?.status).toBe("requires-action");
      expect(toolCallEvt?.tool_call?.requires_confirmation).toBe(true);
    });

    it("yields confirmed tool_result and resumed execution when receiving function_response", async () => {
      const client = createAgentRuntimeProvider();
      const events = [];

      for await (const evt of client.streamQuery(
        {
          messages: [
            {
              role: "user",
              content: "",
              parts: [
                {
                  function_response: {
                    id: "call-99",
                    name: "adk_request_confirmation",
                    response: { confirmed: true },
                  },
                },
              ],
            },
          ],
        },
        "test-user"
      )) {
        events.push(evt);
      }

      const toolResultEvt = events.find((e) => e.event_type === "tool_result");
      expect(toolResultEvt).toBeDefined();
      expect(toolResultEvt?.tool_result?.name).toBe("adk_request_confirmation");
      expect(toolResultEvt?.tool_result?.result).toEqual({ confirmed: true });

      const contentEvt = events.find(
        (e) => e.event_type === "content" && e.content?.includes("Approved")
      );
      expect(contentEvt).toBeDefined();
    });

    it("yields declined tool_result when receiving function_response with confirmed: false", async () => {
      const client = createAgentRuntimeProvider();
      const events = [];

      for await (const evt of client.streamQuery(
        {
          messages: [
            {
              role: "user",
              content: "",
              parts: [
                {
                  function_response: {
                    id: "call-100",
                    name: "adk_request_confirmation",
                    response: { confirmed: false },
                  },
                },
              ],
            },
          ],
        },
        "test-user"
      )) {
        events.push(evt);
      }

      const toolResultEvt = events.find((e) => e.event_type === "tool_result");
      expect(toolResultEvt).toBeDefined();
      expect(toolResultEvt?.tool_result?.result).toEqual({ confirmed: false });

      const contentEvt = events.find(
        (e) => e.event_type === "content" && e.content?.includes("Declined")
      );
      expect(contentEvt).toBeDefined();
    });
  });

  describe("ToolGroup HITL Integration", () => {
    it("renders ToolGroupTrigger with Requires Approval when status is requires-action", async () => {
      const { ToolGroupRoot, ToolGroupTrigger, ToolGroupContent } =
        await import("@/components/assistant-ui/tool-group");

      render(
        <ToolGroupRoot defaultOpen={true}>
          <ToolGroupTrigger count={1} status="requires-action" />
          <ToolGroupContent>
            <div>Confirmation Card Content</div>
          </ToolGroupContent>
        </ToolGroupRoot>
      );

      expect(screen.getByText("Tool requires approval")).toBeDefined();
      expect(screen.getByText("Requires Approval")).toBeDefined();
      expect(screen.getByText("Confirmation Card Content")).toBeDefined();
    });
  });

  describe("Session Adapter & History Loading with HITL Tools", () => {
    it("loads session 2648707499674304512 and reconstructs tool-call part with requires-action status", async () => {
      const { formatRemoteMessagesToThreadMessages } =
        await import("@/lib/session-adapter");

      const rawMessages = [
        {
          id: "msg-user-1",
          role: "user",
          content: "Please delete the production Kubernetes cluster",
        },
        {
          id: "msg-assistant-2",
          role: "assistant",
          content: "",
          thought: "Analyzing deletion request...",
          toolCalls: [
            {
              name: "adk_request_confirmation",
              args: {
                prompt:
                  "Do you confirm the deletion of production cluster gke-prod-cluster-01?",
                action_description: "Delete Kubernetes Cluster",
              },
            },
          ],
        },
      ];

      const messages = formatRemoteMessagesToThreadMessages(rawMessages);

      expect(messages.length).toBe(2);
      const assistantMsg = messages[1] as unknown as {
        role: string;
        content: Array<{
          type: string;
          toolName?: string;
          status?: { type: string; reason?: string };
          args?: { prompt?: string };
        }>;
        status?: { type: string; reason?: string };
      };

      expect(assistantMsg.role).toBe("assistant");
      expect(assistantMsg.status).toEqual({
        type: "requires-action",
        reason: "tool-calls",
      });

      const toolCallPart = assistantMsg.content.find((p) => p.type === "tool-call");
      expect(toolCallPart).toBeDefined();
      expect(toolCallPart?.toolName).toBe("adk_request_confirmation");
      expect(toolCallPart?.status).toEqual({
        type: "requires-action",
        reason: "tool-calls",
      });
      expect(toolCallPart?.args?.prompt).toContain("Do you confirm the deletion");
    });
  });

  describe("API Chat Route with HITL Payload", () => {
    it("streams confirmation tool_call via /api/chat when action requires confirmation", async () => {
      vi.spyOn(auth.api, "getSession").mockResolvedValueOnce({
        user: {
          id: "test-user",
          name: "Test User",
          email: "test@example.com",
        },
        session: {
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      });

      const req = new NextRequest("http://localhost:3000/api/chat", {
        method: "POST",
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: "Please confirm delete cluster resource",
            },
          ],
        }),
      });

      const res = await chatRoute(req);
      expect(res.status).toBe(200);

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader!.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
      }

      expect(text).toContain("adk_request_confirmation");
      expect(text).toContain("requires-action");
    });

    it("executes full interactive approval lifecycle: renders card, handles approve click, streams resumed summary", async () => {
      const sseChunks = [
        `data: ${JSON.stringify({ event_type: "thought", thought: "Resuming workflow..." })}\n\n`,
        `data: ${JSON.stringify({ event_type: "tool_result", tool_result: { name: "load_web_page", result: "Page contents" } })}\n\n`,
        `data: ${JSON.stringify({ event_type: "content", content: "Summary: The blog post discusses why LLMs can achieve breakthroughs." })}\n\n`,
        `data: [DONE]\n\n`,
      ];

      const encoder = new TextEncoder();
      let streamIndex = 0;
      const customReadable = new ReadableStream({
        pull(controller) {
          if (streamIndex < sseChunks.length) {
            controller.enqueue(encoder.encode(sseChunks[streamIndex++]));
          } else {
            controller.close();
          }
        },
      });

      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        body: customReadable,
      });
      global.fetch = fetchSpy as unknown as typeof fetch;

      const adapter = createGeminiChatAdapter();

      const TestApprovalFlow = () => {
        const runtime = useLocalRuntime(adapter);

        return (
          <AssistantRuntimeProvider runtime={runtime}>
            <GeminiThread />
          </AssistantRuntimeProvider>
        );
      };

      render(<TestApprovalFlow />);

      // Verify ToolFallback renders approval UI
      const toolCallPart = {
        type: "tool-call" as const,
        toolCallId: "adk-6578f364-101a-48d7-9303-366d8a1a7105",
        toolName: "adk_request_confirmation",
        args: {
          originalFunctionCall: {
            id: "adk-c7e19376-3b32-45c8-bee7-3a135d13d6ed",
            name: "load_web_page",
            args: { url: "https://yongzx.github.io/blog/2026/08/08/llm-can-jump" },
          },
          toolConfirmation: {
            hint: "Approval Required: The agent requests permission to execute 'load_web_page'.",
            confirmed: false,
          },
        },
        status: { type: "requires-action" as const, reason: "tool-calls" },
      };

      const handleAddResult = vi.fn(async (res) => {
        // Simulates assistant-ui triggering runtime run on addResult
        const generator = adapter.run({
          messages: [
            {
              id: "m-assistant",
              role: "assistant",
              content: [{ ...toolCallPart, result: res }],
              createdAt: new Date(),
              status: { type: "complete", reason: "stop" },
            },
          ] as unknown as Parameters<typeof adapter.run>[0]["messages"],
          abortSignal: new AbortController().signal,
        } as Parameters<typeof adapter.run>[0]);

        if (Symbol.asyncIterator in generator) {
          for await (const chunk of generator) {
            void chunk;
          }
        }
      });

      render(
        <ToolFallback
          {...toolCallPart}
          addResult={handleAddResult as unknown as ToolCallMessagePartProps["addResult"]}
        />
      );

      expect(screen.getByText(/action requires approval/i)).toBeDefined();
      const approveBtn = screen.getByRole("button", { name: /approve tool execution/i });
      expect(approveBtn).toBeDefined();

      // Click Approve
      fireEvent.click(approveBtn);

      expect(handleAddResult).toHaveBeenCalledWith({ confirmed: true });
      expect(fetchSpy).toHaveBeenCalled();

      // Check request body sent to /api/chat
      const sentPayload = JSON.parse(fetchSpy.mock.calls[0][1].body);
      const userFnResp = sentPayload.messages.find(
        (m: { role: string }) => m.role === "user"
      );
      expect(userFnResp).toBeDefined();
      expect(userFnResp.parts[0].function_response).toEqual({
        id: "adk-6578f364-101a-48d7-9303-366d8a1a7105",
        name: "adk_request_confirmation",
        response: { confirmed: true },
      });
    });

    it("sends user text message and does NOT resurrect previous tool approval function response on follow-up turns", async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(
          'data: {"content": "Here is your poem about Copenhagen..."}\n\ndata: [DONE]\n\n',
          {
            headers: { "Content-Type": "text/event-stream" },
          }
        )
      );
      global.fetch = fetchSpy as unknown as typeof fetch;

      const adapter = createGeminiChatAdapter(() => "session-multi-turn");

      // Conversation history: Turn 1 (ask summary), Turn 2 (assistant tool + summary), Turn 3 (user ask poem)
      const historyMessages = [
        {
          id: "msg-1",
          role: "user",
          content: [
            {
              type: "text",
              text: "Summarize https://yongzx.github.io/blog/2026/08/08/llm-can-jump",
            },
          ],
          createdAt: new Date(),
          status: { type: "complete", reason: "stop" },
        },
        {
          id: "msg-2",
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolName: "adk_request_confirmation",
              toolCallId: "adk-12345",
              args: { originalFunctionCall: { name: "load_web_page" } },
              result: { confirmed: true },
            },
            {
              type: "text",
              text: "The article argues that LLMs can jump...",
            },
          ],
          createdAt: new Date(),
          status: { type: "complete", reason: "stop" },
        },
        {
          id: "msg-3",
          role: "user",
          content: [{ type: "text", text: "Generate a Poem about Copenhaguen" }],
          createdAt: new Date(),
          status: { type: "complete", reason: "stop" },
        },
      ];

      const generator = adapter.run({
        messages: historyMessages as unknown as Parameters<
          typeof adapter.run
        >[0]["messages"],
        abortSignal: new AbortController().signal,
      } as Parameters<typeof adapter.run>[0]);

      if (Symbol.asyncIterator in generator) {
        for await (const chunk of generator) {
          void chunk;
        }
      }

      expect(fetchSpy).toHaveBeenCalled();
      const sentPayload = JSON.parse(fetchSpy.mock.calls[0][1].body);

      // The last message in sentPayload.messages must be the user's poem prompt
      const lastMsg = sentPayload.messages[sentPayload.messages.length - 1];
      expect(lastMsg.role).toBe("user");
      expect(lastMsg.content).toBe("Generate a Poem about Copenhaguen");
      expect(lastMsg.parts).toEqual([{ text: "Generate a Poem about Copenhaguen" }]);
    });
  });
});
