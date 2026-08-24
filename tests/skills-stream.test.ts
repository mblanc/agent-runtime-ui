import { describe, it, expect } from "vitest";
import { StreamAccumulator } from "@/lib/adapters/stream-accumulator";
import type { ReasoningTraceEntry } from "@/types/agent";

describe("StreamAccumulator with Skill Ingestion", () => {
  it("accumulates load_skill tool call and updates on tool result", () => {
    const acc = new StreamAccumulator();

    // 1. Tool Call: load_skill
    const callOutcome = acc.handle({
      event_type: "tool_call",
      tool_call: {
        id: "call_load_bq",
        name: "load_skill",
        args: {
          skill_name: "bigquery-analyzer",
          version: "2.1.0",
        },
        status: "running",
      },
    });
    expect(callOutcome).toBe("yield");

    let snap = acc.snapshot();
    let customMeta = snap.metadata?.custom as Record<string, unknown>;
    let trace = customMeta.reasoningTrace as ReasoningTraceEntry[];
    expect(trace).toBeDefined();
    expect(trace.length).toBe(1);
    expect(trace[0].type).toBe("skill_loaded");
    if (trace[0].type === "skill_loaded") {
      expect(trace[0].skill.skillName).toBe("bigquery-analyzer");
      expect(trace[0].skill.version).toBe("2.1.0");
      expect(trace[0].status).toBe("running");
    }

    // 2. Tool Result: load_skill response with metadata
    const resultOutcome = acc.handle({
      event_type: "tool_result",
      tool_result: {
        id: "call_load_bq",
        name: "load_skill",
        result: {
          name: "bigquery-analyzer",
          version: "2.1.0",
          description: "Optimizes and audits BigQuery SQL queries",
          author: "Google Cloud",
          license: "Apache-2.0",
          tools: ["bigquery_exec", "explain_sql"],
          instructions_snippet: "Check partition filters.",
        },
      },
    });
    expect(resultOutcome).toBe("yield");

    snap = acc.snapshot();
    customMeta = snap.metadata?.custom as Record<string, unknown>;
    trace = customMeta.reasoningTrace as ReasoningTraceEntry[];
    expect(trace.length).toBe(1);
    expect(trace[0].type).toBe("skill_loaded");
    if (trace[0].type === "skill_loaded") {
      expect(trace[0].skill.skillName).toBe("bigquery-analyzer");
      expect(trace[0].skill.author).toBe("Google Cloud");
      expect(trace[0].skill.license).toBe("Apache-2.0");
      expect(trace[0].skill.tools).toEqual(["bigquery_exec", "explain_sql"]);
      expect(trace[0].skill.instructionsSnippet).toBe("Check partition filters.");
      expect(trace[0].status).toBe("complete");
    }
  });

  it("accumulates search_skills tool call and updates matches on tool result", () => {
    const acc = new StreamAccumulator();

    // 1. Tool Call: search_skills
    acc.handle({
      event_type: "tool_call",
      tool_call: {
        id: "call_search_1",
        name: "search_skills",
        args: {
          query: "bigquery optimization",
        },
        status: "running",
      },
    });

    let snap = acc.snapshot();
    let customMeta = snap.metadata?.custom as Record<string, unknown>;
    let trace = customMeta.reasoningTrace as ReasoningTraceEntry[];
    expect(trace).toBeDefined();
    expect(trace.length).toBe(1);
    expect(trace[0].type).toBe("skill_search");
    if (trace[0].type === "skill_search") {
      expect(trace[0].query).toBe("bigquery optimization");
      expect(trace[0].status).toBe("running");
    }

    // 2. Tool Result: search_skills
    acc.handle({
      event_type: "tool_result",
      tool_result: {
        id: "call_search_1",
        name: "search_skills",
        result: {
          matches: [
            {
              skillName: "bigquery-analyzer",
              description: "BigQuery SQL optimizer",
              version: "2.1.0",
            },
          ],
        },
      },
    });

    snap = acc.snapshot();
    customMeta = snap.metadata?.custom as Record<string, unknown>;
    trace = customMeta.reasoningTrace as ReasoningTraceEntry[];
    expect(trace.length).toBe(1);
    expect(trace[0].type).toBe("skill_search");
    if (trace[0].type === "skill_search") {
      expect(trace[0].matches?.length).toBe(1);
      expect(trace[0].matches?.[0].skillName).toBe("bigquery-analyzer");
      expect(trace[0].status).toBe("complete");
    }
  });

  it("marks running skill entries complete upon done event", () => {
    const acc = new StreamAccumulator();

    acc.handle({
      event_type: "tool_call",
      tool_call: {
        id: "call_skill_unresolved",
        name: "load_skill",
        args: { skill_name: "auto-debugger" },
        status: "running",
      },
    });

    acc.handle({ event_type: "done" });

    const snap = acc.snapshot();
    const customMeta = snap.metadata?.custom as Record<string, unknown>;
    const trace = customMeta.reasoningTrace as ReasoningTraceEntry[];
    expect(trace.length).toBe(1);
    const entry = trace[0];
    expect(entry.type).toBe("skill_loaded");
    if (entry.type === "skill_loaded") {
      expect(entry.status).toBe("complete");
    }
  });
});
