import {
  GroundingChunk,
  GroundingMetadata,
  GroundingSupport,
  RetrievedContextChunk,
  SearchEntryPoint,
  WebGroundingChunk,
} from "@/types/agent";

/**
 * Extracts a clean domain or URI identifier from a web URL or GCS URI.
 */
export function extractDomainFromUri(uri?: string): string {
  if (!uri) return "";

  const trimmed = uri.trim();
  if (trimmed.startsWith("gs://")) {
    const parts = trimmed.substring(5).split("/");
    return `gs://${parts[0] || ""}`;
  }

  try {
    const parsed = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    let host = parsed.hostname.toLowerCase();
    if (host.startsWith("www.")) {
      host = host.substring(4);
    }
    return host;
  } catch {
    return trimmed;
  }
}

/**
 * Parses numeric citation indices from citation bracket strings.
 * Examples:
 *   "[1]" -> [1]
 *   "[1, 2]" -> [1, 2]
 *   "[1, 2, 3]" -> [1, 2, 3]
 *   "[1][2]" -> [1, 2]
 */
export function parseCitationIndices(citationText: string): number[] {
  if (!citationText) return [];

  const matches = citationText.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g);
  const indices: number[] = [];

  for (const match of matches) {
    const nums = match[1].split(",").map((n) => parseInt(n.trim(), 10));
    for (const num of nums) {
      if (!isNaN(num) && num > 0 && !indices.includes(num)) {
        indices.push(num);
      }
    }
  }

  return indices;
}

/**
 * Resolves a 1-based citation index (e.g. 1 for [1]) to its GroundingChunk object.
 */
export function resolveCitationSource(
  citationIndex: number,
  chunks?: GroundingChunk[]
): GroundingChunk | undefined {
  if (!chunks || citationIndex <= 0 || citationIndex > chunks.length) {
    return undefined;
  }
  return chunks[citationIndex - 1];
}

/**
 * Normalizes raw grounding chunk objects into typed GroundingChunk.
 */
/**
 * Normalizes raw grounding chunk objects into typed GroundingChunk.
 */
function normalizeGroundingChunk(raw: Record<string, unknown>): GroundingChunk | null {
  if (!raw || typeof raw !== "object") return null;

  const rawWeb = (raw.web || raw.web_grounding_chunk || raw.webGroundingChunk) as
    Record<string, unknown> | undefined;
  const rawRetrieved = (raw.retrievedContext ||
    raw.retrieved_context ||
    raw.retrieved_context_chunk ||
    raw.retrievedContextChunk) as Record<string, unknown> | undefined;

  let web: WebGroundingChunk | undefined;
  if (rawWeb) {
    const uri = String(rawWeb.uri || rawWeb.url || rawWeb.link || "");
    const title = String(rawWeb.title || rawWeb.name || extractDomainFromUri(uri));
    const domain = String(rawWeb.domain || extractDomainFromUri(uri));
    if (uri) {
      web = { uri, title, domain };
    }
  } else {
    const rawUri = String(raw.uri || raw.url || raw.link || "");
    if (rawUri && !rawUri.startsWith("gs://")) {
      const title = String(raw.title || raw.name || extractDomainFromUri(rawUri));
      const domain = String(raw.domain || extractDomainFromUri(rawUri));
      web = { uri: rawUri, title, domain };
    }
  }

  let retrievedContext: RetrievedContextChunk | undefined;
  if (rawRetrieved) {
    const uri = String(
      rawRetrieved.uri || rawRetrieved.gcsUri || rawRetrieved.gcs_uri || ""
    );
    const title = String(rawRetrieved.title || uri.split("/").pop() || "Document");
    const text =
      rawRetrieved.text || rawRetrieved.snippet || rawRetrieved.content
        ? String(rawRetrieved.text || rawRetrieved.snippet || rawRetrieved.content)
        : undefined;
    const ragCorpusId = rawRetrieved.ragCorpusId
      ? String(rawRetrieved.ragCorpusId)
      : rawRetrieved.rag_corpus_id
        ? String(rawRetrieved.rag_corpus_id)
        : undefined;
    const confidenceScore =
      typeof rawRetrieved.confidenceScore === "number"
        ? rawRetrieved.confidenceScore
        : typeof rawRetrieved.confidence_score === "number"
          ? rawRetrieved.confidence_score
          : typeof rawRetrieved.score === "number"
            ? rawRetrieved.score
            : undefined;
    retrievedContext = { uri, title, text, ragCorpusId, confidenceScore };
  } else {
    const rawUri = String(raw.uri || raw.url || raw.link || "");
    if (rawUri && rawUri.startsWith("gs://")) {
      const title = String(raw.title || rawUri.split("/").pop() || "Document");
      const text =
        raw.text || raw.snippet || raw.content
          ? String(raw.text || raw.snippet || raw.content)
          : undefined;
      const ragCorpusId = raw.ragCorpusId
        ? String(raw.ragCorpusId)
        : raw.rag_corpus_id
          ? String(raw.rag_corpus_id)
          : undefined;
      const confidenceScore =
        typeof raw.confidenceScore === "number"
          ? raw.confidenceScore
          : typeof raw.confidence_score === "number"
            ? raw.confidence_score
            : typeof raw.score === "number"
              ? raw.score
              : undefined;
      retrievedContext = { uri: rawUri, title, text, ragCorpusId, confidenceScore };
    }
  }

  if (!web && !retrievedContext) {
    return null;
  }

  return {
    ...(web ? { web } : {}),
    ...(retrievedContext ? { retrievedContext } : {}),
  };
}

