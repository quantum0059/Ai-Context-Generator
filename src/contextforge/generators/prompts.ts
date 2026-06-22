import { z } from "zod";
import { claudeJson, claudeText, isClaudeConfigured } from "../../lib/claude";
import type { PackageFiles, ProjectSpec } from "../../types/projectspec";
import { lockedEntries, relevantCategoriesForFeature, slugify } from "./shared";

const aspectSchema = z.object({
  aspect: z.string(),
  title: z.string(),
  description: z.string(),
});

type Aspect = z.infer<typeof aspectSchema>;

async function getFeatureAspects(spec: ProjectSpec, feature: string): Promise<Aspect[]> {
  if (isClaudeConfigured()) {
    try {
      const systemPrompt = `You are a senior engineer. Given a feature and a technology stack, determine the implementation aspects that need separate build prompts. An aspect is a distinct implementation concern that an AI works on independently.

Return a JSON array only, no other text:
[
  {
    "aspect": "database-schema",
    "title": "Build the database schema",
    "description": "Create tables, RLS policies, types"
  }
]

Common aspects to consider (only include what applies):
- database-schema (if there is a database in the stack)
- api-routes (if there is a backend)
- ui-components (if there is a frontend)
- state-management (if there is a state library)
- authentication-integration (if auth is involved)
- error-handling
- testing`;

      const userPrompt = `Feature: ${feature}
Stack: ${JSON.stringify(spec.stack)}
Platform: ${spec.platform}

What aspects does this feature need? Return only aspects that are relevant to this specific stack.`;

      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
      return await claudeJson(fullPrompt, z.array(aspectSchema));
    } catch {
      // fall through to heuristics
    }
  }
  return heuristicFeatureAspects(spec, feature);
}

function heuristicFeatureAspects(spec: ProjectSpec, feature: string): Aspect[] {
  const isBackendOnly = spec.platform === "backend-only" || spec.platform === "cli";
  if (isBackendOnly) {
    return [
      { aspect: "api-routes", title: `Build API routes for ${feature}`, description: "Endpoints and business logic" }
    ];
  }
  return [
    { aspect: "ui-components", title: `Build UI components for ${feature}`, description: "User interface and state" },
    { aspect: "api-routes", title: `Build API routes for ${feature}`, description: "Endpoints and integration" }
  ];
}

async function generateAspectPrompt(spec: ProjectSpec, feature: string, aspect: Aspect): Promise<string> {
  if (isClaudeConfigured()) {
    try {
      const systemPrompt = `You are a senior engineer writing implementation instructions for an AI coding assistant. The AI will read ONLY this file before implementing this aspect. Be so specific that the AI produces correct code on the first attempt.

Rules:
- Include exact file paths to create or modify
- Include the complete TypeScript interface/type definitions the AI must use
- Include the exact function signatures to implement
- Include real example code for the most complex part
- Include explicit acceptance criteria as a checklist
- Include the exact test cases that prove it works
- Include what NOT to do for this specific stack
- Never say 'implement X' without showing what X looks like for this project's stack`;

      const stackString = Object.entries(spec.stack)
        .map(([cat, tool]) => `${cat}: ${tool?.value}`)
        .join('\n');

      const otherFeatures = spec.features.filter(f => f !== feature).join(', ');

      const userPrompt = `Project: ${spec.projectName}
Platform: ${spec.platform}
Feature: ${feature}
Aspect: ${aspect.aspect} — ${aspect.description}

Tech stack in use:
${stackString}

Other features already built (assume these exist):
${otherFeatures}

Generate the complete implementation prompt for this aspect. Structure it exactly as:

# Build: ${aspect.title}

## Context
Which files to load before starting this aspect (from the context package).

## What You Are Building
One paragraph describing exactly what this aspect produces and how it fits into the larger feature.

## Files to Create
For each file:
**Path:** exact/path/to/file.ts
**Purpose:** one sentence
**Exports:** what this file exports
**Complete signature:**
\`\`\`typescript
[full TypeScript interface/function signature]
\`\`\`

## Files to Modify
For each existing file to change:
**Path:** exact/path/to/file.ts
**Change:** exactly what to add/modify and where

## Implementation Notes
The 3-5 most important things the AI must know about implementing this aspect correctly for ${spec.stack.database?.value || 'this stack'}.
Include one real code snippet showing the correct pattern.

## What NOT To Do
3-5 specific anti-patterns for this exact stack with brief explanation of why each is wrong.

## Acceptance Criteria
- [ ] (specific, testable checklist items)

## Test Cases
Exact test cases to verify this aspect works:
\`\`\`typescript
[real test code]
\`\`\``;

      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
      return await claudeText(fullPrompt);
    } catch {
      // fallback
    }
  }

  return buildPromptContentFallback(spec, feature, aspect);
}

