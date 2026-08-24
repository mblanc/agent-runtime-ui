import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  SkillLoadedBadge,
  SkillMetadataCard,
  SearchSkillsPill,
} from "@/components/skills";
import type { LoadedSkillMetadata, SkillSearchMatch } from "@/types/agent";

describe("Skill Ingestion UI Components", () => {
  const sampleSkill: LoadedSkillMetadata = {
    skillName: "bigquery-analyzer",
    version: "2.1.0",
    description:
      "Optimizes and audits BigQuery SQL queries, slot usage, and partition filters.",
    author: "Google Cloud",
    license: "Apache-2.0",
    tools: ["bigquery_exec", "explain_sql", "estimate_cost"],
    instructionsSnippet: "Always verify partition pruning on DATE or TIMESTAMP columns.",
  };

  describe("SkillMetadataCard", () => {
    it("renders full metadata with description, author, license, tools, and instructions", () => {
      render(<SkillMetadataCard skill={sampleSkill} />);

      expect(
        screen.getByText(
          "Optimizes and audits BigQuery SQL queries, slot usage, and partition filters."
        )
      ).toBeDefined();
      expect(screen.getByText("Google Cloud")).toBeDefined();
      expect(screen.getByText("Apache-2.0")).toBeDefined();
      expect(screen.getByText("v2.1.0")).toBeDefined();

      const toolChips = screen.getAllByTestId("unlocked-tool-chip");
      expect(toolChips).toHaveLength(3);
      expect(screen.getByText("bigquery_exec")).toBeDefined();
      expect(screen.getByText("explain_sql")).toBeDefined();
      expect(screen.getByText("estimate_cost")).toBeDefined();

      expect(
        screen.getByText("Always verify partition pruning on DATE or TIMESTAMP columns.")
      ).toBeDefined();
    });

    it("renders gracefully with minimal metadata", () => {
      render(<SkillMetadataCard skill={{ skillName: "minimal-skill" }} />);
      expect(screen.getByTestId("skill-metadata-card")).toBeDefined();
      expect(screen.queryByTestId("unlocked-tool-chip")).toBeNull();
    });
  });

  describe("SkillLoadedBadge", () => {
    it("renders title, version, and status badge", () => {
      render(<SkillLoadedBadge skill={sampleSkill} status="complete" />);

      expect(screen.getByText("Skill Loaded:")).toBeDefined();
      expect(screen.getByText("Bigquery Analyzer")).toBeDefined();
      expect(screen.getByText("v2.1.0")).toBeDefined();
      expect(screen.getByText("Mounted")).toBeDefined();
      expect(screen.getByText("View")).toBeDefined();

      // Expanded card is not visible initially
      expect(screen.queryByTestId("skill-metadata-card")).toBeNull();
    });

    it("toggles expanded metadata card on click", () => {
      render(<SkillLoadedBadge skill={sampleSkill} defaultOpen={false} />);

      const toggleButton = screen.getByRole("button");
      fireEvent.click(toggleButton);

      expect(screen.getByTestId("skill-metadata-card")).toBeDefined();
      expect(screen.getByText("Hide")).toBeDefined();

      fireEvent.click(toggleButton);
      expect(screen.queryByTestId("skill-metadata-card")).toBeNull();
    });

    it("renders loading state when status is running", () => {
      render(<SkillLoadedBadge skill={sampleSkill} status="running" />);
      expect(screen.getByText("Loading...")).toBeDefined();
    });
  });

  describe("SearchSkillsPill", () => {
    const matches: SkillSearchMatch[] = [
      {
        skillName: "bigquery-analyzer",
        description: "SQL optimizer",
        version: "2.1.0",
      },
      {
        skillName: "dataflow-runner",
        description: "Pipeline runner",
      },
    ];

    it("renders search query and match count", () => {
      render(<SearchSkillsPill query="bigquery optimization" matches={matches} />);

      expect(screen.getByText(/Searched Skill Registry for:/i)).toBeDefined();
      expect(screen.getByText("2 matches")).toBeDefined();
      expect(screen.getByText("Matches")).toBeDefined();
    });

    it("expands match list when clicking Matches button", () => {
      render(<SearchSkillsPill query="bigquery" matches={matches} />);

      const toggleButton = screen.getByRole("button");
      fireEvent.click(toggleButton);

      expect(screen.getByText("bigquery-analyzer")).toBeDefined();
      expect(screen.getByText("dataflow-runner")).toBeDefined();
      expect(screen.getByText("SQL optimizer")).toBeDefined();
    });
  });
});
