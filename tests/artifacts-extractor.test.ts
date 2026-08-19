import { describe, expect, it } from "vitest";
import {
  extractArtifactFromObject,
  extractArtifactFromTool,
  extractArtifactsFromContent,
  extractArtifactsFromSessionEvent,
  inferMimeType,
} from "@/lib/artifacts/artifact-extractor";

describe("artifact-extractor", () => {
  describe("inferMimeType", () => {
    it("infers standard mime types from file extensions", () => {
      expect(inferMimeType("dashboard.html")).toBe("text/html");
      expect(inferMimeType("data.csv")).toBe("text/csv");
      expect(inferMimeType("diagram.svg")).toBe("image/svg+xml");
      expect(inferMimeType("app.py")).toBe("text/x-python");
      expect(inferMimeType("readme.md")).toBe("text/markdown");
      expect(inferMimeType("config.json")).toBe("application/json");
      expect(inferMimeType("unknown.xyz")).toBe("text/plain");
    });
  });

  describe("extractArtifactFromObject", () => {
    it("extracts artifact payload from standard artifact objects", () => {
      const art = extractArtifactFromObject({
        filename: "sales_dashboard.html",
        title: "Sales Dashboard",
        content: "<h1>Sales</h1>",
        mimeType: "text/html",
        version: 1,
      });

      expect(art).toEqual({
        filename: "sales_dashboard.html",
        title: "Sales Dashboard",
        content: "<h1>Sales</h1>",
        mimeType: "text/html",
        version: 1,
        isComplete: true,
        gcsUri: undefined,
      });
    });

    it("extracts artifact from snake_case and alternate property names", () => {
      const art = extractArtifactFromObject({
        file_name: "pipeline.py",
        code: "print('hello')",
        mime_type: "text/x-python",
        version_number: 2,
      });

      expect(art).toEqual({
        filename: "pipeline.py",
        title: "pipeline.py",
        content: "print('hello')",
        mimeType: "text/x-python",
        version: 2,
        isComplete: true,
        gcsUri: undefined,
      });
    });
  });

  describe("extractArtifactFromTool", () => {
    it("extracts artifact from artifact tool calls and responses", () => {
      const art = extractArtifactFromTool("save_artifact", {
        filename: "report.csv",
        content: "id,name,value\n1,Alpha,100",
      });

      expect(art).not.toBeNull();
      expect(art?.filename).toBe("report.csv");
      expect(art?.mimeType).toBe("text/csv");
      expect(art?.content).toContain("Alpha");
    });

    it("extracts image artifact from generate_image tool calls and responses", () => {
      const art = extractArtifactFromTool("generate_image", {
        Prompt: "Generate an image of a cute cat",
        ImageName: "cute_cat",
        image:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      });

      expect(art).not.toBeNull();
      expect(art?.filename).toBe("cute_cat.png");
      expect(art?.title).toBe("Generate an image of a cute cat");
      expect(art?.mimeType).toBe("image/png");
      expect(art?.content).toBe(
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
      );
    });

    it("extracts image artifact from response containing bytesBase64Encoded", () => {
      const art = extractArtifactFromTool("generate_image", {
        filename: "cute_cat.png",
        bytesBase64Encoded:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      });

      expect(art).not.toBeNull();
      expect(art?.filename).toBe("cute_cat.png");
      expect(art?.mimeType).toBe("image/png");
      expect(art?.content).toContain("data:image/png;base64,");
    });
  });

  describe("extractArtifactsFromContent", () => {
    it("extracts fenced code blocks with filename attribute", () => {
      const markdown = `
Here is the generated dashboard:

\`\`\`html filename="dashboard.html"
<!DOCTYPE html>
<html>
<body><h1>Dashboard</h1></body>
</html>
\`\`\`
`;
      const arts = extractArtifactsFromContent(markdown);
      expect(arts).toHaveLength(1);
      expect(arts[0].filename).toBe("dashboard.html");
      expect(arts[0].mimeType).toBe("text/html");
      expect(arts[0].content).toContain("<h1>Dashboard</h1>");
    });

    it("extracts XML artifact tags", () => {
      const markdown = `
<artifact filename="chart.svg" title="Sales Chart" type="image/svg+xml">
<svg width="100" height="100"><circle cx="50" cy="50" r="40" /></svg>
</artifact>
`;
      const arts = extractArtifactsFromContent(markdown);
      expect(arts).toHaveLength(1);
      expect(arts[0].filename).toBe("chart.svg");
      expect(arts[0].title).toBe("Sales Chart");
      expect(arts[0].mimeType).toBe("image/svg+xml");
    });

    it("extracts standalone HTML document when no other artifact is present", () => {
      const text = `
<!DOCTYPE html>
<html lang="en">
<head><title>App Interface</title></head>
<body><div id="app">Hello</div></body>
</html>
`;
      const arts = extractArtifactsFromContent(text);
      expect(arts).toHaveLength(1);
      expect(arts[0].filename).toBe("index.html");
      expect(arts[0].title).toBe("App Interface");
      expect(arts[0].mimeType).toBe("text/html");
    });

    it("extracts standalone SVG graphic with clean XML content and inferred filename", () => {
      const text = `
I understand you want to save the SVG code as a file artifact.
You can save it into a text file named **elephant.svg**.

### Elephant SVG Code

\`\`\`xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <path fill="currentColor" d="M480 320c0-109.56..." />
</svg>
\`\`\`
`;
      const arts = extractArtifactsFromContent(text);
      expect(arts).toHaveLength(1);
      expect(arts[0].filename).toBe("elephant.svg");
      expect(arts[0].mimeType).toBe("image/svg+xml");
      expect(arts[0].content).not.toContain("data:image/svg+xml;base64,");
      expect(arts[0].content).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    });

    it("extracts fenced CSV block with inferred title and data.csv filename", () => {
      const text = `
Here is the comparison table you requested:

### Top Tech Companies Comparison

\`\`\`csv
Company,Market Cap,Revenue,Employees
Apple Inc.,$3.4T,$383B,161000
Microsoft,$3.1T,$245B,228000
Nvidia,$3.0T,$60B,29600
\`\`\`
`;
      const arts = extractArtifactsFromContent(text);
      expect(arts).toHaveLength(1);
      expect(arts[0].filename).toBe("data.csv");
      expect(arts[0].title).toBe("Top Tech Companies Comparison");
      expect(arts[0].mimeType).toBe("text/csv");
      expect(arts[0].content).toContain("Apple Inc.");
    });

    it("extracts fenced CSV with mentioned filename **companies.csv**", () => {
      const text = `
I have prepared the dataset in **companies.csv**:

\`\`\`csv
Rank,Name,Value
1,Apple,3400
2,Microsoft,3100
\`\`\`
`;
      const arts = extractArtifactsFromContent(text);
      expect(arts).toHaveLength(1);
      expect(arts[0].filename).toBe("companies.csv");
      expect(arts[0].mimeType).toBe("text/csv");
    });

    it("extracts standalone CSV text without code fence", () => {
      const text = `
Here is the data:

Company,Market Cap,Revenue,Employees
Apple Inc.,$3.4T,$383B,161000
Microsoft,$3.1T,$245B,228000
Nvidia,$3.0T,$60B,29600
Alphabet,$2.1T,$307B,182502
Amazon,$1.9T,$574B,1525000
`;
      const arts = extractArtifactsFromContent(text);
      expect(arts).toHaveLength(1);
      expect(arts[0].filename).toBe("data.csv");
      expect(arts[0].mimeType).toBe("text/csv");
      expect(arts[0].content).toContain("Apple Inc.");
    });

    it("extracts SVG object without corrupting with base64 data prefix", () => {
      const art = extractArtifactFromObject({
        filename: "icon.svg",
        content: '<svg viewBox="0 0 100 100"><circle r="50" /></svg>',
        mimeType: "image/svg+xml",
      });
      expect(art).not.toBeNull();
      expect(art?.filename).toBe("icon.svg");
      expect(art?.mimeType).toBe("image/svg+xml");
      expect(art?.content).toBe('<svg viewBox="0 0 100 100"><circle r="50" /></svg>');
      expect(art?.content).not.toContain("data:image/svg+xml;base64,");
    });
  });

  describe("extractArtifactsFromSessionEvent", () => {
    it("extracts artifacts from all properties of a session event", () => {
      const evt = {
        id: "evt-123",
        role: "assistant",
        actions: {
          artifact: {
            filename: "summary.md",
            content: "# Summary\nAll tasks done.",
          },
        },
      };

      const arts = extractArtifactsFromSessionEvent(evt);
      expect(arts).toHaveLength(1);
      expect(arts[0].filename).toBe("summary.md");
      expect(arts[0].mimeType).toBe("text/markdown");
    });

    it("extracts image artifacts from content.parts function_response in session event", () => {
      const evt = {
        id: "evt-456",
        role: "assistant",
        rawEvent: {
          content: {
            parts: [
              {
                function_call: {
                  name: "generate_image",
                  args: {
                    Prompt: "Generate an image of a cute cat",
                    ImageName: "cute_cat",
                  },
                },
              },
              {
                function_response: {
                  name: "generate_image",
                  response: {
                    image: "data:image/png;base64,iVBORw0KGgo...",
                    filename: "cute_cat.png",
                  },
                },
              },
            ],
          },
        },
      };

      const arts = extractArtifactsFromSessionEvent(evt);
      expect(arts.length).toBeGreaterThanOrEqual(1);
      const catArt = arts.find((a) => a.filename === "cute_cat.png");
      expect(catArt).toBeDefined();
      expect(catArt?.mimeType).toBe("image/png");
      expect(catArt?.content).toBe("data:image/png;base64,iVBORw0KGgo...");
    });
  });
});
