import { describe, expect, it, vi, beforeAll } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  ThreadPrimitive,
} from "@assistant-ui/react";
import { ChatMessage } from "@/components/assistant-ui/gemini-message";
import type { ChatModelAdapter, ThreadMessageLike } from "@assistant-ui/react";

beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollTo = () => {};
  HTMLElement.prototype.scrollTo = () => {};
});

function TestMessageList({
  initialMessages = [],
  adapter,
}: {
  initialMessages?: readonly ThreadMessageLike[];
  adapter?: ChatModelAdapter;
}) {
  const defaultAdapter: ChatModelAdapter = {
    async *run() {
      yield { content: [{ type: "text", text: "Assistant response" }] };
    },
  };

  const runtime = useLocalRuntime(adapter ?? defaultAdapter, {
    initialMessages,
  });

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

describe("Linear Message Editing & Prompt Retrying (Spec 1)", () => {
  it("renders user bubble and hover edit button (Pencil)", async () => {
    const initialMessages: readonly ThreadMessageLike[] = [
      {
        role: "user",
        content: [{ type: "text", text: "What is Google Cloud Agent Runtime?" }],
      },
    ];

    render(<TestMessageList initialMessages={initialMessages} />);

    // User message is rendered
    const msg = await screen.findByText("What is Google Cloud Agent Runtime?");
    expect(msg).toBeDefined();

    // Edit button with aria-label is present
    const editBtn = await screen.findByRole("button", { name: /edit message/i });
    expect(editBtn).toBeDefined();
  });

  it("toggles inline edit mode on edit button click, pre-fills textarea, and renders Cancel and Save & Submit buttons", async () => {
    const initialMessages: readonly ThreadMessageLike[] = [
      {
        role: "user",
        content: [{ type: "text", text: "Explain Reasoning Engines" }],
      },
    ];

    render(<TestMessageList initialMessages={initialMessages} />);

    const editBtn = await screen.findByRole("button", { name: /edit message/i });
    fireEvent.click(editBtn);

    // Textarea should appear with prefilled value
    const textarea = (await screen.findByPlaceholderText(
      "Edit message..."
    )) as HTMLTextAreaElement;
    expect(textarea).toBeDefined();
    expect(textarea.value).toBe("Explain Reasoning Engines");

    // Cancel and Save & Submit buttons should be rendered
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    const saveBtn = screen.getByRole("button", { name: /save & submit/i });
    expect(cancelBtn).toBeDefined();
    expect(saveBtn).toBeDefined();
  });

  it("cancels edit mode without mutating text when clicking Cancel", async () => {
    const initialMessages: readonly ThreadMessageLike[] = [
      {
        role: "user",
        content: [{ type: "text", text: "Original prompt" }],
      },
    ];

    render(<TestMessageList initialMessages={initialMessages} />);

    const editBtn = await screen.findByRole("button", { name: /edit message/i });
    fireEvent.click(editBtn);

    const textarea = (await screen.findByPlaceholderText(
      "Edit message..."
    )) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "Modified prompt that is cancelled" },
    });

    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);

    // Edit textarea should disappear and original message should remain visible
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("Edit message...")).toBeNull();
    });
    expect(screen.getByText("Original prompt")).toBeDefined();
  });

  it("submits edited prompt and triggers model run with updated text and truncated linear history (Turn 1 edit)", async () => {
    const runSpy = vi.fn(async function* ({ messages }) {
      yield {
        content: [
          {
            type: "text" as const,
            text: `Reply to: ${messages[messages.length - 1]?.content?.[0]?.text || ""}`,
          },
        ],
      };
    });

    const initialMessages: readonly ThreadMessageLike[] = [
      {
        role: "user",
        content: [{ type: "text", text: "Turn 1 Prompt" }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Turn 1 Reply" }],
      },
      {
        role: "user",
        content: [{ type: "text", text: "Turn 2 Prompt" }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Turn 2 Reply" }],
      },
    ];

    render(
      <TestMessageList initialMessages={initialMessages} adapter={{ run: runSpy }} />
    );

    expect(await screen.findByText("Turn 1 Prompt")).toBeDefined();
    expect(screen.getByText("Turn 1 Reply")).toBeDefined();
    expect(screen.getByText("Turn 2 Prompt")).toBeDefined();
    expect(screen.getByText("Turn 2 Reply")).toBeDefined();

    // Find the edit button for the first message (Turn 1 Prompt)
    const editButtons = screen.getAllByRole("button", { name: /edit message/i });
    expect(editButtons.length).toBe(2);

    // Click edit on Turn 1 Prompt
    fireEvent.click(editButtons[0]);

    const textarea = (await screen.findByPlaceholderText(
      "Edit message..."
    )) as HTMLTextAreaElement;
    expect(textarea.value).toBe("Turn 1 Prompt");

    fireEvent.change(textarea, { target: { value: "Turn 1 Prompt Edited" } });

    const saveBtn = screen.getByRole("button", { name: /save & submit/i });
    fireEvent.click(saveBtn);

    // Wait for the run to be triggered
    await waitFor(() => {
      expect(runSpy).toHaveBeenCalled();
    });

    // The messages sent to runSpy must only contain the edited message (Turn 1 Prompt Edited),
    // and subsequent turns (Turn 1 Reply, Turn 2 Prompt, Turn 2 Reply) must be discarded.
    const lastRunCall = runSpy.mock.calls[runSpy.mock.calls.length - 1];
    const sentMessages = lastRunCall[0].messages;

    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].role).toBe("user");
    expect(sentMessages[0].content[0].text).toBe("Turn 1 Prompt Edited");

    // UI should show edited prompt and new reply, discarding old turn 2
    await waitFor(() => {
      expect(screen.getByText("Turn 1 Prompt Edited")).toBeDefined();
      expect(screen.queryByText("Turn 2 Prompt")).toBeNull();
      expect(screen.queryByText("Turn 2 Reply")).toBeNull();
    });
  });

  it("submits edited prompt on a multi-turn conversation (Turn 2 edit) preserving Turn 1 and truncating Turn 3", async () => {
    const runSpy = vi.fn(async function* ({ messages }) {
      yield {
        content: [
          {
            type: "text" as const,
            text: `Reply to: ${messages[messages.length - 1]?.content?.[0]?.text || ""}`,
          },
        ],
      };
    });

    const initialMessages: readonly ThreadMessageLike[] = [
      {
        role: "user",
        content: [{ type: "text", text: "Alpha Question" }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Alpha Answer" }],
      },
      {
        role: "user",
        content: [{ type: "text", text: "Beta Question" }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Beta Answer" }],
      },
      {
        role: "user",
        content: [{ type: "text", text: "Gamma Question" }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Gamma Answer" }],
      },
    ];

    render(
      <TestMessageList initialMessages={initialMessages} adapter={{ run: runSpy }} />
    );

    expect(await screen.findByText("Alpha Question")).toBeDefined();
    expect(screen.getByText("Beta Question")).toBeDefined();
    expect(screen.getByText("Gamma Question")).toBeDefined();

    const editButtons = screen.getAllByRole("button", { name: /edit message/i });
    expect(editButtons.length).toBe(3);

    // Edit Beta Question (second user message, index 1 in edit buttons)
    fireEvent.click(editButtons[1]);

    const textarea = (await screen.findByPlaceholderText(
      "Edit message..."
    )) as HTMLTextAreaElement;
    expect(textarea.value).toBe("Beta Question");

    fireEvent.change(textarea, { target: { value: "Beta Question Updated" } });

    const saveBtn = screen.getByRole("button", { name: /save & submit/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(runSpy).toHaveBeenCalled();
    });

    const lastRunCall = runSpy.mock.calls[runSpy.mock.calls.length - 1];
    const sentMessages = lastRunCall[0].messages;

    // Must have Turn 1 (Alpha Question, Alpha Answer) and Turn 2 (Beta Question Updated)
    expect(sentMessages.length).toBe(3);
    expect(sentMessages[0].content[0].text).toBe("Alpha Question");
    expect(sentMessages[1].content[0].text).toBe("Alpha Answer");
    expect(sentMessages[2].content[0].text).toBe("Beta Question Updated");

    // Gamma Question & Answer must be discarded
    await waitFor(() => {
      expect(screen.getByText("Alpha Question")).toBeDefined();
      expect(screen.getByText("Alpha Answer")).toBeDefined();
      expect(screen.getByText("Beta Question Updated")).toBeDefined();
      expect(screen.queryByText("Gamma Question")).toBeNull();
      expect(screen.queryByText("Gamma Answer")).toBeNull();
    });
  });

  it("reloads assistant message using ActionBarPrimitive.Reload and triggers fresh run", async () => {
    const runSpy = vi.fn(async function* ({ messages }) {
      yield {
        content: [
          {
            type: "text" as const,
            text: `Regenerated: ${messages[messages.length - 1]?.content?.[0]?.text || ""}`,
          },
        ],
      };
    });

    const initialMessages: readonly ThreadMessageLike[] = [
      {
        role: "user",
        content: [{ type: "text", text: "What is Gemini 2.5 Flash?" }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Initial response" }],
      },
    ];

    render(
      <TestMessageList initialMessages={initialMessages} adapter={{ run: runSpy }} />
    );

    expect(await screen.findByText("Initial response")).toBeDefined();

    const reloadBtn = screen.getByRole("button", { name: /reload message/i });
    expect(reloadBtn).toBeDefined();

    fireEvent.click(reloadBtn);

    await waitFor(() => {
      expect(runSpy).toHaveBeenCalled();
    });

    const lastRunCall = runSpy.mock.calls[runSpy.mock.calls.length - 1];
    const sentMessages = lastRunCall[0].messages;

    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].role).toBe("user");
    expect(sentMessages[0].content[0].text).toBe("What is Gemini 2.5 Flash?");

    await waitFor(() => {
      expect(screen.getByText("Regenerated: What is Gemini 2.5 Flash?")).toBeDefined();
    });
  });
});
