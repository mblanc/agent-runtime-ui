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
  rendered_content?: string;
  sdkBlob?: string;
  sdk_blob?: string;
}

export interface GroundingMetadata {
  webSearchQueries?: string[];
  groundingChunks?: GroundingChunk[];
  groundingSupports?: GroundingSupport[];
  searchEntryPoint?: SearchEntryPoint;
  retrievalQueries?: string[];
}
