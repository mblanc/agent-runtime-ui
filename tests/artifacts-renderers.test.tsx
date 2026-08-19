import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { parseCsv } from "@/lib/artifacts/csv-parser";
import { HtmlIframeRenderer } from "@/components/artifacts/renderers/html-iframe-renderer";
import { CodeArtifactRenderer } from "@/components/artifacts/renderers/code-artifact-renderer";
import { CsvTableRenderer } from "@/components/artifacts/renderers/csv-table-renderer";
import { SvgDiagramRenderer } from "@/components/artifacts/renderers/svg-diagram-renderer";
import { MarkdownArtifactRenderer } from "@/components/artifacts/renderers/markdown-artifact-renderer";

describe("Artifact Renderers & Utilities", () => {
  describe("parseCsv parser", () => {
    it("parses standard comma-delimited CSV with quotes and headers", () => {
      const csv = `Name,Age,Role\n"Alice",30,"Engineer"\n"Bob, Jr.",25,"Designer"`;
      const result = parseCsv(csv);
      expect(result.headers).toEqual(["Name", "Age", "Role"]);
      expect(result.rows.length).toBe(2);
      expect(result.rows[0]).toEqual(["Alice", "30", "Engineer"]);
      expect(result.rows[1]).toEqual(["Bob, Jr.", "25", "Designer"]);
      expect(result.totalRows).toBe(2);
    });

    it("handles empty or whitespace-only CSV", () => {
      expect(parseCsv("").totalRows).toBe(0);
      expect(parseCsv("   \n\n ").totalRows).toBe(0);
    });

    it("detects tab-delimited TSV data", () => {
      const tsv = "ID\tScore\tStatus\n1\t99.5\tPASS\n2\t82.1\tPASS";
      const result = parseCsv(tsv);
      expect(result.headers).toEqual(["ID", "Score", "Status"]);
      expect(result.rows.length).toBe(2);
    });
  });

  describe("HtmlIframeRenderer", () => {
    it("renders iframe with strict sandbox attributes", () => {
      render(<HtmlIframeRenderer html="<h1>Hello World</h1>" title="Test Preview" />);

      const iframe = screen.getByTitle("Test Preview") as HTMLIFrameElement;
      expect(iframe).toBeDefined();
      expect(iframe.getAttribute("sandbox")).toBe(
        "allow-scripts allow-forms allow-modals allow-popups"
      );
      expect(iframe.getAttribute("srcDoc")).toBe("<h1>Hello World</h1>");
    });
  });

  describe("CodeArtifactRenderer", () => {
    it("renders code and language badge", () => {
      render(
        <CodeArtifactRenderer
          code="const x = 42;"
          language="typescript"
          filename="app.ts"
        />
      );

      expect(screen.getAllByText("typescript").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("app.ts")).toBeDefined();
      expect(screen.getByText(/1 line/)).toBeDefined();
    });

    it("handles copy code click", async () => {
      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, {
        clipboard: { writeText: writeTextMock },
      });

      render(
        <CodeArtifactRenderer code="const greeting = 'hello';" language="typescript" />
      );

      const copyBtn = screen.getByRole("button", { name: /copy/i });
      fireEvent.click(copyBtn);
      expect(writeTextMock).toHaveBeenCalledWith("const greeting = 'hello';");
    });
  });

  describe("CsvTableRenderer", () => {
    const sampleCsv = `Quarter,Revenue,Growth\nQ1,100,10%\nQ2,150,50%\nQ3,120,20%`;

    it("renders table headers and row counts", () => {
      render(<CsvTableRenderer csv={sampleCsv} filename="sales.csv" />);

      expect(screen.getByText("3 rows")).toBeDefined();
      expect(screen.getByText("3 columns")).toBeDefined();
      expect(screen.getByText("Quarter")).toBeDefined();
      expect(screen.getByText("Revenue")).toBeDefined();
      expect(screen.getByText("Growth")).toBeDefined();
      expect(screen.getByText("Q1")).toBeDefined();
      expect(screen.getByText("100")).toBeDefined();
    });

    it("filters rows based on search input", () => {
      render(<CsvTableRenderer csv={sampleCsv} filename="sales.csv" />);

      const searchInput = screen.getByPlaceholderText("Filter records...");
      fireEvent.change(searchInput, { target: { value: "Q2" } });

      expect(screen.getByText("Q2")).toBeDefined();
      expect(screen.queryByText("Q1")).toBeNull();
      expect(screen.queryByText("Q3")).toBeNull();
    });
  });

  describe("SvgDiagramRenderer", () => {
    const sampleSvg = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>`;

    it("renders svg and zoom controls", () => {
      render(<SvgDiagramRenderer svg={sampleSvg} filename="test.svg" />);

      expect(screen.getByText("SVG Vector Graphics")).toBeDefined();
      expect(screen.getByText("100% zoom")).toBeDefined();

      const zoomInBtn = screen.getByRole("button", { name: /zoom in/i });
      fireEvent.click(zoomInBtn);
      expect(screen.getByText("125% zoom")).toBeDefined();
    });
  });

  describe("MarkdownArtifactRenderer", () => {
    const sampleMd = `# Overview\nThis is a sample markdown document.`;

    it("renders formatted markdown view and switches to raw code mode", () => {
      render(<MarkdownArtifactRenderer markdown={sampleMd} filename="notes.md" />);

      expect(screen.getByText("Markdown Document")).toBeDefined();
      expect(screen.getByText(/words/)).toBeDefined();

      const rawBtn = screen.getByRole("button", { name: "Raw" });
      fireEvent.click(rawBtn);

      expect(screen.getAllByText("markdown").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("notes.md")).toBeDefined();
    });
  });
});
