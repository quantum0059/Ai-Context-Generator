import { z } from "zod";
import { claudeJson, isClaudeConfigured } from "../lib/claude";
import { extractProjectConstraints } from "./constraint-extractor";
import type { DraftInput } from "../types/projectspec";
import { MODELS } from "../lib/ai-models";
import { validateRegistryCoverage } from "./registry";
import { cacheGet, cacheSet, stringHash } from "../lib/cache";
import {
  callGroqJsonWithKey,
  estimateGroqRequestTokens,
  groqKeyPool,
  shouldUseGroqKeyPool,
} from "./groq-key-pool";

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
      isCustom: z.boolean().optional(),
      suggestedTools: z.array(
        z.object({
          name: z.string(),
          reason: z.string(),
          installCommand: z.string().optional(),
          docsUrl: z.string().optional(),
        })
      ).optional(),
    }),
  ).min(1),
  excludedCategories: z.array(
    z.object({
      key: z.string(),
      reason: z.string(),
    }),
  ).optional(),
});

const KEYWORD_TRIGGERS: Array<{ keywords: string[]; category: string }> = [
  { keywords: ["ai", "chat", "tutor", "assistant", "llm", "gpt"], category: "aiProvider" },
  { keywords: ["video", "stream", "call", "lesson"], category: "videoProvider" },
  { keywords: ["payment", "subscription", "checkout", "billing"], category: "payments" },
  { keywords: ["email", "newsletter"], category: "email" },
  { keywords: ["upload", "file", "image", "media"], category: "imageProcessing" },
  { keywords: ["analytics", "tracking", "funnel"], category: "analytics" },
  { keywords: ["monitor", "error", "crash"], category: "monitoring" },
  { keywords: ["blockchain", "wallet", "crypto", "web3"], category: "walletProvider" },
  { keywords: ["map", "geolocation", "gps"], category: "mapsProvider" },
  { keywords: ["search", "full-text"], category: "searchProvider" },
  { keywords: ["cache", "caching", "redis", "session store"], category: "caching" },
  { keywords: ["queue", "background job", "worker", "job scheduling"], category: "queueing" },
  { keywords: ["realtime", "websocket", "live", "pub/sub", "multiplayer"], category: "websocket" },
  { keywords: ["cms", "content management", "blog", "editorial"], category: "cms" },
  { keywords: ["rate limit", "rate limiting", "throttle", "ddos"], category: "rateLimit" },
  { keywords: ["feature flag", "a/b test", "experiment", "toggle"], category: "featureFlags" },
  { keywords: ["log", "logging", "log aggregation", "structured logs"], category: "logging" },
  { keywords: ["i18n", "internationalisation", "internationalization", "multilingual", "translation"], category: "i18n" },
];

// Validate registry coverage at module load — warns if any trigger category
// has zero registry entries (would silently fall to Tier 2 hallucination).
validateRegistryCoverage(KEYWORD_TRIGGERS.map((t) => t.category));

function hasKeyword(text: string, keyword: string): boolean {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "i").test(text);
}

const CATEGORY_LABELS: Record<string, string> = {
  frontendFramework: "Frontend Framework",
  backendFramework: "Backend Framework",
  cliFramework: "CLI Framework",
  styling: "Styling",
  stateManagement: "State Management",
  database: "Database",
  authentication: "Authentication",
  hosting: "Hosting",
  aiProvider: "AI Provider",
  videoProvider: "Video Provider",
  payments: "Payments",
  email: "Email",
  storage: "File Storage",
  analytics: "Analytics",
  monitoring: "Monitoring",
  walletProvider: "Wallet Provider",
  mapsProvider: "Maps Provider",
  searchProvider: "Search Provider",
};

