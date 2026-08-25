import { describe, it, expect } from "vitest";
import {
  isLoadSkillTool,
  isSearchSkillsTool,
  parseLoadedSkillPayload,
  parseSearchSkillsPayload,
} from "@/lib/skills/skill-parser";

describe("Skill Parser & Normalizer", () => {
  describe("tool name detection", () => {
    it("identifies load_skill tool variants", () => {
      expect(isLoadSkillTool("load_skill")).toBe(true);
      expect(isLoadSkillTool("loadSkill")).toBe(true);
      expect(isLoadSkillTool("adk_load_skill")).toBe(true);
      expect(isLoadSkillTool("skill_loader")).toBe(true);
      expect(isLoadSkillTool("execute_query")).toBe(false);
      expect(isLoadSkillTool(undefined)).toBe(false);
    });

    it("identifies search_skills tool variants", () => {
      expect(isSearchSkillsTool("search_skills")).toBe(true);
      expect(isSearchSkillsTool("searchSkills")).toBe(true);
      expect(isSearchSkillsTool("adk_search_skills")).toBe(true);
      expect(isSearchSkillsTool("skills_search")).toBe(true);
      expect(isSearchSkillsTool("search_skill")).toBe(true);
      expect(isSearchSkillsTool("fetch_docs")).toBe(false);
      expect(isSearchSkillsTool(undefined)).toBe(false);
    });
  });

  describe("parseLoadedSkillPayload", () => {
    it("parses valid load_skill payload with snake_case properties", () => {
      const args = { skill_name: "bigquery-analyzer", version: "2.1.0" };
      const result = {
        name: "bigquery-analyzer",
        version: "2.1.0",
        description: "Optimizes and audits BigQuery SQL queries and partitions",
        author: "Google Cloud",
        license: "Apache-2.0",
        unlocked_tools: ["bigquery_exec", "explain_sql"],
        instructions_snippet: "When analyzing queries, check partition filters first.",
      };

      const parsed = parseLoadedSkillPayload(args, result);
      expect(parsed).toEqual({
        skillName: "bigquery-analyzer",
        version: "2.1.0",
        description: "Optimizes and audits BigQuery SQL queries and partitions",
        author: "Google Cloud",
        license: "Apache-2.0",
        tools: ["bigquery_exec", "explain_sql"],
        instructionsSnippet: "When analyzing queries, check partition filters first.",
      });
    });

    it("parses camelCase payload and stringified JSON", () => {
      const args = JSON.stringify({ skillName: "data-science-toolkit" });
      const result = JSON.stringify({
        skillName: "data-science-toolkit",
        version: "1.0.4",
        description: "Pandas and scikit-learn analytics helper",
        tools: ["fit_model", "predict"],
      });

      const parsed = parseLoadedSkillPayload(args, result);
      expect(parsed).toEqual({
        skillName: "data-science-toolkit",
        version: "1.0.4",
        description: "Pandas and scikit-learn analytics helper",
        tools: ["fit_model", "predict"],
      });
    });

    it("handles partial payload with only args", () => {
      const args = { skill_name: "gcs-manager", version: "0.9.0" };
      const parsed = parseLoadedSkillPayload(args, undefined);
      expect(parsed).toEqual({
        skillName: "gcs-manager",
        version: "0.9.0",
      });
    });

    it("handles nested skill object in result", () => {
      const result = {
        skill: {
          name: "vertex-search",
          version: "3.0.0",
          description: "Enterprise RAG search",
          tools: ["search_corpus"],
        },
      };

      const parsed = parseLoadedSkillPayload({}, result);
      expect(parsed).toEqual({
        skillName: "vertex-search",
        version: "3.0.0",
        description: "Enterprise RAG search",
        tools: ["search_corpus"],
      });
    });

    it("parses error payload from registry failure", () => {
      const args = { name: "private-workspace-artifact-builder" };
      const result = {
        error:
          "Failed to fetch skill 'private-workspace-artifact-builder' from registry: Skill 'private-workspace-artifact-builder' does not contain zipped filesystem.",
        error_code: "REGISTRY_ERROR",
      };

      const parsed = parseLoadedSkillPayload(args, result);
      expect(parsed).toEqual({
        skillName: "private-workspace-artifact-builder",
        error:
          "Failed to fetch skill 'private-workspace-artifact-builder' from registry: Skill 'private-workspace-artifact-builder' does not contain zipped filesystem.",
        errorCode: "REGISTRY_ERROR",
      });
    });

    it("extracts skillName from error message string when args name is missing", () => {
      const result = {
        error:
          "Failed to fetch skill 'private-workspace-artifact-builder' from registry: Skill 'private-workspace-artifact-builder' does not contain zipped filesystem.",
        error_code: "REGISTRY_ERROR",
      };

      const parsed = parseLoadedSkillPayload({}, result);
      expect(parsed).toEqual({
        skillName: "private-workspace-artifact-builder",
        error:
          "Failed to fetch skill 'private-workspace-artifact-builder' from registry: Skill 'private-workspace-artifact-builder' does not contain zipped filesystem.",
        errorCode: "REGISTRY_ERROR",
      });
    });

    it("returns null on empty input", () => {
      expect(parseLoadedSkillPayload(undefined, undefined)).toBeNull();
      expect(parseLoadedSkillPayload({}, {})).toBeNull();
    });
  });

  describe("parseSearchSkillsPayload", () => {
    it("parses search query and match list", () => {
      const args = { query: "bigquery optimization" };
      const result = {
        matches: [
          {
            skill_name: "bigquery-analyzer",
            description: "BigQuery SQL optimizer",
            version: "2.1.0",
          },
          {
            name: "sql-linter",
            description: "Validates SQL syntax",
          },
        ],
      };

      const parsed = parseSearchSkillsPayload(args, result);
      expect(parsed).toEqual({
        query: "bigquery optimization",
        matches: [
          {
            skillName: "bigquery-analyzer",
            description: "BigQuery SQL optimizer",
            version: "2.1.0",
          },
          {
            skillName: "sql-linter",
            description: "Validates SQL syntax",
          },
        ],
      });
    });

    it("parses stringified JSON search result", () => {
      const args = { search_query: "cloud storage" };
      const result = JSON.stringify([
        {
          skillName: "gcs-ops",
          description: "GCS bucket operations",
          version: "1.2.0",
        },
      ]);

      const parsed = parseSearchSkillsPayload(args, result);
      expect(parsed).toEqual({
        query: "cloud storage",
        matches: [
          {
            skillName: "gcs-ops",
            description: "GCS bucket operations",
            version: "1.2.0",
          },
        ],
      });
    });

    it("returns null when no query or matches exist", () => {
      expect(parseSearchSkillsPayload(undefined, undefined)).toBeNull();
      expect(parseSearchSkillsPayload({}, {})).toBeNull();
    });
  });
});
