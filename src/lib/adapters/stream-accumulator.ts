import type { ChatModelRunResult, ThreadMessage } from "@assistant-ui/react";
import type {
  A2UIPartData,
  AgentActionsDelta,
  AgentCodeExecutionBlock,
  AgentMessageInfoMetadata,
  AgentNodeInfo,
  AgentStreamEvent,
  AgentUsageMetadata,
  ArtifactStreamPayload,
  CodeExecutionResultData,
  ExecutableCodeData,
  GroundingMetadata,
  MemoryRetrievalItem,
  ReasoningTraceEntry,
} from "@/types/agent";
import {
  extractGroundingMetadata,
  mergeGroundingMetadata,
} from "@/lib/grounding/citation-parser";
import { parseCodeExecutionOutput } from "@/lib/code-execution/output-parser";
import {
  inferMimeType,
  deriveArtifactTitle,
  extractArtifactFromTool,
  extractArtifactsFromContent,
} from "@/lib/artifacts/artifact-extractor";
import { parseA2UIPayload, extractA2UIFromContent } from "@/lib/a2ui/a2ui-parser";
import { formatAgentDisplayName } from "@/lib/utils";
import { formatReasoningTrace } from "@/lib/agent-runtime/reasoning-directives";

import { createYieldContent, type ToolCallYieldItem } from "./yield-content";

/**
 * What the caller should do with the event it just handed to `handle()`.
 *
 * `"skip"` is not "nothing happened": the metadata carry-forward, the memory
 * list and the grounding merge run for every event. It only means this event
 * produced no snapshot the consumer needs to see — a throttled partial, or an
 * event type this adapter does not render.
 */
export type HandleOutcome = "skip" | "yield" | "final";

interface SubagentStreamItem {
  agentName: string;
  displayName: string;
  input?: string;
  response: string;
  status: "running" | "complete";
}

// Entries hold structured fields rather than a rendered markdown string.
// The block used to be built once and then edited in place by a RegExp
// assembled from the model-supplied tool name, which meant a result
// containing `\n:::` or `status="complete"` could terminate or corrupt
// its own block. These entries are what the renderer now consumes; the
// markdown projection in agent-runtime/reasoning-directives.ts is
// derived from them for the fallback path.
//
// Thought and tool entries are the shared `ReasoningTraceEntry` shapes
// as-is. Subagents are the exception: a subagent's state keeps changing
// after its entry is pushed (status flips, response chunks append), so
// the entry holds only the map key and `buildReasoningTrace` resolves it
// at yield time. Inlining the fields here would mean maintaining two
// copies of a mutating record.
type StreamReasoningEntry =
  | Extract<ReasoningTraceEntry, { type: "thought" } | { type: "tool" }>
  | { type: "subagent"; agentName: string }
  | { type: "code_execution"; blockId: string };

const STREAM_YIELD_THROTTLE_MS = 50;

/**
 * The state machine of a streaming turn: everything an assistant message
 * accumulates as SSE events arrive, and nothing about how those events reached
 * it.
 *
 * This was ~450 lines of `let` bindings and closures inside the adapter's
 * `run()` generator, reachable only by driving a whole turn through a mocked
 * `fetch`. As an object it is addressable directly — feed it events, read
 * `snapshot()` — which is what `tests/stream-accumulator.test.ts` does.
 */
export class StreamAccumulator {
  private readonly subagentsMap = new Map<string, SubagentStreamItem>();
  private readonly reasoningEntries: StreamReasoningEntry[] = [];
  private readonly codeExecutionBlocks: AgentCodeExecutionBlock[] = [];
  private readonly artifactsMap = new Map<string, ArtifactStreamPayload>();
  private latestArtifactEvent: ArtifactStreamPayload | undefined;
  private activeSubagentName: string | null = null;

  private accumulatedText = "";
  private currentTextSegment = "";
  private finalizedTextPrefix = "";

