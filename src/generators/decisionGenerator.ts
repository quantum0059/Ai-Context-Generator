import type { GeneratedPackage, ProjectInput, Recommendation } from "../types";

/** Generates one architecture decision record per selected category. */
export function generateDecisions(
  input: ProjectInput,
  selected: Recommendation[],
): GeneratedPackage {
  const files: GeneratedPackage = {};
  selected.forEach((rec, i) => {
    const num = String(i + 1).padStart(3, "0");
    const rejected = rec.alternatives
      .map((a) => `- **${a.name}** - rejected: ${a.cons[0] ?? "lower overall fit"} (docs: ${a.docsUrl})`)
      .join("\n");
    files[`decisions/${num}-${rec.category}.md`] = `# ADR ${num}: ${rec.category}

## Status
Accepted

## Decision
Use **${rec.primary.name}** for ${rec.category}.

## Context
Project "${input.name}" targets ${input.platform} with budget "${input.budget}".

## Reasoning
${rec.rationale}

## Rejected Alternatives
${rejected || "_No alternatives were evaluated for this category._"}

## Trade-offs
${rec.primary.cons.map((c) => `- ${c}`).join("\n")}

## Consequence
AI assistants and developers MUST NOT replace ${rec.primary.name} without
superseding this ADR with a new, approved record.
`;
  });
  return files;
}
