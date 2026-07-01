import { z } from "zod";
import { cacheGet, cacheSet, stringHash } from "../lib/cache";
import { claudeJson, isClaudeConfigured } from "../lib/claude";
import type { DraftInput, SuggestionCandidate } from "../types/projectspec";
import { registryFor } from "./registry";
import { MODELS } from "../lib/ai-models";

const SUGGESTION_TTL_MS = 6 * 60 * 60 * 1000; // several hours

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
 * Cross-category affinity rules.
 *
 * When `ifCategoryHas` is in the locked stack, `preferInCategory` should
 * boost (or outright select) `preferTool` in the suggestion results.
 * This ensures coherent stacks — e.g. if Supabase is already chosen for the
 * database, its integrated auth should be preferred over a separate Clerk.
 */
interface AffinityRule {
  /** Partial, case-insensitive match against the value in the locked stack */
  ifCategoryHas: { category: string; toolPartial: string };
  /** Category being suggested right now */
  preferInCategory: string;
  /** Tool name to bubble to position #1 if present in results */
  preferTool: string;
}

const AFFINITY_RULES: AffinityRule[] = [
  // Supabase DB → prefer Supabase Auth and Supabase Storage
  {
    ifCategoryHas: { category: "database", toolPartial: "supabase" },
    preferInCategory: "authentication",
    preferTool: "Supabase Auth",
  },
  {
    ifCategoryHas: { category: "database", toolPartial: "supabase" },
    preferInCategory: "storage",
    preferTool: "Supabase Storage",
  },
  // Drizzle ORM → prefer PostgreSQL or Neon (Drizzle doesn't support MongoDB well)
  {
    ifCategoryHas: { category: "orm", toolPartial: "drizzle" },
    preferInCategory: "database",
    preferTool: "Neon",
  },
  // Upstash Redis (caching) → prefer Upstash Rate Limit (same account, zero extra setup)
  {
    ifCategoryHas: { category: "caching", toolPartial: "upstash" },
    preferInCategory: "rateLimit",
    preferTool: "Upstash Rate Limit",
  },
  // BullMQ (queueing) → prefer Redis (self-hosted) for caching (already needed for BullMQ)
  {
    ifCategoryHas: { category: "queueing", toolPartial: "bullmq" },
    preferInCategory: "caching",
    preferTool: "Redis (self-hosted)",
  },
  // Expo (mobile framework) → prefer Expo Notifications over web push
  {
    ifCategoryHas: { category: "framework", toolPartial: "expo" },
    preferInCategory: "notifications",
    preferTool: "Expo Notifications",
  },
  // Wagmi (wallet) → prefer RainbowKit (built on Wagmi) for wallet UI
  {
    ifCategoryHas: { category: "walletProvider", toolPartial: "wagmi" },
    preferInCategory: "walletProvider",
    preferTool: "RainbowKit",
  },
];

/**
 * Applies affinity rules to re-order candidates so contextually coherent
 * tools bubble to the top. Does not remove any candidates.
 */
