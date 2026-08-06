export interface AgentMessagePart {
  text?: string;
  thought?: boolean;
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
}

export interface AgentMessage {
  role: "user" | "model" | "assistant" | "system";
  parts: AgentMessagePart[];
}

export interface AgentStreamEvent {
  event_type?: "content" | "thought" | "tool_call" | "tool_result" | "error" | "done";
  content?: string;
  thought?: string;
  tool_call?: {
    name: string;
    args: Record<string, unknown>;
  };
  tool_result?: {
    name: string;
    result: Record<string, unknown>;
  };
  error?: string;
}

export type GeminiModelTier = "flash" | "pro";

export interface ChatRequestBody {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;
  modelTier?: GeminiModelTier;
}
