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
 * Hybrid Recommendation Engine (Section 5).
 * Tier 1: Claude ranks registry candidates -> source "suggested", confidence "high".
 * Tier 2: no registry entries -> Claude generates "Community Suggested"
 * candidates -> source "community"; uncertain tools get confidence "low",
 * which propagates into skill files as verify-against-docs warnings.
 * Results are cached against every input that can change the recommendation.
 */
export async function suggestForCategory(
  category: string,
  draft: DraftInput,
): Promise<SuggestionResult> {
  const recommendationContext = JSON.stringify({
    description: draft.description,
    features: [...draft.features].sort(),
    budget: draft.constraints.budget ?? "",
    avoid: [...(draft.constraints.avoid ?? [])].sort(),
    projectType: draft.projectType ?? "",
  });
  const cacheKey = `suggest:${category}:${draft.platform}:${stringHash(recommendationContext)}`;
  const cached = cacheGet<SuggestionResult>(cacheKey);
  if (cached) return cached;

  const entries = registryFor(category);
  const techConstraints = draft.constraints.technical || {
    forbiddenTools: [],
    forbiddenCategories: [],
    requiredToolTypes: [],
    mustBeOffline: false,
    mustUseLocalStorage: false,
    rawConstraints: []
  };

  const avoidedTools = [...techConstraints.forbiddenTools, ...(draft.constraints.avoid ?? [])]
    .map((name) => name.toLowerCase());
  const eligibleTools = entries.filter(tool => 
    !avoidedTools.includes(tool.name.toLowerCase()) &&
    !techConstraints.forbiddenCategories.includes(tool.category)
  );

  let result: SuggestionResult;

  if (eligibleTools.length > 0) {
    const context = `${draft.description} ${draft.features.join(" ")}`.toLowerCase();
    const score = (entry: (typeof eligibleTools)[number]) => {
      let value = entry.pros.filter((pro) => context.includes(pro.toLowerCase())).length;
      if ((draft.constraints.budget ?? "").toLowerCase().includes("free") && entry.freeTier === "Yes") value += 3;
      if (category.toLowerCase().includes("frontend") && draft.platform === "web" && entry.name === "Next.js") value += 5;
      if (category.toLowerCase().includes("frontend") && draft.platform.includes("mobile") && entry.name.includes("Expo")) value += 5;
      if (category.toLowerCase().includes("backend") && entry.name === "Fastify") value += 5;
      return value;
    };
    const orderedTools = [...eligibleTools].sort((a, b) => score(b) - score(a));
    let ranked = orderedTools.slice(0, 3).map((e) => ({
      name: e.name,
      rationale: `${e.skillGenerationHints} Pros: ${e.pros.join("; ")}.`,
    }));
    if (isClaudeConfigured()) {
      try {
        const r = await claudeJson(
          "You are a technical advisor selecting the best tools for a software project. Rank only from the provided candidates. Return JSON only.",
          `Rank the best 2-3 tools for the "${category}" category of this project and explain why per option.\n` +
            `Project: ${draft.description}\nPlatform: ${draft.platform}\nFeatures: ${draft.features.join(", ")}\n` +
            `Budget: ${draft.constraints.budget ?? "unspecified"}\nAvoid: ${(draft.constraints.avoid ?? []).join(", ") || "nothing"}\n` +
            `You MUST choose only from these candidates: ${orderedTools.map((e) => e.name).join(", ")}.\n` +
            `Return JSON: {"candidates":[{"name":"...","rationale":"..."}]}`,
          tier1Schema,
          1,
          MODELS.FAST,
        );
        const valid = r.candidates.filter((c) =>
          eligibleTools.some((e) => e.name.toLowerCase() === c.name.toLowerCase()),
        );
        if (valid.length > 0) ranked = valid;
      } catch {
        // keep registry-order fallback
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
    try {
      const isRequired = techConstraints.requiredToolTypes.some(t => 
        t.toLowerCase().includes(category.toLowerCase()) || 
        category.toLowerCase().includes(t.toLowerCase()) ||
        t.toLowerCase().replace(/[^a-z0-9]/g, '') === category.toLowerCase().replace(/[^a-z0-9]/g, '')
      );

      let prompt = `Suggest 2-3 real, currently-maintained tools for the "${category}" category of this project.\n` +
        `Project: ${draft.description}\nPlatform: ${draft.platform}\nFeatures: ${draft.features.join(", ")}\n` +
        `Budget: ${draft.constraints.budget ?? "unspecified"}\nAvoid: ${(draft.constraints.avoid ?? []).join(", ") || "nothing"}\n`;

      if (isRequired && techConstraints.mustBeOffline) {
        prompt += `Suggest an offline, locally-running tool for ${category}. It must not require internet access.\n`;
      }

      if (techConstraints.forbiddenTools.length > 0) {
        prompt += `Forbidden tools: ${techConstraints.forbiddenTools.join(', ')}\n`;
      }

      prompt += `For each: name, rationale, docsUrl if you are sure of it, and confidence "high" only if you are certain the tool is current and well-maintained, otherwise "low".\n` +
        `Return JSON: {"candidates":[{"name":"...","rationale":"...","docsUrl":"...","confidence":"high|low"}]}`;

      const r = await claudeJson(
        "You are a technical advisor recommending software tools. Only suggest real, currently-maintained tools. Return JSON only.",
        prompt,
        tier2Schema,
        1,
        MODELS.FAST,
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
    } catch {
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
        rationale: `No registry data exists for "${category}" and the AI engine is not configured. Research current options and type your choice manually - it will be locked into the ProjectSpec exactly as entered.`,
        source: "community",
        confidence: "low",
      },
    ],
  };
}
