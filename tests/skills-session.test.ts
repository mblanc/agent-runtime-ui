import { describe, it, expect } from "vitest";
import { groupTurnSessionEvents } from "@/lib/agent-runtime/group-turns";
import { formatRemoteMessagesToThreadMessages } from "@/lib/session-adapter";
import type { LoadedSkillMetadata, ReasoningTraceEntry } from "@/types/agent";

describe("Skill Ingestion Session History Rehydration", () => {
  const sampleSkill: LoadedSkillMetadata = {
    skillName: "bigquery-analyzer",
    version: "2.1.0",
    description: "Optimizes and audits BigQuery SQL queries",
    author: "Google Cloud",
    license: "Apache-2.0",
    tools: ["bigquery_exec", "explain_sql"],
    instructionsSnippet: "Always verify partition pruning.",
  };

  it("groups session events with load_skill call and result into skill_loaded reasoning trace", () => {
    const rawEvents = [
      {
        id: "evt-user-1",
        role: "user",
        content: "Optimize my bigquery query",
      },
      {
        id: "evt-asst-1",
        role: "assistant",
        raw_event: {
          actions: {
            tool_calls: [
              {
                id: "call_load_1",
                name: "load_skill",
                args: {
                  skill_name: "bigquery-analyzer",
                  version: "2.1.0",
                },
              },
            ],
          },
        },
      },
      {
        id: "evt-asst-2",
        role: "assistant",
        raw_event: {
          actions: {
            tool_results: [
              {
                id: "call_load_1",
                name: "load_skill",
                result: {
                  name: "bigquery-analyzer",
                  version: "2.1.0",
                  description: "Optimizes and audits BigQuery SQL queries",
                  author: "Google Cloud",
                  license: "Apache-2.0",
                  tools: ["bigquery_exec", "explain_sql"],
                  instructions_snippet: "Always verify partition pruning.",
                },
              },
            ],
          },
        },
      },
      {
        id: "evt-asst-3",
        role: "assistant",
        content: "Here is your optimized SQL query.",
      },
    ];

    const turns = groupTurnSessionEvents(rawEvents, "sess-skills-1");
    expect(turns.length).toBe(2);

    const asstTurn = turns[1];
    expect(asstTurn.role).toBe("assistant");
    expect(asstTurn.reasoningTrace).toBeDefined();

    const skillEntry = asstTurn.reasoningTrace?.find((e) => e.type === "skill_loaded");
    expect(skillEntry).toBeDefined();
    if (skillEntry && skillEntry.type === "skill_loaded") {
      expect(skillEntry.skill.skillName).toBe("bigquery-analyzer");
      expect(skillEntry.skill.version).toBe("2.1.0");
      expect(skillEntry.skill.author).toBe("Google Cloud");
      expect(skillEntry.skill.tools).toEqual(["bigquery_exec", "explain_sql"]);
      expect(skillEntry.status).toBe("complete");
    }
  });

  it("groups session events with search_skills into skill_search reasoning trace", () => {
    const rawEvents = [
      {
        id: "evt-user-1",
        role: "user",
        content: "Find skills for bigquery",
      },
      {
        id: "evt-asst-1",
        role: "assistant",
        raw_event: {
          actions: {
            tool_calls: [
              {
                id: "call_search_1",
                name: "search_skills",
                args: { query: "bigquery" },
              },
            ],
          },
        },
      },
      {
        id: "evt-asst-2",
        role: "assistant",
        raw_event: {
          actions: {
            tool_results: [
              {
                id: "call_search_1",
                name: "search_skills",
                result: {
                  matches: [
                    {
                      skill_name: "bigquery-analyzer",
                      description: "BigQuery SQL optimizer",
                      version: "2.1.0",
                    },
                  ],
                },
              },
            ],
          },
        },
      },
      {
        id: "evt-asst-3",
        role: "assistant",
        content: "Found 1 matching skill.",
      },
    ];

    const turns = groupTurnSessionEvents(rawEvents, "sess-skills-2");
    expect(turns.length).toBe(2);

    const asstTurn = turns[1];
    expect(asstTurn.reasoningTrace).toBeDefined();
    const searchEntry = asstTurn.reasoningTrace?.find((e) => e.type === "skill_search");
    expect(searchEntry).toBeDefined();
    if (searchEntry && searchEntry.type === "skill_search") {
      expect(searchEntry.query).toBe("bigquery");
      expect(searchEntry.matches?.length).toBe(1);
      expect(searchEntry.matches?.[0].skillName).toBe("bigquery-analyzer");
      expect(searchEntry.status).toBe("complete");
    }
  });

  it("formatRemoteMessagesToThreadMessages preserves reasoningTrace with skill entries", () => {
    const rawMessages = [
      {
        id: "msg-1",
        role: "assistant",
        content: "I have optimized your query.",
        thought: "Loaded bigquery analyzer skill",
        reasoningTrace: [
          {
            type: "skill_loaded",
            skill: sampleSkill,
            status: "complete",
          },
        ] as ReasoningTraceEntry[],
      },
    ];

    const threadMessages = formatRemoteMessagesToThreadMessages(rawMessages);
    expect(threadMessages.length).toBe(1);
    const customMeta = threadMessages[0].metadata?.custom as Record<string, unknown>;
    expect(customMeta.reasoningTrace).toBeDefined();
    const trace = customMeta.reasoningTrace as ReasoningTraceEntry[];
    expect(trace[0].type).toBe("skill_loaded");
  });
});
