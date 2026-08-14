import { describe, expect, it } from "vitest";
import {
  extractDomainFromUri,
  extractGroundingMetadata,
  isGrounded,
  parseCitationIndices,
  resolveCitationSource,
  transformCitationsToMarkdownLinks,
} from "@/lib/grounding/citation-parser";
import type { GroundingChunk } from "@/types/agent";

describe("Grounding Citation Parser & Utilities", () => {
  describe("extractDomainFromUri", () => {
    it("extracts hostname from https and http urls", () => {
      expect(
        extractDomainFromUri("https://cloud.google.com/vertex-ai/docs/grounding")
      ).toBe("cloud.google.com");
      expect(extractDomainFromUri("http://www.example.org/path/to/page")).toBe(
        "example.org"
      );
      expect(
        extractDomainFromUri(
          "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc"
        )
      ).toBe("vertexaisearch.cloud.google.com");
    });

    it("extracts GCS bucket prefix from gs:// uris", () => {
      expect(extractDomainFromUri("gs://my-corp-bucket/policies/q3-security.pdf")).toBe(
        "gs://my-corp-bucket"
      );
      expect(extractDomainFromUri("gs://arch-kb/specs/design.md")).toBe("gs://arch-kb");
    });

    it("handles empty or invalid uris gracefully", () => {
      expect(extractDomainFromUri("")).toBe("");
      expect(extractDomainFromUri(undefined)).toBe("");
      expect(extractDomainFromUri("not-a-valid-uri")).toBe("not-a-valid-uri");
    });
  });

  describe("parseCitationIndices", () => {
    it("parses single citation bracket [1]", () => {
      expect(parseCitationIndices("This is grounded fact [1].")).toEqual([1]);
    });

    it("parses multi-citation brackets [1, 2] and [1, 2, 3]", () => {
      expect(parseCitationIndices("Multiple sources [1, 2].")).toEqual([1, 2]);
      expect(parseCitationIndices("Comprehensive evidence [1, 2, 3].")).toEqual([
        1, 2, 3,
      ]);
    });

    it("parses adjacent brackets [1][2]", () => {
      expect(parseCitationIndices("Adjacent citations [1][2].")).toEqual([1, 2]);
    });

    it("deduplicates repeated indices within text", () => {
      expect(parseCitationIndices("Fact one [1] and fact two [1, 2]")).toEqual([1, 2]);
    });

    it("ignores non-numeric brackets or empty input", () => {
      expect(parseCitationIndices("")).toEqual([]);
      expect(parseCitationIndices("No citations here")).toEqual([]);
      expect(parseCitationIndices("[Link text](https://google.com)")).toEqual([]);
    });
  });

  describe("resolveCitationSource", () => {
    const mockChunks: GroundingChunk[] = [
      {
        web: {
          uri: "https://cloud.google.com/vertex-ai",
          title: "Vertex AI Overview",
          domain: "cloud.google.com",
        },
      },
      {
        retrievedContext: {
          uri: "gs://corp-bucket/agent-specs.pdf",
          title: "Agent Specs",
          text: "Vertex AI Reasoning Engine supports multi-turn sessions.",
          confidenceScore: 0.94,
        },
      },
    ];

    it("maps 1-based index 1 to the first chunk", () => {
      const source = resolveCitationSource(1, mockChunks);
      expect(source?.web?.title).toBe("Vertex AI Overview");
      expect(source?.web?.domain).toBe("cloud.google.com");
    });

    it("maps 1-based index 2 to the second chunk", () => {
      const source = resolveCitationSource(2, mockChunks);
      expect(source?.retrievedContext?.title).toBe("Agent Specs");
      expect(source?.retrievedContext?.confidenceScore).toBe(0.94);
    });

    it("returns undefined for out-of-bounds or invalid indices", () => {
      expect(resolveCitationSource(0, mockChunks)).toBeUndefined();
      expect(resolveCitationSource(3, mockChunks)).toBeUndefined();
      expect(resolveCitationSource(-1, mockChunks)).toBeUndefined();
      expect(resolveCitationSource(1, undefined)).toBeUndefined();
      expect(resolveCitationSource(1, [])).toBeUndefined();
    });
  });

  describe("extractGroundingMetadata", () => {
    it("normalizes camelCase Vertex AI grounding payload", () => {
      const raw = {
        webSearchQueries: ["vertex ai agent runtime specs", "psc network"],
        groundingChunks: [
          {
            web: {
              uri: "https://cloud.google.com/agent-runtime",
              title: "Agent Runtime Overview",
            },
          },
          {
            retrievedContext: {
              uri: "gs://corp-bucket/arch/design.pdf",
              title: "Design Specs",
              text: "Enterprise RAG context",
              ragCorpusId: "enterprise-kb",
              confidenceScore: 0.96,
            },
          },
        ],
        groundingSupports: [
          {
            groundingChunkIndices: [0],
            confidenceScores: [0.98],
            segment: {
              startIndex: 0,
              endIndex: 45,
              text: "Vertex AI Agent Runtime provides managed scaling",
            },
          },
        ],
        searchEntryPoint: {
          renderedContent: "<div class='google-search-widget'>Google Search Widget</div>",
        },
      };

      const meta = extractGroundingMetadata(raw);
      expect(meta).toBeDefined();
      expect(meta?.webSearchQueries).toEqual([
        "vertex ai agent runtime specs",
        "psc network",
      ]);
      expect(meta?.groundingChunks).toHaveLength(2);
      expect(meta?.groundingChunks?.[0].web?.domain).toBe("cloud.google.com");
      expect(meta?.groundingChunks?.[1].retrievedContext?.ragCorpusId).toBe(
        "enterprise-kb"
      );
      expect(meta?.groundingSupports?.[0].groundingChunkIndices).toEqual([0]);
      expect(meta?.searchEntryPoint?.renderedContent).toContain("Google Search Widget");
      expect(isGrounded(meta)).toBe(true);
    });

    it("normalizes snake_case Gemini candidate grounding payload", () => {
      const raw = {
        candidates: [
          {
            grounding_metadata: {
              web_search_queries: ["gemini enterprise platform"],
              grounding_chunks: [
                {
                  web: {
                    uri: "https://docs.cloud.google.com/gemini",
                    title: "Gemini Documentation",
                  },
                },
              ],
              search_entry_point: {
                rendered_content: "<span>Search suggestions</span>",
              },
            },
          },
        ],
      };

      const meta = extractGroundingMetadata(raw);
      expect(meta).toBeDefined();
      expect(meta?.webSearchQueries).toEqual(["gemini enterprise platform"]);
      expect(meta?.groundingChunks?.[0].web?.title).toBe("Gemini Documentation");
      expect(meta?.searchEntryPoint?.renderedContent).toBe(
        "<span>Search suggestions</span>"
      );
      expect(isGrounded(meta)).toBe(true);
    });

    it("normalizes ADK google_search tool results into GroundingMetadata", () => {
      const toolEvent = {
        tool_result: {
          name: "google_search",
          result: {
            query: "weather in Copenhagen today",
            search_results: [
              {
                title: "Copenhagen Weather - AccuWeather",
                url: "https://www.accuweather.com/en/dk/copenhagen/forecast",
                snippet: "Current weather in Copenhagen is 18°C and partly cloudy.",
              },
              {
                title: "Copenhagen Forecast - Time and Date",
                url: "https://www.timeanddate.com/weather/denmark/copenhagen",
                snippet: "Detailed forecast for Copenhagen.",
              },
            ],
          },
        },
      };

      const meta = extractGroundingMetadata(toolEvent);
      expect(meta).toBeDefined();
      expect(meta?.webSearchQueries).toEqual(["weather in Copenhagen today"]);
      expect(meta?.groundingChunks).toHaveLength(2);
      expect(meta?.groundingChunks?.[0].web?.domain).toBe("accuweather.com");
      expect(meta?.groundingChunks?.[1].web?.domain).toBe("timeanddate.com");
      expect(isGrounded(meta)).toBe(true);
    });

    it("normalizes ADK google_search_agent subagent responses into GroundingMetadata", () => {
      const subagentEvent = {
        agent_response: {
          agent: "google_search_agent",
          response: {
            search_query: "weather in Copenhagen today",
            sources: [
              {
                title: "DMI Copenhagen Weather",
                uri: "https://www.dmi.dk/copenhagen",
              },
            ],
          },
        },
      };

      const meta = extractGroundingMetadata(subagentEvent);
      expect(meta).toBeDefined();
      expect(meta?.webSearchQueries).toEqual(["weather in Copenhagen today"]);
      expect(meta?.groundingChunks?.[0].web?.domain).toBe("dmi.dk");
      expect(isGrounded(meta)).toBe(true);
    });

    it("returns undefined and isGrounded false for empty or un-grounded payloads", () => {
      expect(extractGroundingMetadata(null)).toBeUndefined();
      expect(extractGroundingMetadata({})).toBeUndefined();
      expect(extractGroundingMetadata({ text: "Hello world" })).toBeUndefined();
      expect(isGrounded(undefined)).toBe(false);
      expect(isGrounded(null)).toBe(false);
    });
  });

  describe("transformCitationsToMarkdownLinks", () => {
    it("transforms single [1] into [1](#cite-1)", () => {
      expect(transformCitationsToMarkdownLinks("Vertex AI is scalable [1].")).toBe(
        "Vertex AI is scalable [1](#cite-1)."
      );
    });

    it("transforms multiple indices [1, 2] into [1, 2](#cite-1,2)", () => {
      expect(transformCitationsToMarkdownLinks("Sub-second cold starts [1, 2].")).toBe(
        "Sub-second cold starts [1, 2](#cite-1,2)."
      );
    });

    it("transforms adjacent citation brackets [1][2]", () => {
      expect(transformCitationsToMarkdownLinks("Multiple facts [1][2].")).toBe(
        "Multiple facts [1](#cite-1)[2](#cite-2)."
      );
    });

    it("does not transform standard markdown links [text](url) or images ![alt](url)", () => {
      const text =
        "Visit [Google Cloud](https://cloud.google.com) and ![Architecture](https://example.com/arch.png) along with [1].";
      expect(transformCitationsToMarkdownLinks(text)).toBe(
        "Visit [Google Cloud](https://cloud.google.com) and ![Architecture](https://example.com/arch.png) along with [1](#cite-1)."
      );
    });

    it("does not transform array literals in fenced code blocks or inline code", () => {
      const input =
        "Here is code:\n```typescript\nconst arr = [1, 2];\nconsole.log(arr[1]);\n```\nAlso inline `items[0]` and fact [1].";
      const expected =
        "Here is code:\n```typescript\nconst arr = [1, 2];\nconsole.log(arr[1]);\n```\nAlso inline `items[0]` and fact [1](#cite-1).";
      expect(transformCitationsToMarkdownLinks(input)).toBe(expected);
    });

    it("handles empty or null string gracefully", () => {
      expect(transformCitationsToMarkdownLinks("")).toBe("");
    });
  });
});
