"use client";

import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useRemoteThreadListRuntime,
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
import { useSession } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";

export default function ChatPage() {
  const { data: session, isPending } = useSession();
  const router = useRouter();
  const activeThreadIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!isPending && !session?.user) {
      router.push("/login");
    }
  }, [session, isPending, router]);

  const sessionListAdapter = useSessionThreadListAdapter(session?.user?.id);

  const chatAdapter = useMemo(
    () => createGeminiChatAdapter(() => activeThreadIdRef.current),
    []
  );

  const feedbackAdapter = useMemo(
    () => createGeminiFeedbackAdapter(() => activeThreadIdRef.current),
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

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-screen w-full overflow-hidden bg-[#fdfcfc] text-[#1f1f1f] dark:bg-[#0c0c0c] dark:text-[#e3e3e3]">
        {/* Left Thread History & User Sidebar */}
        <ThreadSidebar />

        {/* Main Gemini Thread Area */}
        <main className="flex flex-1 flex-col overflow-hidden">
          <GeminiThread />
        </main>
      </div>
    </AssistantRuntimeProvider>
  );
}
