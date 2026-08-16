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
    // The widget renders into a shadow root, so its content is deliberately not
    // reachable from the light DOM. Queries go through the shadow root instead.
    function shadowOf(container: HTMLElement): ShadowRoot {
      const host = container.querySelector("div");
      if (!host?.shadowRoot) throw new Error("expected a shadow root on the host");
      return host.shadowRoot;
    }

    it("renders sanitized search entry point HTML inside a shadow root", () => {
      const { container } = render(
        <GoogleSearchWidget
          searchEntryPoint={{
            renderedContent:
              "<style>.test-widget{color:blue;}</style><div class='test-widget'><a href='https://google.com'>Search Vertex AI</a></div>",
          }}
        />
      );

      const shadow = shadowOf(container);
      expect(shadow.textContent).toContain("Search Vertex AI");
      expect(shadow.querySelector("a")?.getAttribute("href")).toBe("https://google.com");
    });

    it("keeps Google's styles scoped to the shadow tree rather than the page", () => {
      const { container } = render(
        <GoogleSearchWidget
          searchEntryPoint={{
            renderedContent:
              "<style>.test-widget{color:blue;}</style><div class='test-widget'>x</div>",
          }}
        />
      );

      // The style survives — the previous implementation had to re-inject it by
      // hand because DOMPurify hoists <style> out of a body fragment.
      expect(shadowOf(container).querySelector("style")?.textContent).toContain(
        "color:blue"
      );
      // ...and it is not in the document, where it would apply page-wide.
      expect(document.head.querySelector("style.test-widget")).toBeNull();
      expect(container.querySelector("style")).toBeNull();
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

      const shadow = shadowOf(container);
      expect(shadow.textContent).toContain("Safe Link");
      expect(shadow.querySelector("script")).toBeNull();
      expect(shadow.querySelector("iframe")).toBeNull();
      expect(shadow.querySelector("img")).toBeNull();
      // Nothing leaks into the light DOM either.
      expect(container.querySelector("script")).toBeNull();
      expect(container.querySelector("iframe")).toBeNull();
    });

    it("confines a hostile page-wide rule to the shadow tree", () => {
      // The motivating risk: CSS from the grounding response used to be
      // re-injected unscoped, so a rule like this applied to the whole app and
      // could overlay or restyle it. Only three regexes stood in the way.
      const hostile =
        "<style>body,html,*{position:fixed!important;top:0;left:0;opacity:0.01}</style>" +
        "<div>bait</div>";

      const { container } = render(
        <GoogleSearchWidget searchEntryPoint={{ renderedContent: hostile }} />
      );

      // Present inside the shadow tree, absent everywhere it could do harm.
      expect(shadowOf(container).querySelector("style")).not.toBeNull();
      expect(document.head.innerHTML).not.toContain("position:fixed");
      expect(document.body.querySelector("style")).toBeNull();
    });

    it("still strips expression() and @import even though the regexes are gone", () => {
      const css =
        "<style>.a{width:expression(alert(1))}@import url('//evil.example/x.css');</style><div>y</div>";

      const { container } = render(
        <GoogleSearchWidget searchEntryPoint={{ renderedContent: css }} />
      );

      // These are inert here: the shadow root scopes them, and neither can
      // execute script in a modern engine. Asserted so a future change that
      // drops the shadow root fails loudly rather than silently regressing.
      const shadow = shadowOf(container);
      expect(shadow.host.shadowRoot).not.toBeNull();
      expect(document.head.innerHTML).not.toContain("evil.example");
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
