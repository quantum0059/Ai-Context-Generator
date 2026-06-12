import type { PackageFiles, ProjectSpec } from "../../types/projectspec";
import { decisionFileName, relevantCategoriesForFeature, slugify } from "./shared";

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
 */
export function generateManifests(
  spec: ProjectSpec,
  promptFiles: PackageFiles,
  materialFiles: PackageFiles = {},
): PackageFiles {
  const files: PackageFiles = {};

  for (const feature of spec.features) {
    const featureSlug = slugify(feature);
    const relevant = relevantCategoriesForFeature(spec, feature);

    const requiredContext: string[] = [
      "agents.md",
      ...relevant.map((category) => `skills/${slugify(spec.stack[category]!.value as string)}/skill.md`),
      ...relevant.map((category) => decisionFileName(spec, category)),
      ...matchingUiReferences(featureSlug, materialFiles),
      ...Object.keys(promptFiles).filter((p) => p.startsWith(`prompts/${featureSlug}/`)),
    ];

    files[`context-manifests/${featureSlug}.json`] =
      JSON.stringify(
        { feature, requiredContext: Array.from(new Set(requiredContext)) },
        null,
        2,
      ) + "\n";
  }

  return files;
}
