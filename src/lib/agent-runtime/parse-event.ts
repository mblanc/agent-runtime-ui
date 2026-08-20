import {
  AgentActionsDelta,
  AgentCodeExecutionBlock,
  AgentNodeInfo,
  AgentSessionEvent,
  AgentUsageMetadata,
  CodeExecutionLanguage,
  CodeExecutionOutcome,
  CodeExecutionResultData,
} from "@/types/agent";
import { extractGroundingMetadata } from "@/lib/grounding/citation-parser";
import { parseCodeExecutionOutput } from "@/lib/code-execution/output-parser";
import { extractToolCall, extractToolResult, safeParseJson } from "./event-utils";
import { extractArtifactsFromSessionEvent } from "@/lib/artifacts/artifact-extractor";
import { parseA2UIPayload, extractA2UIFromContent } from "@/lib/a2ui/a2ui-parser";

/**
 * Defensive parsing of a single untyped Vertex session event.
 */

export function parseRawSessionEvent(
  rawEvt: unknown,
  sessionId: string,
  fallbackIdx: number
): AgentSessionEvent {
  const parsed = safeParseJson(rawEvt);
  const root = (
    parsed && typeof parsed === "object" ? parsed : { content: rawEvt }
  ) as Record<string, unknown>;

  const config = (safeParseJson(root.config) || {}) as Record<string, unknown>;
  const rawEvent = (safeParseJson(
    root.raw_event || root.rawEvent || config.raw_event || config.rawEvent
  ) || {}) as Record<string, unknown>;
  const contentObj = (safeParseJson(root.content || config.content) || {}) as Record<
    string,
    unknown
  >;

  const authorCandidates = [
    root.author,
    root.role,
    config.author,
    config.role,
    contentObj.role,
    contentObj.author,
    rawEvent.role,
    rawEvent.author,
    root.userQuery || root.user_query ? "user" : null,
    root.modelResponse || root.model_response ? "model" : null,
  ].filter(Boolean) as string[];

  const isUser = authorCandidates.some(
    (a) => String(a).toLowerCase() === "user" || String(a).toLowerCase() === "human"
  );
  const role: "user" | "assistant" = isUser ? "user" : "assistant";

  const authorStr =
    (root.author as string) ||
    (config.author as string) ||
    (rawEvent.author as string) ||
    (contentObj.author as string) ||
    undefined;

  const invocationIdStr =
    (root.invocationId as string) ||
    (rawEvent.invocationId as string) ||
    (config.invocationId as string) ||
    undefined;

  const textPieces: string[] = [];
  const thoughtPieces: string[] = [];
  const parsedToolCalls: Array<{
    name: string;
    id?: string;
    args: Record<string, unknown>;
  }> = [];
  const parsedToolResults: Array<{
    name: string;
    id?: string;
    result: Record<string, unknown>;
  }> = [];
  const parsedCodeBlocks: AgentCodeExecutionBlock[] = [];

  const visitedObjects = new Set<unknown>();

  const inspectObject = (obj: unknown) => {
    if (!obj) return;
    const parsedObj = safeParseJson(obj);
    if (!parsedObj) return;

    if (typeof parsedObj === "object" && parsedObj !== null) {
      if (visitedObjects.has(parsedObj)) return;
      visitedObjects.add(parsedObj);
    }

    if (typeof parsedObj === "string") {
      const trimmed = parsedObj.trim();
      if (trimmed && !trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        textPieces.push(trimmed);
      }
      return;
    }

    if (Array.isArray(parsedObj)) {
      for (const item of parsedObj) {
        inspectObject(item);
      }
      return;
    }

    if (typeof parsedObj === "object") {
      const record = parsedObj as Record<string, unknown>;

      if (Array.isArray(record.parts)) {
        for (const part of record.parts) {
          if (typeof part === "string") {
            textPieces.push(part);
          } else if (part && typeof part === "object") {
            const p = part as Record<string, unknown>;
            const isPartThought =
              p.thought === true ||
              (typeof p.thought === "string" &&
                p.thought.trim().toLowerCase() !== "false" &&
                p.thought.trim() !== "0" &&
                Boolean(p.thought.trim())) ||
              (p.thought && typeof p.thought === "object");

            if (isPartThought) {
              if (typeof p.thought === "string" && p.thought.trim()) {
                thoughtPieces.push(p.thought.trim());
              } else if (p.thought && typeof p.thought === "object") {
                const t = p.thought as Record<string, unknown>;
                if (typeof t.text === "string" && t.text.trim()) {
                  thoughtPieces.push(t.text.trim());
                }
              } else if (typeof p.text === "string" && p.text.trim()) {
                thoughtPieces.push(p.text.trim());
              }
            } else if (typeof p.text === "string" && p.text.trim()) {
              textPieces.push(p.text.trim());
            }

            const tc = extractToolCall(p.functionCall || p.function_call);
            if (tc) parsedToolCalls.push(tc);

            const tr = extractToolResult(p.functionResponse || p.function_response);
            if (tr) parsedToolResults.push(tr);

            const execCode = (p.executable_code || p.executableCode) as
              Record<string, unknown> | undefined;
            if (execCode && typeof execCode === "object") {
              const code = String(execCode.code || "");
              const language = String(
                execCode.language || "PYTHON"
              ) as CodeExecutionLanguage;
              const existing = parsedCodeBlocks.find((b) => b.code === code);
              if (!existing) {
                parsedCodeBlocks.push({
                  id: `code-${sessionId}-${parsedCodeBlocks.length}`,
                  language,
                  code,
                  status: "running",
                });
              }
            }

            const codeRes = (p.code_execution_result || p.codeExecutionResult) as
              Record<string, unknown> | undefined;
            if (codeRes && typeof codeRes === "object") {
              const parsedOutput = parseCodeExecutionOutput(String(codeRes.output || ""));
              const resData: CodeExecutionResultData = {
                outcome: String(codeRes.outcome || "OUTCOME_OK") as CodeExecutionOutcome,
                output: String(codeRes.output || ""),
                ...(typeof codeRes.durationMs === "number"
                  ? { durationMs: codeRes.durationMs }
                  : {}),
                generatedImages: Array.isArray(codeRes.generatedImages)
                  ? (codeRes.generatedImages as string[])
                  : parsedOutput.images,
              };
              const isError =
                resData.outcome === "OUTCOME_FAILED" ||
                resData.outcome === "OUTCOME_DEADLINE_EXCEEDED";
              const blockStatus = isError ? "error" : "complete";

              const pendingBlock = parsedCodeBlocks
                .slice()
                .reverse()
                .find((b) => b.code && !b.result);
              if (pendingBlock) {
                pendingBlock.result = resData;
                pendingBlock.status = blockStatus;
              } else if (
                !parsedCodeBlocks.some((b) => b.result?.output === resData.output)
              ) {
                parsedCodeBlocks.push({
                  id: `code-res-${sessionId}-${parsedCodeBlocks.length}`,
                  language: "PYTHON",
                  code: "",
                  result: resData,
                  status: blockStatus,
                });
              }
            }
          }
        }
        return;
      }

      if (
        typeof record.thought === "string" &&
        record.thought.trim() &&
        record.thought !== "true"
      ) {
        thoughtPieces.push(record.thought.trim());
      } else if (record.thought && typeof record.thought === "object") {
        const t = record.thought as Record<string, unknown>;
        if (typeof t.text === "string" && t.text.trim()) {
          thoughtPieces.push(t.text.trim());
        }
      } else if (typeof record.reasoning === "string" && record.reasoning.trim()) {
        thoughtPieces.push(record.reasoning.trim());
      }

      if (typeof record.text === "string" && record.text.trim()) {
        if (record.thought === true && !record.content) {
          thoughtPieces.push(record.text.trim());
        } else {
          textPieces.push(record.text.trim());
        }
      } else if (typeof record.content === "string" && record.content.trim()) {
        if (record.thought === true) {
          thoughtPieces.push(record.content.trim());
        } else {
          textPieces.push(record.content.trim());
        }
      }

      const tc = extractToolCall(
        record.function_call || record.functionCall || record.tool_call
      );
      if (tc) parsedToolCalls.push(tc);

      const tr = extractToolResult(
        record.function_response || record.functionResponse || record.tool_result
      );
      if (tr) parsedToolResults.push(tr);

      if (Array.isArray(record.tool_calls)) {
        for (const item of record.tool_calls) {
          const extracted = extractToolCall(item);
          if (extracted) parsedToolCalls.push(extracted);
        }
      }

      if (Array.isArray(record.tool_results)) {
        for (const item of record.tool_results) {
          const extracted = extractToolResult(item);
          if (extracted) parsedToolResults.push(extracted);
        }
      }

      if (
        Array.isArray(record.codeExecutionBlocks) ||
        Array.isArray(record.code_execution_blocks)
      ) {
        const blocks = (record.codeExecutionBlocks ||
          record.code_execution_blocks) as AgentCodeExecutionBlock[];
        for (const block of blocks) {
          if (
            !parsedCodeBlocks.some(
              (b) => b.id === block.id || (b.code && b.code === block.code)
            )
          ) {
            parsedCodeBlocks.push(block);
          }
        }
      }

      if (typeof record.query === "string" && record.query.trim()) {
        textPieces.push(record.query.trim());
      }
      if (typeof record.response === "string" && record.response.trim()) {
        textPieces.push(record.response.trim());
      }
      if (record.actions && typeof record.actions === "object") {
        inspectObject(record.actions);
      }
      if (record.content && record.content !== obj) {
        inspectObject(record.content);
      }
      if (
        (record.raw_event || record.rawEvent) &&
        (record.raw_event || record.rawEvent) !== obj
      ) {
        inspectObject(record.raw_event || record.rawEvent);
      }
    }
  };

  if (root.thought) inspectObject({ thought: root.thought });
  if (config.thought) inspectObject({ thought: config.thought });
  if (root.content) {
    inspectObject(root.content);
  } else if (config.content) {
    inspectObject(config.content);
  } else if (root.raw_event || root.rawEvent) {
    inspectObject(root.raw_event || root.rawEvent);
  } else if (config.raw_event || config.rawEvent) {
    inspectObject(config.raw_event || config.rawEvent);
  }
  if (root.userQuery || root.user_query) inspectObject(root.userQuery || root.user_query);
  if (root.modelResponse || root.model_response)
    inspectObject(root.modelResponse || root.model_response);

  if (Array.isArray(root.tool_calls)) {
    for (const item of root.tool_calls) {
      const extracted = extractToolCall(item);
      if (extracted) parsedToolCalls.push(extracted);
    }
  }
  if (root.tool_call) {
    const extracted = extractToolCall(root.tool_call);
    if (extracted) parsedToolCalls.push(extracted);
  }
  if (Array.isArray(root.tool_results)) {
    for (const item of root.tool_results) {
      const extracted = extractToolResult(item);
      if (extracted) parsedToolResults.push(extracted);
    }
  }
  if (root.tool_result) {
    const extracted = extractToolResult(root.tool_result);
    if (extracted) parsedToolResults.push(extracted);
  }
  if (
    Array.isArray(root.code_execution_blocks) ||
    Array.isArray(root.codeExecutionBlocks)
  ) {
    const blocks = (root.code_execution_blocks ||
      root.codeExecutionBlocks) as AgentCodeExecutionBlock[];
    for (const block of blocks) {
      if (!parsedCodeBlocks.some((b) => b.id === block.id)) {
        parsedCodeBlocks.push(block);
      }
    }
  }

  if (textPieces.length === 0) {
    inspectObject(root);
  }

  const uniqueTextPieces = Array.from(new Set(textPieces));
  const uniqueThoughtPieces = Array.from(new Set(thoughtPieces));

  const uniqueToolCalls: Array<{
    name: string;
    id?: string;
    args: Record<string, unknown>;
  }> = [];
  const seenCalls = new Set<string>();
  for (const call of parsedToolCalls) {
    const key = `${call.name}:${JSON.stringify(call.args || {})}`;
    if (!seenCalls.has(key)) {
      seenCalls.add(key);
      uniqueToolCalls.push(call);
    }
  }

  const uniqueToolResults: Array<{
    name: string;
    id?: string;
    result: Record<string, unknown>;
  }> = [];
  const seenResults = new Set<string>();
  for (const res of parsedToolResults) {
    const key = `${res.name}:${JSON.stringify(res.result || {})}`;
    if (!seenResults.has(key)) {
      seenResults.add(key);
      uniqueToolResults.push(res);
    }
  }

  const content = uniqueTextPieces.join("\n").trim();
  const thought =
    uniqueThoughtPieces.length > 0 ? uniqueThoughtPieces.join("\n").trim() : undefined;

  const nameStr = (root.name as string) || "";
  const parts = nameStr.split("/");
  const id =
    (typeof rawEvent.id === "string" && rawEvent.id ? rawEvent.id : undefined) ||
    (typeof rawEvent.event_id === "string" && rawEvent.event_id
      ? rawEvent.event_id
      : undefined) ||
    (typeof root.id === "string" && root.id ? root.id : undefined) ||
    (typeof root.event_id === "string" && root.event_id ? root.event_id : undefined) ||
    parts[parts.length - 1] ||
    `event-${sessionId}-${fallbackIdx}`;

  const createTime =
    (root.timestamp as string) ||
    (root.createTime as string) ||
    (root.create_time as string) ||
    (config.timestamp as string) ||
    new Date().toISOString();

  const finalRole =
    uniqueToolCalls.length > 0 || uniqueToolResults.length > 0 ? "assistant" : role;

  const groundingMeta = extractGroundingMetadata(
    root.groundingMetadata ||
      root.grounding_metadata ||
      rawEvent.groundingMetadata ||
      rawEvent.grounding_metadata ||
      config.groundingMetadata ||
      config.grounding_metadata ||
      root
  );

  const modelVersionStr =
    (root.modelVersion as string) ||
    (root.model_version as string) ||
    (config.modelVersion as string) ||
    (config.model_version as string) ||
    (rawEvent.modelVersion as string) ||
    (rawEvent.model_version as string) ||
    (root.model as string) ||
    undefined;

  const usageMeta = (root.usageMetadata ||
    root.usage_metadata ||
    root.usage ||
    config.usageMetadata ||
    config.usage_metadata ||
    config.usage ||
    rawEvent.usageMetadata ||
    rawEvent.usage_metadata ||
    rawEvent.usage ||
    (rawEvent.response as Record<string, unknown>)?.usageMetadata ||
    (rawEvent.response as Record<string, unknown>)?.usage_metadata ||
    (rawEvent.output as Record<string, unknown>)?.usageMetadata ||
    (rawEvent.output as Record<string, unknown>)?.usage_metadata ||
    (root.metadata as Record<string, unknown>)?.usageMetadata ||
    (root.metadata as Record<string, unknown>)?.usage_metadata) as
    Record<string, unknown> | undefined;

  let parsedUsageMetadata: AgentUsageMetadata | undefined;
  if (usageMeta && typeof usageMeta === "object") {
    const promptCount =
      typeof usageMeta.prompt_token_count === "number"
        ? usageMeta.prompt_token_count
        : typeof usageMeta.promptTokenCount === "number"
          ? usageMeta.promptTokenCount
          : undefined;
    const candidatesCount =
      typeof usageMeta.candidates_token_count === "number"
        ? usageMeta.candidates_token_count
        : typeof usageMeta.candidatesTokenCount === "number"
          ? usageMeta.candidatesTokenCount
          : undefined;
    const thoughtsCount =
      typeof usageMeta.thoughts_token_count === "number"
        ? usageMeta.thoughts_token_count
        : typeof usageMeta.thoughtsTokenCount === "number"
          ? usageMeta.thoughtsTokenCount
          : undefined;
    const totalCount =
      typeof usageMeta.total_token_count === "number"
        ? usageMeta.total_token_count
        : typeof usageMeta.totalTokenCount === "number"
          ? usageMeta.totalTokenCount
          : undefined;
    let cachedCount =
      typeof usageMeta.cached_content_token_count === "number"
        ? usageMeta.cached_content_token_count
        : typeof usageMeta.cachedContentTokenCount === "number"
          ? usageMeta.cachedContentTokenCount
          : typeof usageMeta.cached_token_count === "number"
            ? usageMeta.cached_token_count
            : typeof usageMeta.cachedTokenCount === "number"
              ? usageMeta.cachedTokenCount
              : undefined;

    const promptDetails =
      usageMeta.prompt_tokens_details || usageMeta.promptTokensDetails;
    if (cachedCount === undefined && Array.isArray(promptDetails)) {
      const cachedDetail = (promptDetails as Array<Record<string, unknown>>).find(
        (d) =>
          String(d.modality || "")
            .toUpperCase()
            .includes("CACHE") ||
          String(d.tokenType || "")
            .toUpperCase()
            .includes("CACHE")
      );
      if (cachedDetail) {
        cachedCount =
          typeof cachedDetail.token_count === "number"
            ? cachedDetail.token_count
            : typeof cachedDetail.tokenCount === "number"
              ? cachedDetail.tokenCount
              : undefined;
      }
    }

    const trafficType =
      typeof usageMeta.traffic_type === "string"
        ? usageMeta.traffic_type
        : typeof usageMeta.trafficType === "string"
          ? usageMeta.trafficType
          : undefined;

    parsedUsageMetadata = {
      ...(promptCount !== undefined
        ? { prompt_token_count: promptCount, promptTokenCount: promptCount }
        : {}),
      ...(candidatesCount !== undefined
        ? {
            candidates_token_count: candidatesCount,
            candidatesTokenCount: candidatesCount,
          }
        : {}),
      ...(thoughtsCount !== undefined
        ? { thoughts_token_count: thoughtsCount, thoughtsTokenCount: thoughtsCount }
        : {}),
      ...(cachedCount !== undefined
        ? {
            cached_content_token_count: cachedCount,
            cachedContentTokenCount: cachedCount,
            cached_token_count: cachedCount,
            cachedTokenCount: cachedCount,
          }
        : {}),
      ...(totalCount !== undefined
        ? { total_token_count: totalCount, totalTokenCount: totalCount }
        : {}),
      ...(trafficType ? { traffic_type: trafficType, trafficType } : {}),
      ...(Array.isArray(usageMeta.prompt_tokens_details || usageMeta.promptTokensDetails)
        ? {
            prompt_tokens_details: (usageMeta.prompt_tokens_details ||
              usageMeta.promptTokensDetails) as AgentUsageMetadata["prompt_tokens_details"],
            promptTokensDetails: (usageMeta.prompt_tokens_details ||
              usageMeta.promptTokensDetails) as AgentUsageMetadata["prompt_tokens_details"],
          }
        : {}),
      ...(Array.isArray(
        usageMeta.candidates_tokens_details || usageMeta.candidatesTokensDetails
      )
        ? {
            candidates_tokens_details: (usageMeta.candidates_tokens_details ||
              usageMeta.candidatesTokensDetails) as AgentUsageMetadata["candidates_tokens_details"],
            candidatesTokensDetails: (usageMeta.candidates_tokens_details ||
              usageMeta.candidatesTokensDetails) as AgentUsageMetadata["candidates_tokens_details"],
          }
        : {}),
      ...(Array.isArray(usageMeta.cached_tokens_details || usageMeta.cachedTokensDetails)
        ? {
            cached_tokens_details: (usageMeta.cached_tokens_details ||
              usageMeta.cachedTokensDetails) as AgentUsageMetadata["cached_tokens_details"],
            cachedTokensDetails: (usageMeta.cached_tokens_details ||
              usageMeta.cachedTokensDetails) as AgentUsageMetadata["cached_tokens_details"],
          }
        : {}),
    };
  }

  const avgLogprobsVal =
    typeof root.avg_logprobs === "number"
      ? root.avg_logprobs
      : typeof root.avgLogprobs === "number"
        ? root.avgLogprobs
        : typeof rawEvent.avg_logprobs === "number"
          ? rawEvent.avg_logprobs
          : typeof rawEvent.avgLogprobs === "number"
            ? rawEvent.avgLogprobs
            : typeof config.avg_logprobs === "number"
              ? config.avg_logprobs
              : typeof config.avgLogprobs === "number"
                ? config.avgLogprobs
                : undefined;

  const nodeInfoObj = (root.node_info ||
    root.nodeInfo ||
    rawEvent.node_info ||
    rawEvent.nodeInfo ||
    config.node_info ||
    config.nodeInfo) as AgentNodeInfo | undefined;

  const nodePathStr =
    nodeInfoObj?.path ||
    (typeof root.node_path === "string" ? root.node_path : undefined) ||
    (typeof root.nodePath === "string" ? root.nodePath : undefined) ||
    (typeof rawEvent.node_path === "string" ? rawEvent.node_path : undefined) ||
    (typeof rawEvent.nodePath === "string" ? rawEvent.nodePath : undefined) ||
    (typeof config.node_path === "string" ? config.node_path : undefined) ||
    (typeof config.nodePath === "string" ? config.nodePath : undefined) ||
    undefined;

  let thoughtSigStr =
    (typeof root.thought_signature === "string" ? root.thought_signature : undefined) ||
    (typeof root.thoughtSignature === "string" ? root.thoughtSignature : undefined) ||
    (typeof rawEvent.thought_signature === "string"
      ? rawEvent.thought_signature
      : undefined) ||
    (typeof rawEvent.thoughtSignature === "string"
      ? rawEvent.thoughtSignature
      : undefined) ||
    (typeof config.thought_signature === "string"
      ? config.thought_signature
      : undefined) ||
    (typeof config.thoughtSignature === "string" ? config.thoughtSignature : undefined) ||
    undefined;

  const contentCandidates = [root.content, rawEvent.content, config.content];

  if (!thoughtSigStr) {
    for (const c of contentCandidates) {
      if (
        c &&
        typeof c === "object" &&
        Array.isArray((c as Record<string, unknown>).parts)
      ) {
        for (const p of (c as Record<string, unknown>).parts as Array<
          Record<string, unknown>
        >) {
          if (p && typeof p === "object") {
            if (typeof p.thought_signature === "string" && p.thought_signature) {
              thoughtSigStr = p.thought_signature;
              break;
            }
            if (typeof p.thoughtSignature === "string" && p.thoughtSignature) {
              thoughtSigStr = p.thoughtSignature;
              break;
            }
          }
        }
      }
      if (thoughtSigStr) break;
    }
  }

  const actionsObj = (root.actions || rawEvent.actions || config.actions) as
    AgentActionsDelta | undefined;

  const finishReasonStr =
    (typeof root.finish_reason === "string" ? root.finish_reason : undefined) ||
    (typeof root.finishReason === "string" ? root.finishReason : undefined) ||
    (typeof rawEvent.finish_reason === "string" ? rawEvent.finish_reason : undefined) ||
    (typeof rawEvent.finishReason === "string" ? rawEvent.finishReason : undefined) ||
    (typeof config.finish_reason === "string" ? config.finish_reason : undefined) ||
    (typeof config.finishReason === "string" ? config.finishReason : undefined) ||
    undefined;

  const rawTimestamp =
    root.timestamp ??
    rawEvent.timestamp ??
    config.timestamp ??
    (typeof root.createTime === "string" ? root.createTime : undefined);

  const timestampVal =
    typeof rawTimestamp === "number" || typeof rawTimestamp === "string"
      ? rawTimestamp
      : undefined;

  const a2uiRaw =
    root.a2ui ||
    root.a2uiData ||
    root.a2ui_data ||
    config.a2ui ||
    config.a2uiData ||
    rawEvent.a2ui ||
    rawEvent.a2uiData ||
    rawEvent.a2ui_data;
  let parsedA2UI = a2uiRaw ? parseA2UIPayload(a2uiRaw) : undefined;
  let cleanContent = content;

  if (content && typeof content === "string") {
    if (
      content.includes("---a2ui_JSON---") ||
      content.includes("```a2ui") ||
      content.includes("```json:a2ui") ||
      content.includes("<!-- a2ui_start -->")
    ) {
      const extracted = extractA2UIFromContent(content);
      if (extracted.a2ui) {
        parsedA2UI = parsedA2UI || extracted.a2ui;
        cleanContent = extracted.cleanText;
      }
    }
  }

  return {
    id,
    name: nameStr || undefined,
    sessionId,
    createTime,
    role: finalRole,
    author: authorStr,
    invocationId: invocationIdStr,
    ...(modelVersionStr
      ? { modelVersion: modelVersionStr, model_version: modelVersionStr }
      : {}),
    content: cleanContent,
    ...(thought ? { thought } : {}),
    ...(thoughtSigStr
      ? { thoughtSignature: thoughtSigStr, thought_signature: thoughtSigStr }
      : {}),
    ...(uniqueToolCalls.length > 0 ? { tool_calls: uniqueToolCalls } : {}),
    ...(uniqueToolResults.length > 0 ? { tool_results: uniqueToolResults } : {}),
    ...(uniqueToolCalls.length > 0 ? { tool_call: uniqueToolCalls[0] } : {}),
    ...(uniqueToolResults.length > 0 ? { tool_result: uniqueToolResults[0] } : {}),
    ...(parsedCodeBlocks.length > 0
      ? {
          codeExecutionBlocks: parsedCodeBlocks,
          code_execution_blocks: parsedCodeBlocks,
        }
      : {}),
    ...(parsedA2UI
      ? { a2ui: parsedA2UI, a2uiData: parsedA2UI, a2ui_data: parsedA2UI }
      : {}),
    ...(groundingMeta
      ? { groundingMetadata: groundingMeta, grounding_metadata: groundingMeta }
      : {}),
    ...(parsedUsageMetadata
      ? { usageMetadata: parsedUsageMetadata, usage_metadata: parsedUsageMetadata }
      : {}),
    ...(avgLogprobsVal !== undefined
      ? { avgLogprobs: avgLogprobsVal, avg_logprobs: avgLogprobsVal }
      : {}),
    ...(nodeInfoObj ? { nodeInfo: nodeInfoObj, node_info: nodeInfoObj } : {}),
    ...(nodePathStr ? { nodePath: nodePathStr, node_path: nodePathStr } : {}),
    ...(actionsObj ? { actions: actionsObj } : {}),
    ...(finishReasonStr
      ? { finishReason: finishReasonStr, finish_reason: finishReasonStr }
      : {}),
    ...(timestampVal !== undefined ? { timestamp: timestampVal } : {}),
    ...(() => {
      const extractedArts = extractArtifactsFromSessionEvent({
        ...root,
        content,
        tool_calls: uniqueToolCalls,
        tool_results: uniqueToolResults,
        actions: actionsObj,
        rawEvent,
      });
      return extractedArts.length > 0
        ? { artifacts: extractedArts, artifact: extractedArts[0] }
        : {};
    })(),
    rawEvent: Object.keys(rawEvent).length > 0 ? rawEvent : root,
  };
}
