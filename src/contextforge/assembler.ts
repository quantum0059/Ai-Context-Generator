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
import { buildSharedContext } from "./generators/shared";
import { validateGeneratedPackage, type ValidationResult } from "./validators/stack-validator";
import { generateRequirementsDoc } from "./generators/requirements";

/** No Generic Content rule (Section 14). */
function assertNoGenericContent(spec: ProjectSpec, files: PackageFiles): void {
  const forbiddenContent = [
    "expect(true).toBe(true)",
    "export default function feature(): void",
    "${" + "contextList}",
    "# TODO: install",
  ];
  // Placeholder tokens that indicate a stub was emitted instead of real,
  // actionable content. These are an automatic failure in any prompt, test,
  // or skill file — an autonomous agent reading them has no success definition.
  const placeholderTokens = [
    "// TODO",
    "// FIXME",
    "/* TODO",
    "/* FIXME",
    "# TODO",
    "# FIXME",
    "<!-- TODO",
    "TODO:",
    "FIXME:",
    "add render test",
    "assert error message is visible",
    "your code here",
    "implement this",
    "coming soon",
  ];
  const qualityFailures: string[] = [];

  for (const [path, content] of Object.entries(files)) {
    if (content.includes("[PLACEHOLDER]")) {
      throw new Error(`Generic content violation: ${path} contains a placeholder token`);
    }
    const forbidden = forbiddenContent.find((token) => content.includes(token));
    if (forbidden) {
      throw new Error(`Generic content violation: ${path} contains forbidden stub content: ${forbidden}`);
    }

    // Placeholder TODO/FIXME tokens are a hard failure in prompts, tests,
    // skills, and decision records — these files are handed directly to an
    // AI agent and must never contain deferred work.
    const isAgentFacing =
      path.startsWith("prompts/") ||
      path.startsWith("skills/") ||
      path.startsWith("decisions/") ||
      path === "tech-stack.md" ||
      path === "agents.md" ||
      path === "requirements.md";
    if (isAgentFacing) {
      const placeholder = placeholderTokens.find((token) => content.includes(token));
      if (placeholder) {
        throw new Error(
          `Generic content violation: ${path} contains a placeholder token ("${placeholder}"). `
          + "Generated files handed to an AI agent must contain real, complete content — no deferred work.",
        );
      }
    }

    // Enhanced: prompt files must contain src/ paths AND at least one code block
    if (path.startsWith("prompts/") && path.endsWith(".md")) {
      if (!content.includes("src/")) {
        qualityFailures.push(`${path}: missing src/ file paths — AI agent cannot determine where to create files`);
      }
      if (!content.includes("\`\`\`")) {
        qualityFailures.push(`${path}: missing code block — AI agent will hallucinate API patterns`);
      }
    }

    // Enhanced: agents.md must contain at least one code block
    if (path === "agents.md" && !content.includes("\`\`\`")) {
      qualityFailures.push(`agents.md: no code blocks found — AI agents read this first and need real patterns`);
    }

    // Enhanced: manifest JSON must have acceptance_criteria
    if (path.startsWith("context-manifests/") && path.endsWith(".json")) {
      try {
        const parsed = JSON.parse(content) as Record<string, unknown>;
        const ac = parsed["acceptance_criteria"] ?? parsed["acceptanceCriteria"];
        if (!Array.isArray(ac) || (ac as unknown[]).length < 3) {
          qualityFailures.push(`${path}: acceptance_criteria is missing or has fewer than 3 items — AI agent has no success definition`);
        }
      } catch {
        qualityFailures.push(`${path}: invalid JSON — manifest cannot be parsed by AI tooling`);
      }
    }
  }

  if (!files["agents.md"]?.includes(spec.projectName)) {
    throw new Error("Generic content violation: agents.md does not reference the project name");
  }

  // Report quality failures as warnings (not exceptions) — allows demo without AI key
  if (qualityFailures.length > 0) {
    console.warn(
      `[QualityGate] ${qualityFailures.length} prompt quality issue(s) detected:\n`
      + qualityFailures.map((f) => `  ⚠️  ${f}`).join("\n")
      + "\n  → Configure an AI provider (ANTHROPIC_API_KEY or GROQ_API_KEY) for full-quality output."
    );
  }
}

