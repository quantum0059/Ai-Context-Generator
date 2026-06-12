import { z } from "zod";
import { claudeJson, isClaudeConfigured } from "../lib/claude";
import type { DraftInput } from "../types/projectspec";

const discoverySchema = z.object({
  requiredCategories: z.array(z.string().min(1)).min(1),
});

const PLATFORM_BASE: Record<string, string[]> = {
  web: ["frontendFramework", "styling", "stateManagement", "database", "authentication", "hosting"],
  "mobile-ios-android": ["frontendFramework", "styling", "stateManagement", "database", "authentication"],
  ios: ["frontendFramework", "styling", "stateManagement", "database", "authentication"],
  android: ["frontendFramework", "styling", "stateManagement", "database", "authentication"],
  desktop: ["frontendFramework", "styling", "stateManagement", "database"],
  "browser-extension": ["frontendFramework", "stateManagement", "storage"],
  "backend-only": ["backendFramework", "database", "authentication", "hosting"],
  cli: ["backendFramework"],
};

const KEYWORD_TRIGGERS: Array<{ keywords: string[]; category: string }> = [
  { keywords: ["ai", "chat", "tutor", "assistant", "llm", "gpt"], category: "aiProvider" },
  { keywords: ["video", "stream", "call", "lesson"], category: "videoProvider" },
  { keywords: ["payment", "subscription", "checkout", "billing"], category: "payments" },
  { keywords: ["email", "newsletter"], category: "email" },
  { keywords: ["upload", "file", "image", "media"], category: "storage" },
  { keywords: ["analytics", "tracking", "funnel"], category: "analytics" },
  { keywords: ["monitor", "error", "crash"], category: "monitoring" },
  { keywords: ["blockchain", "wallet", "crypto", "web3"], category: "walletProvider" },
  { keywords: ["map", "geolocation", "gps"], category: "mapsProvider" },
  { keywords: ["search", "full-text"], category: "searchProvider" },
];

function heuristicCategories(draft: DraftInput): string[] {
  const base = PLATFORM_BASE[draft.platform] ?? PLATFORM_BASE.web;
  const text = `${draft.description} ${draft.features.join(" ")}`.toLowerCase();
  const result = new Set<string>(base);
  for (const { keywords, category } of KEYWORD_TRIGGERS) {
    if (keywords.some((k) => text.includes(k))) result.add(category);
  }
  return Array.from(result);
}

/**
 * Dynamic Category Discovery (Section 3): one Claude call determines which
 * technology categories are needed - categories are NOT hardcoded. The
 * heuristic fallback keeps the pipeline usable when no API key is configured.
 */
export async function discoverCategories(
  draft: DraftInput,
): Promise<{ requiredCategories: string[]; engine: "claude" | "heuristic" }> {
  if (isClaudeConfigured()) {
    try {
      const result = await claudeJson(
        `You are analyzing a software project to determine which technology categories its stack needs.\n` +
          `Project description: ${draft.description}\n` +
          `Platform: ${draft.platform}\n` +
          `Features: ${draft.features.join(", ") || "none listed"}\n\n` +
          `Return JSON: {"requiredCategories": ["camelCaseCategory", ...]}.\n` +
          `Use names like frontendFramework, backendFramework, authentication, database, stateManagement, styling, aiProvider, payments, videoProvider, email, storage, analytics, monitoring, hosting - and invent new camelCase categories when a feature implies one (e.g. walletProvider). Include only categories this specific project needs.`,
        discoverySchema,
      );
      return { requiredCategories: result.requiredCategories, engine: "claude" };
    } catch {
      // fall through to heuristic
    }
  }
  return { requiredCategories: heuristicCategories(draft), engine: "heuristic" };
}