function buildPromptContentFallback(
  spec: ProjectSpec,
  feature: string,
  aspect: Aspect,
): string {
  const relevant = relevantCategoriesForFeature(spec, feature);
  const stackLines = relevant
    .map((category) => {
      const entry = spec.stack[category];
      return `- **${category}:** ${entry?.value}`;
    })
    .join("\n");

  const fullStackSummary = lockedEntries(spec)
    .map(([cat, e]) => `| ${cat} | ${e.value} | ${e.source} |`)
    .join("\n");

  const avoidSection = spec.constraints.avoid?.length
    ? `\n### Explicitly Excluded\nDo NOT use: ${spec.constraints.avoid.join(", ")}. These were excluded by the developer.\n`
    : "";

  return `# Build: ${aspect.title}

> **Copy-paste this entire prompt into your AI assistant.** It contains everything
> the assistant needs to build this feature correctly with the right architecture.

---

## Your Role

You are a senior ${spec.platform} engineer building the **${feature}** feature
(${aspect.aspect} layer) for **${spec.projectName}**.

## Context

Load these files for additional context:
- \`agents.md\` — Project constitution and architecture rules
- \`tech-stack.md\` — Complete technology reference with setup details
- \`decisions/\` — ADRs explaining why each technology was chosen
- \`templates/\` — Code templates for components, services, hooks, etc.

## What You Are Building

Implement the **${aspect.aspect}** layer of **${feature}** for ${spec.projectName}.
${aspect.description}

### Relevant Stack for This Feature

${stackLines || "_No locked stack entries map directly to this feature — follow agents.md._"}

### Full Project Stack

| Category | Technology | Source |
|---|---|---|
${fullStackSummary || "| _No stack entries_ | | |"}

---

## Files to Create

**Path:** src/example/${slugify(feature)}.ts
**Purpose:** Example file for the feature
**Exports:** Default export
**Complete signature:**
\`\`\`typescript
export default function ${slugify(feature)}(): void;
\`\`\`

## Files to Modify

**Path:** src/index.ts
**Change:** Add export for ${slugify(feature)}

## Implementation Notes

1. **Use ONLY the locked technologies** listed above. Do not introduce alternatives.
2. **Service layer pattern** — All external SDK calls go through dedicated service modules.
3. **Domain types** — Services return ${spec.projectName} domain types.
4. **Error boundaries** — Every async operation handles loading, success, and error states.
5. **No ad-hoc changes** — Create an ADR in \`decisions/\` if you believe a change is necessary.
${avoidSection}

## What NOT To Do

- Do not ignore the existing architecture.
- Do not introduce new dependencies.

## Acceptance Criteria

- [ ] ${feature} works end-to-end on ${spec.platform}
- [ ] No technology outside the locked stack was introduced
- [ ] Loading, error, and empty states are handled gracefully
- [ ] All business logic is unit-tested

## Test Cases

\`\`\`typescript
import { expect, test } from "vitest";

test("${feature} aspect works", () => {
  expect(true).toBe(true);
});
\`\`\`
`;
}

/** Dynamic prompt generation per feature with rich, self-contained context (Section 8). */
export async function generatePrompts(spec: ProjectSpec): Promise<PackageFiles> {
  const files: PackageFiles = {};

  for (const feature of spec.features) {
    const featureSlug = slugify(feature);
    const aspects = await getFeatureAspects(spec, feature);

    const aspectPromises = aspects.map(async (aspect) => {
      const generatedContent = await generateAspectPrompt(spec, feature, aspect);
      files[`prompts/${featureSlug}/${aspect.aspect}.md`] = generatedContent;
    });

    await Promise.all(aspectPromises);
  }

  return files;
}

