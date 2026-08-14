import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { InlineCitationBadge } from "@/components/grounding/inline-citation-badge";
import { SourcePopoverContent } from "@/components/grounding/source-popover";
import { GoogleSearchWidget } from "@/components/grounding/google-search-widget";
import { GroundingSourcesAccordion } from "@/components/grounding/grounding-sources-accordion";
import { EnterpriseRagDrawer } from "@/components/grounding/enterprise-rag-drawer";
import { GroundingFooter } from "@/components/grounding/grounding-footer";
import { GroundingProvider } from "@/components/grounding/grounding-context";
import type {
  GroundingChunk,
  GroundingMetadata,
  RetrievedContextChunk,
} from "@/types/agent";

const mockSampleChunks: GroundingChunk[] = [
  {
    web: {
      uri: "https://cloud.google.com/vertex-ai/docs",
      title: "Google Cloud Documentation",
      domain: "cloud.google.com",
    },
  },
  {
    retrievedContext: {
      uri: "gs://corp-bucket/policies/q3-security.pdf",
      title: "Q3 Security Policies",
      text: "Full enterprise security architecture context.",
      ragCorpusId: "corp-rag-kb",
      confidenceScore: 0.94,
    },
  },
];

const mockMetadata: GroundingMetadata = {
  webSearchQueries: ["vertex ai agent runtime", "psc network"],
  groundingChunks: mockSampleChunks,
  searchEntryPoint: {
    renderedContent:
      "<div class='google-entry-point'><span>Search Suggestions</span></div>",
  },
};

