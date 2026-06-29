import { z } from "zod";
import { claudeJson, isClaudeConfigured } from "../../lib/claude";
import type { PackageFiles, ProjectSpec } from "../../types/projectspec";
import { buildConstraintBlock, decisionFileName, lockedEntries, relevantCategoriesForFeature, slugify } from "./shared";
import { registryByName } from "../registry";
import { MODELS } from "../../lib/ai-models";

function matchingUiReferences(featureSlug: string, materialFiles: PackageFiles): string[] {
  const tokens = featureSlug.split("-").filter((t) => t.length > 2);
  return Object.keys(materialFiles).filter(
    (path) =>
      path.startsWith("prompt_material/ui-references/") &&
      tokens.some((t) => path.includes(t)),
  );
}

const manifestSchema = z.object({
  feature: z.string(),
  phase: z.number(),
  depends_on: z.array(z.string()),
  estimated_complexity: z.enum(["low", "medium", "high"]),
  acceptance_criteria: z.array(z.string()),
  files_to_create: z.array(
    z.object({
      path: z.string(),
      purpose: z.string(),
      exports: z.array(z.string()),
      primary_dependencies: z.array(z.string()),
    }),
  ),
  files_to_modify: z.array(
    z.object({
      path: z.string(),
      change: z.string(),
    }),
  ),
  environment_variables_required: z.array(
    z.object({
      name: z.string(),
      where_to_get_it: z.string(),
      example_value: z.string(),
    }),
  ),
  test_commands: z.array(z.string()),
  load_before_starting: z.array(z.string()),
  common_mistakes: z.array(z.string()),
});

type Manifest = z.infer<typeof manifestSchema>;

async function generateFeatureManifest(
  spec: ProjectSpec,
  feature: string,
  featureIdx: number,
  uniqueContext: string[],
): Promise<Manifest | null> {
  const systemPrompt = `${buildConstraintBlock(spec)}You are a technical project manager generating a machine-readable task definition for an AI coding agent. The agent will read this JSON file and know exactly what to build, what files to create, what to test, and what done looks like — with zero human input required.

Return valid JSON only, no markdown, no code fences.`;

  const userPrompt = `Generate a complete executable context manifest for:

Project: ${spec.projectName}
Feature: ${feature}
Platform: ${spec.platform}
Stack: ${JSON.stringify(spec.stack)}

Return this exact JSON structure, fully populated:
{
  "feature": "${feature}",
  "phase": ${featureIdx + 1},
  "depends_on": [ (array of feature names that must be complete before starting this one) ],
  "estimated_complexity": "low|medium|high",
  "acceptance_criteria": [
    (5-8 specific, testable criteria — each one must be verifiable with a concrete action like 'curl', 'click', or 'run test'. No vague criteria like 'works correctly')
  ],
  "files_to_create": [
    {
      "path": (exact relative path from project root),
      "purpose": (one sentence),
      "exports": (array of what this file exports),
      "primary_dependencies": (array of npm packages this file imports from)
    }
  ],
  "files_to_modify": [
    {
      "path": (exact relative path),
      "change": (exactly what to add or change, specific enough that an AI knows where to make the edit)
    }
  ],
  "environment_variables_required": [
    {
      "name": (exact variable name),
      "where_to_get_it": (URL or service name),
      "example_value": (realistic non-secret example)
    }
  ],
  "test_commands": [
    (exact terminal commands or test function calls that verify this feature works)
  ],
  "load_before_starting": [
    (exact file paths from this context package to load into the AI context window before starting, in order of importance. Must include the following: ${uniqueContext.join(', ')})
  ],
  "common_mistakes": [
    (3-5 specific mistakes AI assistants commonly make when implementing this feature with this stack)
  ]
}`;

  try {
    return await claudeJson(systemPrompt, userPrompt, manifestSchema, 1, MODELS.CONTENT);
  } catch (error) {
    // fallback if AI call fails or is not configured
    return null;
  }
}

