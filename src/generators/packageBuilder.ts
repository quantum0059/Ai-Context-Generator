import { getTechnologyById } from "../registry/technologies";
import type {
  Analysis,
  GeneratedPackage,
  ProjectInput,
  Recommendation,
  Selections,
} from "../types";
import { generateAgents } from "./agentsGenerator";
import { generateContext } from "./contextGenerator";
import { generateDecisions } from "./decisionGenerator";
import { generateInstall } from "./installGenerator";
import { generatePromptMaterial } from "./promptMaterialGenerator";
import { generatePrompts } from "./promptGenerator";
import { generateRoadmap } from "./roadmapGenerator";
import { generateSkill } from "./skillGenerator";
import { generateTemplates } from "./templateGenerator";

/** Applies user selections by swapping the primary technology per category. */
function applySelections(
  recommendations: Recommendation[],
  selections: Selections,
): Recommendation[] {
  return recommendations.map((rec) => {
    const chosenId = selections[rec.category];
    if (!chosenId || chosenId === rec.primary.id) return rec;
    const chosen =
      rec.alternatives.find((a) => a.id === chosenId) ?? getTechnologyById(chosenId);
    if (!chosen) return rec;
    const alternatives = [rec.primary, ...rec.alternatives.filter((a) => a.id !== chosen.id)];
    return { ...rec, primary: chosen, alternatives };
  });
}

function generateResources(selected: Recommendation[]): string {
  const sections = selected.map((rec) => {
    const entry = (t: typeof rec.primary, label: string) => `### ${label}: ${t.name}
- **Why:** ${rec.primary.id === t.id ? rec.rationale : t.description}
- **Pricing:** ${t.pricing}
- **Free tier:** ${t.freeTier ? "Yes" : "No"}
- **Docs:** ${t.docsUrl}
- **Pros:** ${t.pros.join("; ")}
- **Cons:** ${t.cons.join("; ")}
`;
    return `## ${rec.category}

${entry(rec.primary, "Selected")}
${rec.alternatives.map((a) => entry(a, "Alternative")).join("\n")}`;
  });
  return `# Resources & Recommendations

${sections.join("\n")}`;
}

/** Assembles the complete AI context package as a path -> content map. */
export function buildPackage(
  input: ProjectInput,
  analysis: Analysis,
  recommendations: Recommendation[],
  selections: Selections,
): GeneratedPackage {
  const selected = applySelections(recommendations, selections);

  const files: GeneratedPackage = {
    "agents.md": generateAgents(input, analysis, selected),
    "ai-context.json": generateContext(input, selected),
    "roadmap.md": generateRoadmap(input, analysis, selected),
    "resources.md": generateResources(selected),
    ...generatePrompts(input, analysis, selected),
    ...generateDecisions(input, selected),
    ...generateTemplates(input, selected),
    ...generateInstall(input, selected),
    ...generatePromptMaterial(input),
  };

  for (const rec of selected) {
    files[`skills/${rec.primary.id}.md`] = generateSkill(rec.primary);
  }

  return files;
}