  private latestEventId: string | undefined;
  private latestInvocationId: string | undefined;
  private latestModelVersion: string | undefined;
  private latestUsageMetadata: AgentUsageMetadata | undefined;
  private latestAvgLogprobs: number | undefined;
  private latestNodeInfo: AgentNodeInfo | undefined;
  private latestNodePath: string | undefined;
  private latestThoughtSignature: string | undefined;
  private latestActions: AgentActionsDelta | undefined;
  private latestFinishReason: string | undefined;
  private latestTimestamp: number | string | undefined;
  private readonly toolCallsMap = new Map<string, ToolCallYieldItem>();
  private readonly retrievedMemoriesList: MemoryRetrievalItem[] = [];
  private latestGroundingMetadata: GroundingMetadata | undefined;
  private a2uiData: A2UIPartData | undefined;

  private lastStreamYieldTime = 0;
  private isTerminal = false;

  /**
   * @param sourceMessages the conversation the turn was sent with. Read only by
   *        the `tool_result` branch, to tell a result for a call made in an
   *        earlier message from one with no call at all.
   */
  constructor(private readonly sourceMessages: readonly ThreadMessage[] = []) {}

  /**
   * Folds one event into the accumulated message.
   *
   * The `else if` order below is the dispatch order and is load-bearing; see
   * the metadata-only branch at the bottom.
   */
  handle(parsed: AgentStreamEvent): HandleOutcome {
    if (this.isTerminal) {
      return "skip";
    }

    // Carry-forward, not extraction. Every alternative spelling
    // Vertex uses — `invocation_id`, `config.invocationId`,
    // `raw_event.model_version`, a bare `state_delta` — is resolved
    // once at the SSE boundary, in `normalizeEventMetadata`. What
    // arrives here is an `AgentStreamEvent` with one spelling; this
    // only remembers the last value seen, because a field the
    // backend sends on the final chunk has to survive onto the
    // snapshots yielded before it.
    this.latestEventId = parsed.eventId || this.latestEventId;
    this.latestInvocationId = parsed.invocationId || this.latestInvocationId;
    this.latestModelVersion = parsed.modelVersion || this.latestModelVersion;
    this.latestUsageMetadata = parsed.usageMetadata || this.latestUsageMetadata;
    this.latestAvgLogprobs = parsed.avgLogprobs ?? this.latestAvgLogprobs;
    this.latestNodeInfo = parsed.nodeInfo || this.latestNodeInfo;
    this.latestNodePath = parsed.nodePath || this.latestNodePath;
    this.latestThoughtSignature = parsed.thoughtSignature || this.latestThoughtSignature;
    this.latestActions = parsed.actions || this.latestActions;
    this.latestFinishReason = parsed.finishReason || this.latestFinishReason;
    if (parsed.timestamp !== undefined) {
      this.latestTimestamp = parsed.timestamp;
    }

    if (parsed.retrieved_memories) {
      const memories = parsed.retrieved_memories as MemoryRetrievalItem[];
      if (Array.isArray(memories)) {
        for (const item of memories) {
          if (
            item &&
            !this.retrievedMemoriesList.some(
              (m) => m.id === item.id || m.fact === item.fact
            )
          ) {
            this.retrievedMemoriesList.push(item);
          }
        }
      }
    }

    const extractedMeta = extractGroundingMetadata(parsed);
    if (extractedMeta) {
      this.latestGroundingMetadata = mergeGroundingMetadata([
        this.latestGroundingMetadata,
        extractedMeta,
      ]);
    }

    const a2uiPayload = parsed.a2ui || parsed.a2uiData || parsed.a2ui_data;
    if (a2uiPayload) {
      const parsedA2UI = parseA2UIPayload(a2uiPayload);
      if (parsedA2UI) {
        this.a2uiData = parsedA2UI;
      }
    }

    const now = Date.now();
    const isHighFrequencyPartial = parsed.partial === true;
    const shouldYield =
      !isHighFrequencyPartial ||
      now - this.lastStreamYieldTime >= STREAM_YIELD_THROTTLE_MS;

    if (parsed.event_type === "content" && parsed.content) {
      return this.handleContent(parsed, now, shouldYield);
    } else if (parsed.event_type === "thought" && parsed.thought) {
      return this.handleThought(parsed, now, shouldYield);
    } else if (parsed.event_type === "agent_call" && parsed.agent_call) {
      return this.handleAgentCall(parsed.agent_call);
    } else if (parsed.event_type === "agent_response" && parsed.agent_response) {
      return this.handleAgentResponse(parsed.agent_response);
    } else if (parsed.event_type === "tool_call" && parsed.tool_call) {
      return this.handleToolCall(parsed.tool_call);
    } else if (parsed.event_type === "tool_result" && parsed.tool_result) {
      return this.handleToolResult(parsed.tool_result);
    } else if (
      parsed.event_type === "executable_code" &&
      (parsed.executable_code || parsed.executableCode)
    ) {
      return this.handleExecutableCode(
        (parsed.executable_code || parsed.executableCode)!
      );
    } else if (
      parsed.event_type === "code_execution_result" &&
      (parsed.code_execution_result || parsed.codeExecutionResult)
    ) {
      return this.handleCodeExecutionResult(
        (parsed.code_execution_result || parsed.codeExecutionResult)!
      );
    } else if (
      (parsed.event_type === "artifact_created" ||
        parsed.event_type === "artifact_updated") &&
      parsed.artifact
    ) {
      return this.handleArtifact(parsed.artifact);
    } else if (parsed.event_type === "a2ui") {
      return this.handleA2UI(parsed);
    } else if (parsed.event_type === "error" && parsed.error) {
      return this.handleError(parsed.error);
    } else if (parsed.event_type === "done") {
      this.completeTerminalState();
      return "final";
    } else if (extractedMeta || a2uiPayload) {
      return "yield";
    }

    return "skip";
  }

