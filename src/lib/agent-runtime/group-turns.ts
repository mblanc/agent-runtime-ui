import {
  AgentCodeExecutionBlock,
  AgentSessionEvent,
  ReasoningTraceEntry,
} from "@/types/agent";
import { formatAgentDisplayName } from "@/lib/utils";
import {
  extractGroundingMetadata,
  mergeGroundingMetadata,
} from "@/lib/grounding/citation-parser";
import {
  extractSubagentName,
  getEventToolCalls,
  getEventToolResults,
  isRootWorkflowOutput,
  isSubagentNode,
} from "./event-utils";
import { parseRawSessionEvent } from "./parse-event";
import { formatReasoningTrace } from "./reasoning-directives";
import { extractArtifactsFromSessionEvent } from "@/lib/artifacts/artifact-extractor";
import {
  isLoadSkillTool,
  isSearchSkillsTool,
  parseLoadedSkillPayload,
  parseSearchSkillsPayload,
} from "@/lib/skills/skill-parser";
import type { ArtifactStreamPayload } from "@/types/agent";

/**
 * Turn segmentation: groups a flat event list into user/assistant turns,
 * folds subagent activity into the owning turn, and pairs tool calls with
 * their results.
 */

export function groupTurnSessionEvents(
  rawEvents: unknown[],
  sessionId: string
): AgentSessionEvent[] {
  if (!rawEvents || rawEvents.length === 0) return [];

  const parsedEvents = rawEvents.map((evt, idx) =>
    parseRawSessionEvent(evt, sessionId, idx)
  );

  const turns: Array<{
    userEvent?: AgentSessionEvent;
    assistantEvents: AgentSessionEvent[];
  }> = [];

  let currentTurn: {
    userEvent?: AgentSessionEvent;
    assistantEvents: AgentSessionEvent[];
  } = { assistantEvents: [] };

  for (const evt of parsedEvents) {
    if (evt.role === "user") {
      if (currentTurn.userEvent || currentTurn.assistantEvents.length > 0) {
        turns.push(currentTurn);
      }
      currentTurn = { userEvent: evt, assistantEvents: [] };
    } else {
      currentTurn.assistantEvents.push(evt);
    }
  }

  if (currentTurn.userEvent || currentTurn.assistantEvents.length > 0) {
    turns.push(currentTurn);
  }

  const result: AgentSessionEvent[] = [];

  for (const turn of turns) {
    if (turn.userEvent) {
      result.push(turn.userEvent);
    }

    if (turn.assistantEvents.length === 0) {
      continue;
    }

    if (turn.assistantEvents.length === 1) {
      const singleEvt = { ...turn.assistantEvents[0] };
      const hasTools =
        (singleEvt.tool_calls && singleEvt.tool_calls.length > 0) ||
        Boolean(singleEvt.tool_call) ||
        getEventToolCalls(singleEvt).length > 0;
      const hasToolResults =
        (singleEvt.tool_results && singleEvt.tool_results.length > 0) ||
        Boolean(singleEvt.tool_result) ||
        getEventToolResults(singleEvt).length > 0;
      const hasCode =
        (singleEvt.codeExecutionBlocks && singleEvt.codeExecutionBlocks.length > 0) ||
        (singleEvt.code_execution_blocks && singleEvt.code_execution_blocks.length > 0);
      const hasSubs = singleEvt.subAgents && singleEvt.subAgents.length > 0;
      const hasTrace = singleEvt.reasoningTrace && singleEvt.reasoningTrace.length > 0;
      const hasThought = Boolean(singleEvt.thought?.trim());

      if (
        !hasTools &&
        !hasToolResults &&
        !hasCode &&
        !hasSubs &&
        !hasTrace &&
        !hasThought
      ) {
        const singleArtifacts = extractArtifactsFromSessionEvent(singleEvt);
        if (singleArtifacts.length > 0) {
          singleEvt.artifacts = singleArtifacts;
        }
        result.push(singleEvt);
        continue;
      }
    }

    let finalIdx = -1;
    for (let i = turn.assistantEvents.length - 1; i >= 0; i--) {
      if (turn.assistantEvents[i].content?.trim()) {
        finalIdx = i;
        break;
      }
    }

    if (finalIdx === -1) {
      finalIdx = turn.assistantEvents.findIndex((e) => isRootWorkflowOutput(e.rawEvent));
    }

    if (finalIdx === -1) {
      finalIdx = turn.assistantEvents.length - 1;
    }

    const rawFinalEvent = turn.assistantEvents[finalIdx];
    const finalEvent = { ...rawFinalEvent };

    const intermediateEvents = turn.assistantEvents.filter((_, idx) => idx !== finalIdx);

    // 1. Group subagent activity from intermediate events
    const subAgentsList = [];
    const subagentsGrouped = new Map<
      string,
      {
        id: string;
        agentName: string;
        displayName: string;
        contentParts: string[];
        thoughtParts: string[];
        timestamp?: string;
      }
    >();

    const genericAuthors = new Set([
      "agent",
      "sub_agent",
      "subagent",
      "root",
      "workflow",
      "model",
      "assistant",
      "user",
    ]);

    for (const evt of intermediateEvents) {
      const isSub = isSubagentNode(evt.rawEvent as Record<string, unknown> | undefined);
      const subName = isSub
        ? extractSubagentName(evt.rawEvent as Record<string, unknown> | undefined)
        : evt.author && !genericAuthors.has(evt.author.toLowerCase())
          ? evt.author
          : undefined;

      if (isSub || subName) {
        const agentKey = subName || "subagent";
        const displayName = formatAgentDisplayName(agentKey);
        const content = evt.content?.trim() || "";
        const thought = evt.thought?.trim() || "";
        const existing = subagentsGrouped.get(agentKey);
        if (existing) {
          if (content && !existing.contentParts.includes(content)) {
            existing.contentParts.push(content);
          }
          if (thought && !existing.thoughtParts.includes(thought)) {
            existing.thoughtParts.push(thought);
          }
        } else {
          subagentsGrouped.set(agentKey, {
            id: evt.id,
            agentName: agentKey,
            displayName,
            contentParts: content ? [content] : [],
            thoughtParts: thought ? [thought] : [],
            timestamp: evt.createTime,
          });
        }
      }
    }

    const subagentTraceEntries: ReasoningTraceEntry[] = [];
    for (const sub of subagentsGrouped.values()) {
      const combinedContent = sub.contentParts.join("\n\n").trim();
      const combinedThought = sub.thoughtParts.join("\n\n").trim();

      if (combinedContent) {
        subAgentsList.push({
          id: sub.id,
          agentName: sub.agentName,
          displayName: sub.displayName,
          status: "complete" as const,
          content: combinedContent,
          thought: combinedThought || undefined,
          timestamp: sub.timestamp,
        });

        subagentTraceEntries.push({
          type: "subagent",
          id: sub.id,
          displayName: sub.displayName,
          agentName: sub.agentName,
          response: combinedContent,
          status: "complete",
        });
      }
    }

    // 2. Gather and pair tool calls and results across all events in the turn
    const callsWithEvent: Array<{
      eventIdx: number;
      call: { id?: string; name: string; args: Record<string, unknown> };
    }> = [];
    const resultsWithEvent: Array<{
      eventIdx: number;
      resIdx: number;
      result: { id?: string; name: string; result: Record<string, unknown> };
    }> = [];

    for (let i = 0; i < turn.assistantEvents.length; i++) {
      const evt = turn.assistantEvents[i];
      const calls = getEventToolCalls(evt);
      for (const call of calls) {
        callsWithEvent.push({ eventIdx: i, call });
      }
      const results = getEventToolResults(evt);
      for (let rIdx = 0; rIdx < results.length; rIdx++) {
        resultsWithEvent.push({ eventIdx: i, resIdx: rIdx, result: results[rIdx] });
      }
    }

    const usedResultKeys = new Set<string>();
    const processedCallKeys = new Set<string>();
    const toolTraceEntries: ReasoningTraceEntry[] = [];
    const turnToolCalls: Array<{
      id?: string;
      name: string;
      args: Record<string, unknown>;
    }> = [];
    const turnToolResults: Array<{
      id?: string;
      name: string;
      result: Record<string, unknown>;
    }> = [];

    for (const { eventIdx, call } of callsWithEvent) {
      const toolName = call.name || "tool";
      const argsStr = JSON.stringify(call.args || {}, null, 2);
      const callKey = `${toolName}-${argsStr}`;
      turnToolCalls.push(call);

      let matchedResultStr: string | undefined;
      let matchedResultObj:
        { id?: string; name: string; result: Record<string, unknown> } | undefined;

      // Match by ID first
      if (call.id) {
        for (const item of resultsWithEvent) {
          const key = `${item.eventIdx}-${item.resIdx}`;
          if (item.result.id === call.id && !usedResultKeys.has(key)) {
            usedResultKeys.add(key);
            matchedResultStr = JSON.stringify(item.result.result || {}, null, 2);
            matchedResultObj = item.result;
            break;
          }
        }
      }

      // Fallback match by name
      if (matchedResultStr === undefined) {
        for (const item of resultsWithEvent) {
          const key = `${item.eventIdx}-${item.resIdx}`;
          if (
            item.result.name === toolName &&
            !(call.id && item.result.id) &&
            !usedResultKeys.has(key)
          ) {
            usedResultKeys.add(key);
            matchedResultStr = JSON.stringify(item.result.result || {}, null, 2);
            matchedResultObj = item.result;
            break;
          }
        }
      }

      if (matchedResultObj) {
        turnToolResults.push(matchedResultObj);
      }

      const evtId = turn.assistantEvents[eventIdx]?.id || `evt-${eventIdx}`;
      const toolCallId = call.id || `${evtId}-call-${toolTraceEntries.length}`;

      if (isLoadSkillTool(toolName)) {
        processedCallKeys.add(callKey);
        const skill = parseLoadedSkillPayload(call.args, matchedResultObj?.result);
        if (skill) {
          toolTraceEntries.push({
            type: "skill_loaded",
            skill,
            status: "complete",
            toolCallId,
          });
        } else {
          toolTraceEntries.push({
            type: "tool",
            toolCallId,
            toolName,
            argsJson: argsStr,
            resultJson: matchedResultStr,
            status: "complete",
          });
        }
      } else if (isSearchSkillsTool(toolName)) {
        processedCallKeys.add(callKey);
        const search = parseSearchSkillsPayload(call.args, matchedResultObj?.result);
        toolTraceEntries.push({
          type: "skill_search",
          query: search?.query || "skills",
          matches: search?.matches,
          status: "complete",
          toolCallId,
        });
      } else if (matchedResultStr !== undefined) {
        processedCallKeys.add(callKey);
        toolTraceEntries.push({
          type: "tool",
          toolCallId,
          toolName,
          argsJson: argsStr,
          resultJson: matchedResultStr,
          status: "complete",
        });
      } else if (!processedCallKeys.has(callKey)) {
        processedCallKeys.add(callKey);
        toolTraceEntries.push({
          type: "tool",
          toolCallId,
          toolName,
          argsJson: argsStr,
          status: "complete",
        });
      }
    }

    // Unpaired results
    for (const item of resultsWithEvent) {
      const key = `${item.eventIdx}-${item.resIdx}`;
      if (!usedResultKeys.has(key)) {
        usedResultKeys.add(key);
        turnToolResults.push(item.result);
        const toolName = item.result.name || "tool";
        const resStr = JSON.stringify(item.result.result || {}, null, 2);
        const evtId = turn.assistantEvents[item.eventIdx]?.id || `evt-${item.eventIdx}`;
        const toolCallId = item.result.id || `${evtId}-result-${item.resIdx}`;

        if (isLoadSkillTool(toolName)) {
          const skill = parseLoadedSkillPayload(undefined, item.result.result);
          if (skill) {
            toolTraceEntries.push({
              type: "skill_loaded",
              skill,
              status: "complete",
              toolCallId,
            });
          } else {
            toolTraceEntries.push({
              type: "tool",
              toolCallId,
              toolName,
              resultJson: resStr,
              status: "complete",
            });
          }
        } else if (isSearchSkillsTool(toolName)) {
          const search = parseSearchSkillsPayload(undefined, item.result.result);
          toolTraceEntries.push({
            type: "skill_search",
            query: search?.query || "skills",
            matches: search?.matches,
            status: "complete",
            toolCallId,
          });
        } else {
          toolTraceEntries.push({
            type: "tool",
            toolCallId,
            toolName,
            resultJson: resStr,
            status: "complete",
          });
        }
      }
    }

    // 3. Aggregate code execution blocks
    const aggregatedCodeBlocks: AgentCodeExecutionBlock[] = [];
    for (const event of turn.assistantEvents) {
      const blocks = event.codeExecutionBlocks || event.code_execution_blocks || [];
      for (const block of blocks) {
        if (block.code && !block.result) {
          const existingWithSameCode = aggregatedCodeBlocks.find(
            (b) => b.code === block.code
          );
          if (!existingWithSameCode) {
            aggregatedCodeBlocks.push({ ...block });
          }
        } else if (!block.code && block.result) {
          const pending = aggregatedCodeBlocks
            .slice()
            .reverse()
            .find((b) => b.code && !b.result);
          if (pending) {
            pending.result = block.result;
            pending.status =
              block.result.outcome === "OUTCOME_FAILED" ||
              block.result.outcome === "OUTCOME_DEADLINE_EXCEEDED"
                ? "error"
                : "complete";
          } else if (
            !aggregatedCodeBlocks.some((b) => b.result?.output === block.result?.output)
          ) {
            aggregatedCodeBlocks.push({ ...block });
          }
        } else {
          const existingWithSameCode = aggregatedCodeBlocks.find(
            (b) => b.code && b.code === block.code
          );
          if (existingWithSameCode) {
            if (block.result) {
              existingWithSameCode.result = block.result;
              existingWithSameCode.status = block.status;
            }
          } else {
            const existingIdx = aggregatedCodeBlocks.findIndex((b) => b.id === block.id);
            if (existingIdx !== -1) {
              aggregatedCodeBlocks[existingIdx] = { ...block };
            } else {
              aggregatedCodeBlocks.push({ ...block });
            }
          }
        }
      }
    }

    const codeTraceEntries: ReasoningTraceEntry[] = [];
    for (const b of aggregatedCodeBlocks) {
      if (b.status === "running" && b.result) {
        b.status =
          b.result.outcome === "OUTCOME_FAILED" ||
          b.result.outcome === "OUTCOME_DEADLINE_EXCEEDED"
            ? "error"
            : "complete";
      }
      codeTraceEntries.push({
        type: "code_execution",
        block: b,
      });
    }

    // 4. Collect and deduplicate thoughts across all events in the turn
    const rawThoughts: string[] = [];
    for (const evt of turn.assistantEvents) {
      if (evt.thought?.trim()) {
        rawThoughts.push(evt.thought.trim());
      }
    }

    const dedupedThoughts: string[] = [];
    for (const t of rawThoughts) {
      const trimmed = t.trim();
      if (!trimmed) continue;
      const existingIdx = dedupedThoughts.findIndex(
        (existing) =>
          existing === trimmed || existing.includes(trimmed) || trimmed.includes(existing)
      );
      if (existingIdx !== -1) {
        if (trimmed.length > dedupedThoughts[existingIdx].length) {
          dedupedThoughts[existingIdx] = trimmed;
        }
      } else {
        dedupedThoughts.push(trimmed);
      }
    }

    // 5. Assemble ordered reasoningTrace:
    // - Initial deliberation thought (if any) is ALWAYS placed BEFORE actions (tools, subagents, code).
    // - Actions (tool calls, subagents, code execution) follow in logical order.
    // - Any subsequent distinct post-action thoughts follow after the actions.
    const reasoningTrace: ReasoningTraceEntry[] = [];
    if (dedupedThoughts.length > 0) {
      reasoningTrace.push({ type: "thought", text: dedupedThoughts[0] });
    }
    reasoningTrace.push(...toolTraceEntries);
    reasoningTrace.push(...subagentTraceEntries);
    reasoningTrace.push(...codeTraceEntries);
    if (dedupedThoughts.length > 1) {
      for (const followUpThought of dedupedThoughts.slice(1)) {
        reasoningTrace.push({ type: "thought", text: followUpThought });
      }
    }

    const unifiedThought =
      reasoningTrace.length > 0 ? formatReasoningTrace(reasoningTrace) : undefined;

    const codeExecutionBlocks =
      aggregatedCodeBlocks.length > 0 ? aggregatedCodeBlocks : undefined;

    const turnArtifacts: ArtifactStreamPayload[] = [];
    for (const evt of turn.assistantEvents) {
      const arts = extractArtifactsFromSessionEvent(evt);
      for (const a of arts) {
        if (!turnArtifacts.some((existing) => existing.filename === a.filename)) {
          turnArtifacts.push(a);
        }
      }
    }

    const allTurnGroundingMetas = [
      ...turn.assistantEvents.map(
        (e) => e.groundingMetadata || e.grounding_metadata || extractGroundingMetadata(e)
      ),
      finalEvent.groundingMetadata ||
        finalEvent.grounding_metadata ||
        extractGroundingMetadata(finalEvent),
    ];
    const groundingMeta = mergeGroundingMetadata(allTurnGroundingMetas);

    const modelVersion =
      finalEvent.modelVersion ||
      finalEvent.model_version ||
      turn.assistantEvents.find((e) => e.modelVersion || e.model_version)?.modelVersion ||
      turn.assistantEvents.find((e) => e.modelVersion || e.model_version)?.model_version;

    const invocationId =
      finalEvent.invocationId ||
      finalEvent.invocation_id ||
      turn.assistantEvents.find((e) => e.invocationId || e.invocation_id)?.invocationId ||
      turn.assistantEvents.find((e) => e.invocationId || e.invocation_id)?.invocation_id;

    const usageMetadata =
      finalEvent.usageMetadata ||
      finalEvent.usage_metadata ||
      turn.assistantEvents.find((e) => e.usageMetadata || e.usage_metadata)
        ?.usageMetadata ||
      turn.assistantEvents.find((e) => e.usageMetadata || e.usage_metadata)
        ?.usage_metadata;

    const avgLogprobs =
      finalEvent.avgLogprobs ??
      finalEvent.avg_logprobs ??
      turn.assistantEvents.find(
        (e) => e.avgLogprobs !== undefined || e.avg_logprobs !== undefined
      )?.avgLogprobs ??
      turn.assistantEvents.find(
        (e) => e.avgLogprobs !== undefined || e.avg_logprobs !== undefined
      )?.avg_logprobs;

    const nodeInfo =
      finalEvent.nodeInfo ||
      finalEvent.node_info ||
      turn.assistantEvents.find((e) => e.nodeInfo || e.node_info)?.nodeInfo ||
      turn.assistantEvents.find((e) => e.nodeInfo || e.node_info)?.node_info;

    const nodePath =
      finalEvent.nodePath ||
      finalEvent.node_path ||
      nodeInfo?.path ||
      turn.assistantEvents.find((e) => e.nodePath || e.node_path)?.nodePath ||
      turn.assistantEvents.find((e) => e.nodePath || e.node_path)?.node_path;

    const thoughtSignature =
      finalEvent.thoughtSignature ||
      finalEvent.thought_signature ||
      turn.assistantEvents.find((e) => e.thoughtSignature || e.thought_signature)
        ?.thoughtSignature ||
      turn.assistantEvents.find((e) => e.thoughtSignature || e.thought_signature)
        ?.thought_signature;

    const actions =
      finalEvent.actions || turn.assistantEvents.find((e) => e.actions)?.actions;

    const finishEvent = turn.assistantEvents.find(
      (e) => e.finishReason || e.finish_reason
    );
    const finishReason =
      finalEvent.finishReason ||
      finalEvent.finish_reason ||
      finishEvent?.finishReason ||
      finishEvent?.finish_reason;

    const a2uiData =
      finalEvent.a2ui ||
      finalEvent.a2uiData ||
      finalEvent.a2ui_data ||
      turn.assistantEvents.find((e) => e.a2ui || e.a2uiData || e.a2ui_data)?.a2ui ||
      turn.assistantEvents.find((e) => e.a2ui || e.a2uiData || e.a2ui_data)?.a2uiData ||
      turn.assistantEvents.find((e) => e.a2ui || e.a2uiData || e.a2ui_data)?.a2ui_data;

    result.push({
      id: finalEvent.id,
      name: finalEvent.name,
      sessionId,
      createTime: finalEvent.createTime,
      role: "assistant",
      author: finalEvent.author,
      invocationId: invocationId,
      ...(modelVersion ? { modelVersion, model_version: modelVersion } : {}),
      content: finalEvent.content,
      ...(unifiedThought ? { thought: unifiedThought } : {}),
      ...(reasoningTrace.length > 0 ? { reasoningTrace } : {}),
      ...(thoughtSignature
        ? { thoughtSignature, thought_signature: thoughtSignature }
        : {}),
      ...(subAgentsList.length > 0 ? { subAgents: subAgentsList } : {}),
      ...(turnToolCalls.length > 0 ? { tool_calls: turnToolCalls } : {}),
      ...(turnToolResults.length > 0 ? { tool_results: turnToolResults } : {}),
      ...(finalEvent.tool_call ? { tool_call: finalEvent.tool_call } : {}),
      ...(finalEvent.tool_result ? { tool_result: finalEvent.tool_result } : {}),
      ...(codeExecutionBlocks && codeExecutionBlocks.length > 0
        ? {
            codeExecutionBlocks,
            code_execution_blocks: codeExecutionBlocks,
          }
        : {}),
      ...(turnArtifacts.length > 0 ? { artifacts: turnArtifacts } : {}),
      ...(a2uiData ? { a2ui: a2uiData, a2uiData: a2uiData, a2ui_data: a2uiData } : {}),
      ...(groundingMeta
        ? { groundingMetadata: groundingMeta, grounding_metadata: groundingMeta }
        : {}),
      ...(usageMetadata ? { usageMetadata, usage_metadata: usageMetadata } : {}),
      ...(avgLogprobs !== undefined ? { avgLogprobs, avg_logprobs: avgLogprobs } : {}),
      ...(nodeInfo ? { nodeInfo, node_info: nodeInfo } : {}),
      ...(nodePath ? { nodePath, node_path: nodePath } : {}),
      ...(actions ? { actions } : {}),
      ...(finishReason ? { finishReason, finish_reason: finishReason } : {}),
      ...(finalEvent.timestamp !== undefined ? { timestamp: finalEvent.timestamp } : {}),
      rawEvent: finalEvent.rawEvent,
    });
  }

  return result;
}
