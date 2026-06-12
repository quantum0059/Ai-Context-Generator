import { TECHNOLOGIES } from "../registry/technologies";
import type { Analysis, ProjectInput, Recommendation, Technology } from "../types";

function buildRationale(tech: Technology, input: ProjectInput): string {
  const reasons: string[] = [];
  if (tech.freeTier) reasons.push("offers a free tier");
  if (input.preferredTechnologies.some((p) => matches(tech, p)))
    reasons.push("matches your stated technology preference");
  reasons.push(`strong developer experience (${tech.pros[0]?.toLowerCase() ?? "well documented"})`);
  return `Selected because it ${reasons.join(", ")}. ${tech.description}`;
}

function matches(tech: Technology, preference: string): boolean {
  const p = preference.trim().toLowerCase();
  return p.length > 0 && (tech.name.toLowerCase().includes(p) || tech.id.includes(p));
}

/**
 * Recommends a primary technology plus alternatives per required category.
 * Prioritization: user preference > free solutions > registry priority
 * (which encodes developer experience, community support and scalability).
 */
export function recommend(input: ProjectInput, analysis: Analysis): Recommendation[] {
  return analysis.requiredCategories.flatMap((category) => {
    let candidates = TECHNOLOGIES.filter(
      (t) => t.category === category && t.platforms.includes(input.platform),
    );
    if (candidates.length === 0) {
      candidates = TECHNOLOGIES.filter((t) => t.category === category);
    }
    if (input.budget === "free-only") {
      const free = candidates.filter((t) => t.freeTier);
      if (free.length > 0) candidates = free;
    }

    const score = (t: Technology) =>
      (input.preferredTechnologies.some((p) => matches(t, p)) ? -100 : 0) +
      (t.freeTier ? -10 : 0) +
      t.priority;

    const sorted = [...candidates].sort((a, b) => score(a) - score(b));
    if (sorted.length === 0) return [];

    const [primary, ...alternatives] = sorted;
    return [
      {
        category,
        primary,
        alternatives,
        rationale: buildRationale(primary, input),
      },
    ];
  });
}
