import type { LoadedSkillMetadata, SkillSearchMatch } from "@/types/agent";

/**
 * Checks if a tool name corresponds to loading a skill.
 */
export function isLoadSkillTool(toolName?: string): boolean {
  if (!toolName) return false;
  const normalized = toolName.toLowerCase().replace(/[-_]/g, "");
  return (
    normalized === "loadskill" ||
    normalized === "adkloadskill" ||
    normalized === "skillloader" ||
    normalized === "loadskills"
  );
}

/**
 * Checks if a tool name corresponds to searching the skill registry.
 */
export function isSearchSkillsTool(toolName?: string): boolean {
  if (!toolName) return false;
  const normalized = toolName.toLowerCase().replace(/[-_]/g, "");
  return (
    normalized === "searchskills" ||
    normalized === "adksearchskills" ||
    normalized === "skillssearch" ||
    normalized === "searchskill" ||
    normalized === "findskills" ||
    normalized === "queryskills"
  );
}

function safeParseObject(input: unknown): Record<string, unknown> | null {
  if (!input) return null;
  if (typeof input === "object" && input !== null) {
    if (Array.isArray(input)) return null;
    return input as Record<string, unknown>;
  }
  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Normalizes tool arguments and response into a structured `LoadedSkillMetadata` object.
 * Supports snake_case and camelCase keys, stringified JSON, and partial payloads.
 */
export function parseLoadedSkillPayload(
  args?: unknown,
  result?: unknown
): LoadedSkillMetadata | null {
  const parsedArgs = safeParseObject(args) || {};
  let parsedResult = safeParseObject(result) || {};

  // If result wraps the skill in a nested object (e.g. { skill: { ... } } or { data: { ... } })
  if (parsedResult.skill && typeof parsedResult.skill === "object") {
    parsedResult = {
      ...parsedResult,
      ...(parsedResult.skill as Record<string, unknown>),
    };
  } else if (parsedResult.result && typeof parsedResult.result === "object") {
    parsedResult = {
      ...parsedResult,
      ...(parsedResult.result as Record<string, unknown>),
    };
  }

  const skillNameRaw =
    parsedResult.skill_name ||
    parsedResult.skillName ||
    parsedResult.name ||
    parsedArgs.skill_name ||
    parsedArgs.skillName ||
    parsedArgs.name;

  const errorRaw = parsedResult.error || parsedResult.message;
  const error = typeof errorRaw === "string" ? errorRaw.trim() : undefined;

  const errorCodeRaw = parsedResult.error_code || parsedResult.errorCode;
  const errorCode = typeof errorCodeRaw === "string" ? errorCodeRaw.trim() : undefined;

  let skillName = typeof skillNameRaw === "string" ? skillNameRaw.trim() : "";

  if (!skillName && error) {
    const match = error.match(/skill\s+['"]([^'"]+)['"]/i);
    if (match && match[1]) {
      skillName = match[1].trim();
    }
  }

  if (
    !skillName &&
    !error &&
    Object.keys(parsedArgs).length === 0 &&
    Object.keys(parsedResult).length === 0
  ) {
    return null;
  }

  const versionRaw =
    parsedResult.version ||
    parsedResult.revision ||
    parsedResult.revision_id ||
    parsedResult.revisionId ||
    parsedArgs.version ||
    parsedArgs.revision;
  const version =
    typeof versionRaw === "string"
      ? versionRaw.trim()
      : typeof versionRaw === "number"
        ? String(versionRaw)
        : undefined;

  const descriptionRaw =
    parsedResult.description ||
    parsedResult.summary ||
    parsedArgs.description ||
    parsedArgs.summary;
  const description =
    typeof descriptionRaw === "string" ? descriptionRaw.trim() : undefined;

  const authorRaw =
    parsedResult.author ||
    parsedResult.publisher ||
    parsedResult.creator ||
    parsedArgs.author;
  const author = typeof authorRaw === "string" ? authorRaw.trim() : undefined;

  const licenseRaw = parsedResult.license || parsedArgs.license;
  const license = typeof licenseRaw === "string" ? licenseRaw.trim() : undefined;

  // Normalize tools list
  const rawTools =
    parsedResult.tools ||
    parsedResult.unlocked_tools ||
    parsedResult.unlockedTools ||
    parsedResult.tool_names ||
    parsedResult.toolNames ||
    parsedResult.functions ||
    parsedArgs.tools ||
    parsedArgs.unlocked_tools;

  let tools: string[] | undefined;
  if (Array.isArray(rawTools)) {
    tools = rawTools
      .map((t) =>
        typeof t === "string"
          ? t.trim()
          : typeof t === "object" && t && "name" in t
            ? String((t as { name: unknown }).name)
            : ""
      )
      .filter(Boolean);
  } else if (typeof rawTools === "string" && rawTools.trim()) {
    tools = rawTools
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  const instructionsRaw =
    parsedResult.instructions_snippet ||
    parsedResult.instructionsSnippet ||
    parsedResult.instructions ||
    parsedResult.prompt ||
    parsedArgs.instructions_snippet ||
    parsedArgs.instructionsSnippet ||
    parsedArgs.instructions;
  const instructionsSnippet =
    typeof instructionsRaw === "string" ? instructionsRaw.trim() : undefined;

  return {
    skillName: skillName || "skill",
    ...(version ? { version } : {}),
    ...(description ? { description } : {}),
    ...(author ? { author } : {}),
    ...(license ? { license } : {}),
    ...(tools && tools.length > 0 ? { tools } : {}),
    ...(instructionsSnippet ? { instructionsSnippet } : {}),
    ...(error ? { error } : {}),
    ...(errorCode ? { errorCode } : {}),
  };
}

/**
 * Parses search query and match results from `search_skills` tool events.
 */
export function parseSearchSkillsPayload(
  args?: unknown,
  result?: unknown
): { query: string; matches: SkillSearchMatch[] } | null {
  const parsedArgs = safeParseObject(args) || {};
  let parsedResult = safeParseObject(result);

  let rawList: unknown[] = [];
  if (Array.isArray(result)) {
    rawList = result;
  } else if (typeof result === "string") {
    try {
      const parsed = JSON.parse(result);
      if (Array.isArray(parsed)) {
        rawList = parsed;
      } else if (typeof parsed === "object" && parsed !== null) {
        parsedResult = parsed as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
  }

  if (parsedResult) {
    const candidateList =
      parsedResult.matches ||
      parsedResult.skills ||
      parsedResult.results ||
      parsedResult.items;
    if (Array.isArray(candidateList)) {
      rawList = candidateList;
    }
  }

  const queryRaw =
    parsedArgs.query ||
    parsedArgs.search_query ||
    parsedArgs.searchQuery ||
    parsedArgs.q ||
    (parsedResult ? parsedResult.query || parsedResult.search_query : "");

  const query = typeof queryRaw === "string" ? queryRaw.trim() : "";

  const matches: SkillSearchMatch[] = [];
  for (const item of rawList) {
    if (typeof item === "object" && item !== null) {
      const rec = item as Record<string, unknown>;
      const name = rec.skill_name || rec.skillName || rec.name || "";
      const desc = rec.description || rec.summary || "";
      const ver = rec.version || rec.revision || "";
      if (name) {
        matches.push({
          skillName: String(name).trim(),
          description: String(desc).trim(),
          ...(ver ? { version: String(ver).trim() } : {}),
        });
      }
    }
  }

  if (!query && matches.length === 0) {
    return null;
  }

  return {
    query,
    matches,
  };
}
