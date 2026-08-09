# Specification: Google Search & Enterprise RAG Grounding (Source Citations & Truthfulness Inspector)

## 1. Objective & Background

### 1.1 Objective
Implement a compliant, high-fidelity **Grounding & Citations Visualizer** in `agent-runtime-ui`. This feature supports **Grounding with Google Search** and **Vertex AI RAG Engine / Vector Search** ([`docs.cloud.google.com/.../grounding`](https://cloud.google.com/vertex-ai/generative-ai/docs/grounding/overview)), rendering the official Google Search suggestion entry point (`searchEntryPoint.renderedContent`), interactive inline citation badges (`[1]`, `[2]`) linked to text segments, and an Enterprise RAG Document Inspector for private corpora.

### 1.2 Target User & Problem Solved
- **Target User**: Enterprise users and developers requiring verifiable truthfulness, fact attribution, and source lineage in LLM responses.
- **Problem Solved**: Un-grounded AI responses can hallucinate facts without accountability. Even when grounded, standard UIs often fail to link specific sentences to sources or meet Google Search attribution guidelines.
- **Solution**:
  1. Parse `groundingMetadata` from Vertex AI Reasoning Engine / Gemini streams.
  2. Embed the official, compliant `searchEntryPoint.renderedContent` HTML widget at the bottom of grounded turns.
  3. Render clickable inline citation badges (`[1]`, `[2]`) mapped to `groundingSupports` and `groundingChunks`.
  4. Display an **Enterprise RAG Inspector** drawer for private corporate documents (titles, GCS URIs, and confidence scores).

---

## 2. Architecture & Data Contracts

### 2.1 Grounding Data Models (`src/types/agent.ts`)

```typescript
export interface WebGroundingChunk {
  uri: string; // e.g. "https://vertexaisearch.cloud.google.com/..."
  title: string; // e.g. "Google Cloud Documentation"
  domain?: string; // extracted e.g. "cloud.google.com"
}

export interface RetrievedContextChunk {
  uri: string; // e.g. "gs://my-corp-bucket/policies/q3-security.pdf"
  title: string;
  text?: string;
  ragCorpusId?: string;
  confidenceScore?: number;
}

export interface GroundingChunk {
  web?: WebGroundingChunk;
  retrievedContext?: RetrievedContextChunk;
}

export interface GroundingSupport {
  groundingChunkIndices: number[];
  confidenceScores?: number[];
  segment?: {
    startIndex: number;
    endIndex: number;
    text: string;
  };
}

export interface SearchEntryPoint {
  renderedContent?: string; // HTML and CSS snippet provided by Google Search Grounding API
  sdkBlob?: string;
}

export interface GroundingMetadata {
  webSearchQueries?: string[];
  groundingChunks?: GroundingChunk[];
  groundingSupports?: GroundingSupport[];
  searchEntryPoint?: SearchEntryPoint;
  retrievalQueries?: string[];
}
```

### 2.2 Stream Event & Message Part Extensions

```typescript
export interface AgentMessagePart {
  // ... existing fields
  grounding_metadata?: GroundingMetadata;
  groundingMetadata?: GroundingMetadata;
}

export interface AgentStreamEvent {
  // ... existing fields
  grounding_metadata?: GroundingMetadata;
}
```

---

## 3. UI & UX Architecture

### 3.1 Inline Citations & Grounding Footer (`src/components/grounding/`)

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ Assistant:                                                                  │
│ Vertex AI Agent Runtime provides managed auto-scaling and native session    │
│ persistence [1]. It supports sub-second cold starts [2] and private VPC    │
│ connectivity via Private Service Connect [3].                               │
│                                                                             │
│ ┌─────────────────────────────────────────────────────────────────────────┐ │
│ │ 🔍 Grounded with Google Search & Enterprise Docs       [ 3 Sources ▾ ]   │ │
│ ├─────────────────────────────────────────────────────────────────────────┤ │
│ │  Searches: "vertex ai agent runtime specs", "psc network attachment"    │ │
│ │                                                                         │ │
│ │  [1] cloud.google.com/agent-runtime/overview                            │ │
│ │      "Vertex AI Agent Runtime provides managed scaling and stateful..." │ │
│ │                                                                         │ │
│ │  [2] docs.cloud.google.com/gemini-enterprise-agent-platform/scale       │ │
│ │      "Sub-second cold start optimization for containerized agents..."   │ │
│ │                                                                         │ │
│ │  📄 Internal Doc: gs://corp-bucket/arch/agent-runtime-design.pdf        │ │
│ │      "Confidence: 94% • RAG Corpus: enterprise-kb-us"                   │ │
│ ├─────────────────────────────────────────────────────────────────────────┤ │
│ │  <!-- Official Google Search suggestions widget renderedContent -->     │ │
│ │  [ Search: Vertex AI Agent Runtime ] [ Search: Private Service Connect ]│ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Component Details
1. **`InlineCitationBadge` (`src/components/grounding/inline-citation-badge.tsx`)**:
   - Renders as a compact superscript button: `[1]`.
   - Hovering / clicking opens a Radix Popover with source title, URL link, snippet excerpt, and confidence rating.
2. **`GoogleSearchWidget` (`src/components/grounding/google-search-widget.tsx`)**:
   - Safely renders `searchEntryPoint.renderedContent` HTML inside a styled container conforming to Google Search attribution rules.
   - Respects dark and light mode color schemes automatically.
3. **`GroundingSourcesAccordion` (`src/components/grounding/grounding-sources-accordion.tsx`)**:
   - Collapsible panel displaying search queries, web source cards, and private RAG chunk items.
4. **`EnterpriseRagDrawer` (`src/components/grounding/enterprise-rag-drawer.tsx`)**:
   - Slide-over detail view to inspect full text excerpts of internal corporate documents matched via Vector Search.

---

## 4. Tech Stack & Dependencies

- **Framework**: Next.js 15 (App Router), React 19, TypeScript (Strict).
- **Styling**: Tailwind CSS v3, Radix UI Popover (`@radix-ui/react-popover`), `lucide-react`.
- **Markdown Pipeline**: Custom citation parsing extension in `markdown-text.tsx`.
- **Testing**: Vitest (`vitest`), `@testing-library/react`, `jsdom`.

---

## 5. File Structure & Changes

```text
src/
├── components/
│   ├── grounding/
│   │   ├── grounding-footer.tsx              # Main container at message footer
│   │   ├── google-search-widget.tsx          # Render searchEntryPoint.renderedContent
│   │   ├── grounding-sources-accordion.tsx   # Expandable list of web & RAG sources
│   │   ├── inline-citation-badge.tsx         # Clickable [N] citation in text
│   │   ├── source-popover.tsx                # Hover/click source preview card
│   │   └── enterprise-rag-drawer.tsx         # Deep inspect private RAG chunks
│   └── assistant-ui/
│       ├── gemini-message.tsx                # Mount grounding footer
│       └── markdown-text.tsx                 # Parse and replace [N] with citation badges
├── lib/
│   ├── agent-runtime-client.ts               # Mock grounding metadata generator
│   └── gemini-runtime-adapter.ts             # Map groundingMetadata to assistant-ui
└── types/
    └── agent.ts                              # GroundingMetadata, GroundingChunk, etc.
```

---

## 6. Testing Strategy

1. **Citation Parser Tests (`tests/grounding-parser.test.ts`)**:
   - Test markdown citation matching `[1]`, `[2, 3]` and mapping to `groundingChunkIndices`.
   - Test segment offset resolution against response text.
2. **Component Tests (`tests/grounding-ui.test.tsx`)**:
   - Test rendering `GoogleSearchWidget` when `searchEntryPoint.renderedContent` is provided.
   - Test clicking `InlineCitationBadge` opens `SourcePopover` with correct title and URL.
   - Test `EnterpriseRagDrawer` displays GCS URIs and confidence scores.
3. **Stream Integration Tests (`tests/grounding-stream.test.ts`)**:
   - Test receiving `grounding_metadata` in mock mode and verifying visual badges render.

---

## 7. Boundaries

- **Always**:
  - Comply with Google Search Grounding attribution and display terms.
  - Safely render HTML from `searchEntryPoint.renderedContent` while preventing arbitrary script injection.
  - Maintain 100% strict TypeScript types.
  - Support offline / mock testing when `MOCK_AGENT_RUNTIME=true`.
- **Never**:
  - Never alter or suppress the Google Search attribution logo or links provided in `renderedContent`.

---

## 8. Success Criteria & Verification

- [ ] `bun run check` passes with zero TypeScript errors.
- [ ] `bun run lint` passes with zero ESLint warnings/errors.
- [ ] `bun run test` passes all unit and component tests.
- [ ] Asking a search-related question in mock mode (e.g. *"What are the latest Vertex AI specs?"*) returns citations `[1]`, `[2]` and the Grounding summary bar.
- [ ] Clicking citations opens the source preview popover.
- [ ] The official Google Search suggestion widget renders properly in dark and light modes.