function heuristicProjectType(draft: DraftInput): string {
  const text = `${draft.description} ${draft.features.join(" ")}`.toLowerCase();
  if (/\b(cli|command[- ]line|terminal tool)\b/.test(text)) return "CLI_TOOL";
  if (/\b(library|sdk|npm package|developer package)\b/.test(text)) return "LIBRARY_OR_SDK";
  if (/\b(headless|engine|parser|parses|compiler|compiles|generator|generates|processing pipeline|processes|analyzer|analyzes|mentor|builds? .{0,20} files?|emits?)\b/.test(text)) return "HEADLESS_ENGINE";
  if (/\b(backend api|rest api|graphql api|api service|microservice)\b/.test(text)) return "BACKEND_API";
  return "UI_APPLICATION";
}

function heuristicCategories(draft: DraftInput, projectType: string): string[] {
  const text = `${draft.description} ${draft.features.join(" ")}`.toLowerCase();
  const uiPlatform = ["web", "mobile-ios-android", "ios", "android", "desktop", "browser-extension"].includes(draft.platform);
  let base: string[];
  if (projectType === "CLI_TOOL") base = ["cliFramework"];
  else if (projectType === "LIBRARY_OR_SDK") base = [];
  else if (projectType === "HEADLESS_ENGINE") base = ["backendFramework"];
  else if (projectType === "BACKEND_API") base = ["backendFramework", "hosting"];
  else base = uiPlatform ? ["frontendFramework", "styling", "stateManagement", ...(draft.platform === "web" ? ["hosting"] : [])] : ["backendFramework"];

  const result = new Set<string>(base);
  const personalOffline = /\b(personal|single[- ]user)\b/.test(text) && /\b(offline|local)\b/.test(text);
  if (!personalOffline && /\b(auth|authentication|login|sign[ -]?in|account|profile|user|team)\b/.test(text)) result.add("authentication");
  if (/\b(database|persist|store data|records|tasks|projects|content|profile|user|realtime)\b/.test(text)) result.add("database");
  for (const { keywords, category } of KEYWORD_TRIGGERS) {
    if (category === "aiProvider" && /\b(no external ai|without external ai|no ai api)\b/.test(text)) continue;
    if (keywords.some((keyword) => hasKeyword(text, keyword))) result.add(category);
  }
  return Array.from(result);
}

function tool(
  name: string,
  reason: string,
  installCommand?: string,
  docsUrl?: string,
) {
  return { name, reason, installCommand, docsUrl };
}

