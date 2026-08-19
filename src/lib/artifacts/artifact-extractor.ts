import type {
  AgentSessionEvent,
  ArtifactMimeType,
  ArtifactStreamPayload,
} from "@/types/agent";
import { parseCodeExecutionOutput } from "@/lib/code-execution/output-parser";
import { parseCsv } from "@/lib/artifacts/csv-parser";

export function inferMimeType(
  filename: string,
  fallback: ArtifactMimeType = "text/plain"
): ArtifactMimeType {
  const ext = filename.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "html":
    case "htm":
      return "text/html";
    case "csv":
      return "text/csv";
    case "tsv":
      return "text/tab-separated-values";
    case "svg":
      return "image/svg+xml";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "md":
    case "markdown":
      return "text/markdown";
    case "json":
      return "application/json";
    case "py":
      return "text/x-python";
    case "js":
    case "jsx":
      return "text/javascript";
    case "ts":
    case "tsx":
      return "text/typescript";
    case "css":
      return "text/css";
    case "yaml":
    case "yml":
      return "text/yaml";
    default:
      return fallback;
  }
}

export function deriveArtifactTitle(
  filename?: string,
  fallback = "Generated Artifact"
): string {
  if (!filename) return fallback;
  const clean = filename
    .replace(/^output_/, "Plot ")
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]/g, " ")
    .trim();
  if (!clean) return fallback;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

const FILENAME_KEYS = [
  "filename",
  "file_name",
  "ImageName",
  "image_name",
  "imageName",
  "name",
  "path",
  "identifier",
  "id",
  "title",
] as const;

const CONTENT_KEYS = [
  "content",
  "image",
  "imageBytes",
  "image_bytes",
  "bytesBase64Encoded",
  "b64_json",
  "data",
  "code",
  "html",
  "svg",
  "csv",
  "url",
  "uri",
  "imageUrl",
  "image_url",
  "gcsUri",
  "gcs_uri",
  "output",
  "result",
  "text",
] as const;

function getFirstString(
  record: Record<string, unknown>,
  keys: readonly string[]
): string | undefined {
  for (const key of keys) {
    const val = record[key];
    if (typeof val === "string" && val.length > 0) return val;
  }
  return undefined;
}

