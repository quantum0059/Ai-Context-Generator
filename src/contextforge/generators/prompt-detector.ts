import { z } from "zod";
import { claudeJson, isClaudeConfigured } from "../../lib/claude";
import type { ProjectSpec } from "../../types/projectspec";
import { buildConstraintBlock } from "./shared";
import { detectPlatformParadigm } from "./platform";
import { MODELS } from "../../lib/ai-models";

export const aspectSchema = z.object({
  aspect: z.string(),
  title: z.string(),
  description: z.string(),
});

export type Aspect = z.infer<typeof aspectSchema>;

export async function getFeatureAspects(spec: ProjectSpec, feature: string, sharedContext: string = ''): Promise<Aspect[]> {
  if (isClaudeConfigured()) {
    try {
      const systemPrompt = `${buildConstraintBlock(spec)}You are a senior engineer. Given a feature and a technology stack, determine the implementation aspects that need separate build prompts. An aspect is a distinct implementation concern that an AI works on independently.

Return a JSON object only, no other text:
{
  "aspects": [{
    "aspect": "database-schema",
    "title": "Build the database schema",
    "description": "Create tables, RLS policies, types"
  }]
}

Common aspects to consider (only include what applies):
- database-schema (if there is a database in the stack)
- api-routes (if there is a backend)
- ui-components (if there is a frontend)
- state-management (if there is a state library)
- authentication-integration (if auth is involved)
- error-handling
- testing
${sharedContext}`;

      const userPrompt = `Feature: ${feature}
Stack: ${JSON.stringify(spec.stack)}
Platform: ${spec.platform}

What aspects does this feature need? Return only aspects that are relevant to this specific stack.`;

      const result = await claudeJson(
        systemPrompt,
        userPrompt,
        z.object({ aspects: z.array(aspectSchema) }),
        1,
        MODELS.CONTENT,
      );
      return filterAspectsAgainstConstraints(ensureRequiredAspects(feature, result.aspects), spec);
    } catch {
      // fall through to heuristics
    }
  }
  return filterAspectsAgainstConstraints(ensureRequiredAspects(feature, heuristicFeatureAspects(spec, feature)), spec);
}

export function ensureRequiredAspects(feature: string, aspects: Aspect[]): Aspect[] {
  if (!/\b(ast|parser|concept detection)\b/i.test(feature)) return aspects;
  if (aspects.some((aspect) => aspect.aspect === "concept-detection")) return aspects;
  return [
    ...aspects,
    {
      aspect: "concept-detection",
      title: `Build concept detection for ${feature}`,
      description: "Detect programming concepts from normalized AST nodes and query matches",
    },
  ];
}

/**
 * Post-processes the aspect list returned by the AI to remove any aspects that
 * are architecturally invalid given the project constraints. This is the key
 * gate that prevents api-routes and authentication-integration prompts from
 * ever being generated for offline, no-backend projects.
 */
export function filterAspectsAgainstConstraints(aspects: Aspect[], spec: ProjectSpec): Aspect[] {
  const paradigm = detectPlatformParadigm(spec);

  const filtered = aspects.filter((aspect) => {
    const key = aspect.aspect.toLowerCase();

    // Remove auth aspects for offline single-user apps
    if (paradigm.isOffline && key.includes('authentication')) {
      console.log(
        `[AspectFilter] Removed ${aspect.aspect} — auth not valid for offline app`
      );
      return false;
    }

    // Remove UI aspects for projects that render no GUI (CLI, backend-only).
    // This is the key gate that stops a node-cli tool from receiving React
    // component build prompts it can never use.
    if (!paradigm.hasUI && /ui|component|frontend|client|screen/.test(key)) {
      console.log(
        `[AspectFilter] Removed ${aspect.aspect} — platform "${spec.platform}" has no UI`
      );
      return false;
    }

    // Remove API route aspects when there is no HTTP server (CLI, offline, or
    // no HTTP framework in the stack).
    if (/api-routes|api|endpoint|route|server/.test(key) && !paradigm.hasHttpServer) {
      console.log(
        `[AspectFilter] Removed ${aspect.aspect} — no HTTP server for platform "${spec.platform}"`
      );
      return false;
    }

    return true;
  });

  // Never return an empty aspect list — if platform filtering stripped
  // everything, fall back to a platform-appropriate core aspect so the
  // feature still gets an actionable build prompt.
  if (filtered.length === 0) {
    return heuristicFeatureAspects(spec, aspects[0]?.title ?? 'core');
  }
  return filtered;
}

export function heuristicFeatureAspects(spec: ProjectSpec, feature: string): Aspect[] {
  const paradigm = detectPlatformParadigm(spec);

  // CLI tools: commands + the core service/logic layer. No UI, no HTTP.
  if (paradigm.isCli) {
    return [
      { aspect: "cli-commands", title: `Build CLI commands for ${feature}`, description: "Command definitions, argument parsing, and output formatting" },
      { aspect: "core-logic", title: `Build core logic for ${feature}`, description: "The service/domain layer that the commands call into" },
    ];
  }

  // Backend / API-only services: HTTP routes + service layer, no UI.
  if (paradigm.isBackendOnly && paradigm.hasHttpServer) {
    return [
      { aspect: "api-routes", title: `Build API routes for ${feature}`, description: "Endpoints and business logic" },
      { aspect: "core-logic", title: `Build core logic for ${feature}`, description: "Service layer and domain types" },
    ];
  }

  // Backend-only with no HTTP surface (e.g. a worker/daemon): logic only.
  if (paradigm.isBackendOnly || (!paradigm.hasUI && !paradigm.hasHttpServer)) {
    return [
      { aspect: "core-logic", title: `Build core logic for ${feature}`, description: "Service/domain layer and data flow" },
    ];
  }

  // UI platforms with a backend (typical web/mobile app): UI + API.
  if (paradigm.hasHttpServer) {
    return [
      { aspect: "ui-components", title: `Build UI components for ${feature}`, description: "User interface and state" },
      { aspect: "api-routes", title: `Build API routes for ${feature}`, description: "Endpoints and integration" },
    ];
  }

  // UI platform with no HTTP server (e.g. offline desktop/mobile app): UI + local logic.
  return [
    { aspect: "ui-components", title: `Build UI components for ${feature}`, description: "User interface and state" },
    { aspect: "core-logic", title: `Build core logic for ${feature}`, description: "Local data/service layer (no network)" },
  ];
}
