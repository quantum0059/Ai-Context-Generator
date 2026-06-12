import type { ProjectInput, Recommendation } from "../types";

/** Generates ai-context.json - the machine-readable single source of truth. */
export function generateContext(
  input: ProjectInput,
  selected: Recommendation[],
): string {
  const context: Record<string, unknown> = {
    projectName: input.name,
    platform: input.platform,
    budget: input.budget,
    features: input.features,
  };
  for (const rec of selected) {
    context[rec.category] = rec.primary.id;
  }
  return JSON.stringify(context, null, 2) + "\n";
}
