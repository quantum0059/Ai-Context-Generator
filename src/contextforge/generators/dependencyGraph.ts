import { z } from "zod";
import { claudeJson, claudeText, isClaudeConfigured } from "../../lib/claude";
import { MODELS } from "../../lib/ai-models";
import type { ProjectSpec } from "../../types/projectspec";
import { buildConstraintBlock } from "./shared";

const orderSchema = z.object({
  ordered: z.array(z.object({ feature: z.string(), reason: z.string() })).min(1),
});

const PRIORITY: Array<{ keywords: string[]; weight: number; reason: string }> = [
  { keywords: ["auth", "login", "signup"], weight: 0, reason: "Most features depend on knowing who the user is." },
  { keywords: ["profile", "account"], weight: 1, reason: "User profile data builds on the authentication layer." },
  { keywords: ["onboard"], weight: 2, reason: "Onboarding requires the core user model to exist first." },
  { keywords: ["ai", "chat", "tutor"], weight: 6, reason: "AI features integrate on top of the core experience." },
  { keywords: ["video", "lesson"], weight: 6, reason: "Media features integrate on top of the core experience." },
  { keywords: ["payment", "billing", "subscription"], weight: 8, reason: "Monetization should land after the core product works." },
  { keywords: ["admin", "analytics"], weight: 9, reason: "Operational tooling comes last." },
];

function heuristicOrder(spec: ProjectSpec): Array<{ feature: string; reason: string }> {
  const scored = spec.features.map((feature, index) => {
    const text = feature.toLowerCase();
    const hit = PRIORITY.find((p) => p.keywords.some((k) => text.includes(k)));
    return {
      feature,
      reason: hit?.reason ?? "Core feature; ordered by logical build sequence.",
      weight: hit?.weight ?? 4,
      index,
    };
  });
  scored.sort((a, b) => a.weight - b.weight || a.index - b.index);
  return scored.map(({ feature, reason }) => ({ feature, reason }));
}

/** Claude-derived feature ordering by logical dependency (Section 11). */
export async function orderFeatures(
  spec: ProjectSpec,
): Promise<Array<{ feature: string; reason: string }>> {
  if (spec.features.length === 0) return [];
  if (isClaudeConfigured()) {
    try {
      const systemPrompt = `${buildConstraintBlock(spec)}You are a technical project manager. Order the given features by logical build dependency.

Return JSON only: {"ordered":[{"feature":"<exact feature text>","reason":"..."}]} containing every feature exactly once.`;
      const userPrompt = `Order these features of project "${spec.projectName}" (${spec.platform}) by logical build dependency — what must exist before what.

Features: ${spec.features.join("; ")}`;
      const r = await claudeJson(
        systemPrompt,
        userPrompt,
        orderSchema,
        1,
        MODELS.REASONING,
      );
      const valid = r.ordered.filter((o) =>
        spec.features.some((f) => f.toLowerCase() === o.feature.toLowerCase()),
      );
      if (valid.length === spec.features.length) return valid;
    } catch {
      // fall through
    }
  }
  return heuristicOrder(spec);
}

export function generateDependencyGraph(
  spec: ProjectSpec,
  ordered: Array<{ feature: string; reason: string }>,
): string {
  const chain = ordered.map((o) => o.feature).join(" -> ") || "No features listed";
  const detail = ordered
    .map((o, i) => `${i + 1}. **${o.feature}** - ${o.reason}`)
    .join("\n");
  return `# Dependency Graph: ${spec.projectName}

Build order derived from logical feature dependencies. This ordering directly
determines the phase sequence in \`roadmap.md\`.

\`\`\`
${chain}
\`\`\`

## Ordering rationale
${detail || "_No features were specified in the ProjectSpec._"}
`;
}

export async function generateDependencyGraphJson(
  spec: ProjectSpec,
  ordered?: Array<{ feature: string; reason: string }>,
): Promise<string> {
  const systemPrompt =
    `${buildConstraintBlock(spec)}You are a technical project manager determining the optimal build order for a software project. Return valid JSON only, no markdown, no code fences.`;

  const userPrompt = `Determine the build order and dependencies for:

Project: ${spec.projectName}
Features: ${spec.features.join(", ")}
Stack: ${JSON.stringify(spec.stack)}
Platform: ${spec.platform}

Return this exact JSON structure:
{
  "buildOrder": [
    {
      "phase": 1,
      "name": "(phase name like 'Foundation')",
      "features": ["(array of feature names)"],
      "reason": "(one sentence why these go first)",
      "canParallelize": "(boolean — can features in this phase be built simultaneously)"
    }
  ],
  "featureDependencies": {
    "(featureName)": ["(array of feature names that must be complete before this one can start)"]
  },
  "criticalPath": ["(array of feature names in order that represents the longest dependency chain — this is the minimum sequential build path)"],
  "parallelizableGroups": [
    ["(arrays of feature names that can be built simultaneously after their dependencies are met)"]
  ],
  "foundationRequirements": {
    "mustBuildFirst": ["(array of features or infrastructure items needed before ANY feature work — typically: database schema, auth, environment setup)"],
    "reason": "(one sentence)"
  }
}

Rules for determining order:
- Authentication must come before any feature that has user-owned data
- Database schema must come before any feature that reads or writes data
- Payment integration depends on auth and user profiles
- AI features depend on auth and any data storage they use
- Apply these rules to ${spec.features.join(", ")} specifically`;

  // Build a REAL structured fallback from the same ordering the markdown uses,
  // so dependency-graph.json can never silently disagree with
  // dependency-graph.md (previously it emitted empty arrays on any AI failure).
  const effectiveOrder = ordered ?? heuristicOrder(spec);
  const orderedNames = effectiveOrder.map((o) => o.feature);
  const featureDependencies: Record<string, string[]> = {};
  orderedNames.forEach((name, i) => {
    featureDependencies[name] = i === 0 ? [] : [orderedNames[i - 1]];
  });
  const fallback = {
    buildOrder: effectiveOrder.map((o, i) => ({
      phase: i + 1,
      name: o.feature,
      features: [o.feature],
      reason: o.reason,
      canParallelize: false,
    })),
    featureDependencies,
    criticalPath: orderedNames,
    parallelizableGroups: [],
    foundationRequirements: {
      mustBuildFirst: orderedNames.slice(0, 1),
      reason:
        orderedNames.length > 0
          ? `${orderedNames[0]} establishes the foundation the remaining features build on.`
          : "No features specified.",
    },
  };

  if (isClaudeConfigured() && spec.features.length > 0) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await claudeText(systemPrompt, userPrompt, 1, MODELS.REASONING);
        // Attempt to clean markdown JSON formatting if present
        const cleaned = response
          .replace(/^```json\s*/m, "")
          .replace(/^```\s*$/m, "")
          .trim();
        const parsed = JSON.parse(cleaned);
        return JSON.stringify(parsed, null, 2) + "\n";
      } catch (e) {
        if (attempt === 1) {
          // Fall through to fallback after one retry
        }
      }
    }
  }

  return JSON.stringify(fallback, null, 2) + "\n";
}
