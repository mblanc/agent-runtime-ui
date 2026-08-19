"use client";

import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useRemoteThreadListRuntime,
  type AssistantRuntime,
} from "@assistant-ui/react";
import { createGeminiChatAdapter } from "@/lib/adapters/chat-adapter";
import { createGeminiFeedbackAdapter } from "@/lib/adapters/feedback-adapter";
import { createGcsAttachmentAdapter } from "@/lib/adapters/gcs-attachment-adapter";
import {
  createWebSpeechDictationAdapter,
  createWebSpeechSynthesisAdapter,
} from "@/lib/adapters/speech-adapters";
import { useSessionThreadListAdapter } from "@/lib/session-adapter";
import { ThreadSidebar } from "@/components/assistant-ui/thread-sidebar";
import { GeminiThread } from "@/components/assistant-ui/gemini-thread";
import { AgentHeaderSelector } from "@/components/agent-switcher/agent-header-selector";
import { MemoryHeaderButton } from "@/components/memory/memory-header-button";
import { SessionStateHeaderButton } from "@/components/session-state/session-state-header-button";
import { ArtifactsHeaderButton } from "@/components/artifacts/artifacts-header-button";
import { AgentProvider, useActiveAgent } from "@/lib/agent-context";
import { MemoryProvider } from "@/lib/memory-context";
import {
  SessionStateProvider,
  useOptionalSessionState,
} from "@/lib/session-state/state-context";
import { ArtifactProvider, useOptionalArtifacts } from "@/lib/artifacts/artifact-context";
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef } from "react";

const MemoryDrawer = dynamic(
  () => import("@/components/memory/memory-drawer").then((m) => m.MemoryDrawer),
  { ssr: false }
);

const SessionStateDrawer = dynamic(
  () =>
    import("@/components/session-state/session-state-drawer").then(
      (m) => m.SessionStateDrawer
    ),
  { ssr: false }
);

const ArtifactsCanvas = dynamic(
  () => import("@/components/artifacts/artifacts-canvas").then((m) => m.ArtifactsCanvas),
  { ssr: false }
);

function ChatContent() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const { activeAgent } = useActiveAgent();
  const activeThreadIdRef = useRef<string | undefined>(undefined);
  const activeAgentIdRef = useRef<string | undefined>(activeAgent?.id);
  const activeLocationRef = useRef<string | undefined>(activeAgent?.location);

  // Written after commit, not during render. Under concurrent rendering a render
  // can be started, abandoned and restarted, so a render-phase write can land
  // from a render that is never committed. The refs are read by the chat adapter
  // via getThreadMessages, so they must reflect committed state.
  useEffect(() => {
    activeAgentIdRef.current = activeAgent?.id;
    activeLocationRef.current = activeAgent?.location;
  }, [activeAgent?.id, activeAgent?.location]);

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.push("/login");
    }
  }, [session, isPending, router]);

  const sessionListAdapter = useSessionThreadListAdapter(
    session?.user?.id,
    activeAgent?.id,
    activeAgent?.location
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

  const sessionState = useOptionalSessionState();
  const setActiveSessionIdRef = useRef(sessionState?.setActiveSessionId);
  setActiveSessionIdRef.current = sessionState?.setActiveSessionId;

  const artifactsContext = useOptionalArtifacts();
  const setArtifactsSessionIdRef = useRef(artifactsContext?.setActiveSessionId);
  setArtifactsSessionIdRef.current = artifactsContext?.setActiveSessionId;
  const ingestStreamArtifactRef = useRef(artifactsContext?.ingestStreamArtifact);
  ingestStreamArtifactRef.current = artifactsContext?.ingestStreamArtifact;

  const chatAdapter = useMemo(
    () =>
      createGeminiChatAdapter(
        () => activeThreadIdRef.current,
        () => activeAgentIdRef.current,
        () => activeLocationRef.current,
        getThreadMessages,
        (art) => ingestStreamArtifactRef.current?.(art)
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
    setActiveSessionIdRef.current?.(newId);
    setArtifactsSessionIdRef.current?.(newId);
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

  useEffect(() => {
    runtimeRef.current = runtime;
  }, [runtime]);

  const handleAgentChange = useCallback(() => {
    runtime.threads.switchToNewThread();
  }, [runtime]);

  const isCanvasOpen = Boolean(artifactsContext?.isOpen);
  const isFullscreen = Boolean(artifactsContext?.isFullscreen);
  const splitRatio = artifactsContext?.splitRatio ?? 0.5;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-screen w-full overflow-hidden bg-[#fdfcfc] text-[#1f1f1f] dark:bg-[#0c0c0c] dark:text-[#e3e3e3]">
        {/* Left Thread History & User Sidebar */}
        <ThreadSidebar />

        {/* Main Gemini Thread Area with Top Header */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Top Header with Agent Switcher, Memory Bank, Session State & Artifacts Canvas Button */}
          <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/40 px-4 bg-background/50 backdrop-blur-xs">
            <div className="flex items-center gap-2">
              <AgentHeaderSelector onAgentChange={handleAgentChange} />
              <MemoryHeaderButton />
              <SessionStateHeaderButton />
              <ArtifactsHeaderButton />
            </div>
          </header>

          <div className="flex flex-1 overflow-hidden relative">
            {/* Chat Thread Viewport */}
            <div
              className="flex-1 flex flex-col h-full overflow-hidden transition-all"
              style={
                isCanvasOpen && !isFullscreen
                  ? { width: `${(1 - splitRatio) * 100}%`, flex: "none" }
                  : undefined
              }
            >
              <GeminiThread />
            </div>

            {/* Split-Pane Artifacts Canvas */}
            {isCanvasOpen && (
              <div
                className="h-full flex shrink-0"
                style={isFullscreen ? undefined : { width: `${splitRatio * 100}%` }}
              >
                <ArtifactsCanvas />
              </div>
            )}
          </div>
        </main>

        {/* Slide-Over Memory Profile Drawer */}
        <MemoryDrawer />

        {/* Slide-Over Session State Inspector Drawer */}
        <SessionStateDrawer />
      </div>
    </AssistantRuntimeProvider>
  );
}

export default function ChatPage() {
  return (
    <AgentProvider>
      <MemoryProvider>
        <SessionStateProvider>
          <ArtifactProvider>
            <ChatContent />
          </ArtifactProvider>
        </SessionStateProvider>
      </MemoryProvider>
    </AgentProvider>
  );
}
