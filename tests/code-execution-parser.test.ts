import { describe, it, expect } from "vitest";
import { parseCodeExecutionOutput } from "@/lib/code-execution/output-parser";
import { ansiToHtml } from "@/lib/code-execution/ansi-to-html";

describe("parseCodeExecutionOutput", () => {
  it("returns empty stdout and images when given empty or undefined input", () => {
    expect(parseCodeExecutionOutput()).toEqual({
      stdout: "",
      images: [],
      savedArtifacts: [],
    });
    expect(parseCodeExecutionOutput("")).toEqual({
      stdout: "",
      images: [],
      savedArtifacts: [],
    });
  });

  it("extracts pure stdout when no images are present", () => {
    const raw = "Prime numbers found: [2, 3, 5, 7, 11]\nTotal: 5";
    const result = parseCodeExecutionOutput(raw);
    expect(result.stdout).toBe("Prime numbers found: [2, 3, 5, 7, 11]\nTotal: 5");
    expect(result.images).toEqual([]);
  });

  it("extracts base64 data URLs and cleans stdout", () => {
    const base64Data =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const raw = `Generated Histogram Plot:\n${base64Data}\nSummary stats calculated successfully.`;

    const result = parseCodeExecutionOutput(raw);
    expect(result.stdout).toBe(
      "Generated Histogram Plot:\n\nSummary stats calculated successfully."
    );
    expect(result.images).toEqual([base64Data]);
  });

  it("extracts GCS image URIs and cleans stdout", () => {
    const gcsUri = "gs://my-bucket/artifacts/scatter_plot.png";
    const raw = `Plot saved to Cloud Storage: ${gcsUri}\nDone.`;

    const result = parseCodeExecutionOutput(raw);
    expect(result.stdout).toBe("Plot saved to Cloud Storage:\nDone.");
    expect(result.images).toEqual([gcsUri]);
  });

  it("handles multiple images and deduplicates identical URLs", () => {
    const img1 = "data:image/png;base64,AAAA";
    const img2 = "data:image/png;base64,BBBB";
    const raw = `Plot 1: ${img1}\nPlot 2: ${img2}\nPlot 1 copy: ${img1}`;

    const result = parseCodeExecutionOutput(raw);
    expect(result.images).toEqual([img1, img2]);
  });

  it("extracts saved artifact filenames from sandbox stdout like Saved artifacts:\\noutput_2026-08-18-13-50-21-330452.png", () => {
    const raw =
      "Saved artifacts:\noutput_2026-08-18-13-50-21-330452.png\n\nExecution completed successfully.";
    const result = parseCodeExecutionOutput(raw);
    expect(result.savedArtifacts).toContain("output_2026-08-18-13-50-21-330452.png");
  });
});

describe("ansiToHtml", () => {
  it("returns empty string for empty input", () => {
    expect(ansiToHtml()).toBe("");
    expect(ansiToHtml("")).toBe("");
  });

  it("escapes dangerous HTML characters to prevent XSS", () => {
    const raw = `<script>alert("hack")</script> & 'foo' "bar"`;
    const result = ansiToHtml(raw);
    expect(result).not.toContain("<script>");
    expect(result).toContain("&lt;script&gt;");
    expect(result).toContain("&amp;");
    expect(result).toContain("&quot;bar&quot;");
  });

  it("converts ANSI color sequences to HTML spans", () => {
    const raw = "Normal \x1b[31mRed Error\x1b[0m Normal";
    const result = ansiToHtml(raw);
    expect(result).toContain('<span class="text-rose-400 font-medium">Red Error</span>');
  });

  it("handles bold and green styles", () => {
    const raw = "\x1b[1m\x1b[32mSuccess: 100%\x1b[0m";
    const result = ansiToHtml(raw);
    expect(result).toContain('class="font-bold"');
    expect(result).toContain('class="text-emerald-400 font-medium"');
    expect(result).toContain("Success: 100%");
  });

  it("closes unclosed spans at the end of input", () => {
    const raw = "\x1b[31mUnclosed Red Error";
    const result = ansiToHtml(raw);
    expect(result).toBe(
      '<span class="text-rose-400 font-medium">Unclosed Red Error</span>'
    );
  });

  it("caps maximum open span depth to prevent excessive DOM nesting", () => {
    const repetitiveAnsi = "\x1b[31m".repeat(50) + "Deep Text" + "\x1b[0m";
    const result = ansiToHtml(repetitiveAnsi);
    const spanMatches = result.match(/<span/g);
    expect(spanMatches?.length).toBeLessThanOrEqual(20);
    expect(result).toContain("Deep Text");
  });
});
