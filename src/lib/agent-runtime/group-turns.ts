import { AgentSessionEvent } from "@/types/agent";
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
} from "./event-utils";
import { parseRawSessionEvent } from "./parse-event";

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
      result.push(turn.assistantEvents[0]);
      continue;
    }

    let finalIdx = turn.assistantEvents.findIndex((e) =>
      isRootWorkflowOutput(e.rawEvent)
    );

    if (finalIdx === -1) {
      for (let i = turn.assistantEvents.length - 1; i >= 0; i--) {
        if (turn.assistantEvents[i].content?.trim()) {
          finalIdx = i;
          break;
        }
      }
    }

    if (finalIdx === -1) {
      finalIdx = turn.assistantEvents.length - 1;
    }

    const finalEvent = turn.assistantEvents[finalIdx];
    const intermediateEvents = turn.assistantEvents.filter((_, idx) => idx !== finalIdx);

    const reasoningBlocks: string[] = [];
    const subAgentsList = [];
    const usedResultKeys = new Set<string>();
    const processedCallKeys = new Set<string>();

    // Group intermediate events by subagent identity to avoid one box per chunk
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

    for (let i = 0; i < intermediateEvents.length; i++) {
      const inter = intermediateEvents[i];
      const author =
        extractSubagentName(inter.rawEvent as Record<string, unknown> | undefined) ||
        inter.author ||
        "sub_agent";
      const displayName = formatAgentDisplayName(author);
      const content = inter.content?.trim() || "";
      const thought = inter.thought?.trim() || "";

      if (content || thought) {
        const existing = subagentsGrouped.get(author);
        if (existing) {
          if (content && !existing.contentParts.includes(content)) {
            existing.contentParts.push(content);
          }
          if (thought && !existing.thoughtParts.includes(thought)) {
            existing.thoughtParts.push(thought);
          }
        } else {
          subagentsGrouped.set(author, {
            id: inter.id,
            agentName: author,
            displayName,
            contentParts: content ? [content] : [],
            thoughtParts: thought ? [thought] : [],
            timestamp: inter.createTime,
          });
        }
      }

      const calls = getEventToolCalls(inter);
      const results = getEventToolResults(inter);

      for (const call of calls) {
        const toolName = call.name || "tool";
        const argsStr = JSON.stringify(call.args || {}, null, 2);
        const callKey = `${toolName}-${argsStr}`;

        let matchedResultStr: string | undefined;

        /**
         * Pair on id when both sides carry one. Matching purely by name — "the
         * next unused result with this tool's name" — attached results in
         * arrival order rather than call order, so two parallel calls to the
         * same tool exchanged results. The streaming path in chat-adapter.ts
         * applies the same rule, so a conversation renders identically live and
         * on reload; previously the two heuristics could disagree.
         *
         * The name fallback stays for payloads where ids are absent, which is
         * why the id path is only taken when the result actually has one.
         */
        const matchAt = (
          candidates: ReturnType<typeof getEventToolResults>,
          eventIdx: number,
          predicate: (r: (typeof candidates)[number]) => boolean
        ): string | undefined => {
          const idx = candidates.findIndex(
            (r, k) => predicate(r) && !usedResultKeys.has(`${eventIdx}-${k}`)
          );
          if (idx === -1) return undefined;
          usedResultKeys.add(`${eventIdx}-${idx}`);
          return JSON.stringify(candidates[idx].result || {}, null, 2);
        };

        const byId = (r: { id?: string }) => Boolean(call.id) && r.id === call.id;
        const byName = (r: { name?: string; id?: string }) =>
          r.name === toolName && !(call.id && r.id);

        for (const predicate of [byId, byName]) {
          if (predicate === byId && !call.id) continue;

          matchedResultStr = matchAt(results, i, predicate);
          if (matchedResultStr !== undefined) break;

          for (let j = i + 1; j < intermediateEvents.length; j++) {
            matchedResultStr = matchAt(
              getEventToolResults(intermediateEvents[j]),
              j,
              predicate
            );
            if (matchedResultStr !== undefined) break;
          }
          if (matchedResultStr !== undefined) break;
        }

        if (matchedResultStr !== undefined) {
          processedCallKeys.add(callKey);
          reasoningBlocks.push(
            `:::tool[${toolName}]{status="complete"}\n**Arguments:**\n\`\`\`json\n${argsStr}\n\`\`\`\n**Result:**\n\`\`\`json\n${matchedResultStr}\n\`\`\`\n:::`
          );
        } else if (!processedCallKeys.has(callKey)) {
          processedCallKeys.add(callKey);
          reasoningBlocks.push(
            `:::tool[${toolName}]{status="complete"}\n**Arguments:**\n\`\`\`json\n${argsStr}\n\`\`\`\n:::`
          );
        }
      }

      for (let resIdx = 0; resIdx < results.length; resIdx++) {
        if (usedResultKeys.has(`${i}-${resIdx}`)) continue;
        const res = results[resIdx];
        const toolName = res.name || "tool";
        const resStr = JSON.stringify(res.result || {}, null, 2);
        reasoningBlocks.push(
          `:::tool[${toolName}]{status="complete"}\n**Result:**\n\`\`\`json\n${resStr}\n\`\`\`\n:::`
        );
      }
    }

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

        reasoningBlocks.push(
          `:::subagent[${sub.displayName}]{id="${sub.id}" agent="${sub.agentName}" status="complete"}\n${combinedContent}\n:::`
        );
      } else if (combinedThought) {
        reasoningBlocks.push(combinedThought);
      }
    }

    if (finalEvent.thought?.trim()) {
      reasoningBlocks.push(finalEvent.thought.trim());
    }

    const unifiedThought =
      reasoningBlocks.length > 0 ? reasoningBlocks.join("\n\n") : undefined;

    const finalEventToolCalls = getEventToolCalls(finalEvent);
    const finalEventToolResults = getEventToolResults(finalEvent);

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

    const finishReason =
      finalEvent.finishReason ||
      finalEvent.finish_reason ||
      turn.assistantEvents.find((e) => e.finishReason || e.finish_reason)?.finishReason ||
      turn.assistantEvents.find((e) => e.finishReason || e.finish_reason)?.finish_reason;

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
      ...(thoughtSignature
        ? { thoughtSignature, thought_signature: thoughtSignature }
        : {}),
      ...(subAgentsList.length > 0 ? { subAgents: subAgentsList } : {}),
      ...(finalEventToolCalls.length > 0 ? { tool_calls: finalEventToolCalls } : {}),
      ...(finalEventToolResults.length > 0
        ? { tool_results: finalEventToolResults }
        : {}),
      ...(finalEvent.tool_call ? { tool_call: finalEvent.tool_call } : {}),
      ...(finalEvent.tool_result ? { tool_result: finalEvent.tool_result } : {}),
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