  /**
   * Returns all accumulated artifacts, syncing any newly completed content artifacts.
   */
  getArtifacts(): ArtifactStreamPayload[] {
    this.syncContentArtifacts();
    return Array.from(this.artifactsMap.values());
  }

  private lastScannedArtifactTextLength = 0;

  private syncContentArtifacts(force = false): void {
    if (!this.accumulatedText) return;
    if (!force && this.accumulatedText.length === this.lastScannedArtifactTextLength) {
      return;
    }
    // Fast bail-out: only run regex extraction if candidate delimiters exist
    if (
      !force &&
      !this.accumulatedText.includes("```") &&
      !this.accumulatedText.includes("<artifact") &&
      !this.accumulatedText.includes("<antArtifact") &&
      !this.accumulatedText.includes("<svg") &&
      !this.accumulatedText.includes("<!DOCTYPE") &&
      !this.accumulatedText.includes("<html") &&
      !this.accumulatedText.includes("\t")
    ) {
      return;
    }
    this.lastScannedArtifactTextLength = this.accumulatedText.length;
    const contentArtifacts = extractArtifactsFromContent(this.accumulatedText);
    for (const art of contentArtifacts) {
      const existing = this.artifactsMap.get(art.filename);
      if (!existing) {
        this.artifactsMap.set(art.filename, { ...art });
        this.latestArtifactEvent = { ...art };
      } else if (!existing.gcsUri && existing.content !== art.content) {
        existing.content = art.content;
        existing.title = art.title || existing.title;
        this.latestArtifactEvent = { ...existing };
      }
    }
  }

  /**
   * The end of a stream that closed without a terminal event.
   */
  finalize(): void {
    this.flushCurrentTextSegment();
    this.accumulatedText = this.finalizedTextPrefix;
    this.syncContentArtifacts(true);
  }

