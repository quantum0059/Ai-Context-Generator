import type { PackageFiles, ProjectSpec } from "../../types/projectspec";
import { decisionFileName, lockedEntries, relevantCategoriesForFeature, slugify } from "./shared";

function matchingUiReferences(featureSlug: string, materialFiles: PackageFiles): string[] {
  const tokens = featureSlug.split("-").filter((t) => t.length > 2);
  return Object.keys(materialFiles).filter(
    (path) =>
      path.startsWith("prompt_material/ui-references/") &&
      tokens.some((t) => path.includes(t)),
  );
}

/**
 * Context Assembly Engine (Section 10): per feature, list exactly which
 * package files an AI assistant should load before working on that feature.
 *
 * Now also generates a human-readable feature guide (markdown) alongside the
 * JSON manifest, so users know what to load and why without parsing JSON.
 */
export function generateManifests(
  spec: ProjectSpec,
  promptFiles: PackageFiles,
  materialFiles: PackageFiles = {},
): PackageFiles {
  const files: PackageFiles = {};

  for (let featureIdx = 0; featureIdx < spec.features.length; featureIdx++) {
    const feature = spec.features[featureIdx];
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

    // JSON manifest (kept for machine consumption)
    files[`context-manifests/${featureSlug}.json`] =
      JSON.stringify(
        { feature, requiredContext: uniqueContext },
        null,
        2,
      ) + "\n";

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
  }

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
