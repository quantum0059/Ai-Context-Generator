import { registryFor, registryByName } from "../registry";
import type { PackageFiles, ProjectSpec } from "../../types/projectspec";
import { decisionFileName, lockedEntries } from "./shared";

/** One ADR per locked category (Section 6). Prevents AI from changing architecture later. */
export function generateDecisions(spec: ProjectSpec): PackageFiles {
  const files: PackageFiles = {};

  for (const [category, entry] of lockedEntries(spec)) {
    const chosen = entry.value;
    const reg = registryByName(chosen);
    const alternatives = registryFor(category).filter(
      (e) => e.name.toLowerCase() !== chosen.toLowerCase(),
    );

    files[decisionFileName(spec, category)] = `# ADR: ${category}

## Status
Accepted (locked at projectSpecVersion ${spec.projectSpecVersion})

## Decision
Use **${chosen}** for ${category} in ${spec.projectName}.

## Provenance
- Source: **${entry.source}** ${entry.source === "user" ? "(chosen directly by the developer - binding)" : entry.source === "suggested" ? "(registry-backed suggestion confirmed by the developer)" : "(community-suggested, confirmed by the developer)"}
${entry.confidence ? `- Confidence: **${entry.confidence}**${entry.confidence === "low" ? " - verify conventions against current official docs" : ""}` : ""}

## Context
${spec.projectName} targets **${spec.platform}**.${spec.constraints.budget ? ` Budget constraint: ${spec.constraints.budget}.` : ""}${spec.constraints.avoid?.length ? ` Excluded tools: ${spec.constraints.avoid.join(", ")}.` : ""}

## Reasoning
${reg ? `${reg.skillGenerationHints} Pros: ${reg.pros.join("; ")}.` : `The developer locked ${chosen} for ${category}. No registry metadata is available; the choice stands as confirmed.`}

## Rejected Alternatives
${alternatives.length ? alternatives.map((a) => `- **${a.name}** - not selected: ${a.cons[0] ?? "lower overall fit"} (docs: ${a.docsUrl})`).join("\n") : "_No registry alternatives were evaluated for this category._"}

## Trade-offs
${reg ? reg.cons.map((c) => `- ${c}`).join("\n") : `- Conventions for ${chosen} must be verified against its official documentation.`}

## Consequence
AI assistants and developers MUST NOT replace ${chosen} without superseding
this ADR with a new, approved record.
`;
  }

  return files;
}
