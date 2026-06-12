import { registryByName } from "../registry";
import type { PackageFiles, ProjectSpec } from "../../types/projectspec";
import { lockedEntries, lowConfidenceWarning, slugify } from "./shared";

/**
 * One skill package (folder of 5 files) per finalized stack entry with
 * value != null (Section 9). Low-confidence entries open every file with a
 * visible verify-against-docs warning block.
 */
export function generateSkills(spec: ProjectSpec): PackageFiles {
  const files: PackageFiles = {};

  for (const [category, entry] of lockedEntries(spec)) {
    const tool = entry.value;
    const slug = slugify(tool);
    const reg = registryByName(tool);
    const warn = entry.confidence === "low" ? lowConfidenceWarning(tool) : "";

    files[`skills/${slug}/skill.md`] = `${warn}# Skill: ${tool}

## Role in ${spec.projectName}
${tool} is the locked choice for **${category}** (source: ${entry.source}).
${reg ? reg.skillGenerationHints : `No registry data is available for ${tool}; consult its official documentation for an overview.`}

## When to use
Use ${tool} for every ${category} concern in this ${spec.platform} project. Do not
introduce alternatives - this choice is locked at projectSpecVersion ${spec.projectSpecVersion}.
${reg ? `\n- **Docs:** ${reg.docsUrl}\n- **Pricing:** ${reg.pricing}\n- **Free tier:** ${reg.freeTier}` : ""}
`;

    files[`skills/${slug}/install.md`] = `${warn}# Install: ${tool}

${reg ? `\`\`\`bash\n${reg.installCommands.join("\n")}\n\`\`\`` : `No registry install commands available. Install ${tool} following its official documentation, and record the exact commands here once verified.`}
`;

    files[`skills/${slug}/examples.md`] = `${warn}# Usage Patterns: ${tool} in ${spec.projectName}

Platform: **${spec.platform}**. Apply these patterns:

- Wrap all ${tool} calls in a dedicated service module - components and routes never import ${tool} directly.
- Initialize ${tool} once at application startup; fail fast if configuration is missing.
- Map ${tool} responses to ${spec.projectName} domain types at the service boundary.
${reg ? reg.pros.map((p) => `- Leverage: ${p}`).join("\n") : ""}
`;

    files[`skills/${slug}/env-vars.md`] = `${warn}# Environment Variables: ${tool}

${reg && reg.envVars.length > 0 ? reg.envVars.map((v) => `- \`${v}\``).join("\n") : `_No registry data on required environment variables for ${tool}. Check official docs and list them here._`}

Never commit secrets. Validate presence at startup.
`;

    files[`skills/${slug}/common-mistakes.md`] = `${warn}# Common Mistakes: ${tool}

${reg ? reg.cons.map((c) => `- ${c}`).join("\n") : `- Assuming API conventions without checking current ${tool} docs.`}
- Scattering direct ${tool} calls across the codebase instead of one service module.
- Inventing configuration options or endpoints - verify against official docs.
- Replacing ${tool} with a different ${category} tool: forbidden without a new ADR.
`;
  }

  return files;
}
