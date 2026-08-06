"use client";

import { AssistantRuntimeProvider, useLocalRuntime } from "@assistant-ui/react";
import { geminiChatAdapter } from "@/lib/gemini-runtime-adapter";
import { ThreadSidebar } from "@/components/assistant-ui/thread-sidebar";
import { GeminiThread } from "@/components/assistant-ui/gemini-thread";

export default function ChatPage() {
  const runtime = useLocalRuntime(geminiChatAdapter);

  const handleNewChat = () => {
    // Reset thread state if needed
    window.location.reload();
  };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-screen w-full overflow-hidden bg-[#fdfcfc] text-[#1f1f1f] dark:bg-[#0c0c0c] dark:text-[#e3e3e3]">
        {/* Left Thread History & User Sidebar */}
        <ThreadSidebar onNewChat={handleNewChat} />

        {/* Main Gemini Thread Area */}
        <main className="flex flex-1 flex-col overflow-hidden">
          <GeminiThread />
        </main>
      </div>
    </AssistantRuntimeProvider>
  );
}
