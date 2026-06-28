import { z } from "zod";
import { cacheGet, cacheSet, stringHash } from "../lib/cache";
import { claudeJson, isClaudeConfigured } from "../lib/claude";
import type { DraftInput, SuggestionCandidate } from "../types/projectspec";
import { registryFor } from "./registry";
import { MODELS } from "../lib/ai-models";

const SUGGESTION_TTL_MS = 6 * 60 * 60 * 1000; // several hours

const tier1Schema = z.object({
  candidates: z
    .array(z.object({ name: z.string().min(1), rationale: z.string().min(1) }))
    .min(1)
    .max(3),
});

const tier2Schema = z.object({
  candidates: z
    .array(
      z.object({
        name: z.string().min(1),
        rationale: z.string().min(1),
        docsUrl: z.string().optional(),
        confidence: z.enum(["high", "low"]).default("low"),
      }),
    )
    .min(1)
    .max(3),
});

export interface SuggestionResult {
  category: string;
  tier: "registry" | "community";
  candidates: SuggestionCandidate[];
}

/**
 * Builds a normalized, deterministic context string from the draft so that
 * minor user edits (typo fixes, punctuation) do not bust the suggestion cache.
 * Only semantically-meaningful fields are included.
 */
function buildNormalizedCacheContext(draft: DraftInput): string {
  return JSON.stringify({
    description: draft.description.trim().slice(0, 150).toLowerCase(),
    features: [...draft.features].map((f) => f.trim().toLowerCase()).sort(),
    budget: (draft.constraints.budget ?? "").toLowerCase(),
    avoid: [...(draft.constraints.avoid ?? [])].map((a) => a.toLowerCase()).sort(),
    projectType: (draft.projectType ?? "").toLowerCase(),
    mustBeOffline: draft.constraints.technical?.mustBeOffline ?? false,
    compliance: [...(draft.constraints.technical?.compliance ?? [])].sort(),
  });
}

/**
 * Assembles a rich, structured context block that gives the LLM full signal
 * about the project so it can reason about trade-offs — not just pick
 * the first tool it sees.
 */
function buildContextBlock(category: string, draft: DraftInput): string {
  const tc = draft.constraints.technical;
  const lines: string[] = [
    `Category to select for: "${category}"`,
    `Project description: ${draft.description}`,
    `Platform: ${draft.platform}`,
    `Features: ${draft.features.length > 0 ? draft.features.join(", ") : "not specified"}`,
    `Project type: ${draft.projectType ?? "not specified"}`,
    `Budget: ${draft.constraints.budget ?? "unspecified"}`,
    `Tools to avoid: ${(draft.constraints.avoid ?? []).join(", ") || "none"}`,
  ];

  if (tc) {
    if (tc.mustBeOffline) lines.push("⚠️ HARD CONSTRAINT: App must work fully offline — no cloud SDKs.");
    if (tc.mustUseLocalStorage) lines.push("⚠️ HARD CONSTRAINT: Data must be stored locally on-device.");
    if (tc.forbiddenTools.length > 0) lines.push(`Forbidden tools: ${tc.forbiddenTools.join(", ")}`);
    if (tc.forbiddenCategories.length > 0) lines.push(`Forbidden categories: ${tc.forbiddenCategories.join(", ")}`);
    if (tc.compliance && tc.compliance.length > 0) lines.push(`Compliance requirements: ${tc.compliance.join(", ")}`);
    if (tc.targetAudience && tc.targetAudience.length > 0) lines.push(`Target audience: ${tc.targetAudience.join(", ")}`);
  }

  if (draft.architecturalRequirements) {
    const ar = draft.architecturalRequirements;
    if (ar.businessGoals.length > 0) lines.push(`Business goals: ${ar.businessGoals.slice(0, 3).join("; ")}`);
    const nfr = ar.nonFunctional;
    const nfrHighlights = [
      ...nfr.performance.slice(0, 2),
      ...nfr.security.slice(0, 2),
      ...nfr.scalability.slice(0, 2),
    ];
    if (nfrHighlights.length > 0) lines.push(`Non-functional requirements: ${nfrHighlights.join("; ")}`);
  }

  return lines.join("\n");
}

/**
 * Formats the full list of eligible registry tools into a structured block
 * for the LLM, including name, description, pros, cons, and pricing tier.
 */
function formatToolsForLlm(
  tools: Array<{
    name: string;
    skillGenerationHints: string;
    pros: string[];
    cons: string[];
    freeTier: string;
    pricing: string;
  }>,
): string {
  return tools
    .map(
      (t, i) =>
        `${i + 1}. **${t.name}**\n` +
        `   Description: ${t.skillGenerationHints}\n` +
        `   Pros: ${t.pros.join("; ")}\n` +
        `   Cons: ${t.cons.join("; ")}\n` +
        `   Pricing: ${t.pricing} (Free tier: ${t.freeTier})`,
    )
    .join("\n\n");
}

/**
 * Hybrid Recommendation Engine (Section 5).
 *
 * Tier 1 (registry): The full set of eligible registry tools is passed to
 * the LLM with a rich project context block. The LLM reasons about trade-offs
 * and returns the best 2–3. Source = "suggested", confidence = "high".
 *
 * Tier 2 (community): No registry entries exist → the LLM generates candidates
 * from its training knowledge. Source = "community"; uncertain tools get
 * confidence = "low", which propagates into skill files as verify-against-docs
 * warnings.
 *
 * Results are cached against a normalized context key so minor description
 * edits do not bust the cache.
 */
