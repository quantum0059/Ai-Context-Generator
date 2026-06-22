import type { ProjectSpec } from "../../types/projectspec";
import { decisionFileName, lockedEntries, lowConfidenceEntries, slugify } from "./shared";

/** agents.md - the AI constitution (Section 7), generated solely from the finalized ProjectSpec. */
export function generateAgents(spec: ProjectSpec): string {
  const locked = lockedEntries(spec);
  const lowConf = lowConfidenceEntries(spec);

  const stackList = locked
    .map(([category, entry]) => `- **${category}:** ${entry.value} _(source: ${entry.source}${entry.confidence ? `, confidence: ${entry.confidence}` : ""})_`)
    .join("\n");

  const archRules = locked
    .map(([category, entry]) => `- All ${category} concerns go through **${entry.value}** exclusively; see \`${decisionFileName(spec, category)}\` for why it was chosen.`)
    .join("\n");

  const lowConfSection = lowConf.length
    ? lowConf
        .map(([category, entry]) => `- **${category}: ${entry.value}** - community-suggested with low confidence. Verify current APIs and conventions against official docs before relying on them.`)
        .join("\n")
    : "_None. All locked stack entries are high confidence._";

  return `# ${spec.projectName} - AI Development Constitution

## Project Overview
${spec.description}

- **Platform:** ${spec.platform}
- **Features:** ${spec.features.join(", ") || "see description"}
${spec.constraints.budget ? `- **Budget constraint:** ${spec.constraints.budget}` : ""}
${spec.constraints.avoid?.length ? `- **Explicitly avoided:** ${spec.constraints.avoid.join(", ")}` : ""}

## Tech Stack (LOCKED - projectSpecVersion: ${spec.projectSpecVersion})
${stackList || "_No technologies locked._"}

Categories marked \"not needed\" by the user: ${
    Object.entries(spec.stack)
      .filter(([, e]) => e.value === null)
      .map(([c]) => c)
      .join(", ") || "none"
  }

## Architecture Rules
${archRules || "_No locked stack entries._"}
- External SDK calls live only in the service layer; components never import SDKs directly.
- Validate all external input at the boundary before it reaches business logic.

## Coding Conventions
- Write idiomatic code for the locked frameworks above - follow their official style guides.
- TypeScript/typed code where the stack supports it; explicit error handling everywhere.
- Small, single-responsibility modules; one component per file.

## What NOT to do
- Do NOT introduce technologies outside the LOCKED stack above.
- Do NOT change architecture without creating a new ADR in \`decisions/\`.
- Do NOT \"helpfully\" swap a locked tool for a similar one (${locked.map(([, e]) => e.value).slice(0, 3).join(", ")} are final).
${spec.constraints.avoid?.length ? `- Do NOT use: ${spec.constraints.avoid.join(", ")} (explicitly excluded by the developer).` : ""}

## Low-Confidence Areas
${lowConfSection}

## When stuck
- \`tech-stack.md\` for complete technology reference, setup details, and best practices.
- \`decisions/\` for why choices were made.
- \`context-manifests/${spec.features[0] ? slugify(spec.features[0]) : "<feature>"}-guide.md\` for a human-readable guide on what to load before working on a feature.
`;
}