function offlineCodeAnalysisCategories(draft: DraftInput) {
  const text = `${draft.description} ${draft.features.join(" ")}`.toLowerCase();
  const categories = [
    {
      key: "runtime",
      label: "Runtime",
      reason: "Runs the complete mentor engine locally across operating systems",
      relevantToProjectType: true,
      isCustom: true,
      suggestedTools: [
        tool("Node.js + TypeScript", "Offline, cross-platform, and well suited to AST tooling and local process orchestration", "npm install -D typescript @types/node", "https://nodejs.org/docs/latest/api/"),
        tool("Python 3", "Strong parsing and analysis ecosystem if Python is preferred", undefined, "https://docs.python.org/3/"),
      ],
    },
    {
      key: "astParser",
      label: "AST Parsing",
      reason: "Parses submitted Java, Python, and JavaScript code for structural analysis",
      relevantToProjectType: true,
      isCustom: true,
      suggestedTools: [
        tool("tree-sitter", "Multi-language, fully offline, incremental, and production-grade", "npm install tree-sitter", "https://tree-sitter.github.io/tree-sitter/"),
        tool("@babel/parser", "Excellent alternative when analysis is limited to JavaScript and TypeScript", "npm install @babel/parser", "https://babeljs.io/docs/babel-parser"),
      ],
    },
    {
      key: "localDatabase",
      label: "Local Database",
      reason: "Persists learner profiles, submissions, scores, and recommendations in one offline file",
      relevantToProjectType: true,
      isCustom: true,
      suggestedTools: [
        tool("better-sqlite3", "Fast synchronous SQLite for a local single-user engine", "npm install better-sqlite3", "https://github.com/WiseLibs/better-sqlite3"),
        tool("sqlite3", "Widely used asynchronous SQLite binding", "npm install sqlite3", "https://github.com/TryGhost/node-sqlite3"),
      ],
    },
    {
      key: "cliToolkit",
      label: "CLI Toolkit",
      reason: "Provides a focused local interface for selecting problems and submitting solutions",
      relevantToProjectType: true,
      isCustom: true,
      suggestedTools: [
        tool("Commander + Inquirer + Chalk", "Standard Node.js toolkit for commands, interactive prompts, and readable terminal feedback", "npm install commander inquirer chalk", "https://github.com/tj/commander.js"),
        tool("oclif", "Structured alternative for a larger extensible CLI", "npm install @oclif/core", "https://oclif.io/"),
      ],
    },
    {
      key: "codeExecution",
      label: "Code Execution",
      reason: "Executes Java, Python, and JavaScript submissions locally against test cases",
      relevantToProjectType: true,
      isCustom: true,
      suggestedTools: [
        tool("Node.js child_process", "Built-in local process runner for language compilers and interpreters; add timeouts and resource limits", undefined, "https://nodejs.org/api/child_process.html"),
        tool("isolated-vm", "Stronger isolation alternative specifically for untrusted JavaScript", "npm install isolated-vm", "https://github.com/laverdet/isolated-vm"),
      ],
    },
    {
      key: "testingEngine",
      label: "Testing Engine",
      reason: "Runs public and hidden test cases and verifies expected behavior",
      relevantToProjectType: true,
      isCustom: true,
      suggestedTools: [
        tool("Vitest", "Fast local test runner that integrates cleanly with TypeScript", "npm install -D vitest", "https://vitest.dev/"),
        tool("Node.js test runner", "Dependency-free alternative built into Node.js", undefined, "https://nodejs.org/api/test.html"),
      ],
    },
    {
      key: "complexityAnalysis",
      label: "Complexity Analysis",
      reason: "Estimates time and space complexity from loops, recursion, calls, and data structures",
      relevantToProjectType: true,
      isCustom: true,
      suggestedTools: [
        tool("Custom AST rules engine", "Complexity inference is domain-specific; deterministic rules over the AST are more appropriate than a generic service"),
        tool("tree-sitter queries", "Declarative patterns can identify nested loops, recursion, and data-structure operations", undefined, "https://tree-sitter.github.io/tree-sitter/using-parsers/queries/1-syntax.html"),
      ],
    },
    {
      key: "algorithmRecognition",
      label: "Algorithm Recognition",
      reason: "Matches implementation structure against known algorithm and concept patterns",
      relevantToProjectType: true,
      isCustom: true,
      suggestedTools: [
        tool("Custom pattern matcher", "Tree-sitter queries and normalized AST patterns can recognize algorithms completely offline"),
        tool("tree-sitter queries", "Reusable structural query patterns are a strong base for concept detection", undefined, "https://tree-sitter.github.io/tree-sitter/using-parsers/queries/1-syntax.html"),
      ],
    },
  ];

  if (/\b(skill profiles?|scores? per topic|dashboard|visual|progress)\b/.test(text)) {
    categories.splice(5, 0, {
      key: "dashboardUi",
      label: "Dashboard UI",
      reason: "Displays topic scores, recurring weaknesses, submission history, and next-problem recommendations locally",
      relevantToProjectType: true,
      isCustom: true,
      suggestedTools: [
        tool("Vite + React + Tailwind CSS", "Lightweight local-only dashboard with a fast TypeScript development workflow", "npm create vite@latest dashboard -- --template react-ts", "https://vite.dev/guide/"),
        tool("Ink", "Terminal UI alternative if a browser dashboard is unnecessary", "npm install ink react", "https://github.com/vadimdemedes/ink"),
      ],
    });
  }
  return categories;
}

/**
 * Dynamic Category Discovery (Section 3): one Claude call determines which
 * technology categories are needed - categories are NOT hardcoded. The
 * heuristic fallback keeps the pipeline usable when no API key is configured.
 */
const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000;
const inFlightDiscoveries = new Map<string, Promise<DiscoveryResult>>();

type DiscoveryResult = {
  requiredCategories: string[];
  engine: "claude" | "heuristic";
  projectType?: string;
  classificationReason?: string;
  fullCategories?: any[];
  technicalConstraints?: DraftInput["constraints"]["technical"];
  architecturalRequirements?: any;
};

