/**
 * Granular Regeneration API (P1)
 *
 * Allows targeted re-generation of individual pipeline outputs without
 * rebuilding the entire package. This is the preferred path for iterative
 * development — change one thing, regenerate only what changed.
 *
 * API surface:
 *   regenerateAspect()         → one prompts/<feature>/<aspect>.md
 *   regenerateFeature()        → all aspects for one feature + its manifest
 *   regenerateStackCategory()  → ADR + skills + templates for one category
 *   regenerateContext()        → context.md only
 *   regenerateAgents()         → agents.md only
 */

import type { PackageFiles, ProjectSpec } from "../types/projectspec";
import { generateAgents } from "./generators/agents";
import { generateContext } from "./generators/context";
import { generateDecisions } from "./generators/decisions";
import { generateManifests } from "./generators/manifests";
import { generateSkills } from "./generators/skills";
import { generateTemplates } from "./generators/docs";
import { orderFeatures } from "./generators/dependencyGraph";
import { slugify, decisionFileName } from "./generators/shared";

// Re-export for convenience
export { bumpMinor } from "./regenerate";

/** Result of any granular regeneration. */
export interface GranularResult {
  /** All package files after the operation (existing + regenerated). */
  files: PackageFiles;
  /** Relative paths that were regenerated or added. */
  changed: string[];
  /** Relative paths that were deleted (e.g. old aspect removed). */
  removed: string[];
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function pick(files: PackageFiles, predicate: (path: string) => boolean): PackageFiles {
  return Object.fromEntries(Object.entries(files).filter(([p]) => predicate(p)));
}

// ─── regenerateAspect ─────────────────────────────────────────────────────────

/**
 * Regenerates exactly one `prompts/<feature>/<aspect>.md`.
 *
 * Use this when:
 * - The user wants to retry a single prompt with a different model
 * - An aspect prompt failed validation and needs to be re-generated
 * - The user changed the description for a single feature
 *
 * @param spec       The current (possibly edited) project spec
 * @param feature    The feature name, e.g. "Dashboard"
 * @param aspect     The aspect key, e.g. "ui-components"
 * @param existingFiles  The current full package file map
 */
export async function regenerateAspect(
  spec: ProjectSpec,
  feature: string,
  aspect: string,
  existingFiles: PackageFiles,
): Promise<GranularResult> {
  const files: PackageFiles = { ...existingFiles };
  const changed: string[] = [];
  const featureSlug = slugify(feature);
  const targetPath = `prompts/${featureSlug}/${aspect}.md`;

  // Import here to avoid circular deps
  const { generatePrompts } = await import("./generators/prompts");

  // Generate only this feature's prompts then extract the one we want
  const singleFeatureSpec: ProjectSpec = { ...spec, features: [feature] };
  const newPrompts = await generatePrompts(singleFeatureSpec);

  if (newPrompts[targetPath]) {
    files[targetPath] = newPrompts[targetPath];
    changed.push(targetPath);
  } else {
    // aspect may not exist for this feature — generate all aspects and pick
    for (const [path, content] of Object.entries(newPrompts)) {
      if (path.startsWith(`prompts/${featureSlug}/`)) {
        files[path] = content;
        changed.push(path);
      }
    }
  }

  return { files, changed, removed: [] };
}

// ─── regenerateFeature ────────────────────────────────────────────────────────

/**
 * Regenerates all aspects for one feature AND its context manifest.
 *
 * Use this when:
 * - The user renamed a feature
 * - A feature's description changed substantially
 * - The user wants higher-quality prompts for one feature
 *
 * @param spec          The current project spec
 * @param feature       The feature name to regenerate
 * @param existingFiles The current full package file map
 */
export async function regenerateFeature(
  spec: ProjectSpec,
  feature: string,
  existingFiles: PackageFiles,
): Promise<GranularResult> {
  const files: PackageFiles = { ...existingFiles };
  const changed: string[] = [];
  const removed: string[] = [];
  const featureSlug = slugify(feature);

  // Remove old prompts for this feature
  for (const path of Object.keys(files)) {
    if (path.startsWith(`prompts/${featureSlug}/`)) {
      delete files[path];
      removed.push(path);
    }
  }

  const { generatePrompts } = await import("./generators/prompts");
  const singleFeatureSpec: ProjectSpec = { ...spec, features: [feature] };
  const newPrompts = await generatePrompts(singleFeatureSpec);

  for (const [path, content] of Object.entries(newPrompts)) {
    files[path] = content;
    changed.push(path);
  }

  // Regenerate manifest for this feature only
  const promptFiles = pick(files, (p) => p.startsWith("prompts/"));
  const materialFiles = pick(files, (p) => p.startsWith("prompt_material/"));
  const featureOrder = await orderFeatures(spec);
  const newManifests = await generateManifests(
    { ...spec, features: [feature] },
    promptFiles,
    materialFiles,
  );

  for (const [path, content] of Object.entries(newManifests)) {
    files[path] = content;
    changed.push(path);
  }

  // The roadmap references the full feature list — leave it unchanged.
  // Callers can call regeneratePackage() if the full ordering needs refreshing.
  void featureOrder;

  return { files, changed, removed };
}

// ─── regenerateStackCategory ──────────────────────────────────────────────────

/**
 * Regenerates the ADR, skill pack, and templates for a single stack category.
 *
 * Use this when:
 * - The user swaps one technology (e.g. Supabase → PlanetScale)
 * - A new version of a library changes the recommended patterns
 * - The AI generated incorrect patterns for a specific tool
 *
 * Only files scoped to `category` are touched. All other files remain byte-for-byte identical.
 *
 * @param spec          The current project spec (with the new tool already set)
 * @param category      The category key, e.g. "database"
 * @param existingFiles The current full package file map
 */
export async function regenerateStackCategory(
  spec: ProjectSpec,
  category: string,
  existingFiles: PackageFiles,
): Promise<GranularResult> {
  const files: PackageFiles = { ...existingFiles };
  const changed: string[] = [];
  const removed: string[] = [];

  // 1. Rebuild the ADR for this category
  const adrPath = decisionFileName(spec, category);
  const oldAdrPaths = Object.keys(files).filter(
    (p) => p.startsWith("decisions/") && p.toLowerCase().includes(slugify(category)),
  );
  for (const p of oldAdrPaths) {
    delete files[p];
    removed.push(p);
  }

  const newDecisions = await generateDecisions(spec);
  if (newDecisions[adrPath]) {
    files[adrPath] = newDecisions[adrPath];
    changed.push(adrPath);
  }

  // 2. Rebuild the skill pack for this category
  const allNewSkills = generateSkills(spec);
  const categorySlug = slugify(category);
  const skillPath = `skills/${categorySlug}.md`;
  const oldSkillPaths = Object.keys(files).filter(
    (p) => p.startsWith("skills/") && p.toLowerCase().includes(categorySlug),
  );
  for (const p of oldSkillPaths) {
    delete files[p];
    removed.push(p);
  }
  if (allNewSkills[skillPath]) {
    files[skillPath] = allNewSkills[skillPath];
    changed.push(skillPath);
  }

  // 3. Rebuild templates (they reference specific stack values)
  const newTemplates = generateTemplates(spec);
  for (const [path, content] of Object.entries(newTemplates)) {
    files[path] = content;
    changed.push(path);
  }

  return { files, changed, removed };
}

// ─── regenerateContext ────────────────────────────────────────────────────────

/**
 * Regenerates only `context.md` — the product brief.
 *
 * Use this when:
 * - The project description was updated
 * - The user wants to refine the product vision without rebuilding everything
 */
export async function regenerateContextDoc(
  spec: ProjectSpec,
  existingFiles: PackageFiles,
): Promise<GranularResult> {
  const files: PackageFiles = { ...existingFiles };
  files["context.md"] = await generateContext(spec);
  return { files, changed: ["context.md"], removed: [] };
}

// ─── regenerateAgentsDoc ──────────────────────────────────────────────────────

/**
 * Regenerates only `agents.md` — the architecture constitution.
 *
 * Use this when:
 * - The locked stack changed
 * - The user wants to refresh architecture rules without a full rebuild
 */
export async function regenerateAgentsDoc(
  spec: ProjectSpec,
  existingFiles: PackageFiles,
): Promise<GranularResult> {
  const files: PackageFiles = { ...existingFiles };
  files["agents.md"] = await generateAgents(spec);
  return { files, changed: ["agents.md"], removed: [] };
}
