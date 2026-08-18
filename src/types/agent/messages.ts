import type { AgentCodeExecutionBlock, AgentMessagePart } from "./message-parts";

export interface AgentMessage {
  role: "user" | "model" | "assistant" | "system";
  content?: string;
  parts?: AgentMessagePart[];
}

export interface SubAgentExecution {
  id: string;
  agentName: string;
  displayName: string;
  role?: string;
  status: "running" | "complete" | "error";
  callInput?: string | Record<string, unknown>;
  content?: string;
  thought?: string;
  timestamp?: string;
  nodePath?: string;
  durationSeconds?: number;
}

/**
 * One entry of an assistant turn's thinking trace, as data.
 *
 * The trace is produced twice — live in `adapters/chat-adapter.ts` and on
 * history replay in `agent-runtime/group-turns.ts` — and consumed once, by
 * `components/assistant-ui/reasoning.tsx`. It used to travel between them as a
 * `:::tool[name]{status="..."}` markdown string that the consumer regex-parsed
 * back into blocks. That round-trip is why model-supplied names and bodies had
 * to be escaped at all: a `]` in a name or a line of `:::` in a tool result
 * could close a block early. Carrying the entries themselves removes the parse,
 * and with it the entire class of bug.
 *
 * The string form still exists — see `agent-runtime/reasoning-directives.ts` —
 * because sessions persisted before this type did contain only the string, and
 * because the presence of a `reasoning` content part is what makes assistant-ui
 * render the Thinking Process panel at all. The consumer prefers the array when
 * it has one and parses the string when it does not.
 *
 * `argsJson`/`resultJson` are pre-serialised rather than raw values: what the
 * UI shows is pretty-printed JSON, and both producers already had it in that
 * form. Keeping them as strings avoids re-deciding formatting in the renderer.
 */
export type ReasoningTraceEntry =
  | { type: "thought"; text: string }
  | {
      type: "tool";
      /**
       * The id the tool-call panel pairs on. The trace used to be keyed by tool
       * name alone, so two parallel calls to one tool had both results land on
       * whichever block was pushed last. It is also the render key, so a block
       * keeps its identity across streaming yields.
       */
      toolCallId: string;
      toolName: string;
      /** Pretty-printed JSON; absent for a result that arrived without its call. */
      argsJson?: string;
      resultJson?: string;
      status: "running" | "requires-action" | "complete";
    }
  | {
      type: "subagent";
      agentName: string;
      displayName: string;
      /** Pretty-printed JSON input; absent on the history-replay path. */
      input?: string;
      response?: string;
      status: "running" | "complete";
      /** Source event id, present only on history replay. */
      id?: string;
    }
  | {
      type: "code_execution";
      block: AgentCodeExecutionBlock;
    };
