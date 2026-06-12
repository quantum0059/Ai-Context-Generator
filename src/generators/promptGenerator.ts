import type { Analysis, GeneratedPackage, ProjectInput, Recommendation } from "../types";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function stackSummary(selected: Recommendation[]): string {
  return selected
    .map((r) => `- **${r.category}:** ${r.primary.name}`)
    .join("\n");
}

function promptFile(
  title: string,
  input: ProjectInput,
  analysis: Analysis,
  selected: Recommendation[],
): string {
  return `# Feature Prompt: ${title}

## Project Context
- **Project:** ${input.name}
- **Purpose:** ${analysis.purpose}
- **Platform:** ${input.platform}
- **Target users:** ${input.targetUsers || "general users"}
- **Architecture:** ${analysis.architecture}

## Locked Stack (do not change)
${stackSummary(selected)}

## Feature Requirements
Implement the "${title}" feature for this project. Derive detailed requirements
from the project description: ${input.description}

## Coding Rules
- Follow the conventions defined in \`agents.md\` exactly.
- Use only the technologies listed in the locked stack above.
- Use the templates in \`templates/\` as the structural starting point.
- Keep components small; extract logic into hooks/services.

## Architecture Rules
- Do not introduce new libraries without an ADR in \`decisions/\`.
- Respect the existing folder structure defined in \`agents.md\`.
- All external service calls go through the service layer.

## Testing Instructions
- Add unit tests for all business logic.
- Cover the happy path plus at least one error path per public function.

## Acceptance Criteria
- [ ] Feature works end to end on ${input.platform}.
- [ ] No type errors, lint errors or failing tests.
- [ ] No deviation from the locked stack or conventions.
`;
}

/** Generates one numbered prompt file per major feature. */
export function generatePrompts(
  input: ProjectInput,
  analysis: Analysis,
  selected: Recommendation[],
): GeneratedPackage {
  const baseFeatures = ["Project Analysis", "Design System"];
  const categoryFeatures: string[] = [];
  if (selected.some((r) => r.category === "authentication")) categoryFeatures.push("Authentication");
  categoryFeatures.push("Onboarding", "Dashboard");
  if (selected.some((r) => r.category === "ai")) categoryFeatures.push("AI Integration");
  if (selected.some((r) => r.category === "video")) categoryFeatures.push("Video");
  if (selected.some((r) => r.category === "payments")) categoryFeatures.push("Payments");

  const custom = input.features.filter(
    (f) => !categoryFeatures.some((c) => c.toLowerCase() === f.trim().toLowerCase()),
  );

  const all = [...baseFeatures, ...categoryFeatures, ...custom];
  const files: GeneratedPackage = {};
  all.forEach((feature, i) => {
    const num = String(i + 1).padStart(2, "0");
    files[`prompts/${num}-${slugify(feature)}.md`] = promptFile(
      feature,
      input,
      analysis,
      selected,
    );
  });
  return files;
}
