import { z } from "zod";
import { claudeJson, isClaudeConfigured } from "../lib/claude";
import type { ProjectConstraints } from "../types/projectspec";
import { MODELS } from "../lib/ai-models";

const constraintsSchema = z.object({
  mustBeOffline: z.boolean(),
  mustUseLocalStorage: z.boolean(),
  forbiddenCategories: z.array(z.string()),
  forbiddenTools: z.array(z.string()),
  requiredToolTypes: z.array(z.string()),
  rawConstraints: z.array(z.string()),
});

function heuristicConstraints(description: string): ProjectConstraints {
  const text = description.toLowerCase();
  const mustBeOffline = /\b(fully offline|offline|no internet|without internet|local[- ]only|runs locally|air[- ]gapped)\b/.test(text);
  const mustUseLocalStorage = /\b(sqlite|local database|embedded database|single[- ]file database|local storage|file[- ]based storage)\b/.test(text);
  const noExternalAi = /\b(no|without)\b.{0,40}\b(external ai|ai api|external api)\b/.test(text);
  const forbiddenTools: string[] = [];
  if (mustBeOffline) forbiddenTools.push("Supabase", "Firebase", "Vercel");
  if (noExternalAi) forbiddenTools.push("OpenAI", "Anthropic Claude", "Google Gemini", "Groq");

  const requiredToolTypes: string[] = [];
  if (/\b(ast|abstract syntax tree|parse source code)\b/.test(text)) requiredToolTypes.push("AST parsing library");
  if (/\bsqlite\b/.test(text)) requiredToolTypes.push("local SQLite database");
  if (/\b(run|runs|execute|executes|execution)\b.{0,30}\b(code|solution|solutions|java|python|javascript)\b/.test(text)) requiredToolTypes.push("local code execution");
  if (/\b(cli|command[- ]line|terminal)\b/.test(text)) requiredToolTypes.push("CLI framework");

  return {
    mustBeOffline,
    mustUseLocalStorage,
    forbiddenCategories: noExternalAi ? ["aiProvider"] : [],
    forbiddenTools,
    requiredToolTypes,
    rawConstraints: [
      ...(mustBeOffline ? ["Everything must run locally without internet access"] : []),
      ...(mustUseLocalStorage ? ["Storage must use a local embedded database"] : []),
      ...(noExternalAi ? ["External AI APIs are not allowed"] : []),
    ],
  };
}

export async function extractProjectConstraints(
  description: string,
  platform: string
): Promise<ProjectConstraints> {
  const fallback = heuristicConstraints(description);

  // Explicit offline/local constraints are unambiguous and should not wait on
  // an external provider merely to rediscover them.
  if (fallback.mustBeOffline || fallback.mustUseLocalStorage) return fallback;

  if (!isClaudeConfigured()) {
    return fallback;
  }

  let attempts = 0;
  while (attempts < 2) {
    try {
      const systemPrompt = `You are a technical architect extracting hard constraints from a project description. A hard constraint is a requirement that immediately disqualifies entire categories of tools.

Examples of hard constraints:
- 'fully offline' → disqualifies any tool requiring network access (Supabase, Firebase, external APIs)
- 'no external APIs' → disqualifies cloud AI providers, hosted databases, third-party services
- 'CLI tool' → disqualifies frontend frameworks, UI libraries, browser-specific APIs
- 'runs in the browser' → disqualifies Node.js native modules, filesystem access
- 'must be free' → disqualifies paid-only services
- 'Python only' → disqualifies JavaScript libraries
- 'no database' → disqualifies all database tools
- 'embedded system' → disqualifies runtime-heavy frameworks
- 'open source only' → disqualifies proprietary tools

Return valid JSON only, no markdown, no explanation.`;

      const userPrompt = `Extract all hard technical constraints from this project description.

Description: ${description}
Platform: ${platform}

Return exactly this structure:
{
  "mustBeOffline": (true if description mentions offline, no internet, local-only, air-gapped, no network, or similar),
  "mustUseLocalStorage": (true if description requires local database, embedded storage, file-based storage, or no cloud storage),
  "forbiddenCategories": (array of technology category keys that are disqualified by the constraints — use the same category key names as the discovery step uses, e.g. 'database', 'aiProvider', 'hosting', 'styling'),
  "forbiddenTools": (array of specific tool names that are explicitly disqualified — e.g. 'Supabase', 'Firebase', 'OpenAI', 'Vercel'),
  "requiredToolTypes": (array of tool TYPE descriptions that MUST be in the stack — e.g. 'local SQLite database', 'AST parsing library', 'CLI framework', 'offline ML model'),
  "rawConstraints": (array of direct quotes or close paraphrases from the description that are the source of each constraint)
}

If no hard constraints exist, return the structure with empty arrays and false booleans.`;

      const result = await claudeJson(`${systemPrompt}\n\n${userPrompt}`, constraintsSchema, 1, MODELS.FAST);
      return result;
    } catch (err) {
      console.error("[ConstraintExtractor Error]", err);
      attempts++;
    }
  }

  return fallback;
}