  /**
   * The current message-in-progress as a yieldable result.
   */
  snapshot(): ChatModelRunResult {
    this.syncContentArtifacts();
    const reasoningTrace = this.buildReasoningTrace();

    let displayText = this.accumulatedText;
    if (
      this.accumulatedText.includes("---a2ui_JSON---") ||
      this.accumulatedText.includes("```a2ui") ||
      this.accumulatedText.includes("```json:a2ui") ||
      this.accumulatedText.includes("<!-- a2ui_start -->")
    ) {
      const extracted = extractA2UIFromContent(this.accumulatedText);
      if (extracted.a2ui) {
        this.a2uiData = extracted.a2ui;
        displayText = extracted.cleanText;
      }
    }

    return createYieldContent({
      reasoning: formatReasoningTrace(reasoningTrace),
      reasoningTrace,
      text: displayText,
      toolCalls: Array.from(this.toolCallsMap.values()),
      codeExecutionBlocks: this.codeExecutionBlocks.map((b) => ({ ...b })),
      eventId: this.latestEventId,
      retrievedMemories: this.retrievedMemoriesList,
      groundingMetadata: this.latestGroundingMetadata,
      messageInfo: this.getMessageInfo(),
      artifacts: Array.from(this.artifactsMap.values()),
      artifactEvent: this.latestArtifactEvent,
      a2ui: this.a2uiData,
    });
  }

  // --- event handlers -----------------------------------------------------

  private handleContent(
    parsed: AgentStreamEvent,
    now: number,
    shouldYield: boolean
  ): HandleOutcome {
    this.finalizeAllSubagents();
    const content = parsed.content as string;
    if (parsed.partial === true) {
      this.currentTextSegment += content;
      this.accumulatedText = this.finalizedTextPrefix + this.currentTextSegment;
    } else if (parsed.partial === false) {
      this.currentTextSegment = content;
      this.finalizedTextPrefix = this.finalizedTextPrefix + this.currentTextSegment;
      this.currentTextSegment = "";
      this.accumulatedText = this.finalizedTextPrefix;
    } else {
      this.finalizedTextPrefix += content;
      this.accumulatedText = this.finalizedTextPrefix;
    }

    if (shouldYield) {
      this.lastStreamYieldTime = now;
      return "yield";
    }
    return "skip";
  }

  private handleThought(
    parsed: AgentStreamEvent,
    now: number,
    shouldYield: boolean
  ): HandleOutcome {
    const thought = (parsed.thought as string) || "";
    if (!thought.trim()) return "skip";

    const last = this.reasoningEntries[this.reasoningEntries.length - 1];
    if (last && last.type === "thought") {
      if (parsed.partial === true) {
        last.text += thought;
      } else if (parsed.partial === false) {
        last.text = thought;
      } else if (!last.text.includes(thought)) {
        last.text = last.text ? `${last.text}\n\n${thought}` : thought;
      }
    } else {
      // Check if this thought already exists anywhere in reasoningEntries (e.g. re-emitted after tool calls)
      const existingThought = this.reasoningEntries.find(
        (e): e is Extract<StreamReasoningEntry, { type: "thought" }> =>
          e.type === "thought" &&
          (e.text.trim() === thought.trim() ||
            e.text.includes(thought.trim()) ||
            thought.trim().includes(e.text.trim()))
      );

      if (existingThought) {
        if (thought.trim().length > existingThought.text.trim().length) {
          existingThought.text = thought;
        }
      } else {
        this.reasoningEntries.push({
          type: "thought",
          text: thought,
        });
      }
    }

    if (shouldYield) {
      this.lastStreamYieldTime = now;
      return "yield";
    }
    return "skip";
  }

  private handleAgentCall(
    subagent: NonNullable<AgentStreamEvent["agent_call"]>
  ): HandleOutcome {
    const agentName = subagent.agent || "subagent";
    const displayName = subagent.displayName || formatAgentDisplayName(agentName);
    const inputStr = JSON.stringify(subagent.input || {}, null, 2);

    if (this.activeSubagentName && this.activeSubagentName !== agentName) {
      const prev = this.subagentsMap.get(this.activeSubagentName);
      if (prev) prev.status = "complete";
    }
    this.activeSubagentName = agentName;

    const existing = this.subagentsMap.get(agentName);
    if (existing) {
      existing.status = "running";
      if (inputStr && !existing.input) {
        existing.input = inputStr;
      }
    } else {
      this.subagentsMap.set(agentName, {
        agentName,
        displayName,
        input: inputStr,
        response: "",
        status: "running",
      });
      this.reasoningEntries.push({
        type: "subagent",
        agentName,
      });
    }

    return "yield";
  }