/**
 * Package assembly. The finalized ProjectSpec is the ONLY input generators
 * read (plus static registry data).
 *
 * Generation runs in two sequenced phases so that all AI-driven generators
 * receive the project constitution before producing output:
 *
 *   Phase 1 — Constitutional documents (agents.md + static templates)
 *   Phase 2 — Everything else, each receiving the shared context string
 */
export async function assemblePackage(
  spec: ProjectSpec,
): Promise<{ files: PackageFiles; meta: PackageMeta }> {
  const startTime = Date.now();
  const validated = projectSpecSchema.parse(spec);

  console.log("[Generator] 5% analyzing — Classifying project structure and feature order...");
  const ordered = await orderFeatures(validated);

  // ─── Phase 1: Constitutional documents ───────────────────────────────────
  // agents.md is AI-generated; generateTemplates() is synchronous (no AI).
  // Both must finish before any downstream generator runs.
  console.log("[Generator] 15% generating — Building project constitution (agents.md + templates)...");
  const [agentsContent, templateFiles] = await Promise.all([
    generateAgents(validated),
    Promise.resolve(generateTemplates(validated)), // pure function — wrap for symmetry
  ]);

  // Build the shared context string that all Phase-2 generators will receive.
  // This string contains the first 100 lines of agents.md and the opening
  // sections of the service and API-route templates.
  const sharedContext = buildSharedContext(agentsContent, templateFiles);

  // ─── Phase 2: AI-driven generators (all receive sharedContext) ───────────
  console.log("[Generator] 25% generating — Generating feature prompts and architecture files...");
  const [promptFiles, materialFiles, skillFiles, decisionFiles, setupFiles] =
    await Promise.all([
      generatePrompts(validated, sharedContext),
      generatePromptMaterial(validated),
      Promise.resolve(generateSkills(validated, sharedContext)),
      generateDecisions(validated, sharedContext),
      generateSetup(validated, sharedContext),
    ]);

  // ─── Phase 3: Assemble all files ─────────────────────────────────────────
  console.log("[Generator] 80% generating — Building context manifests...");
  const manifestFiles = await generateManifests(validated, promptFiles, materialFiles);
  const { json: metaJson, meta } = generatePackageMeta(validated);

  const files: PackageFiles = {
    "README.md": generatePackageReadme(validated),
    "agents.md": agentsContent,
    "requirements.md": generateRequirementsDoc(validated),
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

  const validation = validateGeneratedPackage(files, validated);

  // Log all violations
  if (validation.violations.length > 0) {
    console.error(
      '[Validator] VIOLATIONS FOUND:',
      JSON.stringify(validation.violations, null, 2)
    );
  }
  if (validation.warnings.length > 0) {
    console.warn(
      '[Validator] Warnings:',
      JSON.stringify(validation.warnings, null, 2)
    );
  }

  // Write a validation report into the package itself
  // so the user knows what was flagged
  files['validation-report.md'] = generateValidationReport(validation);

  console.log("[Generator] 100% complete — Package generation finished.");
  const elapsed = Date.now() - startTime;
  if (elapsed < 15_000 && validated.features.length >= 5) {
    console.warn(
      `[Generator] Package generated in ${elapsed}ms for ${validated.features.length} features. `
      + "This is suspiciously fast — check for stub fallbacks.",
    );
  }
  return { files, meta };
}

function generateValidationReport(
  result: ValidationResult
): string {
  if (result.passed && result.warnings.length === 0) {
    return `# Validation Report\n\n` +
      `✅ All checks passed. ` +
      `No constraint violations found.`;
  }

  let report = `# Validation Report\n\n`;
  
  if (result.violations.length > 0) {
    report += `## ⛔ Violations (${result.violations.length})\n\n`;
    report += `These files contain content that ` +
      `violates your locked stack constraints. ` +
      `Review before using with an AI agent.\n\n`;
    for (const v of result.violations) {
      report += `### ${v.file}\n`;
      report += `- **Type:** ${v.type}\n`;
      report += `- **Found:** \`${v.found}\`\n`;
      report += `- **Issue:** ${v.message}\n\n`;
    }
  }

  if (result.warnings.length > 0) {
    report += `## ⚠️ Warnings (${result.warnings.length})\n\n`;
    for (const w of result.warnings) {
      report += `- **${w.file}:** ${w.message}\n`;
    }
  }

  return report;
}
