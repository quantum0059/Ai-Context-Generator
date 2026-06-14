import { z } from "zod";
import { cacheGet, cacheSet, stringHash } from "../lib/cache";
import { claudeJson, isClaudeConfigured } from "../lib/claude";
import type { DraftInput, SuggestionCandidate } from "../types/projectspec";
import { registryFor } from "./registry";

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
 * Results are cached per (category + platform + description-hash).
 */
export async function suggestForCategory(
  category: string,
  draft: DraftInput,
): Promise<SuggestionResult> {
  const cacheKey = `suggest:${category}:${draft.platform}:${stringHash(draft.description)}`;
  const cached = cacheGet<SuggestionResult>(cacheKey);
  if (cached) return cached;

  const entries = registryFor(category);
  let result: SuggestionResult;

  if (entries.length > 0) {
    let ranked = entries.slice(0, 3).map((e) => ({
      name: e.name,
      rationale: `${e.skillGenerationHints} Pros: ${e.pros.join("; ")}.`,
    }));
    if (isClaudeConfigured()) {
      try {
        const r = await claudeJson(
          `Rank the best 2-3 tools for the "${category}" category of this project and explain why per option.\n` +
            `Project: ${draft.description}\nPlatform: ${draft.platform}\nFeatures: ${draft.features.join(", ")}\n` +
            `Budget: ${draft.constraints.budget ?? "unspecified"}\nAvoid: ${(draft.constraints.avoid ?? []).join(", ") || "nothing"}\n` +
            `You MUST choose only from these candidates: ${entries.map((e) => e.name).join(", ")}.\n` +
            `Return JSON: {"candidates":[{"name":"...","rationale":"..."}]}`,
          tier1Schema,
        );
        const valid = r.candidates.filter((c) =>
          entries.some((e) => e.name.toLowerCase() === c.name.toLowerCase()),
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
        const entry = entries.find((e) => e.name.toLowerCase() === c.name.toLowerCase());
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
      const r = await claudeJson(
        `Suggest 2-3 real, currently-maintained tools for the "${category}" category of this project.\n` +
          `Project: ${draft.description}\nPlatform: ${draft.platform}\nFeatures: ${draft.features.join(", ")}\n` +
          `Budget: ${draft.constraints.budget ?? "unspecified"}\nAvoid: ${(draft.constraints.avoid ?? []).join(", ") || "nothing"}\n` +
          `For each: name, rationale, docsUrl if you are sure of it, and confidence "high" only if you are certain the tool is current and well-maintained, otherwise "low".\n` +
          `Return JSON: {"candidates":[{"name":"...","rationale":"...","docsUrl":"...","confidence":"high|low"}]}`,
        tier2Schema,
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