/**
 * Normalizes raw grounding support items into typed GroundingSupport.
 */
function normalizeGroundingSupport(
  raw: Record<string, unknown>
): GroundingSupport | null {
  if (!raw || typeof raw !== "object") return null;

  const rawIndices =
    raw.groundingChunkIndices || raw.grounding_chunk_indices || raw.chunkIndices;
  const groundingChunkIndices: number[] = Array.isArray(rawIndices)
    ? rawIndices.map((i) => Number(i)).filter((i) => !isNaN(i))
    : [];

  const rawScores = raw.confidenceScores || raw.confidence_scores;
  const confidenceScores: number[] | undefined = Array.isArray(rawScores)
    ? rawScores.map((s) => Number(s)).filter((s) => !isNaN(s))
    : undefined;

  const rawSegment = (raw.segment || raw.textSegment || raw.text_segment) as
    Record<string, unknown> | undefined;
  let segment: GroundingSupport["segment"] | undefined;
  if (rawSegment) {
    segment = {
      startIndex: Number(rawSegment.startIndex || rawSegment.start_index || 0),
      endIndex: Number(rawSegment.endIndex || rawSegment.end_index || 0),
      text: String(rawSegment.text || ""),
    };
  }

  return {
    groundingChunkIndices,
    ...(confidenceScores ? { confidenceScores } : {}),
    ...(segment ? { segment } : {}),
  };
}

/**
 * Extracts and normalizes GroundingMetadata from any raw Vertex AI / Gemini API response object,
 * including native Grounding, ADK google_search tool results, and subagent search responses.
 */
