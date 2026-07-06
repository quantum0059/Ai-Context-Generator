import type { PackageFiles, PackageMeta, ProjectSpec } from "../types/projectspec";
import { projectSpecSchema } from "./spec";
import { generateAgents } from "./generators/agents";
import { generateContext } from "./generators/context";
import { generateDecisions } from "./generators/decisions";
import { generateDependencyGraph, orderFeatures } from "./generators/dependencyGraph";
import {
  generateAiContext,
  generatePackageReadme,
  generateResources,
  generateRoadmap,
  generateSetup,
  generateTemplates,
} from "./generators/docs";
import { generateManifests } from "./generators/manifests";
import { generatePromptMaterial } from "./generators/promptMaterial";
import { generatePrompts } from "./generators/prompts";
import { generateSkills } from "./generators/skills";
import { slugify } from "./generators/shared";

export function bumpMinor(version: string): string {
  const [major, minor] = version.split(".").map(Number);
  return `${major}.${(minor ?? 0) + 1}.0`;
}

function pick(files: PackageFiles, predicate: (path: string) => boolean): PackageFiles {
  return Object.fromEntries(Object.entries(files).filter(([p]) => predicate(p)));
}

export interface RegenerationResult {
  spec: ProjectSpec;
  files: PackageFiles;
  meta: PackageMeta;
  changed: string[];
  removed: string[];
}

/**
 * Regeneration flow (Section 12): no rebuild from scratch. Only generators
 * affected by the spec edit re-run; unrelated existing files (e.g. skill
 * packages for unchanged tools, prompts for unchanged features) are carried
 * over byte-for-byte from the previous package.
 */
export async function regeneratePackage(
  oldSpec: ProjectSpec,
  editedSpec: ProjectSpec,
  oldFiles: PackageFiles,
): Promise<RegenerationResult> {
  const newSpec: ProjectSpec = {
    ...editedSpec,
    projectSpecVersion: bumpMinor(oldSpec.projectSpecVersion),
  };
  projectSpecSchema.parse(newSpec);

  const files: PackageFiles = { ...oldFiles };
  const changed = new Set<string>();
  const removed: string[] = [];

  // --- Diff features ---
  const oldSlugs = new Set(oldSpec.features.map(slugify));
  const newSlugs = new Set(newSpec.features.map(slugify));
  const addedFeatures = newSpec.features.filter((f) => !oldSlugs.has(slugify(f)));
  const removedFeatures = oldSpec.features.filter((f) => !newSlugs.has(slugify(f)));
  const featuresChanged = addedFeatures.length > 0 || removedFeatures.length > 0;

  // --- Diff stack ---
  const allCategories = new Set([...Object.keys(oldSpec.stack), ...Object.keys(newSpec.stack)]);
  const changedCategories = Array.from(allCategories).filter(
    (c) => JSON.stringify(oldSpec.stack[c] ?? null) !== JSON.stringify(newSpec.stack[c] ?? null),
  );
  const stackChanged = changedCategories.length > 0;

  // --- Remove artifacts for removed features ---
  for (const feature of removedFeatures) {
    const slug = slugify(feature);
    for (const path of Object.keys(files)) {
      if (
        path.startsWith(`prompts/${slug}/`) ||
        path === `context-manifests/${slug}.json` ||
        path === `context-manifests/${slug}-guide.md`
      ) {
        delete files[path];
        removed.push(path);
      }
    }
  }

  // --- Stack changes: rebuild tech-stack, ADRs, resources, setup, templates ---
  if (stackChanged) {
    // Tech stack is consolidated — regenerate the whole file
    const allNewSkills = generateSkills(newSpec);
    // Remove any old skills/ folder files from previous package format
    for (const path of Object.keys(files)) {
      if (path.startsWith("skills/")) {
        delete files[path];
        removed.push(path);
      }
    }
    for (const [path, content] of Object.entries(allNewSkills)) {
      files[path] = content;
      changed.add(path);
    }
    // ADR numbering depends on locked-category order -> rebuild decisions/ fully.
    for (const path of Object.keys(files)) {
      if (path.startsWith("decisions/")) delete files[path];
    }
    for (const [path, content] of Object.entries(await generateDecisions(newSpec))) {
      files[path] = content;
      changed.add(path);
    }
    files["resources.md"] = generateResources(newSpec);
    changed.add("resources.md");
    for (const [path, content] of Object.entries(await generateSetup(newSpec))) {
      files[path] = content;
      changed.add(path);
    }
    for (const [path, content] of Object.entries(generateTemplates(newSpec))) {
      files[path] = content;
      changed.add(path);
    }
  }

  // --- Prompts only for added features ---
  if (addedFeatures.length > 0) {
    const newPrompts = await generatePrompts({ ...newSpec, features: addedFeatures });
    for (const [path, content] of Object.entries(newPrompts)) {
      files[path] = content;
      changed.add(path);
    }
  }

  // --- Design reference changes regenerate prompt_material ---
  if (
    JSON.stringify(oldSpec.designReferences ?? []) !==
    JSON.stringify(newSpec.designReferences ?? [])
  ) {
    for (const [path, content] of Object.entries(await generatePromptMaterial(newSpec))) {
      files[path] = content;
      changed.add(path);
    }
  }

  // --- Ordering-dependent docs + manifests ---
  if (featuresChanged || stackChanged) {
    const ordered = await orderFeatures(newSpec);
    files["roadmap.md"] = generateRoadmap(newSpec, ordered);
    files["dependency-graph.md"] = generateDependencyGraph(newSpec, ordered);
    changed.add("roadmap.md");
    changed.add("dependency-graph.md");

    for (const path of Object.keys(files)) {
      if (path.startsWith("context-manifests/")) delete files[path];
    }
    const promptFiles = pick(files, (p) => p.startsWith("prompts/"));
    const materialFiles = pick(files, (p) => p.startsWith("prompt_material/"));
    for (const [path, content] of Object.entries(
      await generateManifests(newSpec, promptFiles, materialFiles),
    )) {
      files[path] = content;
      changed.add(path);
    }
  }

  // --- Always regenerated from the new spec ---
  files["context.md"] = await generateContext(newSpec);
  files["agents.md"] = await generateAgents(newSpec);
  files["ai-context.json"] = generateAiContext(newSpec);
  files["README.md"] = generatePackageReadme(newSpec);
  changed.add("context.md");
  changed.add("agents.md");
  changed.add("ai-context.json");
  changed.add("README.md");

  let oldPackageVersion = "1.0.0";
  try {
    oldPackageVersion = (JSON.parse(oldFiles["package-meta.json"] ?? "{}") as PackageMeta)
      .packageVersion ?? "1.0.0";
  } catch {
    // keep default
  }
  const meta: PackageMeta = {
    packageVersion: bumpMinor(oldPackageVersion),
    projectSpecVersion: newSpec.projectSpecVersion,
    generatedAt: new Date().toISOString(),
  };
  files["package-meta.json"] = JSON.stringify(meta, null, 2) + "\n";
  changed.add("package-meta.json");

  return { spec: newSpec, files, meta, changed: Array.from(changed), removed };
}
