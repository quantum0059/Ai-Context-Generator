import { z } from "zod";
import { claudeJson, isClaudeConfigured } from "../../lib/claude";
import type { PackageFiles, ProjectSpec } from "../../types/projectspec";
import { lockedEntries, relevantCategoriesForFeature, slugify } from "./shared";

const featureDetailsSchema = z.object({
  deliverables: z
    .array(z.string().min(1))
    .min(2)
    .max(8)
    .describe("Specific things to build for this feature"),
  fileStructure: z
    .array(z.string().min(1))
    .min(2)
    .max(12)
    .describe("Suggested file paths like src/components/Auth/LoginForm.tsx"),
  acceptanceCriteria: z
    .array(z.string().min(1))
    .min(3)
    .max(8)
    .describe("Testable acceptance criteria"),
  aspects: z
    .array(z.string().min(1))
    .min(1)
    .max(4)
    .describe("Implementation aspects like ui, backend, api"),
});

type FeatureDetails = z.infer<typeof featureDetailsSchema>;

async function getFeatureDetails(
  spec: ProjectSpec,
  feature: string,
): Promise<FeatureDetails> {
  if (isClaudeConfigured()) {
    try {
      const stackSummary = lockedEntries(spec)
        .map(([cat, e]) => `${cat}: ${e.value}`)
        .join(", ");

      const r = await claudeJson(
        `You are planning the implementation of the "${feature}" feature for a ${spec.platform} project called "${spec.projectName}".
Project description: "${spec.description}"
Tech stack: ${stackSummary}

Generate detailed implementation guidance:
1. "deliverables" — 3-6 specific things to build (e.g., "Sign-up page with email and social login", "Protected route wrapper component")
2. "fileStructure" — 4-10 suggested file paths where code should go (e.g., "src/app/(auth)/sign-in/page.tsx", "src/services/auth.ts")
3. "acceptanceCriteria" — 3-6 testable acceptance criteria (e.g., "Users can sign up with email or social login")
4. "aspects" — 1-3 implementation aspects in kebab-case (e.g., "ui", "backend", "api")

Return JSON matching: {"deliverables":["..."],"fileStructure":["..."],"acceptanceCriteria":["..."],"aspects":["..."]}`,
        featureDetailsSchema,
      );
      return r;
    } catch {
      // fall through to heuristics
    }
  }
  return heuristicFeatureDetails(spec, feature);
}

function heuristicFeatureDetails(spec: ProjectSpec, feature: string): FeatureDetails {
  const featureSlug = slugify(feature);
  const isBackendOnly = spec.platform === "backend-only" || spec.platform === "cli";
  const aspects = isBackendOnly ? ["backend"] : ["ui", "backend"];

  // Build reasonable deliverables from feature name
  const deliverables = isBackendOnly
    ? [
        `${feature} API endpoints with input validation`,
        `${feature} service module with business logic`,
        `${feature} error handling and edge cases`,
      ]
    : [
        `${feature} user interface with loading, error, and empty states`,
        `${feature} service module encapsulating all external SDK calls`,
        `${feature} data flow connecting UI to services`,
        `Navigation integration for ${feature}`,
      ];

  // Build reasonable file structure
  const fileStructure = isBackendOnly
    ? [
        `src/routes/${featureSlug}.ts`,
        `src/services/${featureSlug}.ts`,
        `src/types/${featureSlug}.ts`,
        `tests/${featureSlug}.test.ts`,
      ]
    : [
        `src/app/${featureSlug}/page.tsx`,
        `src/components/${featureSlug}/index.tsx`,
        `src/services/${featureSlug}.ts`,
        `src/types/${featureSlug}.ts`,
        `tests/${featureSlug}.test.ts`,
      ];

  const acceptanceCriteria = [
    `${feature} works end-to-end on ${spec.platform}`,
    `No technology outside the locked stack was introduced`,
    `Loading, error, and empty states are handled gracefully`,
    `All business logic is unit-tested`,
  ];

  return { deliverables, fileStructure, acceptanceCriteria, aspects };
}

