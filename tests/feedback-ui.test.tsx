import { describe, expect, it, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  ThreadPrimitive,
  type ThreadAssistantMessage,
} from "@assistant-ui/react";
import {
  createGeminiFeedbackAdapter,
  geminiFeedbackAdapter,
} from "@/lib/adapters/feedback-adapter";
import { ChatMessage } from "@/components/assistant-ui/gemini-message";

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollTo = () => {};
  HTMLElement.prototype.scrollTo = () => {};
});

function createMockAssistantMessage(
  id: string,
  text = "Test reply",
  customMetadata: Record<string, unknown> = {}
): ThreadAssistantMessage {
  return {
    id,
    role: "assistant",
    content: [{ type: "text", text }],
    createdAt: new Date(),
    status: { type: "complete", reason: "stop" },
    metadata: {
      unstable_state: null,
      unstable_annotations: [],
      unstable_data: [],
      steps: [],
      custom: customMetadata,
    },
  };
}

function TestFeedbackThread({
  submitSpy,
}: {
  submitSpy?: (params: { message: unknown; type: "positive" | "negative" }) => void;
}) {
  const runtime = useLocalRuntime(
    {
      async *run() {
        yield { content: [{ type: "text", text: "Here is your agent answer." }] };
      },
    },
    {
      initialMessages: [
        {
          id: "msg-user-1",
          role: "user",
          content: [{ type: "text", text: "How does feedback work?" }],
        },
        {
          id: "msg-assistant-1",
          role: "assistant",
          content: [
            { type: "text", text: "Feedback forwards to Vertex AI Feedback Service." },
          ],
          status: { type: "complete", reason: "stop" },
        },
      ],
      adapters: {
        feedback: {
          submit: (feedback) => {
            submitSpy?.(feedback);
          },
        },
      },
    }
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root>
        <ThreadPrimitive.Viewport>
          <ThreadPrimitive.Messages
            components={{
              Message: ChatMessage,
            }}
          />
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}

describe("Feedback UI and Runtime Adapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("createGeminiFeedbackAdapter unit tests", () => {
    it("POSTs THUMBS_UP feedback to /api/feedback when type is positive", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          name: "feedback-1",
          createTime: "now",
          feedbackType: "THUMBS_UP",
        }),
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        mockFetch as unknown as typeof fetch
      );

      const adapter = createGeminiFeedbackAdapter(() => "session-test-456");
      await adapter.submit({
        message: createMockAssistantMessage("msg-999", "Assistant reply"),
        type: "positive",
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("/api/feedback");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.sessionId).toBe("session-test-456");
      expect(body.eventId).toBe("msg-999");
      expect(body.feedbackType).toBe("THUMBS_UP");
    });

    it("POSTs THUMBS_DOWN feedback to /api/feedback when type is negative", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          name: "feedback-2",
          createTime: "now",
          feedbackType: "THUMBS_DOWN",
        }),
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        mockFetch as unknown as typeof fetch
      );

      const adapter = createGeminiFeedbackAdapter(() => "session-test-789");
      await adapter.submit({
        message: createMockAssistantMessage("msg-888", "Assistant reply"),
        type: "negative",
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("/api/feedback");
      const body = JSON.parse(opts.body);
      expect(body.sessionId).toBe("session-test-789");
      expect(body.eventId).toBe("msg-888");
      expect(body.feedbackType).toBe("THUMBS_DOWN");
    });

    it("prioritizes message.metadata.custom.eventId when present", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          name: "feedback-3",
          createTime: "now",
          feedbackType: "THUMBS_UP",
        }),
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        mockFetch as unknown as typeof fetch
      );

      const mockMsg = createMockAssistantMessage("m-1", "Assistant reply", {
        eventId: "2a18cb74-f654-47f3-86ac-dbb6223bbf8b",
      });

      const adapter = createGeminiFeedbackAdapter(
        () => "session-test-custom",
        () => "engine-123",
        () => "us-central1"
      );
      await adapter.submit({
        message: mockMsg,
        type: "positive",
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.sessionId).toBe("session-test-custom");
      expect(body.eventId).toBe("2a18cb74-f654-47f3-86ac-dbb6223bbf8b");
      expect(body.reasoningEngineId).toBe("engine-123");
      expect(body.location).toBe("us-central1");
    });

    it("handles fetch error gracefully without unhandled rejection", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network connection failed"));
      vi.spyOn(globalThis, "fetch").mockImplementation(
        mockFetch as unknown as typeof fetch
      );
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const adapter = createGeminiFeedbackAdapter(() => "session-err");
      await expect(
        adapter.submit({
          message: createMockAssistantMessage("msg-err"),
          type: "positive",
        })
      ).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("handles HTTP error status without throwing unhandled exception", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal error",
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        mockFetch as unknown as typeof fetch
      );
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const adapter = createGeminiFeedbackAdapter(() => "session-500");
      await expect(
        adapter.submit({
          message: createMockAssistantMessage("msg-500"),
          type: "negative",
        })
      ).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("geminiFeedbackAdapter default instance uses default sessionId fallback", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        mockFetch as unknown as typeof fetch
      );

      await geminiFeedbackAdapter.submit({
        message: createMockAssistantMessage("msg-default"),
        type: "positive",
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body);
      expect(body.sessionId).toBe("default");
    });
  });

  describe("Assistant Message Feedback Buttons Integration", () => {
    it("renders ThumbsUp and ThumbsDown action buttons in assistant message action bar", async () => {
      render(<TestFeedbackThread />);

      const thumbsUpButton = await screen.findByRole("button", {
        name: /good response/i,
      });
      const thumbsDownButton = await screen.findByRole("button", {
        name: /bad response/i,
      });

      expect(thumbsUpButton).toBeDefined();
      expect(thumbsDownButton).toBeDefined();
    });

    it("clicking ThumbsUp button triggers feedback adapter submit with positive type", async () => {
      const submitSpy = vi.fn();
      render(<TestFeedbackThread submitSpy={submitSpy} />);

      const thumbsUpButton = await screen.findByRole("button", {
        name: /good response/i,
      });
      fireEvent.click(thumbsUpButton);

      await waitFor(() => {
        expect(submitSpy).toHaveBeenCalledTimes(1);
      });

      const callArg = submitSpy.mock.calls[0][0];
      expect(callArg.type).toBe("positive");
      expect(callArg.message.id).toBeDefined();
    });

    it("clicking ThumbsDown button triggers feedback adapter submit with negative type", async () => {
      const submitSpy = vi.fn();
      render(<TestFeedbackThread submitSpy={submitSpy} />);

      const thumbsDownButton = await screen.findByRole("button", {
        name: /bad response/i,
      });
      fireEvent.click(thumbsDownButton);

      await waitFor(() => {
        expect(submitSpy).toHaveBeenCalledTimes(1);
      });

      const callArg = submitSpy.mock.calls[0][0];
      expect(callArg.type).toBe("negative");
      expect(callArg.message.id).toBeDefined();
    });
  });
});