export function extractGroundingMetadata(raw: unknown): GroundingMetadata | undefined {
  if (!raw || typeof raw !== "object") return undefined;

  const obj = raw as Record<string, unknown>;

  // Collect potential sub-objects that could contain grounding or search metadata
  const candidateObjects: Array<Record<string, unknown>> = [];

  const addCandidate = (val: unknown) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      candidateObjects.push(val as Record<string, unknown>);
    }
  };

  // 1. Direct and nested container properties
  addCandidate(obj.groundingMetadata);
  addCandidate(obj.grounding_metadata);
  addCandidate(
    (obj.candidates as Array<Record<string, unknown>>)?.[0]?.groundingMetadata
  );
  addCandidate(
    (obj.candidates as Array<Record<string, unknown>>)?.[0]?.grounding_metadata
  );

  const rawEvent = (obj.raw_event || obj.rawEvent) as Record<string, unknown> | undefined;
  if (rawEvent) {
    addCandidate(rawEvent.groundingMetadata);
    addCandidate(rawEvent.grounding_metadata);
    addCandidate(
      (rawEvent.candidates as Array<Record<string, unknown>>)?.[0]?.groundingMetadata
    );
    addCandidate(
      (rawEvent.candidates as Array<Record<string, unknown>>)?.[0]?.grounding_metadata
    );
  }

  const content = obj.content as Record<string, unknown> | undefined;
  if (content) {
    addCandidate(content.groundingMetadata);
    addCandidate(content.grounding_metadata);
  }

  const metadata = obj.metadata as Record<string, unknown> | undefined;
  if (metadata) {
    addCandidate(metadata.groundingMetadata);
    addCandidate(metadata.grounding_metadata);
    const custom = metadata.custom as Record<string, unknown> | undefined;
    if (custom) {
      addCandidate(custom.groundingMetadata);
      addCandidate(custom.grounding_metadata);
    }
  }

  // 2. Tool result inspections (e.g. google_search tool)
  const toolResult = (obj.tool_result || obj.toolResult) as
    Record<string, unknown> | undefined;
  if (toolResult) {
    addCandidate(toolResult.result);
    addCandidate(toolResult.response);
    addCandidate(toolResult);
  }

  const fnResp = (obj.function_response || obj.functionResponse) as
    Record<string, unknown> | undefined;
  if (fnResp) {
    addCandidate(fnResp.response);
    addCandidate(fnResp);
  }

  const toolResults = (obj.tool_results || obj.toolResults) as
    Array<Record<string, unknown>> | undefined;
  if (Array.isArray(toolResults)) {
    for (const tr of toolResults) {
      addCandidate(tr.result);
      addCandidate(tr.response);
      addCandidate(tr);
    }
  }

  // 3. Subagent inspections (e.g. google_search_agent)
  const agentCall = (obj.agent_call || obj.agentCall) as
    Record<string, unknown> | undefined;
  if (agentCall) {
    addCandidate(agentCall.input);
    addCandidate(agentCall.args);
    addCandidate(agentCall);
  }

  const agentResp = (obj.agent_response || obj.agentResponse) as
    Record<string, unknown> | undefined;
  if (agentResp) {
    addCandidate(agentResp.response);
    addCandidate(agentResp);
  }

  const subAgents = (obj.subAgents || obj.sub_agents) as
    Array<Record<string, unknown>> | undefined;
  if (Array.isArray(subAgents)) {
    for (const sa of subAgents) {
      addCandidate(sa.response);
      addCandidate(sa.input);
      addCandidate(sa);
    }
  }

  const toolCall = (obj.tool_call || obj.toolCall) as Record<string, unknown> | undefined;
  if (toolCall) {
    addCandidate(toolCall.args);
    addCandidate(toolCall.input);
    addCandidate(toolCall);
  }

  // Include root object itself as fallback
  addCandidate(obj);

  const webSearchQueries: string[] = [];
  const retrievalQueries: string[] = [];
  const groundingChunks: GroundingChunk[] = [];
  const groundingSupports: GroundingSupport[] = [];
  let searchEntryPoint: SearchEntryPoint | undefined;

  const seenChunkUris = new Set<string>();
  const addUniqueChunk = (chunk: GroundingChunk) => {
    const uri = chunk.web?.uri || chunk.retrievedContext?.uri || "";
    if (uri && !seenChunkUris.has(uri)) {
      seenChunkUris.add(uri);
      groundingChunks.push(chunk);
    } else if (!uri) {
      groundingChunks.push(chunk);
    }
  };

  for (const candidate of candidateObjects) {
    // Collect search queries
    const rawQueries =
      candidate.webSearchQueries ||
      candidate.web_search_queries ||
      candidate.searchQueries ||
      candidate.search_queries ||
      (typeof candidate.query === "string" && candidate.query.trim()
        ? [candidate.query]
        : undefined) ||
      (typeof candidate.search_query === "string" && candidate.search_query.trim()
        ? [candidate.search_query]
        : undefined);

    if (Array.isArray(rawQueries)) {
      for (const q of rawQueries) {
        if (typeof q === "string" && q.trim() && !webSearchQueries.includes(q.trim())) {
          webSearchQueries.push(q.trim());
        }
      }
    }

    // Collect retrieval queries
    const rawRetQueries = candidate.retrievalQueries || candidate.retrieval_queries;
    if (Array.isArray(rawRetQueries)) {
      for (const q of rawRetQueries) {
        if (typeof q === "string" && q.trim() && !retrievalQueries.includes(q.trim())) {
          retrievalQueries.push(q.trim());
        }
      }
    }

    // Collect grounding chunks / sources / search results
    const rawChunks =
      candidate.groundingChunks ||
      candidate.grounding_chunks ||
      candidate.chunks ||
      candidate.sources ||
      candidate.search_results ||
      candidate.searchResults ||
      candidate.results;

    if (Array.isArray(rawChunks)) {
      for (const chunk of rawChunks) {
        if (chunk && typeof chunk === "object") {
          const normalized = normalizeGroundingChunk(chunk as Record<string, unknown>);
          if (normalized) {
            addUniqueChunk(normalized);
          }
        }
      }
    }

    // Collect grounding supports
    const rawSupports = candidate.groundingSupports || candidate.grounding_supports;
    if (Array.isArray(rawSupports)) {
      for (const support of rawSupports) {
        const normalized = normalizeGroundingSupport(support as Record<string, unknown>);
        if (normalized) {
          groundingSupports.push(normalized);
        }
      }
    }

    // Collect search entry point
    const rawEntryPoint = (candidate.searchEntryPoint || candidate.search_entry_point) as
      Record<string, unknown> | undefined;
    if (rawEntryPoint && !searchEntryPoint) {
      const renderedContent =
        typeof rawEntryPoint.renderedContent === "string"
          ? rawEntryPoint.renderedContent
          : typeof rawEntryPoint.rendered_content === "string"
            ? rawEntryPoint.rendered_content
            : undefined;
      const sdkBlob =
        typeof rawEntryPoint.sdkBlob === "string"
          ? rawEntryPoint.sdkBlob
          : typeof rawEntryPoint.sdk_blob === "string"
            ? rawEntryPoint.sdk_blob
            : undefined;
      if (renderedContent || sdkBlob) {
        searchEntryPoint = { renderedContent, sdkBlob };
      }
    }
  }

  const hasData =
    webSearchQueries.length > 0 ||
    retrievalQueries.length > 0 ||
    groundingChunks.length > 0 ||
    groundingSupports.length > 0 ||
    Boolean(searchEntryPoint?.renderedContent);

  if (!hasData) {
    return undefined;
  }

  return {
    ...(webSearchQueries.length > 0 ? { webSearchQueries } : {}),
    ...(retrievalQueries.length > 0 ? { retrievalQueries } : {}),
    ...(groundingChunks.length > 0 ? { groundingChunks } : {}),
    ...(groundingSupports.length > 0 ? { groundingSupports } : {}),
    ...(searchEntryPoint ? { searchEntryPoint } : {}),
  };
}

