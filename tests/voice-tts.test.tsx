import { describe, expect, it, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  ThreadPrimitive,
  type ThreadAssistantMessage,
  type DictationAdapter,
  type SpeechSynthesisAdapter,
  WebSpeechDictationAdapter,
  WebSpeechSynthesisAdapter,
} from "@assistant-ui/react";
import {
  createWebSpeechDictationAdapter,
  createWebSpeechSynthesisAdapter,
} from "@/lib/gemini-runtime-adapter";
import { GeminiComposer } from "@/components/assistant-ui/gemini-composer";
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
  text = "Test assistant speech response"
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
      custom: {},
    },
  };
}

function TestVoiceComposer({
  dictationAdapter,
}: {
  dictationAdapter?: DictationAdapter;
}) {
  const runtime = useLocalRuntime(
    {
      async *run() {
        yield { content: [{ type: "text", text: "Response" }] };
      },
    },
    {
      adapters: {
        dictation: dictationAdapter,
      },
    }
  );

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <GeminiComposer />
    </AssistantRuntimeProvider>
  );
}

function TestSpeechMessage({
  speechAdapter,
  messageText = "Hello from Google Agent Runtime",
}: {
  speechAdapter?: SpeechSynthesisAdapter;
  messageText?: string;
}) {
  const runtime = useLocalRuntime(
    {
      async *run() {
        yield { content: [{ type: "text", text: "Response" }] };
      },
    },
    {
      initialMessages: [
        {
          id: "msg-user-1",
          role: "user",
          content: [{ type: "text", text: "Hello" }],
        },
        createMockAssistantMessage("msg-assistant-1", messageText),
      ],
      adapters: {
        speech: speechAdapter,
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

describe("Voice Dictation & Text-to-Speech (Spec 3)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("WebSpeech Adapters Factory & Fallbacks", () => {
    it("createWebSpeechDictationAdapter returns WebSpeechDictationAdapter instance in browser environment", () => {
      const adapter = createWebSpeechDictationAdapter();
      expect(adapter).toBeInstanceOf(WebSpeechDictationAdapter);
    });

    it("createWebSpeechSynthesisAdapter returns WebSpeechSynthesisAdapter instance in browser environment", () => {
      const adapter = createWebSpeechSynthesisAdapter();
      expect(adapter).toBeInstanceOf(WebSpeechSynthesisAdapter);
    });

    it("WebSpeechDictationAdapter reports isSupported correctly when SpeechRecognition is present", () => {
      class MockSpeechRecognition {}
      const originalSR = (window as unknown as { SpeechRecognition?: unknown })
        .SpeechRecognition;
      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition =
        MockSpeechRecognition;

      expect(WebSpeechDictationAdapter.isSupported()).toBe(true);

      (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition =
        originalSR;
    });
  });

  describe("Gemini Composer Dictation Button", () => {
    it("renders Dictate mic button with aria-label 'Voice dictation' in idle state", async () => {
      render(<TestVoiceComposer />);

      const dictateButton = await screen.findByRole("button", {
        name: /voice dictation/i,
      });
      expect(dictateButton).toBeDefined();
      expect(screen.queryByRole("button", { name: /stop dictation/i })).toBeNull();
    });

    it("triggers listen() on dictation adapter when clicking Dictate button", async () => {
      const listenSpy = vi.fn().mockReturnValue({
        status: { type: "running" as const },
        stop: vi.fn().mockResolvedValue(undefined),
        cancel: vi.fn(),
        onSpeechStart: vi.fn().mockReturnValue(() => {}),
        onSpeechEnd: vi.fn().mockReturnValue(() => {}),
        onSpeech: vi.fn().mockReturnValue(() => {}),
      });

      const mockDictationAdapter: DictationAdapter = {
        listen: listenSpy,
      };

      render(<TestVoiceComposer dictationAdapter={mockDictationAdapter} />);

      const dictateButton = await screen.findByRole("button", {
        name: /voice dictation/i,
      });
      fireEvent.click(dictateButton);

      await waitFor(() => {
        expect(listenSpy).toHaveBeenCalledTimes(1);
      });
    });

    it("toggles to StopDictation button with pulse animation when dictation session is active", async () => {
      const stopSpy = vi.fn().mockResolvedValue(undefined);

      const mockDictationAdapter: DictationAdapter = {
        listen: () => ({
          status: { type: "running" as const },
          stop: stopSpy,
          cancel: vi.fn(),
          onSpeechStart: vi.fn().mockReturnValue(() => {}),
          onSpeechEnd: vi.fn().mockReturnValue(() => {}),
          onSpeech: () => () => {},
        }),
      };

      render(<TestVoiceComposer dictationAdapter={mockDictationAdapter} />);

      const dictateButton = await screen.findByRole("button", {
        name: /voice dictation/i,
      });
      fireEvent.click(dictateButton);

      // Now StopDictation button should appear
      const stopDictationButton = await screen.findByRole("button", {
        name: /stop dictation/i,
      });
      expect(stopDictationButton).toBeDefined();
      expect(stopDictationButton.className).toContain("animate-pulse");

      // Clicking StopDictation calls stop()
      fireEvent.click(stopDictationButton);
      await waitFor(() => {
        expect(stopSpy).toHaveBeenCalled();
      });
    });

    it("updates composer input when speech transcripts are received from dictation adapter", async () => {
      let speechCb:
        ((event: { transcript: string; isFinal?: boolean }) => void) | undefined;

      const mockDictationAdapter: DictationAdapter = {
        listen: () => ({
          status: { type: "running" as const },
          stop: vi.fn().mockResolvedValue(undefined),
          cancel: vi.fn(),
          onSpeechStart: vi.fn().mockReturnValue(() => {}),
          onSpeechEnd: vi.fn().mockReturnValue(() => {}),
          onSpeech: (cb) => {
            speechCb = cb;
            return () => {};
          },
        }),
      };

      render(<TestVoiceComposer dictationAdapter={mockDictationAdapter} />);

      const dictateButton = await screen.findByRole("button", {
        name: /voice dictation/i,
      });
      fireEvent.click(dictateButton);

      await waitFor(() => {
        expect(speechCb).toBeDefined();
      });

      // Send a transcript event
      act(() => {
        speechCb?.({ transcript: "What is the agent status?", isFinal: true });
      });

      const input = (await screen.findByPlaceholderText(
        "Ask Gemini"
      )) as HTMLTextAreaElement;
      await waitFor(() => {
        expect(input.value).toBe("What is the agent status?");
      });
    });
  });

  describe("Assistant Message Text-to-Speech (TTS) Speaker Action", () => {
    it("renders Read aloud button with aria-label 'Read aloud' in idle state", async () => {
      render(<TestSpeechMessage />);

      const speakButton = await screen.findByRole("button", {
        name: /read aloud/i,
      });
      expect(speakButton).toBeDefined();
      expect(screen.queryByRole("button", { name: /stop reading/i })).toBeNull();
    });

    it("calls speak() on speech adapter with assistant message text when clicking Read aloud", async () => {
      const speakSpy = vi.fn().mockReturnValue({
        status: { type: "starting" as const },
        cancel: vi.fn(),
        subscribe: vi.fn().mockReturnValue(() => {}),
      });

      const mockSpeechAdapter: SpeechSynthesisAdapter = {
        speak: speakSpy,
      };

      render(
        <TestSpeechMessage
          speechAdapter={mockSpeechAdapter}
          messageText="Google Cloud Agent Runtime provides serverless ADK hosting."
        />
      );

      const speakButton = await screen.findByRole("button", {
        name: /read aloud/i,
      });
      fireEvent.click(speakButton);

      await waitFor(() => {
        expect(speakSpy).toHaveBeenCalledTimes(1);
      });

      expect(speakSpy).toHaveBeenCalledWith(
        "Google Cloud Agent Runtime provides serverless ADK hosting."
      );
    });

    it("renders Stop reading button and handles cancel() when speech is active", async () => {
      const subscribers = new Set<() => void>();
      let currentStatus: SpeechSynthesisAdapter.Status = { type: "running" };
      const cancelSpy = vi.fn(() => {
        currentStatus = { type: "ended", reason: "cancelled" };
        subscribers.forEach((cb) => cb());
      });

      const mockSpeechAdapter: SpeechSynthesisAdapter = {
        speak: () => ({
          get status() {
            return currentStatus;
          },
          cancel: cancelSpy,
          subscribe: (cb) => {
            subscribers.add(cb);
            return () => subscribers.delete(cb);
          },
        }),
      };

      render(
        <TestSpeechMessage
          speechAdapter={mockSpeechAdapter}
          messageText="Synthesizing multi-agent speech output."
        />
      );

      const speakButton = await screen.findByRole("button", {
        name: /read aloud/i,
      });
      fireEvent.click(speakButton);

      // Stop reading button should appear with animation
      const stopSpeakingButton = await screen.findByRole("button", {
        name: /stop reading/i,
      });
      expect(stopSpeakingButton).toBeDefined();
      expect(stopSpeakingButton.className).toContain("animate-pulse");

      // Clicking Stop reading calls cancel
      fireEvent.click(stopSpeakingButton);
      await waitFor(() => {
        expect(cancelSpy).toHaveBeenCalledTimes(1);
      });

      // Returns to Read aloud button
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /read aloud/i })).toBeDefined();
      });
    });
  });

  describe("Browser Native Web Speech API Mock Integration", () => {
    it("WebSpeechSynthesisAdapter invokes window.speechSynthesis.speak with SpeechSynthesisUtterance", () => {
      let spokenUtterance: { text: string } | undefined;
      const originalSpeechSynthesis = window.speechSynthesis;
      const originalUtterance = window.SpeechSynthesisUtterance;

      window.SpeechSynthesisUtterance = class extends EventTarget {
        text: string;
        constructor(text: string) {
          super();
          this.text = text;
        }
      } as unknown as typeof SpeechSynthesisUtterance;

      window.speechSynthesis = {
        speak: vi.fn((utterance: { text: string }) => {
          spokenUtterance = utterance;
        }),
        cancel: vi.fn(),
      } as unknown as typeof speechSynthesis;

      const adapter = new WebSpeechSynthesisAdapter();
      const utterance = adapter.speak("Testing native speech synthesis integration");

      expect(window.speechSynthesis.speak).toHaveBeenCalledTimes(1);
      expect(spokenUtterance?.text).toBe("Testing native speech synthesis integration");
      expect(utterance.status.type).toBe("running");

      // Cleanup
      window.speechSynthesis = originalSpeechSynthesis;
      window.SpeechSynthesisUtterance = originalUtterance;
    });
  });
});