export async function suggestForCategory(
  category: string,
  draft: DraftInput,
): Promise<SuggestionResult> {
  const normalizedContext = buildNormalizedCacheContext(draft);
  const cacheKey = `suggest:${category}:${draft.platform}:${stringHash(normalizedContext)}`;
  const cached = cacheGet<SuggestionResult>(cacheKey);
  if (cached) return cached;

  const entries = registryFor(category);
  const tc = draft.constraints.technical ?? {
    forbiddenTools: [],
    forbiddenCategories: [],
    requiredToolTypes: [],
    mustBeOffline: false,
    mustUseLocalStorage: false,
    rawConstraints: [],
  };

  const avoidedTools = [...tc.forbiddenTools, ...(draft.constraints.avoid ?? [])].map((n) =>
    n.toLowerCase(),
  );
  const eligibleTools = entries.filter(
    (tool) =>
      !avoidedTools.includes(tool.name.toLowerCase()) &&
      !tc.forbiddenCategories.includes(tool.category),
  );

  let result: SuggestionResult;

  if (eligibleTools.length > 0) {
    // ── Tier 1: LLM-first reasoning over the full eligible registry ──────────
    // We deliberately pass ALL eligible tools, not a pre-scored shortlist.
    // Pre-scoring with string heuristics produced hardcoded biases (e.g. always
    // Next.js for web, always Fastify for backend). The LLM reasons better.
    let ranked = eligibleTools.slice(0, 3).map((e) => ({
      name: e.name,
      rationale: `${e.skillGenerationHints} Pros: ${e.pros.join("; ")}.`,
    }));

    if (isClaudeConfigured()) {
      try {
        const contextBlock = buildContextBlock(category, draft);
        const toolsBlock = formatToolsForLlm(eligibleTools);
        const r = await claudeJson(
          "You are a Principal Engineer selecting the best-fit technologies for a software project. " +
            "You evaluate tools based on the project's actual requirements, constraints, and non-functional needs — " +
            "not by popularity alone. You consider offline requirements, compliance, budget, and team fit. " +
            "You MUST only recommend tools from the provided candidate list. Return JSON only.",
          `## Project Context\n${contextBlock}\n\n` +
            `## Candidate Tools for "${category}"\n${toolsBlock}\n\n` +
            `Select the best 2–3 tools from the candidates above for this specific project.\n` +
            `For each tool, give a concise rationale (1–2 sentences) that references the project's actual requirements.\n` +
            `Return JSON: {"candidates":[{"name":"...","rationale":"..."}]}`,
          tier1Schema,
          2,
          MODELS.CONTENT,
        );
        const valid = r.candidates.filter((c) =>
          eligibleTools.some((e) => e.name.toLowerCase() === c.name.toLowerCase()),
        );
        if (valid.length > 0) ranked = valid;
      } catch (err) {
        // Log the failure so it's visible in server logs; fall back to registry order
        console.warn(
          `[Suggestions] Tier 1 AI call failed for category "${category}" — using registry-order fallback.`,
          err instanceof Error ? err.message : err,
        );
      }
    }

    result = {
      category,
      tier: "registry",
      candidates: ranked.map((c) => {
        const entry = eligibleTools.find((e) => e.name.toLowerCase() === c.name.toLowerCase());
        return {
          name: entry?.name ?? c.name,
          rationale: c.rationale,
          docsUrl: entry?.docsUrl,
          pricing: entry?.pricing,
          freeTier: entry?.freeTier,
          source: "suggested" as const,
          confidence: "high" as const,
        };
      }),
    };
  } else if (isClaudeConfigured()) {
    // ── Tier 2: Community suggestions from LLM training knowledge ────────────
    try {
      const contextBlock = buildContextBlock(category, draft);

      const prompt =
        `## Project Context\n${contextBlock}\n\n` +
        `Suggest 2–3 real, currently-maintained tools for the "${category}" category.\n` +
        `Rules:\n` +
        `- Only suggest tools that genuinely exist on npm (or the relevant package registry).\n` +
        `- Set confidence to "high" ONLY if you are certain the package exists, is actively maintained, ` +
        `and has a public GitHub repo with recent commits. Otherwise use "low".\n` +
        `- If the project must be offline, only suggest tools that run locally without internet access.\n` +
        `Return JSON: {"candidates":[{"name":"...","rationale":"...","docsUrl":"...","confidence":"high|low"}]}`;

      const r = await claudeJson(
        "You are a Principal Engineer recommending software tools. " +
          "Only suggest real, verifiable packages. Accuracy matters more than completeness — " +
          "if you are unsure a package exists, set confidence to 'low'. Return JSON only.",
        prompt,
        tier2Schema,
        2,
        MODELS.CONTENT,
      );
      result = {
        category,
        tier: "community",
        candidates: r.candidates.map((c) => ({
          name: c.name,
          rationale: c.rationale,
          docsUrl: c.docsUrl,
          source: "community" as const,
          confidence: c.confidence ?? "low",
        })),
      };
    } catch (err) {
      console.warn(
        `[Suggestions] Tier 2 AI call failed for category "${category}".`,
        err instanceof Error ? err.message : err,
      );
      result = offlineCommunityFallback(category);
    }
  } else {
    result = offlineCommunityFallback(category);
  }

  cacheSet(cacheKey, result, SUGGESTION_TTL_MS);
  return result;
}

function offlineCommunityFallback(category: string): SuggestionResult {
  return {
    category,
    tier: "community",
    candidates: [
      {
        name: "Manual selection recommended",
        rationale: `No registry data exists for "${category}" and the AI engine is not configured. Research current options and type your choice manually — it will be locked into the ProjectSpec exactly as entered.`,
        source: "community",
        confidence: "low",
      },
    ],
  };
}
