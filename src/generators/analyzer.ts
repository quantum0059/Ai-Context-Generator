import { KEYWORD_CATEGORIES, PROFILES } from "../registry/profiles";
import { complete, isLlmConfigured } from "../lib/llm/adapter";
import type { Analysis, Category, ProjectInput } from "../types";

const ARCHITECTURES: Record<ProjectInput["platform"], string> = {
  web: "Next.js App Router monolith: server components for data fetching, API routes for mutations, feature-based folder structure.",
  mobile: "Expo (React Native) app with file-based routing (expo-router), feature-based folders, services layer for API access.",
  backend: "Fastify API with layered architecture: routes -> services -> repositories, schema validation at the edge.",
  saas: "Next.js full-stack SaaS: multi-tenant data model, server actions for mutations, billing and email as isolated modules.",
  "chrome-extension": "Plasmo extension: popup + content scripts + background service worker, shared state via storage APIs.",
  agentic: "Agent loop built on the Vercel AI SDK: tool registry, planner/executor separation, persistent run state.",
};

/**
 * Analyzes a project description. Uses heuristics by default and enhances
 * the purpose/architecture text with an LLM when one is configured.
 */
export async function analyzeProject(input: ProjectInput): Promise<Analysis> {
  const text = `${input.description} ${input.features.join(" ")}`.toLowerCase();

  const categories = new Set<Category>(PROFILES[input.platform]);
  for (const { keywords, category } of KEYWORD_CATEGORIES) {
    if (keywords.some((k) => text.includes(k))) categories.add(category);
  }

  const complexity =
    categories.size >= 9 ? "high" : categories.size >= 6 ? "medium" : "low";

  let purpose = input.description.trim();
  let architecture = ARCHITECTURES[input.platform];

  if (isLlmConfigured()) {
    try {
      purpose = (
        await complete(
          `Summarize the purpose of this software project in 2 concise sentences. Project: ${input.description}`,
        )
      ).trim();
      architecture = (
        await complete(
          `In 2-3 sentences, recommend a high-level architecture for this ${input.platform} project: ${input.description}. Features: ${input.features.join(", ")}`,
        )
      ).trim();
    } catch {
      // LLM unavailable - keep heuristic results.
    }
  }

  return {
    purpose,
    requiredCategories: Array.from(categories),
    complexity,
    architecture,
  };
}
