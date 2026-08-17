import type { GroundingMetadata } from "./grounding";

export interface GcsFileDataPart {
  file_data: {
    file_uri: string;
    mime_type: string;
  };
}

export interface BaseAgentMessagePart {
  type?:
    | "text"
    | "reasoning"
    | "file_data"
    | "image"
    | "file"
    | "function_call"
    | "function_response";
  text?: string;
  thought?: boolean;
  file_data?: {
    file_uri: string;
    mime_type: string;
  };
  fileData?: {
    file_uri?: string;
    fileUri?: string;
    mime_type?: string;
    mimeType?: string;
  };
  image?: string;
  filename?: string;
  file?: {
    filename?: string;
    data: string;
    mimeType?: string;
    mime_type?: string;
  };
  functionCall?: {
    id?: string;
    name: string;
    args: Record<string, unknown>;
  };
  functionResponse?: {
    id?: string;
    name: string;
    response: Record<string, unknown>;
  };
  function_call?: {
    id?: string;
    name: string;
    args: Record<string, unknown>;
  };
  function_response?: {
    id?: string;
    name: string;
    response: Record<string, unknown>;
  };
  grounding_metadata?: GroundingMetadata;
  groundingMetadata?: GroundingMetadata;
  thought_signature?: string;
  thoughtSignature?: string;
}

export interface AgentTextPart extends BaseAgentMessagePart {
  type?: "text";
  text: string;
}

export interface AgentReasoningPart extends BaseAgentMessagePart {
  type?: "reasoning";
  text: string;
  thought: boolean;
}

export interface AgentFileDataPart extends BaseAgentMessagePart {
  type?: "file_data";
  file_data: {
    file_uri: string;
    mime_type: string;
  };
}

export interface AgentImagePart extends BaseAgentMessagePart {
  type?: "image";
  image: string;
}

export interface AgentFileBlobPart extends BaseAgentMessagePart {
  type?: "file";
  file: {
    filename?: string;
    data: string;
    mimeType?: string;
    mime_type?: string;
  };
}

export interface AgentFunctionCallPart extends BaseAgentMessagePart {
  type?: "function_call";
  function_call: {
    id?: string;
    name: string;
    args: Record<string, unknown>;
  };
}

export interface AgentFunctionResponsePart extends BaseAgentMessagePart {
  type?: "function_response";
  function_response: {
    id?: string;
    name: string;
    response: Record<string, unknown>;
  };
}

export type AgentMessagePart = BaseAgentMessagePart;

export function isTextPart(part: AgentMessagePart): part is AgentTextPart {
  return typeof part.text === "string" && !part.thought;
}

export function isReasoningPart(part: AgentMessagePart): part is AgentReasoningPart {
  return part.thought === true;
}

export function isFileDataPart(part: AgentMessagePart): part is AgentFileDataPart {
  return Boolean(part.file_data || part.fileData);
}

export function isImagePart(part: AgentMessagePart): part is AgentImagePart {
  return typeof part.image === "string";
}

export function isFunctionCallPart(
  part: AgentMessagePart
): part is AgentFunctionCallPart {
  return Boolean(part.function_call || part.functionCall);
}

export function isFunctionResponsePart(
  part: AgentMessagePart
): part is AgentFunctionResponsePart {
  return Boolean(part.function_response || part.functionResponse);
}

export function normalizeAgentMessagePart(
  raw: Record<string, unknown>
): AgentMessagePart {
  if (
    typeof raw.text === "string" &&
    !raw.function_call &&
    !raw.functionCall &&
    !raw.file_data &&
    !raw.fileData
  ) {
    if (raw.thought === true) {
      return { type: "reasoning", text: raw.text, thought: true };
    }
    return { type: "text", text: raw.text };
  }

  const fnCall = (raw.function_call || raw.functionCall) as
    Record<string, unknown> | undefined;
  if (fnCall) {
    const callData = {
      id: (fnCall.id as string) || (raw.id as string),
      name: String(fnCall.name || "tool"),
      args: (fnCall.args as Record<string, unknown>) || {},
    };
    return {
      type: "function_call",
      function_call: callData,
      functionCall: callData,
    };
  }

  const fnResp = (raw.function_response || raw.functionResponse) as
    Record<string, unknown> | undefined;
  if (fnResp) {
    const respData = {
      id: (fnResp.id as string) || (raw.id as string),
      name: String(fnResp.name || "tool"),
      response: (fnResp.response as Record<string, unknown>) || {},
    };
    return {
      type: "function_response",
      function_response: respData,
      functionResponse: respData,
    };
  }

  const fileData = (raw.file_data || raw.fileData) as Record<string, unknown> | undefined;
  if (fileData) {
    const file_uri = String(fileData.file_uri || fileData.fileUri || "");
    const mime_type = String(
      fileData.mime_type || fileData.mimeType || "application/octet-stream"
    );
    return {
      type: "file_data",
      file_data: { file_uri, mime_type },
    };
  }

  if (typeof raw.image === "string") {
    return { type: "image", image: raw.image };
  }

  return { type: "text", text: String(raw.text || JSON.stringify(raw)) };
}
