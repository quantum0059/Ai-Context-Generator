import { z } from "zod";
import { claudeJson, claudeText, isClaudeConfigured } from "../../lib/claude";
import type { PackageFiles, ProjectSpec } from "../../types/projectspec";
import { slugify } from "./shared";
import { MODELS } from "../../lib/ai-models";

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
- testing`;

      const userPrompt = `Feature: ${feature}
Stack: ${JSON.stringify(spec.stack)}
Platform: ${spec.platform}

What aspects does this feature need? Return only aspects that are relevant to this specific stack.`;

      const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
      const result = await claudeJson(
        fullPrompt,
        z.object({ aspects: z.array(aspectSchema) }),
        1,
        MODELS.CONTENT,
      );
      return ensureRequiredAspects(feature, result.aspects);
    } catch {
      // fall through to heuristics
    }
  }
  return ensureRequiredAspects(feature, heuristicFeatureAspects(spec, feature));
}

function ensureRequiredAspects(feature: string, aspects: Aspect[]): Aspect[] {
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

export function isPromptContentValid(content: string, featureName: string, aspect: string): boolean {
  const checks = [
    content.includes(featureName),
    content.includes("src/"),
    content.includes("Acceptance Criteria") || content.includes("- [ ]"),
    !content.includes("expect(true).toBe(true)"),
    !content.includes("export default function feature"),
    content.includes("interface "),
    content.includes(aspect) || content.toLowerCase().includes(aspect.replaceAll("-", " ").toLowerCase()),
    content.length > 500,
  ];
  return checks.every(Boolean);
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
For each file include an exact path beginning with src/, its purpose, exports, and complete TypeScript interfaces and function signatures.

## Files to Modify
For each existing file include an exact path beginning with src/ and the exact change.

## Implementation Notes
Include one real TypeScript code snippet showing the correct pattern.

## What NOT To Do
List specific anti-patterns for this exact stack.

## Acceptance Criteria
Include at least 3 specific, testable checkbox items using - [ ].

## Test Cases
Include real test code without placeholder assertions.`;

    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    try {
      const content = await claudeText(fullPrompt, 1, MODELS.CONTENT);
      if (isPromptContentValid(content, feature, aspect.aspect)) return content;
    } catch {
      // Retry below with the fallback content model.
    }

    try {
      const retryPrompt = `${fullPrompt}\n\nYou MUST include: (1) real file paths starting with src/, (2) TypeScript interfaces, (3) at least 3 acceptance criteria checkboxes. Do not write placeholder code.`;
      const content = await claudeText(retryPrompt, 0, MODELS.CONTENT_FALLBACK);
      if (isPromptContentValid(content, feature, aspect.aspect)) return content;
    } catch {
      // Return an explicit failure notice below.
    }
  }

  return generationFailedContent(feature, aspect);
}

function generationFailedContent(feature: string, aspect: Aspect): string {
  return `# [GENERATION FAILED — Manual Input Required]

Feature: ${feature}
Aspect: ${aspect.aspect}
Reason: AI model did not produce valid content.
Please manually write implementation instructions for this aspect.
`;
}

/** Dynamic prompt generation per feature with rich, self-contained context (Section 8). */
export async function generatePrompts(spec: ProjectSpec): Promise<PackageFiles> {
  const files: PackageFiles = {};

  for (let featureIndex = 0; featureIndex < spec.features.length; featureIndex++) {
    const feature = spec.features[featureIndex];
    console.log(
      `[Generator] Generating ${feature} prompts (${featureIndex + 1}/${spec.features.length})...`,
    );
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