/**
 * Checks whether metadata contains active grounding information.
 */
export function isGrounded(metadata?: GroundingMetadata | null): boolean {
  if (!metadata) return false;
  return (
    Boolean(metadata.groundingChunks && metadata.groundingChunks.length > 0) ||
    Boolean(metadata.webSearchQueries && metadata.webSearchQueries.length > 0) ||
    Boolean(metadata.retrievalQueries && metadata.retrievalQueries.length > 0) ||
    Boolean(metadata.searchEntryPoint?.renderedContent)
  );
}

/**
 * Transforms standalone numeric citation brackets like [1], [2], [1, 2]
 * into citation markdown links [1](#cite-1) without modifying standard markdown links [text](url),
 * images ![alt](url), or array literals inside fenced code blocks and inline code spans.
 */
export function transformCitationsToMarkdownLinks(text: string): string {
  if (!text) return "";

  // Split by fenced code blocks (```...```) and inline code spans (`...`)
  const parts = text.split(/(```[\s\S]*?```|`[^`\n]+`)/g);

  return parts
    .map((part) => {
      // If code fence or inline code, leave untouched
      if (part.startsWith("`")) {
        return part;
      }

      // Transform citations only in prose
      return part.replace(/(?<![!\[])\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g, (_match, nums) => {
        const cleanNums = nums.replace(/\s+/g, "");
        return `[${nums}](#cite-${cleanNums})`;
      });
    })
    .join("");
}
