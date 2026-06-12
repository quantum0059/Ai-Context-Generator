import { z } from "zod";
import { claudeJson, isClaudeConfigured } from "../../lib/claude";
import type { PackageFiles, ProjectSpec } from "../../types/projectspec";
import { relevantCategoriesForFeature, slugify } from "./shared";

const aspectsSchema = z.object({
  aspects: z.array(z.string().min(1)).min(1).max(4),
});

async function aspectsForFeature(spec: ProjectSpec, feature: string): Promise<string[]> {
  if (isClaudeConfigured()) {
    try {
      const r = await claudeJson(
        `For the feature \"${feature}\" of a ${spec.platform} project (\"${spec.description}\"), list 1-4 implementation aspects (short kebab-case nouns like \"ui\", \"backend\", \"api\", \"integration\").\nReturn JSON: {"aspects":["ui","backend"]}`,
        aspectsSchema,
      );
      return r.aspects.map((a) => slugify(a));
    } catch {
      // fall through
    }
  }
  return spec.platform === "backend-only" || spec.platform === "cli"
    ? ["backend"]
    : ["ui", "backend"];
}

function promptContent(spec: ProjectSpec, feature: string, aspect: string): string {
  const relevant = relevantCategoriesForFeature(spec, feature);
  const stackContext = relevant
    .map((category) => `- **${category}:** ${spec.stack[category]?.value}`)
    .join("\n");

  return `# ${spec.projectName}: Build ${feature} (${aspect})

## Project Context
- **Project:** ${spec.projectName}
- **Platform:** ${spec.platform}
- **Description:** ${spec.description}

## Stack Context (LOCKED - projectSpecVersion ${spec.projectSpecVersion})
Only these stack entries are relevant to this prompt:
${stackContext || "- _No locked stack entries map to this feature; follow agents.md._"}

## Requirements
Implement the **${aspect}** aspect of the \"${feature}\" feature for ${spec.projectName}.
Derive detailed behaviour from the project description above and the feature name.

## Architecture Rules (subset of agents.md relevant here)
- Use ONLY the locked stack entries listed above for this work.
- All external SDK calls go through the service layer.
- Do not introduce new technologies; create an ADR first if one seems necessary.
${spec.constraints.avoid?.length ? `- Never use: ${spec.constraints.avoid.join(", ")}.` : ""}

## Acceptance Criteria
- [ ] ${feature} (${aspect}) works end to end on ${spec.platform}.
- [ ] No technology outside the locked stack was introduced.
- [ ] Loading, error and empty states are handled (where UI applies).

## Testing Instructions
- Unit-test all business logic for this aspect.
- Cover the happy path and at least one failure path per public function.
`;
}

/** Dynamic prompt generation per feature and Claude-determined aspect (Section 8). */
export async function generatePrompts(spec: ProjectSpec): Promise<PackageFiles> {
  const files: PackageFiles = {};
  for (const feature of spec.features) {
    const featureSlug = slugify(feature);
    const aspects = await aspectsForFeature(spec, feature);
    for (const aspect of aspects) {
      files[`prompts/${featureSlug}/build-${featureSlug}-${aspect}.md`] = promptContent(
        spec,
        feature,
        aspect,
      );
    }
  }
  return files;
}