function discoveryCacheKey(draft: DraftInput): string {
  return `discover:${stringHash(JSON.stringify({
    projectName: draft.projectName,
    description: draft.description,
    platform: draft.platform,
    features: [...draft.features].sort(),
    constraints: draft.constraints,
  }))}`;
}

export async function discoverCategories(
  draft: DraftInput,
): Promise<DiscoveryResult> {
  const cacheKey = discoveryCacheKey(draft);
  const cached = cacheGet<DiscoveryResult>(cacheKey);
  if (cached) return cached;

  const existing = inFlightDiscoveries.get(cacheKey);
  if (existing) return existing;

  const discoveryPromise = (async (): Promise<DiscoveryResult> => {
    const extractedConstraints = await extractProjectConstraints(
      draft.description,
      draft.platform,
    );
    const technicalConstraints = {
      ...extractedConstraints,
      ...draft.constraints.technical,
      forbiddenCategories: Array.from(new Set([
        ...extractedConstraints.forbiddenCategories,
        ...(draft.constraints.technical?.forbiddenCategories ?? []),
      ])),
      forbiddenTools: Array.from(new Set([
        ...extractedConstraints.forbiddenTools,
        ...(draft.constraints.technical?.forbiddenTools ?? []),
      ])),
      requiredToolTypes: Array.from(new Set([
        ...extractedConstraints.requiredToolTypes,
        ...(draft.constraints.technical?.requiredToolTypes ?? []),
      ])),
      rawConstraints: Array.from(new Set([
        ...extractedConstraints.rawConstraints,
        ...(draft.constraints.technical?.rawConstraints ?? []),
      ])),
      compliance: Array.from(new Set([
        ...(extractedConstraints.compliance ?? []),
        ...(draft.constraints.technical?.compliance ?? []),
      ])),
    };

    console.log("[ConstraintExtractor]", JSON.stringify(technicalConstraints, null, 2));

    if (isClaudeConfigured()) {
      try {
        const discoverySystemPrompt = `You are a senior software architect analyzing a project description to determine its technical architecture requirements.

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

Custom category rules:
- Create one category per distinct technical concern
- Name the category key in camelCase (e.g. 'astParser', 'mlRuntime', 'pdfEngine', 'imageProcessor', 'cliFramework', 'testRunner')
- Set a human-readable label (e.g. 'AST Parser', 'ML Runtime', 'PDF Engine')
- Include a reason explaining why this project specifically needs it
- Set isCustom: true so the UI renders it correctly
- suggestedTools applies only to custom categories; include 2-3 real, installable npm or pip packages when you add a custom category

Return one valid JSON object only.

Field contract:
- projectType: one of UI_APPLICATION, HEADLESS_ENGINE, BACKEND_API, CLI_TOOL, LIBRARY_OR_SDK, HYBRID
- classificationReason: one short sentence
- requiredCategories: array of category objects with key, label, reason, relevantToProjectType, optional isCustom, and optional suggestedTools
- relevantToProjectType must be a JSON boolean true or false, never a string like "true" or "false"
- excludedCategories: optional array of objects with key and reason; use [] when there are no excluded categories`;

        const discoveryUserPrompt = `Analyze this project and determine its required technology categories:

Project Name: ${draft.projectName}
Description: ${draft.description}
Platform: ${draft.platform}
Features mentioned: ${draft.features?.join(', ') || 'none yet'}

Hard constraints already extracted:
Forbidden tools: ${technicalConstraints.forbiddenTools.join(', ')}
Forbidden categories: ${technicalConstraints.forbiddenCategories.join(', ')}
Required tool types: ${technicalConstraints.requiredToolTypes.join(', ')}
Must be offline: ${technicalConstraints.mustBeOffline}
Must use local storage: ${technicalConstraints.mustUseLocalStorage}

Rules for this specific project:
- Do NOT suggest any tool in the forbidden list
- Do NOT suggest any category in the forbidden list
- You MUST include categories for each required tool type listed above
- If mustBeOffline is true, every suggestedTool must work without internet
- If mustUseLocalStorage is true, do not suggest any cloud database
- After listing standard categories, scan for specialized technical needs that require a custom category (e.g. AST parsing → astParser, PDF generation → pdfEngine)`;

        // Keep discovery lean enough for public usage. This route should classify
        // and extract categories, not consume the full architectural-analysis budget.
        const maxTokens = 1500;
        const result = shouldUseGroqKeyPool()
          ? await groqKeyPool.callWithRotation(
              MODELS.FAST,
              estimateGroqRequestTokens(discoverySystemPrompt, discoveryUserPrompt, maxTokens),
              (apiKey) =>
                callGroqJsonWithKey({
                  apiKey,
                  systemPrompt: discoverySystemPrompt,
                  userPrompt: discoveryUserPrompt,
                  schema: discoverySchema,
                  retries: 0,
                  model: MODELS.FAST,
                  maxTokens,
                }),
            )
          : await claudeJson(
              discoverySystemPrompt,
              discoveryUserPrompt,
              discoverySchema,
              0,
              MODELS.FAST,
              maxTokens,
            );
        
        console.log('[CategoryDiscovery]', result.projectType, '—', result.classificationReason);
        
        return {
          requiredCategories: result.requiredCategories.map((c) => c.key),
          fullCategories: result.requiredCategories,
          engine: "claude",
          projectType: result.projectType,
          classificationReason: result.classificationReason,
          technicalConstraints,
        };
      } catch (err) {
        console.error("[DiscoverCategories Error]", err);
      }
    }
    const projectType = heuristicProjectType(draft);

    // Offline code analysis tools (AST parsing, complexity, algorithms) get a
    // purpose-built category set with custom tooling suggestions. This was
    // previously only reachable via the AI path; now it's available in the
    // heuristic fallback so offline-first projects get actionable categories
    // even without an AI provider key.
    //
    // We require BOTH an AST/parsing signal AND at least one higher-level
    // domain concern (complexity, algorithm, mentor, skill) to avoid false
    // positives on simpler projects that merely mention "parses source code".
    const text = `${draft.description} ${draft.features.join(" ")}`.toLowerCase();
    const isOfflineCodeAnalysis =
      projectType === "HEADLESS_ENGINE" &&
      /\b(offline|no internet|without internet|local)\b/.test(text) &&
      /\b(ast|parser?s?|source code)\b/.test(text) &&
      /\b(complexity|algorithm|mentor|skill|recognition)\b/.test(text);

    if (isOfflineCodeAnalysis) {
      const categories = offlineCodeAnalysisCategories(draft);
      return {
        requiredCategories: categories.map((c) => c.key),
        fullCategories: categories,
        engine: "heuristic",
        projectType,
        classificationReason: `Classified as ${projectType.toLowerCase().replaceAll("_", " ")} with offline code analysis specialization from the project description.`,
        technicalConstraints,
      };
    }

    const requiredCategories = heuristicCategories(draft, projectType);
    // Even an unusual library needs at least one explicit technical concern.
    if (requiredCategories.length === 0) requiredCategories.push("packageTooling");
    return {
      requiredCategories,
      fullCategories: requiredCategories.map((key) => ({
        key,
        label: CATEGORY_LABELS[key] ?? key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/\b\w/g, (letter) => letter.toUpperCase()),
        reason: `Required by the project description or selected features for this ${projectType.toLowerCase().replaceAll("_", " ")}`,
        relevantToProjectType: true,
        isCustom: !CATEGORY_LABELS[key],
      })),
      engine: "heuristic",
      projectType,
      classificationReason: `Classified as ${projectType.toLowerCase().replaceAll("_", " ")} from the project description and selected features.`,
      technicalConstraints,
    };
  })();

  inFlightDiscoveries.set(cacheKey, discoveryPromise);
  try {
    const result = await discoveryPromise;
    cacheSet(cacheKey, result, DISCOVERY_CACHE_TTL_MS);
    return result;
  } finally {
    inFlightDiscoveries.delete(cacheKey);
  }
}
