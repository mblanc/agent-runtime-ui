"use client";

import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useRemoteThreadListRuntime,
  type AssistantRuntime,
} from "@assistant-ui/react";
import {
  createGeminiChatAdapter,
  createGeminiFeedbackAdapter,
  createGcsAttachmentAdapter,
  createWebSpeechDictationAdapter,
  createWebSpeechSynthesisAdapter,
} from "@/lib/gemini-runtime-adapter";
import { useSessionThreadListAdapter } from "@/lib/session-adapter";
import { ThreadSidebar } from "@/components/assistant-ui/thread-sidebar";
import { GeminiThread } from "@/components/assistant-ui/gemini-thread";
import { AgentHeaderSelector } from "@/components/agent-switcher/agent-header-selector";
import { MemoryHeaderButton } from "@/components/memory/memory-header-button";
import { AgentProvider, useActiveAgent } from "@/lib/agent-context";
import { MemoryProvider } from "@/lib/memory-context";
import { MemoryDrawer } from "@/components/memory/memory-drawer";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";

function ChatContent() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const { activeAgent } = useActiveAgent();
  const activeThreadIdRef = useRef<string | undefined>(undefined);
  const activeAgentIdRef = useRef<string | undefined>(activeAgent?.id);
  const activeLocationRef = useRef<string | undefined>(activeAgent?.location);

  activeAgentIdRef.current = activeAgent?.id;
  activeLocationRef.current = activeAgent?.location;

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.push("/login");
    }
  }, [session, isPending, router]);

  const sessionListAdapter = useSessionThreadListAdapter(
    session?.user?.id,
    activeAgent?.id
  );

  const runtimeRef = useRef<AssistantRuntime | null>(null);

  const getThreadMessages = useCallback(() => {
    try {
      return (
        runtimeRef.current?.thread?.getState()?.messages ||
        runtimeRef.current?.threads?.main?.getState()?.messages
      );
    } catch {
      return undefined;
    }
  }, []);

  const chatAdapter = useMemo(
    () =>
      createGeminiChatAdapter(
        () => activeThreadIdRef.current,
        () => activeAgentIdRef.current,
        () => activeLocationRef.current,
        getThreadMessages
      ),
    [getThreadMessages]
  );

  const feedbackAdapter = useMemo(
    () =>
      createGeminiFeedbackAdapter(
        () => activeThreadIdRef.current,
        () => activeAgentIdRef.current,
        () => activeLocationRef.current
      ),
    []
  );

  const attachmentAdapter = useMemo(() => createGcsAttachmentAdapter(), []);
  const dictationAdapter = useMemo(() => createWebSpeechDictationAdapter(), []);
  const speechAdapter = useMemo(() => createWebSpeechSynthesisAdapter(), []);

  const handleThreadIdChange = useCallback((newId: string | undefined) => {
    activeThreadIdRef.current = newId;
  }, []);

  const runtime = useRemoteThreadListRuntime({
    runtimeHook: function useRuntimeHook() {
      return useLocalRuntime(chatAdapter, {
        adapters: {
          attachments: attachmentAdapter,
          feedback: feedbackAdapter,
          dictation: dictationAdapter,
          speech: speechAdapter,
        },
      });
    },
    adapter: sessionListAdapter,
    onThreadIdChange: handleThreadIdChange,
  });

  runtimeRef.current = runtime;

  const handleAgentChange = useCallback(() => {
    runtime.threads.switchToNewThread();
  }, [runtime]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-screen w-full overflow-hidden bg-[#fdfcfc] text-[#1f1f1f] dark:bg-[#0c0c0c] dark:text-[#e3e3e3]">
        {/* Left Thread History & User Sidebar */}
        <ThreadSidebar />

        {/* Main Gemini Thread Area with Top Header */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Top Header with Agent Switcher and Memory Bank Button */}
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/40 px-4 bg-background/50 backdrop-blur-xs">
            <div className="flex items-center gap-2">
              <AgentHeaderSelector onAgentChange={handleAgentChange} />
              <MemoryHeaderButton />
            </div>
          </header>

          <div className="flex-1 overflow-hidden">
            <GeminiThread />
          </div>
        </main>

        {/* Slide-Over Memory Profile Drawer */}
        <MemoryDrawer />
      </div>
    </AssistantRuntimeProvider>
  );
}

export default function ChatPage() {
  return (
    <AgentProvider>
      <MemoryProvider>
        <ChatContent />
      </MemoryProvider>
    </AgentProvider>
  );
}
