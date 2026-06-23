import { z } from "zod";
import { claudeJson, isClaudeConfigured } from "../lib/claude";
import { extractProjectConstraints } from "./constraint-extractor";
import type { DraftInput } from "../types/projectspec";

const discoverySchema = z.object({
  projectType: z.enum([
    "UI_APPLICATION",
    "HEADLESS_ENGINE",
    "BACKEND_API",
    "CLI_TOOL",
    "LIBRARY_OR_SDK",
    "HYBRID",
  ]),
  classificationReason: z.string(),
  requiredCategories: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      reason: z.string(),
      relevantToProjectType: z.boolean(),
    }),
  ).min(1),
  excludedCategories: z.array(
    z.object({
      key: z.string(),
      reason: z.string(),
    }),
  ).optional(),
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
): Promise<{
  requiredCategories: string[];
  engine: "claude" | "heuristic";
  projectType?: string;
  classificationReason?: string;
}> {
  const extractedConstraints = await extractProjectConstraints(draft.description, draft.platform);
  draft.constraints.technical = extractedConstraints;
  console.log('[ConstraintExtractor]', JSON.stringify(extractedConstraints, null, 2));

  if (isClaudeConfigured()) {
    let attempts = 0;
    while (attempts < 2) {
      try {
        const result = await claudeJson(
          `You are a senior software architect analyzing a project description to determine its technical architecture requirements.

Your job has TWO steps and you must complete them in order:

STEP 1 — CLASSIFY THE PROJECT TYPE
Before suggesting any categories, determine which of these project types applies:

- UI_APPLICATION: Has a user interface as its primary output (web app, mobile app, desktop app, browser extension)
- HEADLESS_ENGINE: Core output is processed data, generated files, or transformed content — no UI required to deliver value (generators, parsers, converters, AI pipelines)
- BACKEND_API: Primary output is HTTP endpoints consumed by other services or clients
- CLI_TOOL: Primary interface is a terminal command
- LIBRARY_OR_SDK: Primary output is code consumed by other developers
- HYBRID: Has both a meaningful UI AND a meaningful headless/API core (treat as the heavier concern)

STEP 2 — SUGGEST CATEGORIES BASED ON CLASSIFICATION
Use the classification to constrain your suggestions:

If UI_APPLICATION:
  Include: frontend framework, styling, state management, and UI-specific concerns
  
If HEADLESS_ENGINE:
  DO NOT suggest: frontend framework, styling, UI component libraries, state management
  DO suggest: processing pipeline architecture, output format/serialization, job queuing if async, storage for outputs, API layer only if the engine exposes one
  
If BACKEND_API:
  DO NOT suggest: frontend framework, styling, UI libraries
  DO suggest: API framework, database, auth (if endpoints are user-scoped), validation, rate limiting, documentation (OpenAPI)
  
If CLI_TOOL:
  DO NOT suggest: frontend framework, web server, UI libraries
  DO suggest: CLI framework, config management, output formatting, distribution/packaging
  
If LIBRARY_OR_SDK:
  DO NOT suggest: auth, database, frontend concerns
  DO suggest: package distribution, versioning, documentation generation, testing framework, TypeScript types
  
If HYBRID:
  Suggest categories for both concerns but clearly separate them in your response

CRITICAL RULES:
- A project that GENERATES files is a HEADLESS_ENGINE, even if it has a web interface for input collection
- A project that PROCESSES data is a HEADLESS_ENGINE
- Do not suggest categories based on keywords alone — read the actual purpose of the project
- Never suggest a category the project does not need
- A dashboard for a headless engine is a secondary concern, not the primary architecture
  
Analyze this project and return the required technology categories:

Project Name: ${draft.projectName}
Description: ${draft.description}
Platform: ${draft.platform}
Features mentioned: ${draft.features?.join(', ') || 'none yet'}

Hard constraints already extracted:
Forbidden tools: ${extractedConstraints.forbiddenTools.join(', ')}
Forbidden categories: ${extractedConstraints.forbiddenCategories.join(', ')}
Required tool types: ${extractedConstraints.requiredToolTypes.join(', ')}
Must be offline: ${extractedConstraints.mustBeOffline}

Do NOT suggest any tool in the forbidden list.
Do NOT suggest any category in the forbidden list.
You MUST include categories for each required tool type listed above.

Analyze this project and return the required technology categories.
Your ENTIRE response must be a single JSON object matching this structure exactly:

{
  "projectType": "UI_APPLICATION | HEADLESS_ENGINE | BACKEND_API | CLI_TOOL | LIBRARY_OR_SDK | HYBRID",
  "classificationReason": "one sentence explaining why this classification applies",
  "requiredCategories": [
    {
      "key": "camelCase category key",
      "label": "Human readable label",
      "reason": "why this project needs this category",
      "relevantToProjectType": true
    }
  ],
  "excludedCategories": [
    {
      "key": "category that might seem relevant",
      "reason": "why this project does NOT need it"
    }
  ]
}

Return valid JSON only.`,
          discoverySchema,
        );
        
        console.log('[CategoryDiscovery]', result.projectType, '—', result.classificationReason);
        
        return {
          requiredCategories: result.requiredCategories.map((c) => c.key),
          engine: "claude",
          projectType: result.projectType,
          classificationReason: result.classificationReason,
        };
      } catch (err) {
        console.error("[DiscoverCategories Error]", err);
        attempts++;
        if (attempts >= 2) break;
      }
    }
  }
  return { requiredCategories: heuristicCategories(draft), engine: "heuristic" };
}
