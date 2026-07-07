import { registryByName } from "../registry";
import type { RegistryEntry } from "../registry";
import type { PackageFiles, ProjectSpec } from "../../types/projectspec";
import { buildTechCodeSnippets, lockedEntries, lowConfidenceWarning, slugify } from "./shared";

/**
 * Gets platform-specific install commands from registry.
 * Falls back to generic installCommands if no platform-specific override exists.
 */
function getInstallCommands(reg: RegistryEntry, platform: string): string[] {
  const platformKey = normalizePlatform(platform);
  const platformCommands = reg.platformInstallCommands?.[platformKey];
  return platformCommands ?? reg.installCommands;
}

/**
 * Normalizes platform names to match registry keys.
 */
function normalizePlatform(platform: string): string {
  if (platform.includes("mobile") || platform.includes("ios") || platform.includes("android")) {
    return "mobile";
  }
  if (platform.includes("backend")) return "backend";
  if (platform.includes("extension")) return "chrome-extension";
  if (platform.includes("web")) return "web";
  if (platform.includes("saas")) return "saas";
  if (platform.includes("agentic")) return "agentic";
  return platform;
}

interface TechStackEntry {
  name: string;
  category: string;
  source: string;
  confidence?: string;
  docsUrl?: string;
  pricing?: string;
  freeTier?: string;
  installCommands: string[];
  envVars: string[];
  bestPractices: string[];
  pitfalls: string[];
  description?: string;
}

/**
 * Generates a consolidated tech stack reference instead of fragmented per-technology folders.
 *
 * Output:
 *  - tech-stack.md  — Human-readable, scannable reference for the entire locked stack
 *  - tech-stack.json — Machine-readable version for AI assistants to ingest
 *
 * Replaces the old skills/ folder which produced 5 cryptic files per technology.
 */
// sharedContext is accepted for API consistency but unused — generateSkills is
// a pure, synchronous function with no AI calls.
export function generateSkills(spec: ProjectSpec, _sharedContext: string = ''): PackageFiles {
  const entries: TechStackEntry[] = [];
  const markdownSections: string[] = [];
  const allSnippets = buildTechCodeSnippets(spec);

  for (const [category, entry] of lockedEntries(spec)) {
    const tool = entry.value;
    const reg = registryByName(tool);
    const isLowConf = entry.confidence === "low";
    const installCmds = reg ? getInstallCommands(reg, spec.platform) : [];

    // Build structured entry for JSON
    const structuredEntry: TechStackEntry = {
      name: tool,
      category,
      source: entry.source,
      confidence: entry.confidence,
      docsUrl: reg?.docsUrl,
      pricing: reg?.pricing,
      freeTier: reg?.freeTier,
      installCommands: installCmds,
      envVars: reg?.envVars ?? [],
      bestPractices: [
        // Registry-specific pros lead — they're the most useful, tool-specific guidance
        ...(reg ? reg.pros.map((p) => `${p}`) : []),
        // Universal service-layer rules follow as a reminder
        `Wrap all ${tool} calls in a dedicated service module — components and routes never import ${tool} directly.`,
        `Initialize ${tool} once at application startup; fail fast if configuration is missing.`,
        `Map ${tool} responses to ${spec.projectName} domain types at the service boundary.`,
      ],
      pitfalls: [
        ...(reg ? reg.cons : [`Assuming API conventions without checking current ${tool} docs.`]),
        `Scattering direct ${tool} calls across the codebase instead of one service module.`,
        `Replacing ${tool} with a different ${category} tool without a new ADR.`,
      ],
      description: reg?.skillGenerationHints,
    };
    entries.push(structuredEntry);

    const warn = isLowConf ? lowConfidenceWarning(tool) : "";
    const infoTable = reg
      ? `| | |
|---|---|
| **Docs** | ${reg.docsUrl} |
| **Pricing** | ${reg.pricing} |
| **Free Tier** | ${reg.freeTier} |
| **Install** | \`${installCmds.join(" && ")}\` |`
      : `| | |
|---|---|
| **Install** | _No registry data — install ${tool} following its official documentation_ |`;

    const envSection =
      reg && reg.envVars.length > 0
        ? `**Environment Variables** (never commit these — validate at startup):\n${reg.envVars.map((v) => `- \`${v}\``).join("\n")}`
        : "";

    const practicesSection = `**Best Practices:**\n${structuredEntry.bestPractices.map((p) => `- ${p}`).join("\n")}`;

    const pitfallsSection = `**Pitfalls to Avoid:**\n${structuredEntry.pitfalls.map((p) => `- ${p}`).join("\n")}`;

    const description = reg
      ? reg.skillGenerationHints
      : `No registry data available for ${tool}; consult its official documentation.`;

    // Extract the specific snippet for this tool — escape tool name for regex
    const escapedTool = tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedCategory = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const snippetMatch = allSnippets.match(new RegExp(`### ${escapedTool} \\(${escapedCategory}\\)[\\s\\S]*?(\`\`\`[a-z]*[\\s\\S]*?\`\`\`)`));
    const snippetSection = snippetMatch ? `\n**Code Integration Pattern:**\n${snippetMatch[1]}\n` : "";


    markdownSections.push(
      `${warn}### ${tool} (${category})

> **Why:** ${description}
> **Source:** ${entry.source}${entry.confidence ? ` (confidence: ${entry.confidence})` : ""}

${infoTable}

${envSection ? envSection + "\n" : ""}
${practicesSection}

${pitfallsSection}
${snippetSection}`,
    );
  }

  // Categories marked "not needed"
  const notNeeded = Object.entries(spec.stack)
    .filter(([, e]) => e.value === null)
    .map(([c]) => c);

  const notNeededSection =
    notNeeded.length > 0
      ? `\n---\n\n## Categories Not Needed\n\nThe following categories were explicitly marked as not required for this project:\n${notNeeded.map((c) => `- ${c}`).join("\n")}\n`
      : "";

  const techStackMd = `# Tech Stack Reference: ${spec.projectName}

> Complete reference for every locked technology in this project.
> Use this to understand what's in the stack, how to set it up, and how to use it correctly.

**Platform:** ${spec.platform}
**Spec Version:** ${spec.projectSpecVersion}

---

${markdownSections.join("\n\n---\n\n")}
${notNeededSection}
---

## General Rules

1. **Service layer only** — All external SDK calls go through dedicated service modules. Components, routes, and hooks never import SDKs directly.
2. **No surprises** — Never introduce a technology not listed above. If you think you need something new, create an ADR in \`decisions/\` first.
3. **Validate at startup** — Check that all required environment variables are present when the app boots. Fail fast with a clear error message.
4. **Domain types** — Services return your project's domain types, never raw SDK responses.
`;

  const techStackJson = JSON.stringify(
    {
      projectName: spec.projectName,
      platform: spec.platform,
      projectSpecVersion: spec.projectSpecVersion,
      stack: entries,
      notNeeded,
    },
    null,
    2,
  ) + "\n";

  return {
    "tech-stack.md": techStackMd,
    "tech-stack.json": techStackJson,
  };
}