function buildPromptContent(
  spec: ProjectSpec,
  feature: string,
  aspect: string,
  details: FeatureDetails,
): string {
  const relevant = relevantCategoriesForFeature(spec, feature);
  const stackLines = relevant
    .map((category) => {
      const entry = spec.stack[category];
      return `- **${category}:** ${entry?.value}`;
    })
    .join("\n");

  // Full stack summary for context
  const fullStackSummary = lockedEntries(spec)
    .map(([cat, e]) => `| ${cat} | ${e.value} | ${e.source} |`)
    .join("\n");

  const deliverablesSection = details.deliverables
    .map((d) => `- ${d}`)
    .join("\n");

  const fileStructureSection = details.fileStructure
    .map((f) => `    ${f}`)
    .join("\n");

  const acceptanceCriteriaSection = details.acceptanceCriteria
    .map((c) => `- [ ] ${c}`)
    .join("\n");

  const avoidSection = spec.constraints.avoid?.length
    ? `\n### Explicitly Excluded\nDo NOT use: ${spec.constraints.avoid.join(", ")}. These were excluded by the developer.\n`
    : "";

  return `# Build: ${feature} (${aspect}) — ${spec.projectName}

> **Copy-paste this entire prompt into your AI assistant.** It contains everything
> the assistant needs to build this feature correctly with the right architecture.

---

## Your Role

You are a senior ${spec.platform} engineer building the **${feature}** feature
(${aspect} layer) for **${spec.projectName}**.

## Project Context

| | |
|---|---|
| **Project** | ${spec.projectName} |
| **Platform** | ${spec.platform} |
| **Description** | ${spec.description} |

### Relevant Stack for This Feature

${stackLines || "_No locked stack entries map directly to this feature — follow agents.md._"}

### Full Project Stack

| Category | Technology | Source |
|---|---|---|
${fullStackSummary || "| _No stack entries_ | | |"}

---

## What You're Building

Implement the **${aspect}** layer of **${feature}** for ${spec.projectName}.

### Deliverables

${deliverablesSection}

### Suggested File Structure

\`\`\`
${fileStructureSection}
\`\`\`

---

## Architecture Rules (NON-NEGOTIABLE)

1. **Use ONLY the locked technologies** listed above. Do not introduce alternatives.
2. **Service layer pattern** — All external SDK calls go through dedicated service modules. Components, routes, and hooks never import SDKs directly.
3. **Domain types** — Services return ${spec.projectName} domain types, never raw SDK responses.
4. **Error boundaries** — Every async operation handles loading, success, and error states.
5. **No ad-hoc changes** — Do not swap a locked technology for a "better" one. Create an ADR in \`decisions/\` if you believe a change is necessary.
${avoidSection}
## Acceptance Criteria

${acceptanceCriteriaSection}

## Testing Requirements

- **Unit tests** for all business logic in service modules
- **Happy path + failure path** for every public function
- **Mock at the service boundary** only — don't mock internal implementation details
- Follow the test template in \`templates/test-template.md\`

---

## Reference Files

Load these files for additional context:
- \`agents.md\` — Project constitution and architecture rules
- \`tech-stack.md\` — Complete technology reference with setup details
- \`decisions/\` — ADRs explaining why each technology was chosen
- \`templates/\` — Code templates for components, services, hooks, etc.
`;
}

/** Dynamic prompt generation per feature with rich, self-contained context (Section 8). */
export async function generatePrompts(spec: ProjectSpec): Promise<PackageFiles> {
  const files: PackageFiles = {};

  for (const feature of spec.features) {
    const featureSlug = slugify(feature);
    const details = await getFeatureDetails(spec, feature);

    for (const aspect of details.aspects.map((a) => slugify(a))) {
      files[`prompts/${featureSlug}/build-${featureSlug}-${aspect}.md`] = buildPromptContent(
        spec,
        feature,
        aspect,
        details,
      );
    }
  }

  return files;
}