function applyAffinityRules(
  category: string,
  candidates: SuggestionCandidate[],
  draft: DraftInput,
): SuggestionCandidate[] {
  const stack = draft.constraints as unknown as Record<string, unknown>;
  // Also look inside draft.architecturalRequirements if available
  const lockedStack: Record<string, string> = {};

  // Try to read already-locked stack values from the draft
  // (DraftInput doesn't carry .stack, but callers may enrich it)
  const anyDraft = draft as unknown as Record<string, unknown>;
  if (anyDraft.stack && typeof anyDraft.stack === "object") {
    for (const [cat, entry] of Object.entries(anyDraft.stack as Record<string, { value?: string }>)) {
      if (entry?.value) lockedStack[cat] = entry.value.toLowerCase();
    }
  }

  for (const rule of AFFINITY_RULES) {
    if (rule.preferInCategory !== category) continue;
    const lockedValue = lockedStack[rule.ifCategoryHas.category] ?? "";
    if (!lockedValue.includes(rule.ifCategoryHas.toolPartial.toLowerCase())) continue;

    // Move the preferred tool to position 0 if it's present in candidates
    const idx = candidates.findIndex(
      (c) => c.name.toLowerCase().includes(rule.preferTool.toLowerCase()),
    );
    if (idx > 0) {
      const [preferred] = candidates.splice(idx, 1);
      candidates.unshift(preferred);
    }
  }
  return candidates;
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

  // Pass the platform into registryFor so framework entries are pre-filtered
  // to only those that support this project's target platform.
  const entries = registryFor(category, draft.platform);
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

  if (isClaudeConfigured()) {
    try {
      const contextBlock = buildContextBlock(category, draft);
      const toolsBlock = eligibleTools.length > 0 ? `\n\n## Known Registry Tools for Context\n${formatToolsForLlm(eligibleTools)}` : "";

      const prompt =
        `## Project Context\n${contextBlock}${toolsBlock}\n\n` +
        `Suggest 2–3 real, currently-maintained tools for the "${category}" category.\n` +
        `Rules:\n` +
        `- The FIRST candidate must be the single best default for THIS project given its ` +
        `description, features, platform, and budget — the choice a pragmatic senior engineer ` +
        `would pick so a non-technical user can accept it as-is without further research. ` +
        `The remaining candidates are alternatives for users who want to compare.\n` +
        `- Prefer tools that integrate well with any already-selected parts of the stack and ` +
        `that fit the stated budget (favour generous free tiers when budget is tight).\n` +
        `- You may select from the Known Registry Tools, or suggest any other tool you believe is better suited.\n` +
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

      let candidates: SuggestionCandidate[] = r.candidates.map((c) => {
        const entry = eligibleTools.find((e) => e.name.toLowerCase() === c.name.toLowerCase());
        return {
          name: entry?.name ?? c.name,
          rationale: c.rationale,
          docsUrl: entry?.docsUrl ?? c.docsUrl,
          pricing: entry?.pricing,
          freeTier: entry?.freeTier,
          source: (entry ? "suggested" : "community") as "suggested" | "community",
          confidence: (c.confidence ?? "low") as "high" | "low",
        };
      });

      candidates = applyAffinityRules(category, candidates, draft);

      result = {
        category,
        tier: eligibleTools.length > 0 ? "registry" : "community",
        candidates,
      };
    } catch (err) {
      console.warn(
        `[Suggestions] AI call failed for category "${category}" — using fallback.`,
        err instanceof Error ? err.message : err,
      );
      result = buildFallbackResult(category, eligibleTools);
    }
  } else {
    result = buildFallbackResult(category, eligibleTools);
  }

  cacheSet(cacheKey, result, SUGGESTION_TTL_MS);
  return result;
}

/**
 * Deterministic fallback used when the AI engine is unavailable or errors.
 *
 * Confidence is set to "low" because entries are selected by registry priority,
 * NOT by contextual reasoning — so the downstream skill files will emit a
 * "verify-against-docs" warning rather than treating these as verified picks.
 */
function buildFallbackResult(
  category: string,
  eligibleTools: ReturnType<typeof registryFor>,
): SuggestionResult {
  if (eligibleTools.length > 0) {
    return {
      category,
      tier: "registry",
      candidates: eligibleTools.slice(0, 3).map((e, i) => ({
        name: e.name,
        rationale:
          i === 0
            ? `Recommended default for this category. ${e.skillGenerationHints} Pros: ${e.pros.join("; ")}.`
            : `Alternative. ${e.skillGenerationHints} Pros: ${e.pros.join("; ")}.`,
        docsUrl: e.docsUrl,
        pricing: e.pricing,
        freeTier: e.freeTier,
        source: "suggested" as const,
        // LOW confidence: chosen by registry priority, not contextual reasoning,
        // so downstream skill files still emit a verify-against-docs note.
        confidence: "low" as const,
      })),
    };
  }
  return offlineCommunityFallback(category);
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