export function extractArtifactFromObject(obj: unknown): ArtifactStreamPayload | null {
  if (!obj || typeof obj !== "object") return null;
  const record = obj as Record<string, unknown>;

  // Check nested artifact property first
  if (
    record.artifact &&
    typeof record.artifact === "object" &&
    record.artifact !== null
  ) {
    const nested = extractArtifactFromObject(record.artifact);
    if (nested) return nested;
  }

  // Check nested response or result object if present
  if (
    record.response &&
    typeof record.response === "object" &&
    record.response !== null
  ) {
    const nested = extractArtifactFromObject(record.response);
    if (nested) return nested;
  }

  let rawFilename = getFirstString(record, FILENAME_KEYS);
  let rawContent = getFirstString(record, CONTENT_KEYS);

  // Check inlineData object: { inlineData: { mimeType: "...", data: "..." } }
  const inline = (record.inline_data || record.inlineData) as
    Record<string, unknown> | undefined;
  if (!rawContent && inline && typeof inline.data === "string") {
    rawContent = inline.data;
  }

  // Check images array: { images: ["..."] }
  if (
    !rawContent &&
    Array.isArray(record.images) &&
    typeof record.images[0] === "string"
  ) {
    rawContent = record.images[0];
  }
  if (
    !rawContent &&
    Array.isArray(record.generated_images) &&
    typeof record.generated_images[0] === "string"
  ) {
    rawContent = record.generated_images[0];
  }

  const isImageData =
    (typeof rawContent === "string" &&
      (rawContent.startsWith("data:image/") ||
        rawContent.startsWith("iVBORw0KGgo") ||
        rawContent.startsWith("/9j/4") ||
        (rawContent.startsWith("gs://") &&
          /\.(png|jpe?g|webp|svg|gif)$/i.test(rawContent)))) ||
    Boolean(
      record.image ||
      record.imageBytes ||
      record.image_bytes ||
      record.bytesBase64Encoded ||
      record.b64_json ||
      record.ImageName ||
      record.image_name ||
      (typeof rawFilename === "string" &&
        /\.(png|jpe?g|webp|svg|gif)$/i.test(rawFilename))
    );

  if (!rawFilename && isImageData) {
    rawFilename = "generated_image.png";
  }

  if (!rawFilename || rawContent === undefined) return null;

  let filename = rawFilename;
  if (!filename.includes(".")) {
    if (
      isImageData ||
      record.mimeType === "image/png" ||
      record.mime_type === "image/png"
    ) {
      filename = `${rawFilename}.png`;
    } else {
      filename = `${rawFilename}.txt`;
    }
  }

  const mimeType =
    (record.mimeType as ArtifactMimeType) ||
    (record.mime_type as ArtifactMimeType) ||
    (record.type as ArtifactMimeType) ||
    (isImageData ? "image/png" : undefined) ||
    inferMimeType(filename);

  let content = rawContent;
  if (
    mimeType.startsWith("image/") &&
    mimeType !== "image/svg+xml" &&
    !content.startsWith("data:") &&
    !content.startsWith("http://") &&
    !content.startsWith("https://") &&
    !content.startsWith("/") &&
    !content.startsWith("gs://")
  ) {
    content = `data:${mimeType};base64,${content}`;
  } else if (
    mimeType === "image/svg+xml" &&
    content.startsWith("data:image/svg+xml;base64,<svg")
  ) {
    content = content.replace(/^data:image\/svg\+xml;base64,/, "");
  }

  const title =
    (record.title as string) ||
    (record.description as string) ||
    (record.Prompt as string) ||
    (record.prompt as string) ||
    filename;

  const version =
    typeof record.version === "number"
      ? record.version
      : typeof record.version_number === "number"
        ? record.version_number
        : 0;

  const gcsUri = (record.gcsUri ||
    record.gcs_uri ||
    record.canonical_uri ||
    record.canonicalUri ||
    record.uri ||
    (typeof rawContent === "string" && rawContent.startsWith("gs://")
      ? rawContent
      : undefined)) as string | undefined;

  return {
    filename,
    title,
    mimeType,
    version,
    content,
    isComplete: record.isComplete !== false && record.is_complete !== false,
    ...(gcsUri ? { gcsUri } : {}),
  };
}

export function extractArtifactFromTool(
  _name: string,
  data: Record<string, unknown>
): ArtifactStreamPayload | null {
  if (!data || typeof data !== "object") return null;

  // 1. Direct artifact payload inside tool response or args
  if (data.artifact && typeof data.artifact === "object") {
    const art = extractArtifactFromObject(data.artifact);
    if (art) return art;
  }
  if (Array.isArray(data.artifacts)) {
    for (const item of data.artifacts) {
      const art = extractArtifactFromObject(item);
      if (art) return art;
    }
  }
  if (data.response && typeof data.response === "object") {
    const art = extractArtifactFromObject(data.response);
    if (art) return art;
  }
  if (data.result && typeof data.result === "object") {
    const art = extractArtifactFromObject(data.result);
    if (art) return art;
  }

  // 2. Purely structural extraction: if this object contains file identifiers,
  // file content, code, diagrams, image data, or a remote URI, extract it as an artifact.
  return extractArtifactFromObject(data);
}

/**
 * Extracts artifact code blocks or XML tags from markdown text.
 * E.g.:
 * - ```html filename="dashboard.html" ... ```
 * - ```html:dashboard.html ... ```
 * - <!-- filename: dashboard.html --> ```html ... ```
 * - <artifact filename="dashboard.html" title="Dashboard">...</artifact>
 * - <antArtifact identifier="dashboard.html" ...>...</antArtifact>
 * - Standalone full HTML documents or SVG tags
 */