  private handleAgentResponse(
    subagent: NonNullable<AgentStreamEvent["agent_response"]>
  ): HandleOutcome {
    const agentName = subagent.agent || "subagent";
    const displayName = subagent.displayName || formatAgentDisplayName(agentName);
    const responseChunk =
      typeof subagent.response === "string"
        ? subagent.response
        : JSON.stringify(subagent.response || {}, null, 2);

    if (this.activeSubagentName && this.activeSubagentName !== agentName) {
      const prev = this.subagentsMap.get(this.activeSubagentName);
      if (prev) prev.status = "complete";
    }
    this.activeSubagentName = agentName;

    const existing = this.subagentsMap.get(agentName);
    if (existing) {
      existing.response += responseChunk;
    } else {
      this.subagentsMap.set(agentName, {
        agentName,
        displayName,
        response: responseChunk,
        status: "running",
      });
      this.reasoningEntries.push({
        type: "subagent",
        agentName,
      });
    }

    return "yield";
  }

  private handleToolCall(tc: NonNullable<AgentStreamEvent["tool_call"]>): HandleOutcome {
    this.completeActiveSubagent();

    const toolName = tc.name || "tool";
    const isReqAction =
      tc.status === "requires-action" ||
      tc.requires_action ||
      tc.requires_confirmation ||
      toolName === "adk_request_confirmation";

    // Identity is the id when the backend supplies one. An id that
    // is present but unknown means a genuinely new call, so it must
    // NOT be folded into a same-named one in flight — that merged
    // two parallel calls to the same tool into a single entry and
    // destroyed one of them.
    //
    // The name-based merge survives only for id-less backends,
    // where a re-emitted call and a second parallel call are
    // indistinguishable and merging is the safer reading.
    let existingCallId: string | undefined;
    if (tc.id) {
      if (this.toolCallsMap.has(tc.id)) {
        existingCallId = tc.id;
      }
    } else {
      for (const [id, item] of this.toolCallsMap.entries()) {
        if (
          item.toolName === toolName &&
          item.status?.type !== "complete" &&
          !item.hasBackendId
        ) {
          existingCallId = id;
          break;
        }
      }
    }

    const toolCallId =
      existingCallId ||
      tc.id ||
      `call_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const isNewCall = !existingCallId;

    this.toolCallsMap.set(toolCallId, {
      toolCallId,
      toolName,
      args: tc.args || {},
      hasBackendId: Boolean(tc.id),
      status: {
        type: isReqAction ? "requires-action" : "running",
        ...(isReqAction ? { reason: "tool-calls" } : {}),
      },
    });

    if (isNewCall) {
      this.reasoningEntries.push({
        type: "tool",
        toolCallId,
        toolName,
        argsJson: JSON.stringify(tc.args || {}, null, 2),
        status: isReqAction ? "requires-action" : "running",
      });
    }

    if (toolName && tc.args) {
      const art = extractArtifactFromTool(toolName, tc.args);
      if (art) {
        this.handleArtifact(art);
      }
    }

    return "yield";
  }

  private handleToolResult(
    toolResult: NonNullable<AgentStreamEvent["tool_result"]>
  ): HandleOutcome {
    this.completeActiveSubagent();

    const toolName = toolResult.name || "tool";
    const result = toolResult.result;
    const resStr = JSON.stringify(result ?? {}, null, 2);

    // Pair on id whenever the result carries one. Falling back to
    // first-match-by-name for a result whose id is simply unknown
    // attached it to an unrelated invocation of the same tool.
    //
    // This block is the *only* place that decides which call a
    // result belongs to: it reports the id it settled on, and the
    // thinking trace below is looked up by that id rather than
    // re-deriving identity from the tool name. Two structures
    // pairing by two different rules is precisely how the trace
    // and the tool-call panel came to disagree.
    const rawId: string | undefined = toolResult.id;
    let matchedCallId: string | undefined;
    if (rawId) {
      const tc = this.toolCallsMap.get(rawId);
      if (tc) {
        tc.result = result;
        tc.status = { type: "complete" };
        matchedCallId = rawId;
      }
    } else {
      // Id-less result: pair by name, but only against calls that
      // are themselves id-less. A call with a real id can only be
      // resolved by that id.
      for (const [id, tc] of this.toolCallsMap.entries()) {
        if (
          tc.toolName === toolName &&
          tc.status?.type !== "complete" &&
          !tc.hasBackendId
        ) {
          tc.result = result;
          tc.status = { type: "complete" };
          matchedCallId = id;
          break;
        }
      }
      if (!matchedCallId) {
        console.warn(
          `[createGeminiChatAdapter] Unpaired id-less tool_result for "${toolName}" — ` +
            `no id-less call in flight to attach it to.`
        );
      }
    }
    if (!matchedCallId) {
      const existsInPriorMessages =
        rawId &&
        this.sourceMessages.some((msg) =>
          msg.content?.some(
            (p) => p.type === "tool-call" && "toolCallId" in p && p.toolCallId === rawId
          )
        );

      if (!existsInPriorMessages) {
        const toolCallId =
          rawId || `result_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        this.toolCallsMap.set(toolCallId, {
          toolCallId,
          toolName,
          args: {},
          result,
          status: { type: "complete" },
        });
        matchedCallId = toolCallId;
      }
    }

    const existingToolEntry = matchedCallId
      ? this.reasoningEntries.find(
          (e) => e.type === "tool" && e.toolCallId === matchedCallId
        )
      : undefined;

    if (existingToolEntry && existingToolEntry.type === "tool") {
      // Set fields rather than rewriting rendered markdown.
      existingToolEntry.resultJson = resStr;
      existingToolEntry.status = "complete";
    } else {
      this.reasoningEntries.push({
        type: "tool",
        toolCallId:
          matchedCallId ||
          rawId ||
          `result_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        toolName,
        resultJson: resStr,
        status: "complete",
      });
    }

    if (toolName && result) {
      const resObj =
        typeof result === "object" && result !== null
          ? (result as Record<string, unknown>)
          : { output: String(result) };
      const art = extractArtifactFromTool(toolName, resObj);
      if (art) {
        this.handleArtifact(art);
      }
      const a2ui = parseA2UIPayload(result);
      if (a2ui) {
        this.a2uiData = a2ui;
      }
    }

    return "yield";
  }

  private handleExecutableCode(execCode: ExecutableCodeData): HandleOutcome {
    this.finalizeAllSubagents();
    const blockId = `exec-${this.codeExecutionBlocks.length}`;
    this.codeExecutionBlocks.push({
      id: blockId,
      language: execCode.language || "PYTHON",
      code: execCode.code || "",
      status: "running",
    });
    this.reasoningEntries.push({
      type: "code_execution",
      blockId,
    });
    return "yield";
  }

  private handleCodeExecutionResult(codeRes: CodeExecutionResultData): HandleOutcome {
    this.finalizeAllSubagents();
    const parsedOut = parseCodeExecutionOutput(codeRes.output);
    const resultData: CodeExecutionResultData = {
      outcome: codeRes.outcome || "OUTCOME_OK",
      output: codeRes.output || "",
      ...(codeRes.durationMs !== undefined ? { durationMs: codeRes.durationMs } : {}),
      generatedImages: codeRes.generatedImages || parsedOut.images,
    };
    const isError =
      resultData.outcome === "OUTCOME_FAILED" ||
      resultData.outcome === "OUTCOME_DEADLINE_EXCEEDED";
    const status = isError ? "error" : "complete";

    const lastBlock = this.codeExecutionBlocks[this.codeExecutionBlocks.length - 1];
    if (lastBlock && !lastBlock.result) {
      lastBlock.result = resultData;
      lastBlock.status = status;
    } else {
      const blockId = `exec-res-${this.codeExecutionBlocks.length}`;
      this.codeExecutionBlocks.push({
        id: blockId,
        language: "PYTHON",
        code: "",
        result: resultData,
        status,
      });
      this.reasoningEntries.push({
        type: "code_execution",
        blockId,
      });
    }

    const allImages = Array.from(
      new Set([...(resultData.generatedImages || []), ...parsedOut.images])
    );
    if (allImages.length > 0) {
      resultData.generatedImages = allImages;
    }

    const formatImg = (img: string) => {
      if (
        !img ||
        img.startsWith("data:") ||
        img.startsWith("gs://") ||
        img.startsWith("http://") ||
        img.startsWith("https://") ||
        img.startsWith("/")
      ) {
        return img;
      }
      return `data:image/png;base64,${img}`;
    };

    if (parsedOut.savedArtifacts && parsedOut.savedArtifacts.length > 0) {
      for (let sIdx = 0; sIdx < parsedOut.savedArtifacts.length; sIdx++) {
        const savedFile = parsedOut.savedArtifacts[sIdx];
        const mime = inferMimeType(savedFile);
        const imgData = allImages[sIdx] || allImages[0] || "";
        this.handleArtifact({
          filename: savedFile,
          title: deriveArtifactTitle(savedFile, "Generated Artifact"),
          mimeType: mime,
          version: 0,
          content: mime.startsWith("image/") ? formatImg(imgData) : "",
          gcsUri: imgData.startsWith("gs://") ? imgData : undefined,
          isComplete: true,
        });
      }
    } else if (allImages.length > 0) {
      for (let i = 0; i < allImages.length; i++) {
        const img = allImages[i];
        if (img) {
          const filename = `graph_${i + 1}.png`;
          this.handleArtifact({
            filename,
            title: deriveArtifactTitle(filename, "Generated Plot"),
            mimeType: "image/png",
            version: 0,
            content: formatImg(img),
            gcsUri: img.startsWith("gs://") ? img : undefined,
            isComplete: true,
          });
        }
      }
    }

    return "yield";
  }

  private handleArtifact(artifact: ArtifactStreamPayload): HandleOutcome {
    this.finalizeAllSubagents();
    this.latestArtifactEvent = { ...artifact };
    this.artifactsMap.set(artifact.filename, { ...artifact });
    return "yield";
  }

  private handleA2UI(event: AgentStreamEvent): HandleOutcome {
    const payload = event.a2ui || event.a2uiData || event.a2ui_data || event.content;
    const parsed = parseA2UIPayload(payload);
    if (parsed) {
      this.a2uiData = parsed;
      return "yield";
    }
    return "skip";
  }

  /**
   * The error text is appended to the accumulated message, and the subagents
   * are finalised *before* the caller takes its snapshot — the snapshot is
   * derived from live state, so the spinners this stops are stopped in the
   * frame the user actually sees. An earlier version yielded a snapshot it had
   * captured before finalising, and the subagent spinners ran forever.
   */
  private handleError(error: string): HandleOutcome {
    this.isTerminal = true;
    this.finalizeAllSubagents();
    this.flushCurrentTextSegment();
    this.accumulatedText +=
      (this.accumulatedText ? "\n\n" : "") + `⚠️ **Agent Runtime Error:** ${error}`;
    return "final";
  }

  // --- state helpers ------------------------------------------------------

  /** Shared by the `done` event and the `[DONE]` sentinel, which mean the same. */
  private completeTerminalState(): void {
    this.isTerminal = true;
    this.finalizeAllSubagents();
    this.flushCurrentTextSegment();
    for (const tc of this.toolCallsMap.values()) {
      if (tc.status?.type === "running") {
        tc.status = { type: "complete" };
      }
    }
    for (const entry of this.reasoningEntries) {
      if (entry.type === "tool" && entry.status === "running") {
        entry.status = "complete";
      }
    }
    for (const block of this.codeExecutionBlocks) {
      if (block.status === "running") {
        block.status = block.result ? "complete" : "error";
      }
    }
    this.accumulatedText = this.finalizedTextPrefix;
    this.syncContentArtifacts(true);
  }

  private finalizeAllSubagents(): void {
    for (const sub of this.subagentsMap.values()) {
      sub.status = "complete";
    }
    this.activeSubagentName = null;
  }

  /** A tool step ends whichever subagent was in flight. */
  private completeActiveSubagent(): void {
    if (this.activeSubagentName) {
      const prev = this.subagentsMap.get(this.activeSubagentName);
      if (prev) prev.status = "complete";
      this.activeSubagentName = null;
    }
  }

  private flushCurrentTextSegment(): void {
    if (this.currentTextSegment) {
      this.finalizedTextPrefix = this.finalizedTextPrefix + this.currentTextSegment;
      this.currentTextSegment = "";
      this.accumulatedText = this.finalizedTextPrefix;
    }
  }

  private getMessageInfo(): AgentMessageInfoMetadata | undefined {
    if (
      !this.latestInvocationId &&
      !this.latestModelVersion &&
      !this.latestUsageMetadata &&
      this.latestAvgLogprobs === undefined &&
      !this.latestNodeInfo &&
      !this.latestNodePath &&
      !this.latestThoughtSignature &&
      !this.latestActions &&
      !this.latestFinishReason &&
      this.latestTimestamp === undefined
    ) {
      return undefined;
    }
    return {
      ...(this.latestInvocationId ? { invocationId: this.latestInvocationId } : {}),
      ...(this.latestModelVersion ? { modelVersion: this.latestModelVersion } : {}),
      ...(this.latestUsageMetadata ? { usageMetadata: this.latestUsageMetadata } : {}),
      ...(this.latestAvgLogprobs !== undefined
        ? { avgLogprobs: this.latestAvgLogprobs }
        : {}),
      ...(this.latestNodeInfo ? { nodeInfo: this.latestNodeInfo } : {}),
      ...(this.latestNodePath ? { nodePath: this.latestNodePath } : {}),
      ...(this.latestThoughtSignature
        ? { thoughtSignature: this.latestThoughtSignature }
        : {}),
      ...(this.latestActions ? { actions: this.latestActions } : {}),
      ...(this.latestFinishReason ? { finishReason: this.latestFinishReason } : {}),
      ...(this.latestTimestamp !== undefined ? { timestamp: this.latestTimestamp } : {}),
    };
  }

  /**
   * The trace as the renderer consumes it: subagent references resolved
   * against their live map entries, thoughts trimmed, and thoughts that
   * are only whitespace dropped.
   *
   * The trimming is not cosmetic. The markdown projection has always
   * skipped empty thoughts, so emitting them here would make the
   * structured path render an empty "Thought" card where the string path
   * renders nothing, and the two paths have to agree block for block.
   */
  private buildReasoningTrace(): ReasoningTraceEntry[] {
    const trace: ReasoningTraceEntry[] = [];
    for (const entry of this.reasoningEntries) {
      if (entry.type === "thought") {
        const text = entry.text.trim();
        if (text) trace.push({ type: "thought", text });
      } else if (entry.type === "subagent") {
        const sub = this.subagentsMap.get(entry.agentName);
        if (sub) trace.push({ type: "subagent", ...sub });
      } else if (entry.type === "code_execution") {
        const block = this.codeExecutionBlocks.find((b) => b.id === entry.blockId);
        if (block) trace.push({ type: "code_execution", block: { ...block } });
      } else {
        // Copied, not referenced. Tool entries are mutated in place as
        // results arrive, so handing out the live object would make an
        // already-yielded snapshot change underneath its consumer.
        trace.push({ ...entry });
      }
    }
    return trace;
  }
}