describe("Grounding UI Components", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("InlineCitationBadge", () => {
    it("renders single citation badge [1] and opens popover on click", () => {
      render(<InlineCitationBadge index={1} chunks={mockSampleChunks} />);

      const btn = screen.getByRole("button", { name: /Citation source \[1\]/i });
      expect(btn).toBeDefined();
      expect(btn.textContent).toBe("[1]");

      fireEvent.click(btn);
      expect(screen.getByText("Google Cloud Documentation")).toBeDefined();
      expect(screen.getByText("Google Search Source")).toBeDefined();
    });

    it("renders multi-citation badge [1, 2] with tab switching", () => {
      render(<InlineCitationBadge indices={[1, 2]} chunks={mockSampleChunks} />);

      const btn = screen.getByRole("button", { name: /Citation source \[1, 2\]/i });
      expect(btn).toBeDefined();
      expect(btn.textContent).toBe("[1, 2]");

      fireEvent.click(btn);
      expect(screen.getByText("Source [1]")).toBeDefined();
      expect(screen.getByText("Source [2]")).toBeDefined();
      expect(screen.getByText("Google Cloud Documentation")).toBeDefined();

      fireEvent.click(screen.getByText("Source [2]"));
      expect(screen.getByText("Q3 Security Policies")).toBeDefined();
      expect(screen.getByText("94% match")).toBeDefined();
    });
  });

  describe("SourcePopoverContent", () => {
    it("renders web search result card with link", () => {
      render(<SourcePopoverContent chunk={mockSampleChunks[0]} index={1} />);

      expect(screen.getByText("Google Cloud Documentation")).toBeDefined();
      expect(screen.getByText("cloud.google.com")).toBeDefined();
      expect(screen.getByText("Google Search Source")).toBeDefined();
    });

    it("renders enterprise RAG document card with confidence rating and inspect action", () => {
      const onInspect = vi.fn();
      render(
        <SourcePopoverContent
          chunk={mockSampleChunks[1]}
          index={2}
          onInspectRagDoc={onInspect}
        />
      );

      expect(screen.getByText("Q3 Security Policies")).toBeDefined();
      expect(screen.getByText("94% match")).toBeDefined();
      expect(screen.getByText("Enterprise RAG Doc")).toBeDefined();
      expect(screen.getByText("corp-rag-kb")).toBeDefined();

      const inspectBtn = screen.getByRole("button", { name: /Inspect Chunk/i });
      fireEvent.click(inspectBtn);
      expect(onInspect).toHaveBeenCalledWith(mockSampleChunks[1].retrievedContext);
    });
  });

  describe("GoogleSearchWidget", () => {
    it("renders sanitized search entry point HTML snippet with preserved styles exactly as provided", () => {
      render(
        <GoogleSearchWidget
          searchEntryPoint={{
            renderedContent:
              "<style>.test-widget{color:blue;}</style><div class='test-widget'><a href='https://google.com'>Search Vertex AI</a></div>",
          }}
        />
      );

      expect(screen.getByText("Search Vertex AI")).toBeDefined();
    });

    it("sanitizes XSS payloads from renderedContent safely", () => {
      const maliciousPayload = `
        <div class="search-widget">
          <a href="https://cloud.google.com">Safe Link</a>
          <script>window.__pwned = true;</script>
          <img src="invalid" onerror="alert('xss')" />
          <iframe src="javascript:alert('xss')"></iframe>
        </div>
      `;

      const { container } = render(
        <GoogleSearchWidget
          searchEntryPoint={{
            renderedContent: maliciousPayload,
          }}
        />
      );

      expect(screen.getByText("Safe Link")).toBeDefined();
      expect(container.querySelector("script")).toBeNull();
      expect(container.querySelector("iframe")).toBeNull();
      expect(container.querySelector("img")).toBeNull();
    });

    it("returns null when renderedContent is empty or absent", () => {
      const { container } = render(<GoogleSearchWidget searchEntryPoint={{}} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("GroundingProvider Integration", () => {
    it("connects InlineCitationBadge to EnterpriseRagDrawer via GroundingProvider", () => {
      render(
        <GroundingProvider>
          <div>
            <InlineCitationBadge index={2} chunks={mockSampleChunks} />
            <GroundingFooter metadata={mockMetadata} />
          </div>
        </GroundingProvider>
      );

      // Open badge popover
      const badge = screen.getByRole("button", { name: /Citation source \[2\]/i });
      fireEvent.click(badge);

      // Popover shows enterprise doc card
      expect(screen.getByText("Q3 Security Policies")).toBeDefined();

      // Click "Inspect Chunk"
      const inspectBtn = screen.getByRole("button", { name: /Inspect Chunk/i });
      fireEvent.click(inspectBtn);

      // RAG Drawer is now open!
      expect(screen.getByText("Enterprise RAG Inspector")).toBeDefined();
      expect(
        screen.getByText("Full enterprise security architecture context.")
      ).toBeDefined();
    });
  });

  describe("GroundingSourcesAccordion", () => {
    it("renders toggle button with total source count and expands sources list", () => {
      const onInspect = vi.fn();
      render(
        <GroundingSourcesAccordion metadata={mockMetadata} onInspectRagDoc={onInspect} />
      );

      const trigger = screen.getByRole("button", {
        name: /Toggle grounding sources list/i,
      });
      expect(trigger).toBeDefined();
      expect(screen.getByText("2 Sources")).toBeDefined();

      fireEvent.click(trigger);
      expect(screen.getByText(/Searches:/i)).toBeDefined();
      expect(screen.getByText("“vertex ai agent runtime”")).toBeDefined();
      expect(screen.getByText("Google Cloud Documentation")).toBeDefined();
      expect(screen.getByText("Q3 Security Policies")).toBeDefined();

      const inspectBtn = screen.getByRole("button", { name: /Inspect/i });
      fireEvent.click(inspectBtn);
      expect(onInspect).toHaveBeenCalled();
    });

    it("returns null if metadata has no chunks or queries", () => {
      const { container } = render(
        <GroundingSourcesAccordion metadata={{ groundingChunks: [] }} />
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe("EnterpriseRagDrawer", () => {
    it("renders full document chunk text, GCS URI, and confidence score", () => {
      const onClose = vi.fn();
      render(
        <EnterpriseRagDrawer
          isOpen={true}
          onClose={onClose}
          chunk={mockSampleChunks[1].retrievedContext as RetrievedContextChunk}
        />
      );

      expect(screen.getByText("Enterprise RAG Inspector")).toBeDefined();
      expect(screen.getByText("Q3 Security Policies")).toBeDefined();
      expect(screen.getByText("94% Match")).toBeDefined();
      expect(
        screen.getByText("Full enterprise security architecture context.")
      ).toBeDefined();
      expect(screen.getByText("corp-rag-kb")).toBeDefined();
    });
  });
});
