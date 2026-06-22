import type { PackageFiles, PackageMeta, ProjectSpec } from "../types/projectspec";
import { projectSpecSchema } from "./spec";
import { generateAgents } from "./generators/agents";
import { generateDecisions } from "./generators/decisions";
import { generateDependencyGraph, generateDependencyGraphJson, orderFeatures } from "./generators/dependencyGraph";
import {
  generateAiContext,
  generatePackageMeta,
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
import { generateMcpToolDefinition } from "./generators/mcp-tool";

/** No Generic Content rule (Section 14). */
function assertNoGenericContent(spec: ProjectSpec, files: PackageFiles): void {
  for (const [path, content] of Object.entries(files)) {
    if (content.includes("[PLACEHOLDER]")) {
      throw new Error(`Generic content violation: ${path} contains a placeholder token`);
    }
  }
  if (!files["agents.md"]?.includes(spec.projectName)) {
    throw new Error("Generic content violation: agents.md does not reference the project name");
  }
}

/**
 * Package assembly. The finalized ProjectSpec is the ONLY input generators
 * read (plus static registry data). Generators run in parallel where they
 * have no data dependency on each other.
 */
export async function assemblePackage(
  spec: ProjectSpec,
): Promise<{ files: PackageFiles; meta: PackageMeta }> {
  const validated = projectSpecSchema.parse(spec);

  const ordered = await orderFeatures(validated);
  const [promptFiles, materialFiles, skillFiles, decisionFiles, templateFiles, setupFiles] =
    await Promise.all([
      generatePrompts(validated),
      generatePromptMaterial(validated),
      Promise.resolve(generateSkills(validated)),
      generateDecisions(validated),
      Promise.resolve(generateTemplates(validated)),
      generateSetup(validated),
    ]);
  const manifestFiles = await generateManifests(validated, promptFiles, materialFiles);
  const { json: metaJson, meta } = generatePackageMeta(validated);

  const files: PackageFiles = {
    "README.md": generatePackageReadme(validated),
    "agents.md": await generateAgents(validated),
    "ai-context.json": generateAiContext(validated),
    "package-meta.json": metaJson,
    "roadmap.md": generateRoadmap(validated, ordered),
    "resources.md": generateResources(validated),
    "dependency-graph.md": generateDependencyGraph(validated, ordered),
    "dependency-graph.json": await generateDependencyGraphJson(validated),
    ...promptFiles,
    ...materialFiles,
    ...skillFiles,
    ...decisionFiles,
    ...templateFiles,
    ...manifestFiles,
    ...setupFiles,
  };

  const mcpToolDefinition = generateMcpToolDefinition(validated, files);
  files["mcp-server.json"] = mcpToolDefinition;

  assertNoGenericContent(validated, files);
  return { files, meta };
}