export function extractArtifactsFromContent(content: string): ArtifactStreamPayload[] {
  if (!content || typeof content !== "string") return [];

  const artifacts: ArtifactStreamPayload[] = [];
  const seenFilenames = new Set<string>();

  // 1. XML Artifact Tags: <artifact ...>...</artifact> or <antArtifact ...>...</antArtifact>
  const xmlTagRe =
    /<(?:artifact|antArtifact)\s+([^>]+)>([\s\S]*?)<\/(?:artifact|antArtifact)>/gi;
  let xmlMatch: RegExpExecArray | null;
  while ((xmlMatch = xmlTagRe.exec(content)) !== null) {
    const attrStr = xmlMatch[1];
    const body = xmlMatch[2];

    const filenameMatch =
      attrStr.match(/(?:filename|identifier|name)="([^"]+)"/i) ||
      attrStr.match(/(?:filename|identifier|name)='([^']+)'/i);
    const titleMatch =
      attrStr.match(/(?:title|description)="([^"]+)"/i) ||
      attrStr.match(/(?:title|description)='([^']+)'/i);
    const typeMatch =
      attrStr.match(/(?:type|mimeType|mime_type)="([^"]+)"/i) ||
      attrStr.match(/(?:type|mimeType|mime_type)='([^']+)'/i);

    const filename = filenameMatch?.[1] || "artifact.txt";
    if (!seenFilenames.has(filename)) {
      seenFilenames.add(filename);
      artifacts.push({
        filename,
        title: titleMatch?.[1] || filename,
        mimeType: (typeMatch?.[1] as ArtifactMimeType) || inferMimeType(filename),
        version: 0,
        content: body.trim(),
        isComplete: true,
      });
    }
  }

  // 2. Fenced code blocks with filename metadata
  // e.g. ```html filename="index.html" or ```html:index.html or ```typescript filename="app.ts"
  const fencedRe =
    /```([a-zA-Z0-9_-]+)(?:[:\s]+(?:filename=["']?([^"'\s]+)["']?|([a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+)))?([\s\S]*?)```/g;
  let fenceMatch: RegExpExecArray | null;
  while ((fenceMatch = fencedRe.exec(content)) !== null) {
    const lang = fenceMatch[1];
    const explicitFile = fenceMatch[2] || fenceMatch[3];
    const code = fenceMatch[4];

    if (explicitFile) {
      const filename = explicitFile;
      if (!seenFilenames.has(filename)) {
        seenFilenames.add(filename);
        artifacts.push({
          filename,
          title: filename,
          mimeType: inferMimeType(filename, `text/${lang}` as ArtifactMimeType),
          version: 0,
          content: code.trim(),
          isComplete: true,
        });
      }
    } else {
      // Check for leading comment inside code block specifying filename:
      // e.g. <!-- filename: dashboard.html --> or // filename: app.ts or # filename: script.py
      const commentFileMatch = code.match(
        /(?:<!--|\/\/|#|\/\*)\s*(?:filename|file):\s*([a-zA-Z0-9_.-]+\.[a-zA-Z0-9]+)/i
      );
      if (commentFileMatch) {
        const filename = commentFileMatch[1];
        if (!seenFilenames.has(filename)) {
          seenFilenames.add(filename);
          artifacts.push({
            filename,
            title: filename,
            mimeType: inferMimeType(filename),
            version: 0,
            content: code.trim(),
            isComplete: true,
          });
        }
      } else if (
        (lang.toLowerCase() === "html" || lang.toLowerCase() === "htm") &&
        code.includes("<") &&
        code.includes(">")
      ) {
        const fileMentionMatch = content.match(
          /(?:\*\*|`)([a-zA-Z0-9_.-]+\.(?:html|htm))(?:\*\*|`)/i
        );
        const filename = fileMentionMatch?.[1] || "index.html";
        const titleMatch =
          code.match(/<title>([^<]+)<\/title>/i) || code.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        const title =
          titleMatch?.[1]?.trim() ||
          deriveArtifactTitle(filename, "Interactive Web Workspace");

        if (!seenFilenames.has(filename)) {
          seenFilenames.add(filename);
          artifacts.push({
            filename,
            title,
            mimeType: "text/html",
            version: 0,
            content: code.trim(),
            isComplete: true,
          });
        }
      } else if (
        (lang.toLowerCase() === "svg" || lang.toLowerCase() === "xml") &&
        code.includes("<svg") &&
        code.includes("</svg>")
      ) {
        const fileMentionMatch = content.match(
          /(?:\*\*|`)([a-zA-Z0-9_.-]+\.svg)(?:\*\*|`)/i
        );
        const filename = fileMentionMatch?.[1] || "diagram.svg";
        const titleMatch = code.match(/<title>([^<]+)<\/title>/i);
        const title =
          titleMatch?.[1]?.trim() || deriveArtifactTitle(filename, "Vector Graphic");
        if (!seenFilenames.has(filename)) {
          seenFilenames.add(filename);
          artifacts.push({
            filename,
            title,
            mimeType: "image/svg+xml",
            version: 0,
            content: code.trim(),
            isComplete: true,
          });
        }
      } else if (
        lang.toLowerCase() === "csv" ||
        lang.toLowerCase() === "tsv" ||
        lang.toLowerCase() === "tab-separated-values"
      ) {
        const isTsv =
          lang.toLowerCase().includes("tsv") || lang.toLowerCase().includes("tab");
        const fileMentionMatch = content.match(
          new RegExp(
            `(?:\\*\\*|\`)([a-zA-Z0-9_.-]+\\.(?:${isTsv ? "tsv" : "csv"}))(?:\\*\\*|\`)`,
            "i"
          )
        );
        const filename = fileMentionMatch?.[1] || (isTsv ? "data.tsv" : "data.csv");
        const headingMatch = content.match(
          /###?\s*([a-zA-Z0-9_\s.-]+?)(?:\s*CSV|\s*Table|\s*Data)?\n/i
        );
        const title =
          headingMatch?.[1]?.trim() ||
          deriveArtifactTitle(
            filename,
            isTsv ? "Tabular Dataset (TSV)" : "Tabular Dataset (CSV)"
          );

        if (!seenFilenames.has(filename)) {
          seenFilenames.add(filename);
          artifacts.push({
            filename,
            title,
            mimeType: isTsv ? "text/tab-separated-values" : "text/csv",
            version: 0,
            content: code.trim(),
            isComplete: true,
          });
        }
      } else {
        // Other fenced programming languages (e.g. python, json, sql, bash, etc.)
        const extMap: Record<string, string> = {
          python: "py",
          py: "py",
          javascript: "js",
          js: "js",
          typescript: "ts",
          ts: "ts",
          json: "json",
          yaml: "yaml",
          yml: "yaml",
          sql: "sql",
          sh: "sh",
          bash: "sh",
          markdown: "md",
          md: "md",
          css: "css",
        };
        const ext = extMap[lang.toLowerCase()];
        if (ext && code.trim().length > 40 && code.includes("\n")) {
          const fileMentionMatch = content.match(
            new RegExp(`(?:\\*\\*|\`)([a-zA-Z0-9_.-]+\\.${ext})(?:\\*\\*|\`)`, "i")
          );
          if (fileMentionMatch) {
            const filename = fileMentionMatch[1];
            if (!seenFilenames.has(filename)) {
              seenFilenames.add(filename);
              artifacts.push({
                filename,
                title: deriveArtifactTitle(filename, `${lang.toUpperCase()} Script`),
                mimeType: inferMimeType(filename),
                version: 0,
                content: code.trim(),
                isComplete: true,
              });
            }
          }
        }
      }
    }
  }

  // 3. Standalone complete HTML document
  if (
    !artifacts.some((a) => a.mimeType === "text/html") &&
    (content.includes("<!DOCTYPE html>") ||
      (content.includes("<html") && content.includes("</html>")))
  ) {
    const htmlMatch = content.match(
      /<!DOCTYPE html>[\s\S]*?<\/html>|<html[\s\S]*?<\/html>/i
    );
    if (htmlMatch) {
      const htmlCode = htmlMatch[0];
      const titleMatch = htmlCode.match(/<title>([^<]+)<\/title>/i);
      const title = titleMatch?.[1] || "Interactive Web Workspace";
      const filename = "index.html";
      if (!seenFilenames.has(filename)) {
        seenFilenames.add(filename);
        artifacts.push({
          filename,
          title,
          mimeType: "text/html",
          version: 0,
          content: htmlCode.trim(),
          isComplete: true,
        });
      }
    }
  }

  // 4. Standalone SVG graphic / diagram
  if (
    !artifacts.some((a) => a.mimeType === "image/svg+xml") &&
    content.includes("<svg") &&
    content.includes("</svg>")
  ) {
    const svgMatch = content.match(/<svg[\s\S]*?<\/svg>/i);
    if (svgMatch) {
      const svgCode = svgMatch[0];
      const svgTitleMatch = svgCode.match(/<title>([^<]+)<\/title>/i);
      const fileMentionMatch =
        content.match(/(?:\*\*|`)([a-zA-Z0-9_.-]+\.svg)(?:\*\*|`)/i) ||
        content.match(/###?\s*([a-zA-Z0-9_\s.-]+?)\s*SVG/i);

      let filename = "graphic.svg";
      let title = "Vector Graphic";

      if (fileMentionMatch) {
        const rawName = fileMentionMatch[1].trim();
        if (rawName.toLowerCase().endsWith(".svg")) {
          filename = rawName;
          title = deriveArtifactTitle(filename, "Vector Graphic");
        } else {
          filename = `${rawName.toLowerCase().replace(/\s+/g, "_")}.svg`;
          title = `${rawName} SVG`;
        }
      } else if (svgTitleMatch) {
        title = svgTitleMatch[1].trim();
        filename = `${title.toLowerCase().replace(/\s+/g, "_")}.svg`;
      }

      if (!seenFilenames.has(filename)) {
        seenFilenames.add(filename);
        artifacts.push({
          filename,
          title,
          mimeType: "image/svg+xml",
          version: 0,
          content: svgCode.trim(),
          isComplete: true,
        });
      }
    }
  }

  // 5. Standalone CSV / TSV tabular dataset
  if (
    !artifacts.some(
      (a) => a.mimeType === "text/csv" || a.mimeType === "text/tab-separated-values"
    )
  ) {
    const lines = content
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const csvLines: string[] = [];
    for (const line of lines) {
      if (
        !line.startsWith("#") &&
        !line.startsWith("```") &&
        !line.startsWith("<!") &&
        !line.startsWith("<") &&
        (line.includes(",") || line.includes("\t") || line.includes(";"))
      ) {
        csvLines.push(line);
      } else if (csvLines.length >= 3) {
        break;
      } else {
        csvLines.length = 0;
      }
    }

    if (csvLines.length >= 3) {
      const rawCsv = csvLines.join("\n");
      const parsed = parseCsv(rawCsv);
      const isConsistentTable =
        parsed.headers.length >= 2 &&
        parsed.rows.length >= 2 &&
        parsed.rows.every((r) => r.length === parsed.headers.length) &&
        parsed.headers.every((h) => h.length > 0 && h.length < 60) &&
        parsed.rows.every((r) => r.every((c) => c.length < 150));

      if (isConsistentTable) {
        const isTsv =
          rawCsv.includes("\t") &&
          (rawCsv.match(/\t/g) || []).length > (rawCsv.match(/,/g) || []).length;
        const fileMentionMatch = content.match(
          /(?:\*\*|`)([a-zA-Z0-9_.-]+\.(?:csv|tsv))(?:\*\*|`)/i
        );
        const filename = fileMentionMatch?.[1] || (isTsv ? "data.tsv" : "data.csv");
        const headingMatch = content.match(
          /###?\s*([a-zA-Z0-9_\s.-]+?)(?:\s*CSV|\s*Table|\s*Data)?\n/i
        );
        const title =
          headingMatch?.[1]?.trim() ||
          deriveArtifactTitle(
            filename,
            isTsv ? "Tabular Dataset (TSV)" : "Tabular Dataset (CSV)"
          );

        if (!seenFilenames.has(filename)) {
          seenFilenames.add(filename);
          artifacts.push({
            filename,
            title,
            mimeType: isTsv ? "text/tab-separated-values" : "text/csv",
            version: 0,
            content: rawCsv.trim(),
            isComplete: true,
          });
        }
      }
    }
  }

  return artifacts;
}

/**
 * Extract all artifacts from a session event across all known shapes and properties.
 */
export function extractArtifactsFromSessionEvent(
  evt: AgentSessionEvent | Record<string, unknown>
): ArtifactStreamPayload[] {
  const artifacts: ArtifactStreamPayload[] = [];
  const seen = new Set<string>();

  const add = (art: ArtifactStreamPayload | null) => {
    if (!art || !art.filename) return;
    const key = `${art.filename}:${art.version}`;
    if (!seen.has(key)) {
      seen.add(key);
      artifacts.push(art);
    }
  };

  const raw = evt as Record<string, unknown>;

  // 1. Direct event artifact / artifacts
  if (raw.artifact) add(extractArtifactFromObject(raw.artifact));
  if (Array.isArray(raw.artifacts)) {
    for (const item of raw.artifacts) {
      add(extractArtifactFromObject(item));
    }
  }

  // 2. Metadata artifact / artifacts
  const meta = raw.metadata as Record<string, unknown> | undefined;
  if (meta) {
    if (meta.artifact) add(extractArtifactFromObject(meta.artifact));
    if (Array.isArray(meta.artifacts)) {
      for (const item of meta.artifacts) {
        add(extractArtifactFromObject(item));
      }
    }
  }

  // 3. Actions artifacts
  const actions = (raw.actions || meta?.actions) as Record<string, unknown> | undefined;
  if (actions) {
    if (actions.artifact) add(extractArtifactFromObject(actions.artifact));
    if (Array.isArray(actions.artifacts)) {
      for (const item of actions.artifacts) {
        add(extractArtifactFromObject(item));
      }
    }
  }

  // 4. Raw event nesting
  const rawEvent = (raw.rawEvent || raw.raw_event) as Record<string, unknown> | undefined;
  if (rawEvent) {
    if (rawEvent.artifact) add(extractArtifactFromObject(rawEvent.artifact));
    if (Array.isArray(rawEvent.artifacts)) {
      for (const item of rawEvent.artifacts) {
        add(extractArtifactFromObject(item));
      }
    }
    const rawActions = rawEvent.actions as Record<string, unknown> | undefined;
    if (rawActions) {
      if (rawActions.artifact) add(extractArtifactFromObject(rawActions.artifact));
      if (Array.isArray(rawActions.artifacts)) {
        for (const item of rawActions.artifacts) {
          add(extractArtifactFromObject(item));
        }
      }
    }
  }

  // 5. Tool calls and results
  const toolCalls = (raw.tool_calls ||
    raw.toolCalls ||
    (raw.tool_call ? [raw.tool_call] : [])) as Array<{
    name: string;
    args: Record<string, unknown>;
  }>;
  if (Array.isArray(toolCalls)) {
    for (const tc of toolCalls) {
      if (tc && tc.name && tc.args) {
        add(extractArtifactFromTool(tc.name, tc.args));
      }
    }
  }

  const toolResults = (raw.tool_results ||
    raw.toolResults ||
    (raw.tool_result ? [raw.tool_result] : [])) as Array<{
    name: string;
    result: Record<string, unknown>;
  }>;
  if (Array.isArray(toolResults)) {
    for (const tr of toolResults) {
      if (tr && tr.name && tr.result) {
        add(extractArtifactFromTool(tr.name, tr.result));
      }
    }
  }

  // 6. Content markdown, thoughts, and parts inspection
  const inspectPartsArray = (partsList: unknown[]) => {
    for (const part of partsList) {
      if (part && typeof part === "object") {
        const p = part as Record<string, unknown>;

        const fnCall = (p.function_call || p.functionCall) as
          { name?: string; args?: Record<string, unknown> } | undefined;
        if (fnCall && fnCall.name && fnCall.args) {
          add(extractArtifactFromTool(fnCall.name, fnCall.args));
        }

        const fnResp = (p.function_response || p.functionResponse) as
          | {
              name?: string;
              response?: Record<string, unknown>;
              result?: Record<string, unknown>;
            }
          | undefined;
        if (fnResp && fnResp.name) {
          const respData =
            fnResp.response ||
            fnResp.result ||
            (fnResp as unknown as Record<string, unknown>);
          add(extractArtifactFromTool(fnResp.name, respData));
        }

        const codeRes = (p.code_execution_result || p.codeExecutionResult) as
          Record<string, unknown> | undefined;
        if (codeRes) {
          const parsed = parseCodeExecutionOutput(String(codeRes.output || ""));
          const images = Array.from(
            new Set([...((codeRes.generatedImages as string[]) || []), ...parsed.images])
          );
          if (parsed.savedArtifacts.length > 0) {
            for (let sIdx = 0; sIdx < parsed.savedArtifacts.length; sIdx++) {
              const savedFile = parsed.savedArtifacts[sIdx];
              const mime = inferMimeType(savedFile);
              const imgData = images[sIdx] || images[0] || "";
              add({
                filename: savedFile,
                title: deriveArtifactTitle(savedFile, "Generated Artifact"),
                mimeType: mime,
                version: 0,
                content: mime.startsWith("image/") ? formatImageContent(imgData) : "",
                gcsUri: imgData.startsWith("gs://") ? imgData : undefined,
                isComplete: true,
              });
            }
          } else {
            for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
              const imgData = images[imgIdx];
              if (imgData) {
                const filename = `graph_${imgIdx + 1}.png`;
                add({
                  filename,
                  title: deriveArtifactTitle(filename, "Generated Plot"),
                  mimeType: "image/png",
                  version: 0,
                  content: formatImageContent(imgData),
                  gcsUri: imgData.startsWith("gs://") ? imgData : undefined,
                  isComplete: true,
                });
              }
            }
          }
        }

        const inlineData = (p.inline_data || p.inlineData) as
          Record<string, unknown> | undefined;
        if (inlineData && inlineData.data) {
          const mimeType = String(
            inlineData.mime_type || inlineData.mimeType || "image/png"
          ) as ArtifactMimeType;
          const base64Data = String(inlineData.data);
          const content = base64Data.startsWith("data:")
            ? base64Data
            : `data:${mimeType};base64,${base64Data}`;
          add({
            filename: "generated_plot.png",
            title: "Generated Plot",
            mimeType,
            version: 0,
            content,
            isComplete: true,
          });
        }

        if (typeof p.text === "string" && p.text) {
          const fromPartText = extractArtifactsFromContent(p.text);
          for (const art of fromPartText) add(art);
        }
      }
    }
  };

  const formatImageContent = (imgData: string) => {
    if (
      !imgData ||
      imgData.startsWith("data:") ||
      imgData.startsWith("gs://") ||
      imgData.startsWith("http://") ||
      imgData.startsWith("https://") ||
      imgData.startsWith("/")
    ) {
      return imgData;
    }
    return `data:image/png;base64,${imgData}`;
  };

  const contentStr = typeof raw.content === "string" ? raw.content : "";
  if (contentStr) {
    const fromContent = extractArtifactsFromContent(contentStr);
    for (const art of fromContent) add(art);
  } else if (raw.content && typeof raw.content === "object") {
    const contentObj = raw.content as Record<string, unknown>;
    if (Array.isArray(contentObj.parts)) {
      inspectPartsArray(contentObj.parts);
    }
  }

  const thoughtStr = typeof raw.thought === "string" ? raw.thought : "";
  if (thoughtStr) {
    const fromThought = extractArtifactsFromContent(thoughtStr);
    for (const art of fromThought) add(art);
  }

  if (rawEvent && typeof rawEvent === "object") {
    if (rawEvent.content && typeof rawEvent.content === "object") {
      const reContent = rawEvent.content as Record<string, unknown>;
      if (Array.isArray(reContent.parts)) {
        inspectPartsArray(reContent.parts);
      }
    }
    if (Array.isArray(rawEvent.parts)) {
      inspectPartsArray(rawEvent.parts);
    }
  }

  // 7. Code execution blocks and results
  const codeBlocks = (raw.codeExecutionBlocks ||
    raw.code_execution_blocks ||
    rawEvent?.codeExecutionBlocks ||
    rawEvent?.code_execution_blocks) as
    | Array<{
        id?: string;
        language?: string;
        code?: string;
        result?: { outcome?: string; output?: string; generatedImages?: string[] };
      }>
    | undefined;

  if (Array.isArray(codeBlocks)) {
    for (let bIdx = 0; bIdx < codeBlocks.length; bIdx++) {
      const block = codeBlocks[bIdx];
      if (block?.result) {
        const images = block.result.generatedImages || [];
        const parsed = block.result.output
          ? parseCodeExecutionOutput(block.result.output)
          : { images: [], savedArtifacts: [] };
        const allImgs = Array.from(new Set([...images, ...parsed.images]));

        if (parsed.savedArtifacts.length > 0) {
          for (let sIdx = 0; sIdx < parsed.savedArtifacts.length; sIdx++) {
            const savedFile = parsed.savedArtifacts[sIdx];
            const mime = inferMimeType(savedFile);
            const imgData = allImgs[sIdx] || allImgs[0] || "";
            add({
              filename: savedFile,
              title: deriveArtifactTitle(savedFile, "Generated Artifact"),
              mimeType: mime,
              version: 0,
              content: mime.startsWith("image/") ? formatImageContent(imgData) : "",
              gcsUri: imgData.startsWith("gs://") ? imgData : undefined,
              isComplete: true,
            });
          }
        } else {
          for (let imgIdx = 0; imgIdx < allImgs.length; imgIdx++) {
            const imgData = allImgs[imgIdx];
            if (imgData) {
              const filename = `graph_${imgIdx + 1}.png`;
              add({
                filename,
                title: deriveArtifactTitle(filename, "Generated Plot"),
                mimeType: "image/png",
                version: 0,
                content: formatImageContent(imgData),
                gcsUri: imgData.startsWith("gs://") ? imgData : undefined,
                isComplete: true,
              });
            }
          }
        }
      }
    }
  }

  const directCodeRes = (raw.code_execution_result ||
    raw.codeExecutionResult ||
    rawEvent?.code_execution_result ||
    rawEvent?.codeExecutionResult) as
    | {
        outcome?: string;
        output?: string;
        generatedImages?: string[];
      }
    | undefined;
  if (directCodeRes) {
    const parsed = parseCodeExecutionOutput(directCodeRes.output || "");
    const images = Array.from(
      new Set([...(directCodeRes.generatedImages || []), ...parsed.images])
    );
    if (parsed.savedArtifacts.length > 0) {
      for (let sIdx = 0; sIdx < parsed.savedArtifacts.length; sIdx++) {
        const savedFile = parsed.savedArtifacts[sIdx];
        const mime = inferMimeType(savedFile);
        const imgData = images[sIdx] || images[0] || "";
        add({
          filename: savedFile,
          title: deriveArtifactTitle(savedFile, "Generated Artifact"),
          mimeType: mime,
          version: 0,
          content: mime.startsWith("image/") ? formatImageContent(imgData) : "",
          gcsUri: imgData.startsWith("gs://") ? imgData : undefined,
          isComplete: true,
        });
      }
    } else {
      for (let imgIdx = 0; imgIdx < images.length; imgIdx++) {
        const imgData = images[imgIdx];
        if (imgData) {
          const filename = `graph_${imgIdx + 1}.png`;
          add({
            filename,
            title: deriveArtifactTitle(filename, "Generated Plot"),
            mimeType: "image/png",
            version: 0,
            content: formatImageContent(imgData),
            gcsUri: imgData.startsWith("gs://") ? imgData : undefined,
            isComplete: true,
          });
        }
      }
    }
  }

  return artifacts;
}
