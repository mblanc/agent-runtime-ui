import type { GroundingMetadata } from "./grounding";
import type { A2UIPartData, AgentA2UIActionPayload } from "./a2ui";

export interface GcsFileDataPart {
  file_data: {
    file_uri: string;
    mime_type: string;
  };
}

export type CodeExecutionLanguage = "PYTHON" | "JAVASCRIPT" | (string & {});

export type CodeExecutionOutcome =
  "OUTCOME_OK" | "OUTCOME_FAILED" | "OUTCOME_DEADLINE_EXCEEDED" | (string & {});

export interface ExecutableCodeData {
  language: CodeExecutionLanguage;
  code: string;
}

export interface CodeExecutionResultData {
  outcome: CodeExecutionOutcome;
  output: string;
  durationMs?: number;
  generatedImages?: string[];
}

export interface AgentCodeExecutionBlock {
  id: string;
  language: CodeExecutionLanguage;
  code: string;
  result?: CodeExecutionResultData;
  status: "running" | "complete" | "error";
}

export interface BaseAgentMessagePart {
  type?:
    | "text"
    | "reasoning"
    | "file_data"
    | "image"
    | "file"
    | "function_call"
    | "function_response"
    | "executable_code"
    | "code_execution_result"
    | "code_execution_block"
    | "a2ui"
    | "a2ui_action";
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
  executable_code?: ExecutableCodeData;
  executableCode?: ExecutableCodeData;
  code_execution_result?: CodeExecutionResultData;
  codeExecutionResult?: CodeExecutionResultData;
  code_execution_block?: AgentCodeExecutionBlock;
  codeExecutionBlock?: AgentCodeExecutionBlock;
  a2ui?: A2UIPartData;
  a2uiData?: A2UIPartData;
  a2ui_data?: A2UIPartData;
  a2uiAction?: AgentA2UIActionPayload;
  a2ui_action?: AgentA2UIActionPayload;
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

export interface AgentExecutableCodePart extends BaseAgentMessagePart {
  type?: "executable_code";
  executable_code: ExecutableCodeData;
  executableCode?: ExecutableCodeData;
}

export interface AgentCodeExecutionResultPart extends BaseAgentMessagePart {
  type?: "code_execution_result";
  code_execution_result: CodeExecutionResultData;
  codeExecutionResult?: CodeExecutionResultData;
}

export interface AgentCodeExecutionBlockPart extends BaseAgentMessagePart {
  type?: "code_execution_block";
  code_execution_block: AgentCodeExecutionBlock;
  codeExecutionBlock?: AgentCodeExecutionBlock;
}

export interface AgentA2UIPart extends BaseAgentMessagePart {
  type?: "a2ui";
  a2ui?: A2UIPartData;
  a2uiData?: A2UIPartData;
}

export interface AgentA2UIActionPart extends BaseAgentMessagePart {
  type?: "a2ui_action";
  a2uiAction?: AgentA2UIActionPayload;
  a2ui_action?: AgentA2UIActionPayload;
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

export function isExecutableCodePart(
  part: AgentMessagePart
): part is AgentExecutableCodePart {
  return Boolean(part.executable_code || part.executableCode);
}

export function isCodeExecutionResultPart(
  part: AgentMessagePart
): part is AgentCodeExecutionResultPart {
  return Boolean(part.code_execution_result || part.codeExecutionResult);
}

export function isCodeExecutionBlockPart(
  part: AgentMessagePart
): part is AgentCodeExecutionBlockPart {
  return Boolean(part.code_execution_block || part.codeExecutionBlock);
}

export function isA2UIPart(part: AgentMessagePart): part is AgentA2UIPart {
  return part.type === "a2ui" || Boolean(part.a2ui || part.a2uiData || part.a2ui_data);
}

export function isA2UIActionPart(part: AgentMessagePart): part is AgentA2UIActionPart {
  return part.type === "a2ui_action" || Boolean(part.a2uiAction || part.a2ui_action);
}

export function normalizeAgentMessagePart(
  raw: Record<string, unknown>
): AgentMessagePart {
  const execCode = (raw.executable_code || raw.executableCode) as
    Record<string, unknown> | undefined;
  if (execCode) {
    const codeData: ExecutableCodeData = {
      language: String(execCode.language || "PYTHON") as CodeExecutionLanguage,
      code: String(execCode.code || ""),
    };
    return {
      type: "executable_code",
      executable_code: codeData,
      executableCode: codeData,
    };
  }

  const codeResult = (raw.code_execution_result || raw.codeExecutionResult) as
    Record<string, unknown> | undefined;
  if (codeResult) {
    const resultData: CodeExecutionResultData = {
      outcome: String(codeResult.outcome || "OUTCOME_OK") as CodeExecutionOutcome,
      output: String(codeResult.output || ""),
      ...(typeof codeResult.durationMs === "number"
        ? { durationMs: codeResult.durationMs }
        : {}),
      ...(Array.isArray(codeResult.generatedImages)
        ? { generatedImages: codeResult.generatedImages as string[] }
        : {}),
    };
    return {
      type: "code_execution_result",
      code_execution_result: resultData,
      codeExecutionResult: resultData,
    };
  }

  const codeBlock = (raw.code_execution_block || raw.codeExecutionBlock) as
    AgentCodeExecutionBlock | undefined;
  if (codeBlock) {
    return {
      type: "code_execution_block",
      code_execution_block: codeBlock,
      codeExecutionBlock: codeBlock,
    };
  }

  if (
    typeof raw.text === "string" &&
    !raw.function_call &&
    !raw.functionCall &&
    !raw.file_data &&
    !raw.fileData &&
    !raw.executable_code &&
    !raw.executableCode &&
    !raw.code_execution_result &&
    !raw.codeExecutionResult
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

  const a2uiPayload = (raw.a2ui || raw.a2uiData || raw.a2ui_data) as
    A2UIPartData | undefined;
  if (a2uiPayload || raw.type === "a2ui") {
    const data = a2uiPayload || (raw as unknown as A2UIPartData);
    return {
      type: "a2ui",
      a2ui: data,
      a2uiData: data,
    };
  }

  const a2uiAction = (raw.a2uiAction || raw.a2ui_action) as
    AgentA2UIActionPayload | undefined;
  if (a2uiAction || raw.type === "a2ui_action") {
    return {
      type: "a2ui_action",
      a2uiAction: a2uiAction || (raw.payload as AgentA2UIActionPayload),
    };
  }

  return { type: "text", text: String(raw.text || JSON.stringify(raw)) };
}
