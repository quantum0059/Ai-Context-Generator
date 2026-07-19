import { z } from "zod";
import { cacheGet, cacheSet, stringHash } from "../lib/cache";
import { claudeJson, isClaudeConfigured } from "../lib/claude";
import type { DraftInput, SuggestionCandidate, SuggestionResolution } from "../types/projectspec";
import { registryFor } from "./registry";
import { MODELS } from "../lib/ai-models";
import {
  callGroqJsonWithKey,
  estimateGroqRequestTokens,
  groqKeyPool,
  shouldUseGroqKeyPool,
} from "./groq-key-pool";

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

export type SuggestionResult = SuggestionResolution;

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
  // Supabase DB → prefer Postgres for database if not already Supabase
  {
    ifCategoryHas: { category: "database", toolPartial: "supabase" },
    preferInCategory: "orm",
    preferTool: "Drizzle ORM",
  },
  // Neon DB → prefer Drizzle ORM (first-class Neon support)
  {
    ifCategoryHas: { category: "database", toolPartial: "neon" },
    preferInCategory: "orm",
    preferTool: "Drizzle ORM",
  },
  // Drizzle ORM → prefer PostgreSQL or Neon (Drizzle doesn't support MongoDB well)
  {
    ifCategoryHas: { category: "orm", toolPartial: "drizzle" },
    preferInCategory: "database",
    preferTool: "Neon",
  },
  // Prisma ORM → prefer PostgreSQL
  {
    ifCategoryHas: { category: "orm", toolPartial: "prisma" },
    preferInCategory: "database",
    preferTool: "PostgreSQL (self-hosted)",
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
  // Redis (caching) → prefer BullMQ for queueing (same Redis instance)
  {
    ifCategoryHas: { category: "caching", toolPartial: "redis" },
    preferInCategory: "queueing",
    preferTool: "BullMQ",
  },
  // Expo (mobile framework) → prefer Expo Notifications over web push
  {
    ifCategoryHas: { category: "framework", toolPartial: "expo" },
    preferInCategory: "notifications",
    preferTool: "Expo Notifications",
  },
  // Next.js (web framework) → prefer Vercel for hosting, Clerk for auth
  {
    ifCategoryHas: { category: "framework", toolPartial: "next" },
    preferInCategory: "hosting",
    preferTool: "Vercel",
  },
  {
    ifCategoryHas: { category: "framework", toolPartial: "next" },
    preferInCategory: "authentication",
    preferTool: "Clerk",
  },
  // Clerk Auth → prefer Next.js or Expo (best DX with Clerk)
  {
    ifCategoryHas: { category: "authentication", toolPartial: "clerk" },
    preferInCategory: "framework",
    preferTool: "Next.js",
  },
  // Wagmi (wallet) → prefer RainbowKit (built on Wagmi) for wallet UI
  {
    ifCategoryHas: { category: "walletProvider", toolPartial: "wagmi" },
    preferInCategory: "walletProvider",
    preferTool: "RainbowKit",
  },
  // Vite → prefer Vitest for testing
  {
    ifCategoryHas: { category: "framework", toolPartial: "vite" },
    preferInCategory: "testing",
    preferTool: "Vitest",
  },
  // Next.js → prefer Playwright for E2E testing
  {
    ifCategoryHas: { category: "framework", toolPartial: "next" },
    preferInCategory: "testing",
    preferTool: "Playwright",
  },
  // PostgreSQL → prefer Prisma or Drizzle for ORM
  {
    ifCategoryHas: { category: "database", toolPartial: "postgres" },
    preferInCategory: "orm",
    preferTool: "Prisma",
  },
  // MongoDB → prefer Mongoose for ORM
  {
    ifCategoryHas: { category: "database", toolPartial: "mongodb" },
    preferInCategory: "orm",
    preferTool: "Mongoose",
  },
  // Tailwind CSS → prefer shadcn/ui for components
  {
    ifCategoryHas: { category: "styling", toolPartial: "tailwind" },
    preferInCategory: "componentLibrary",
    preferTool: "shadcn/ui",
  },
  // Zustand → prefer Immer for immutable updates
  {
    ifCategoryHas: { category: "stateManagement", toolPartial: "zustand" },
    preferInCategory: "stateManagement",
    preferTool: "Immer",
  },
  // React Query / TanStack Query → prefer Axios or Fetch for HTTP
  {
    ifCategoryHas: { category: "dataFetching", toolPartial: "tanstack" },
    preferInCategory: "httpClient",
    preferTool: "Axios",
  },
  // Vercel hosting → prefer Vercel KV/Blob for storage
  {
    ifCategoryHas: { category: "hosting", toolPartial: "vercel" },
    preferInCategory: "storage",
    preferTool: "Vercel Blob",
  },
  // AWS hosting → prefer S3 for storage, DynamoDB for database
  {
    ifCategoryHas: { category: "hosting", toolPartial: "aws" },
    preferInCategory: "storage",
    preferTool: "AWS S3",
  },
  {
    ifCategoryHas: { category: "hosting", toolPartial: "aws" },
    preferInCategory: "database",
    preferTool: "DynamoDB",
  },
  // Railway/Render hosting → prefer PostgreSQL
  {
    ifCategoryHas: { category: "hosting", toolPartial: "railway" },
    preferInCategory: "database",
    preferTool: "PostgreSQL (self-hosted)",
  },
  {
    ifCategoryHas: { category: "hosting", toolPartial: "render" },
    preferInCategory: "database",
    preferTool: "PostgreSQL (self-hosted)",
  },
  // tRPC → prefer Zod for validation
  {
    ifCategoryHas: { category: "apiLayer", toolPartial: "trpc" },
    preferInCategory: "validation",
    preferTool: "Zod",
  },
  // GraphQL → prefer Apollo Client
  {
    ifCategoryHas: { category: "apiLayer", toolPartial: "graphql" },
    preferInCategory: "dataFetching",
    preferTool: "Apollo Client",
  },
  // Storybook → prefer Chromatic for visual testing
  {
    ifCategoryHas: { category: "componentLibrary", toolPartial: "storybook" },
    preferInCategory: "testing",
    preferTool: "Chromatic",
  },
  // Sentry monitoring → prefer Sentry for error tracking
  {
    ifCategoryHas: { category: "monitoring", toolPartial: "sentry" },
    preferInCategory: "errorTracking",
    preferTool: "Sentry",
  },
  // Clerk → prefer Stripe for payments (Clerk + Stripe Billing integration)
  {
    ifCategoryHas: { category: "authentication", toolPartial: "clerk" },
    preferInCategory: "payments",
    preferTool: "Stripe",
  },
  // Stripe payments → prefer Clerk or Supabase Auth (integrated billing)
  {
    ifCategoryHas: { category: "payments", toolPartial: "stripe" },
    preferInCategory: "authentication",
    preferTool: "Clerk",
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
  const lockedStack: Record<string, string> = {};

  if (draft.stack) {
    for (const [cat, entry] of Object.entries(draft.stack)) {
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

function humanizeCategory(key: string): string {
  return key
    .replace(/[-_]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

function firstSentence(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  const match = normalized.match(/.+?[.!?](?=\s|$)/);
  return match?.[0] ?? normalized;
}

function findAppliedAffinityRule(
  category: string,
  topCandidate: SuggestionCandidate | undefined,
  draft: DraftInput,
): AffinityRule | undefined {
  if (!topCandidate) return undefined;
  const lockedStack: Record<string, string> = {};

  if (draft.stack) {
    for (const [cat, entry] of Object.entries(draft.stack)) {
      if (entry?.value) lockedStack[cat] = entry.value.toLowerCase();
    }
  }

  return AFFINITY_RULES.find((rule) => {
    if (rule.preferInCategory !== category) return false;
    const lockedValue = lockedStack[rule.ifCategoryHas.category] ?? "";
    if (!lockedValue.includes(rule.ifCategoryHas.toolPartial.toLowerCase())) return false;
    return topCandidate.name.toLowerCase().includes(rule.preferTool.toLowerCase());
  });
}

function buildSuggestionPresentation(
  category: string,
  candidates: SuggestionCandidate[],
  draft: DraftInput,
): Pick<SuggestionResult, "recommendationSummary" | "tradeoffs"> {
  const top = candidates[0];
  if (!top) {
    return {
      recommendationSummary: `No strong default is available yet for ${humanizeCategory(category)}.`,
      tradeoffs: [],
    };
  }

  const bundle = detectFeatureBundle(draft.features, draft.projectType, draft.description);
  const affinityRule = findAppliedAffinityRule(category, top, draft);
  const summaryParts = [
    `${top.name} is the recommended default for ${humanizeCategory(category)}.`,
    firstSentence(top.rationale),
  ];

  if (bundle && bundle.categories.includes(category)) {
    summaryParts.push(`It also fits the detected ${bundle.name.toLowerCase()} pattern in your feature set.`);
  }

  if (affinityRule) {
    summaryParts.push(
      `It stays coherent with your selected ${humanizeCategory(affinityRule.ifCategoryHas.category)} choice.`,
    );
  }

  if (draft.constraints.budget && top.freeTier) {
    summaryParts.push(`Free-tier signal: ${top.freeTier}.`);
  }

  const tradeoffs = candidates.slice(1).map((candidate) => {
    const notes: string[] = [firstSentence(candidate.rationale)];

    if (candidate.confidence === "low") {
      notes.push("Lower confidence, so verify maintenance and package docs before locking it in.");
    }

    if (candidate.source === "community") {
      notes.push("This is not grounded in the local registry, so it may need more manual validation.");
    }

    if (candidate.pricing && candidate.pricing !== top.pricing) {
      notes.push(`Pricing profile: ${candidate.pricing}.`);
    } else if (candidate.freeTier && candidate.freeTier !== top.freeTier) {
      notes.push(`Free tier: ${candidate.freeTier}.`);
    }

    return `${candidate.name}: ${notes.join(" ")}`.trim();
  });

  return {
    recommendationSummary: summaryParts.filter(Boolean).join(" "),
    tradeoffs,
  };
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
    stack: Object.entries(draft.stack ?? {})
      .filter(([, e]) => e?.value)
      .map(([cat, e]) => `${cat}:${(e.value as string).toLowerCase()}`)
      .sort(),
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

  // Feature bundle detection — identify when features naturally map to
  // all-in-one platforms so the LLM can prefer coherent bundles over
  // picking best-in-class for each category independently.
  const featureBundle = detectFeatureBundle(draft.features, draft.projectType, draft.description);
  if (featureBundle) {
    lines.push(`🎯 FEATURE BUNDLE DETECTED: ${featureBundle.name}`);
    lines.push(`   Recommended coherent platform: ${featureBundle.recommendedPlatform}`);
    lines.push(`   Rationale: ${featureBundle.rationale}`);
    lines.push(`   Covers categories: ${featureBundle.categories.join(", ")}`);
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

    // Pass structured feature architecture to LLM (from feature-pipeline.ts)
    if (ar.domain?.coreWorkflows?.length > 0) {
      lines.push(`Core workflows: ${ar.domain.coreWorkflows.slice(0, 5).join("; ")}`);
    }

    // Structured FeatureSet with epics, priorities, dependencies, critical path
    if (ar.functional && ar.functional.length > 0) {
      const epicsMap = new Map<string, string[]>();
      const priorityMap = new Map<string, string>();
      const depsMap = new Map<string, string[]>();
      let criticalPathStr = "";

      for (const fr of ar.functional) {
        if (fr.title) {
          // Group by epic if available (FR title -> epic)
          // We infer epic from description keywords
          let epic = "Core Product";
          const desc = fr.description?.toLowerCase() ?? "";
          if (/\b(auth|login|sign.?in|user|account|team|member|rbac|permission)\b/.test(desc)) epic = "Core Infrastructure";
          else if (/\b(payment|billing|subscription|checkout|stripe|moneti[sz]e)\b/.test(desc)) epic = "Monetisation";
          else if (/\b(admin|manage|backoffice|moderator|dashboard|analytics|report|metric)\b/.test(desc)) epic = "Operations & Engagement";
          else if (/\b(onboard|setup|wizard|first.?run|getting.?started)\b/.test(desc)) epic = "User Experience";

          const existing = epicsMap.get(epic) ?? [];
          existing.push(fr.id);
          epicsMap.set(epic, existing);
          priorityMap.set(fr.id, fr.priority);
          depsMap.set(fr.id, fr.actors ?? []);
        }
      }

      const epicLines = Array.from(epicsMap.entries())
        .map(([name, ids]) => `  ${name}: ${ids.join(", ")}`)
        .join("\n");
      if (epicLines) lines.push(`Feature Epics:\n${epicLines}`);

      const criticalPathIds = ar.functional
        .filter((f) => f.priority === "must-have")
        .sort((a, b) => (a.actors?.length ?? 0) - (b.actors?.length ?? 0))
        .map((f) => f.id);
      if (criticalPathIds.length > 0) {
        lines.push(`Critical Path (must-have order): ${criticalPathIds.join(" → ")}`);
      }

      // Priority distribution
      const mustCount = ar.functional.filter((f) => f.priority === "must-have").length;
      const shouldCount = ar.functional.filter((f) => f.priority === "should-have").length;
      const niceCount = ar.functional.filter((f) => f.priority === "nice-to-have").length;
      lines.push(`Priority distribution: ${mustCount} must-have, ${shouldCount} should-have, ${niceCount} nice-to-have`);
    }
  }

  return lines.join("\n");
}

interface FeatureBundle {
  name: string;
  recommendedPlatform: string;
  rationale: string;
  categories: string[];
}

/**
 * Detects when a set of features maps to a known all-in-one platform
 * that covers multiple categories coherently.
 *
 * @param features  - The list of user-selected features.
 * @param projectType - The classified project type (e.g. "UI_APPLICATION").
 * @param description - The raw project description, used to detect explicit
 *   backend technology choices that should NOT be overridden by a bundle.
 */
function detectFeatureBundle(
  features: string[],
  projectType?: string,
  description?: string,
): FeatureBundle | null {
  const featureText = features.join(" ").toLowerCase();
  const type = projectType?.toLowerCase() ?? "";
  const descText = (description ?? "").toLowerCase();

  // Skip for non-UI projects
  if (type === "cli_tool" || type === "library_or_sdk" || type === "headless_engine") {
    return null;
  }

  const hasAuth = /\b(auth|login|sign.?in|account|user|team|member)\b/.test(featureText);
  const hasDB = /\b(database|storage|persist|record|crud|data)\b/.test(featureText);
  const hasEmail = /\b(email|newsletter|notification|send)\b/.test(featureText);
  const hasPayments = /\b(payment|billing|subscription|checkout|stripe)\b/.test(featureText);
  const hasAI = /\b(ai|llm|chat|assistant|model|gpt|openai|claude)\b/.test(featureText);
  const hasSearch = /\b(search|filter|query|find)\b/.test(featureText);
  const hasRealtime = /\b(realtime|websocket|live|pub.sub|multiplayer)\b/.test(featureText);
  const hasFileUpload = /\b(upload|file|image|media|storage)\b/.test(featureText);
  const hasAnalytics = /\b(analytics|metrics|dashboard|report|track)\b/.test(featureText);
  const hasMonitoring = /\b(monitor|error|crash|log|observability)\b/.test(featureText);

  // Detect explicit backend/DB technology choices in the description.
  // When the user already names a specific backend framework or database,
  // do NOT override their intent with an all-in-one managed platform bundle.
  const hasExplicitBackend = /\b(spring boot|spring framework|django|fastapi|flask|nestjs|nest\.js|express|laravel|rails|ruby on rails|go server|golang|rust server|hapi|koa|feathers|strapi|hasura|graphql server)\b/.test(descText);
  const hasExplicitDB = /\b(postgresql|postgres|mysql|mariadb|mongodb|cassandra|redis|dynamodb|cockroachdb|planetscale|turso|sqlite)\b/.test(descText);
  // If the user explicitly chose a backend or database, managed bundles would
  // contradict their specification — skip bundle detection entirely.
  const hasExplicitStack = hasExplicitBackend || hasExplicitDB;

  // Supabase bundle: Auth + Database + (Storage/Realtime/Edge)
  // Only fires when no explicit stack is mentioned, payments are absent, and the
  // project is not a dedicated backend (where Hasura is a better fit).
  if (hasAuth && hasDB && !hasPayments && !hasExplicitStack && type !== "backend_api") {
    return {
      name: "Supabase Full Stack",
      recommendedPlatform: "Supabase",
      rationale: "Auth, Database, Realtime, Storage, and Edge Functions in one platform with generous free tier",
      categories: ["authentication", "database", "storage", "websocket", "hosting"],
    };
  }

  // Firebase bundle: Auth + Database + Analytics + Notifications
  // Requires all three signals and no explicit stack override.
  if (hasAuth && hasDB && !hasExplicitStack && (hasAnalytics || hasEmail) && hasRealtime) {
    return {
      name: "Firebase/Google Cloud Bundle",
      recommendedPlatform: "Firebase",
      rationale: "Auth, Firestore, Analytics, Cloud Messaging, Functions — unified Google ecosystem",
      categories: ["authentication", "database", "analytics", "notifications", "hosting"],
    };
  }

  // Clerk + Stripe + Neon/Vercel: SaaS stack
  if (hasAuth && hasPayments && !hasAI) {
    return {
      name: "Modern SaaS Stack",
      recommendedPlatform: "Clerk + Stripe + Neon/Vercel",
      rationale: "Best-in-class auth (Clerk) + billing (Stripe) + serverless Postgres (Neon) + hosting (Vercel)",
      categories: ["authentication", "payments", "database", "hosting"],
    };
  }

  // Vercel AI SDK bundle: AI + Streaming + Data fetching
  if (hasAI && hasRealtime && !hasExplicitStack) {
    return {
      name: "Vercel AI SDK Stack",
      recommendedPlatform: "Vercel AI SDK + Neon + Vercel",
      rationale: "Provider-agnostic AI streaming, tool calling, and edge deployment with native Next.js integration",
      categories: ["aiProvider", "websocket", "dataFetching", "hosting", "database"],
    };
  }

  // All-in-one Backend: Database + Auth + API + Realtime
  if (hasDB && hasAuth && hasRealtime && type === "backend_api") {
    return {
      name: "Hasura/GraphQL Engine Bundle",
      recommendedPlatform: "Hasura + PostgreSQL",
      rationale: "Instant GraphQL API, Auth, Realtime subscriptions, and permissions over Postgres",
      categories: ["database", "authentication", "apiLayer", "websocket", "hosting"],
    };
  }

  // Analytics + Monitoring + Logging = Observability stack
  if (hasAnalytics && hasMonitoring) {
    return {
      name: "Observability Suite",
      recommendedPlatform: "PostHog or Datadog",
      rationale: "Unified analytics, session replay, error tracking, and logging in one platform",
      categories: ["analytics", "monitoring", "logging"],
    };
  }

  return null;
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

      const systemPrompt = "You are a Principal Engineer recommending software tools. " +
          "Only suggest real, verifiable packages. Accuracy matters more than completeness — " +
          "if you are unsure a package exists, set confidence to 'low'. Return JSON only.";
      const maxTokens = 1500;
      
      const r = shouldUseGroqKeyPool()
        ? await groqKeyPool.callWithRotation(
            MODELS.FAST,
            estimateGroqRequestTokens(systemPrompt, prompt, maxTokens),
            (apiKey) =>
              callGroqJsonWithKey({
                apiKey,
                systemPrompt,
                userPrompt: prompt,
                schema: tier2Schema,
                retries: 2,
                model: MODELS.FAST,
                maxTokens,
              })
          )
        : await claudeJson(
            systemPrompt,
            prompt,
            tier2Schema,
            2,
            MODELS.FAST,
            maxTokens
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
          confidence: entry ? "high" : ((c.confidence ?? "low") as "high" | "low"),
        };
      });

      // Dedup candidates by name (case-insensitive)
      candidates = Array.from(
        new Map(candidates.map((c) => [c.name.toLowerCase(), c])).values(),
      );

      candidates = applyAffinityRules(category, candidates, draft);
      const presentation = buildSuggestionPresentation(category, candidates, draft);

      const anyRegistryMatch = candidates.some((c) => c.source === "suggested");
      result = {
        category,
        tier: anyRegistryMatch ? "registry" : "community",
        candidates,
        recommendationSummary: presentation.recommendationSummary,
        tradeoffs: presentation.tradeoffs,
      };
    } catch (err) {
      console.warn(
        `[Suggestions] AI call failed for category "${category}" — using fallback.`,
        err instanceof Error ? err.message : err,
      );
      result = buildFallbackResult(category, eligibleTools, draft);
    }
  } else {
    result = buildFallbackResult(category, eligibleTools, draft);
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
  draft: DraftInput,
): SuggestionResult {
  if (eligibleTools.length > 0) {
    const candidates = eligibleTools.slice(0, 3).map((e, i) => ({
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
    }));
    const presentation = buildSuggestionPresentation(category, candidates, draft);
    return {
      category,
      tier: "registry",
      candidates,
      recommendationSummary: presentation.recommendationSummary,
      tradeoffs: presentation.tradeoffs,
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
    recommendationSummary:
      `No registry-backed default is available for ${humanizeCategory(category)} right now.`,
    tradeoffs: [
      "Manual validation is required because the suggestion engine could not ground this category in the local registry.",
    ],
  };
}