/**
 * Context Assembly Engine (Section 10): per feature, list exactly which
 * package files an AI assistant should load before working on that feature.
 *
 * Now also generates a human-readable feature guide (markdown) alongside the
 * JSON manifest, so users know what to load and why without parsing JSON.
 */
export async function generateManifests(
  spec: ProjectSpec,
  promptFiles: PackageFiles,
  materialFiles: PackageFiles = {},
): Promise<PackageFiles> {
  const files: PackageFiles = {};

  const manifestPromises = spec.features.map(async (feature, featureIdx) => {
    const featureSlug = slugify(feature);
    const relevant = relevantCategoriesForFeature(spec, feature);

    const requiredContext: string[] = [
      "agents.md",
      "tech-stack.md",
      ...relevant.map((category) => decisionFileName(spec, category)),
      ...matchingUiReferences(featureSlug, materialFiles),
      ...Object.keys(promptFiles).filter((p) => p.startsWith(`prompts/${featureSlug}/`)),
    ];

    const uniqueContext = Array.from(new Set(requiredContext));

    const manifestData = await generateFeatureManifest(spec, feature, featureIdx, uniqueContext);

    // JSON manifest (kept for machine consumption)
    const jsonManifest = manifestData ?? buildFallbackManifest(spec, feature, featureIdx, uniqueContext);
    files[`context-manifests/${featureSlug}.json`] = JSON.stringify(jsonManifest, null, 2) + "\n";

    // Human-readable feature guide
    const contextList = uniqueContext
      .map((path) => {
        const description = describeFile(path, spec, relevant);
        return `1. **\`${path}\`** — ${description}`;
      })
      .join("\n");

    // Determine dependencies
    const prevFeature = featureIdx > 0 ? spec.features[featureIdx - 1] : null;
    const dependencyNote = prevFeature
      ? `This feature should be built **after** ${prevFeature}. See \`roadmap.md\` for the full build order.`
      : "This is the **first feature** to build. See `roadmap.md` for the full build order.";

    const promptList = Object.keys(promptFiles)
      .filter((p) => p.startsWith(`prompts/${featureSlug}/`))
      .map((p) => `- \`${p}\``)
      .join("\n");

    files[`context-manifests/${featureSlug}-guide.md`] = `# Feature Guide: ${feature}

> Load the files below into your AI assistant before working on this feature.
> This ensures the assistant has all the context it needs to build correctly.

## Before You Start

${contextList}

## Build Prompts

Copy-paste these prompts into your AI assistant to start building:

${promptList || "- _No prompts generated for this feature_"}

## Build Order

${dependencyNote}

## Relevant Stack

${relevant.length > 0 ? relevant.map((cat) => `- **${cat}:** ${spec.stack[cat]?.value}`).join("\n") : "- _No specific stack entries map to this feature — follow agents.md._"}
`;
  });

  await Promise.all(manifestPromises);

  return files;
}

/** Produces a short human-readable description of what a package file is for. */
function describeFile(
  path: string,
  spec: ProjectSpec,
  relevantCategories: string[],
): string {
  if (path === "agents.md") {
    return "Project constitution — architecture rules and locked stack (always required)";
  }
  if (path === "tech-stack.md") {
    return "Complete technology reference with setup, env vars, and best practices";
  }
  if (path.startsWith("decisions/")) {
    // Try to extract the category from the filename
    const match = relevantCategories.find((cat) =>
      path.toLowerCase().includes(slugify(cat)),
    );
    if (match) {
      const entry = spec.stack[match];
      return `ADR explaining why ${entry?.value} was chosen for ${match}`;
    }
    return "Architecture Decision Record for a locked technology choice";
  }
  if (path.startsWith("prompt_material/ui-references/")) {
    return "UI reference for this feature's screens";
  }
  if (path.startsWith("prompts/")) {
    return "Build prompt — copy-paste into your AI assistant";
  }
  return "Supporting context file";
}

/**
 * Derives a machine-complete manifest from the ProjectSpec without requiring
 * an AI call. All 9 manifest fields are populated from deterministic rules.
 * This replaces the previous stub `{ feature, requiredContext }` fallback.
 */
