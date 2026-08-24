/**
 * Skill Ingestion & Metadata Inspector Types.
 *
 * Models dynamic discovery and loading of skills from the Google Cloud Skill Registry
 * (adk.dev/integrations/skills-registry/) via ADK `search_skills` and `load_skill` tools.
 */

export interface LoadedSkillMetadata {
  skillName: string;
  version?: string;
  description?: string;
  author?: string;
  license?: string;
  tools?: string[];
  instructionsSnippet?: string;
}

export interface SkillSearchMatch {
  skillName: string;
  description: string;
  version?: string;
}

export interface SkillStreamEventPayload {
  type: "search" | "load";
  query?: string;
  skill?: LoadedSkillMetadata;
  matches?: SkillSearchMatch[];
}