function buildFallbackManifest(
  spec: ProjectSpec,
  feature: string,
  featureIdx: number,
  requiredContext: string[],
): Record<string, unknown> {
  const slug = slugify(feature);
  const relevant = relevantCategoriesForFeature(spec, feature);
  const locked = lockedEntries(spec);

  // Derive files to create from feature slug and stack
  const isNextjs = locked.some(([, e]) => e.value.toLowerCase().includes('next'));
  const filesToCreate: string[] = isNextjs
    ? [`src/app/${slug}/page.tsx`, `src/components/${slug}/index.tsx`, `src/services/${slug}.ts`, `src/types/${slug}.ts`]
    : [`src/features/${slug}/index.ts`, `src/services/${slug}.ts`, `src/types/${slug}.ts`];

  // Derive acceptance criteria from feature name + stack
  const acceptanceCriteria: string[] = [
    `${feature} works end-to-end on ${spec.platform} without errors`,
    `No technology outside the locked stack (${locked.map(([, e]) => e.value).join(', ')}) is imported`,
    `TypeScript strict mode passes — no implicit \`any\` types`,
    `Loading, error, and empty states are all handled gracefully`,
    `All public service functions in src/services/${slug}.ts have unit tests`,
  ];

  const text = feature.toLowerCase();
  if (/auth|login|sign/.test(text)) {
    acceptanceCriteria.push('Unauthenticated user is redirected to /sign-in — not shown a blank or broken page');
    acceptanceCriteria.push('Authenticated user ID is correctly propagated to all service layer calls');
  }
  if (/billing|payment|stripe/.test(text)) {
    acceptanceCriteria.push('Stripe webhook signature is verified on every webhook call — handler returns 400 on invalid signature');
    acceptanceCriteria.push('Premium access is granted only after webhook confirms payment — not at checkout redirect');
  }
  if (/chat|message|realtime/.test(text)) {
    acceptanceCriteria.push('Realtime subscription is established on mount and torn down on unmount — no duplicate listeners');
  }

  // Derive required environment variables from the registry
  const envVars: string[] = [];
  for (const [, entry] of locked) {
    const reg = registryByName(entry.value);
    if (reg?.envVars) envVars.push(...reg.envVars);
  }

  // Derive test commands from stack
  const hasVitest = locked.some(([, e]) => e.value.toLowerCase().includes('vitest'));
  const hasJest = locked.some(([, e]) => e.value.toLowerCase().includes('jest'));
  const testCommands = hasVitest
    ? ['npx vitest run', `npx vitest run src/__tests__/${slug}.test.ts`]
    : hasJest
    ? ['npx jest', `npx jest --testPathPattern=${slug}`]
    : [`npm test`];

  // Derive common mistakes from stack
  const commonMistakes: string[] = [
    `Importing external SDKs directly in component files instead of src/services/${slug}.ts`,
    'Using \`any\` type instead of the domain types in src/types/${slug}.ts',
  ];
  if (locked.some(([, e]) => e.value.toLowerCase().includes('supabase'))) {
    commonMistakes.push('Querying Supabase without user_id filter — always add .eq("user_id", userId)');
  }
  if (locked.some(([, e]) => e.value.toLowerCase().includes('clerk'))) {
    commonMistakes.push('Using useUser() in a Server Component — use auth() from @clerk/nextjs/server instead');
  }

  return {
    feature,
    version: spec.projectSpecVersion,
    load_before_starting: requiredContext,
    files_to_create: filesToCreate,
    files_to_modify: [
      'src/app/layout.tsx',
      'src/components/navigation/Navigation.tsx',
    ],
    acceptance_criteria: acceptanceCriteria,
    environment_variables_required: Array.from(new Set(envVars)),
    test_commands: testCommands,
    common_mistakes: commonMistakes,
    build_after: featureIdx > 0 ? [spec.features[featureIdx - 1]] : [],
  };
}
