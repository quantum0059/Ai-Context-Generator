import { z } from "zod";
import { claudeJson, isClaudeConfigured } from "@/lib/claude";
import { MODELS } from "@/lib/ai-models";
import type { RichFeature, RichFeatureSet } from "@/types/projectspec";

// ─── Request schema ───────────────────────────────────────────────────────────

const requestSchema = z.object({
  projectName: z.string().min(1),
  description: z.string().min(1),
  platform: z.string().optional(),
  projectType: z.string().optional(),
  /** Features the user has already typed/selected — we will NOT duplicate these */
  existingFeatures: z.array(z.string()).optional(),
});

// ─── Response Zod schema (mirrors RichFeature / RichFeatureSet) ───────────────

const richFeatureSchema = z.object({
  name: z.string().min(1),
  epic: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(["must-have", "should-have", "nice-to-have"]),
  userRole: z.string().min(1),
  acceptanceCriteria: z.array(z.string()).min(2).max(5),
  outOfScope: z.array(z.string()),
  dependsOn: z.array(z.string()),
  technicalImplications: z.array(z.string()),
});

const richFeatureSetSchema = z.object({
  epics: z
    .array(
      z.object({
        name: z.string().min(1),
        features: z.array(richFeatureSchema).min(1),
      }),
    )
    .min(1),
  criticalPath: z.array(z.string()).min(1),
  outOfScopeGlobal: z.array(z.string()),
});

// ─── Heuristic fallback (no AI configured) ───────────────────────────────────

/**
 * Produces a structured RichFeatureSet from pure heuristics when no AI
 * provider is available. Grouped by Epic with priorities, acceptance criteria,
 * and dependency edges derived from keyword analysis — NOT a hardcoded
 * IDE-centric pool.
 */
function heuristicRichFeatureSet(
  description: string,
  platform: string,
  projectType: string,
  existingFeatureNames: Set<string>,
): RichFeatureSet {
  const text = `${description} ${platform}`.toLowerCase();
  const isBackend = projectType === "BACKEND_API" || projectType === "HEADLESS_ENGINE";
  const isCli = projectType === "CLI_TOOL";
  const isLib = projectType === "LIBRARY_OR_SDK";
  const hasAuth = /\b(auth|login|sign.?in|account|user|team|member)\b/.test(text);
  const hasDB = /\b(database|storage|persist|record|crud|data)\b/.test(text);
  const hasPayments = /\b(payment|billing|subscription|checkout|stripe)\b/.test(text);
  const hasAI = /\b(ai|llm|chat|assistant|model|gpt|openai|claude)\b/.test(text);
  const hasSearch = /\b(search|filter|query|find)\b/.test(text);
  const hasNotifications = /\b(notify|notification|alert|email|push)\b/.test(text);
  const hasAnalytics = /\b(analytics|metrics|dashboard|report|track)\b/.test(text);
  const hasMedia = /\b(upload|image|file|video|media|storage)\b/.test(text);
  const hasAdmin = /\b(admin|manage|backoffice|moderator)\b/.test(text);
  const hasOnboarding = /\b(onboard|setup wizard|getting started|first.?run)\b/.test(text);

  type FeatureDef = Omit<RichFeature, "isUserProvided">;

  // Infrastructure / foundation
  const foundationFeatures: FeatureDef[] = [];
  if (hasDB && !isLib) {
    foundationFeatures.push({
      name: "Database Schema & Migrations",
      epic: "Core Infrastructure",
      description: "Define the data model, relationships, and migration strategy for persistent storage.",
      priority: "must-have",
      userRole: "system",
      acceptanceCriteria: [
        "All core domain entities have corresponding tables/collections",
        "Migrations are idempotent and can be rolled back",
        "Schema is documented with field descriptions",
      ],
      outOfScope: ["Application logic", "UI components"],
      dependsOn: [],
      technicalImplications: ["database", "ORM or query builder"],
    });
  }
  if (hasAuth && !isBackend && !isCli && !isLib) {
    foundationFeatures.push({
      name: "User Authentication",
      epic: "Core Infrastructure",
      description: "Secure sign-up, sign-in, session management, and password reset flows.",
      priority: "must-have",
      userRole: "end-user",
      acceptanceCriteria: [
        "User can register with email and password",
        "User can sign in and receives a valid session token",
        "Session expires after inactivity and user is redirected to login",
        "Password reset sends an email with a time-limited link",
      ],
      outOfScope: ["Social OAuth (unless specified)", "MFA setup"],
      dependsOn: ["Database Schema & Migrations"],
      technicalImplications: ["authentication", "database"],
    });
  }

  // Domain features
  const domainFeatures: FeatureDef[] = [];
  if (hasSearch) {
    domainFeatures.push({
      name: "Search & Filtering",
      epic: "Core Product",
      description: "Full-text and faceted search across the primary content type.",
      priority: "should-have",
      userRole: "end-user",
      acceptanceCriteria: [
        "User can enter a search query and see relevant results within 500 ms",
        "Results can be filtered by at least one attribute",
        "Empty-state is shown when no results match",
      ],
      outOfScope: ["AI-powered semantic search", "search analytics"],
      dependsOn: hasDB ? ["Database Schema & Migrations"] : [],
      technicalImplications: ["searchProvider", "database"],
    });
  }
  if (hasMedia) {
    domainFeatures.push({
      name: "File Upload & Management",
      epic: "Core Product",
      description: "Upload, store, and retrieve files (images, documents, or media) with validation.",
      priority: "should-have",
      userRole: "end-user",
      acceptanceCriteria: [
        "User can upload a file up to the configured size limit",
        "Unsupported file types are rejected with a clear error",
        "Uploaded files are retrievable via a stable URL",
      ],
      outOfScope: ["Video transcoding", "CDN configuration"],
      dependsOn: hasAuth ? ["User Authentication"] : [],
      technicalImplications: ["storage"],
    });
  }
  if (hasAI) {
    domainFeatures.push({
      name: "AI Integration",
      epic: "Core Product",
      description: "Connect to an AI provider to generate, analyse, or assist with content.",
      priority: "must-have",
      userRole: "end-user",
      acceptanceCriteria: [
        "AI responses are streamed to the user in real-time",
        "Errors from the AI provider are surfaced gracefully with a retry option",
        "Prompt context is scoped to the current session to avoid data leakage",
      ],
      outOfScope: ["Model fine-tuning", "on-device inference"],
      dependsOn: hasAuth ? ["User Authentication"] : [],
      technicalImplications: ["aiProvider"],
    });
  }

  // Monetisation
  const monetisationFeatures: FeatureDef[] = [];
  if (hasPayments) {
    monetisationFeatures.push({
      name: "Payment & Subscription",
      epic: "Monetisation",
      description: "Handle one-time payments or recurring subscriptions with a payment gateway.",
      priority: "must-have",
      userRole: "end-user",
      acceptanceCriteria: [
        "User can subscribe to a plan and is charged correctly",
        "Subscription status is reflected immediately in the UI",
        "Failed payments trigger a retry flow and user notification",
      ],
      outOfScope: ["Invoicing", "tax calculation", "multi-currency beyond gateway defaults"],
      dependsOn: hasAuth ? ["User Authentication"] : [],
      technicalImplications: ["payments", "authentication"],
    });
  }

  // Operations
  const operationsFeatures: FeatureDef[] = [];
  if (hasNotifications) {
    operationsFeatures.push({
      name: "Notification System",
      epic: "Operations & Engagement",
      description: "Send in-app, email, or push notifications for key user-facing events.",
      priority: "should-have",
      userRole: "end-user",
      acceptanceCriteria: [
        "Notifications are delivered within 30 seconds of the triggering event",
        "User can opt out of non-critical notifications",
        "Notifications link back to the relevant resource in the app",
      ],
      outOfScope: ["SMS notifications", "notification history older than 90 days"],
      dependsOn: hasAuth ? ["User Authentication"] : [],
      technicalImplications: ["email", "database"],
    });
  }
  if (hasAnalytics) {
    operationsFeatures.push({
      name: "Analytics Dashboard",
      epic: "Operations & Engagement",
      description: "Visualise key product metrics for operators or admins.",
      priority: "nice-to-have",
      userRole: "admin",
      acceptanceCriteria: [
        "Dashboard displays at least 3 core KPIs",
        "Data is refreshed at most every 5 minutes",
        "Charts are exportable as PNG or CSV",
      ],
      outOfScope: ["Real-time streaming analytics", "custom report builder"],
      dependsOn: hasDB ? ["Database Schema & Migrations"] : [],
      technicalImplications: ["analytics", "database"],
    });
  }
  if (hasAdmin) {
    operationsFeatures.push({
      name: "Admin Panel",
      epic: "Operations & Engagement",
      description: "Back-office interface for managing users, content, and configuration.",
      priority: "should-have",
      userRole: "admin",
      acceptanceCriteria: [
        "Admin can view and search all user accounts",
        "Admin can suspend or delete an account",
        "Admin actions are logged with a timestamp and actor",
      ],
      outOfScope: ["Analytics reporting", "billing management"],
      dependsOn: hasAuth ? ["User Authentication"] : [],
      technicalImplications: ["authentication", "database"],
    });
  }

  // Onboarding
  const uxFeatures: FeatureDef[] = [];
  if (hasOnboarding || (!isBackend && !isCli && !isLib)) {
    uxFeatures.push({
      name: "Onboarding Flow",
      epic: "User Experience",
      description: "Guide new users from registration to their first meaningful action.",
      priority: hasOnboarding ? "must-have" : "nice-to-have",
      userRole: "end-user",
      acceptanceCriteria: [
        "New user is presented with a guided flow after first sign-in",
        "User can skip the onboarding and access it again from settings",
        "Completion of onboarding is persisted so it is not re-shown",
      ],
      outOfScope: ["Interactive product tours", "in-app video tutorials"],
      dependsOn: hasAuth ? ["User Authentication"] : [],
      technicalImplications: ["frontendFramework", "database"],
    });
  }

  // Assemble epics, filtering out already-provided features
  function notProvided(f: FeatureDef): boolean {
    return !existingFeatureNames.has(f.name.toLowerCase());
  }

  const epics: RichFeatureSet["epics"] = [];

  const filteredFoundation = foundationFeatures.filter(notProvided);
  if (filteredFoundation.length > 0) epics.push({ name: "Core Infrastructure", features: filteredFoundation });

  const filteredDomain = domainFeatures.filter(notProvided);
  if (filteredDomain.length > 0) epics.push({ name: "Core Product", features: filteredDomain });

  const filteredMon = monetisationFeatures.filter(notProvided);
  if (filteredMon.length > 0) epics.push({ name: "Monetisation", features: filteredMon });

  const filteredOps = operationsFeatures.filter(notProvided);
  if (filteredOps.length > 0) epics.push({ name: "Operations & Engagement", features: filteredOps });

  const filteredUx = uxFeatures.filter(notProvided);
  if (filteredUx.length > 0) epics.push({ name: "User Experience", features: filteredUx });

  // If we produced nothing at all, push one generic placeholder
  if (epics.length === 0) {
    epics.push({
      name: "Core Product",
      features: [
        {
          name: "Core Feature",
          epic: "Core Product",
          description: "Primary functionality of the project.",
          priority: "must-have",
          userRole: "end-user",
          acceptanceCriteria: ["Feature behaves as described in the project brief", "Error states are handled gracefully"],
          outOfScope: [],
          dependsOn: [],
          technicalImplications: [],
        },
      ],
    });
  }

  // Derive critical path: foundation first, then domain, then the rest
  const allFeatures = epics.flatMap((e) => e.features);
  const criticalPath = allFeatures
    .filter((f) => f.priority === "must-have")
    .sort((a, b) => a.dependsOn.length - b.dependsOn.length)
    .map((f) => f.name);

  return {
    epics,
    criticalPath: criticalPath.length > 0 ? criticalPath : [allFeatures[0]?.name ?? "Core Feature"],
    outOfScopeGlobal: [
      "Third-party integrations not explicitly listed in the project description",
      "Internationalisation and localisation (unless specified)",
      "Automated DevOps / CI/CD pipeline setup",
    ],
  };
}

// ─── Flatten helper used by the wizard ───────────────────────────────────────

function flattenFeatureNames(set: RichFeatureSet): string[] {
  return set.epics.flatMap((epic) => epic.features.map((f) => f.name));
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const {
    projectName,
    description,
    platform = "web",
    projectType = "UI_APPLICATION",
    existingFeatures = [],
  } = parsed.data;

  // Build a normalised Set of already-provided feature names for deduplication
  const existingFeatureNames = new Set(existingFeatures.map((f) => f.toLowerCase()));

  // ── Heuristic path (no AI configured) ──────────────────────────────────────
  if (!isClaudeConfigured()) {
    const set = heuristicRichFeatureSet(description, platform, projectType, existingFeatureNames);
    return Response.json({
      ...set,
      features: flattenFeatureNames(set), // backwards-compat flat list
      engine: "heuristic",
    });
  }

  // ── AI path ─────────────────────────────────────────────────────────────────
  const systemPrompt = `You are a senior software architect performing structured feature extraction for a software project. Your output feeds directly into an AI-driven code generation pipeline, so it must be precise, complete, and architecturally sound.

Work through FIVE mandatory steps in order:

STEP 1 — PROJECT ANALYSIS
Read the description carefully. Identify:
- The primary domain and project type (${projectType})
- The key human actors (e.g. end-user, admin, guest, system)
- What the project explicitly will NOT do (these go into outOfScopeGlobal)

STEP 2 — EPIC GROUPING
Cluster all features into logical domains called Epics (e.g. "Core Infrastructure", "User Experience", "Monetisation", "Operations"). Each Epic must have at least one feature. Do NOT create an Epic for a single feature that could belong elsewhere.

STEP 3 — FEATURE DECOMPOSITION
For every feature, derive:
- priority: MoSCoW — "must-have" (cannot ship without it), "should-have" (high value, deferrable), "nice-to-have" (low urgency)
- userRole: the actor who uses this (end-user, admin, system, developer, guest)
- acceptanceCriteria: 2-4 specific, testable statements (NOT vague like "works correctly")
- outOfScope: 1-3 explicit boundaries that prevent scope creep on this single feature
- dependsOn: array of other feature NAMES that must exist before this can be built (empty array if none)
- technicalImplications: stack categories this feature will need (e.g. "database", "authentication", "aiProvider", "storage")

STEP 4 — DEDUPLICATION
Do NOT suggest any feature whose name (case-insensitive) is in this list: [${existingFeatures.join(", ") || "none"}].

STEP 5 — CRITICAL PATH
List the feature names in topological order — each name after the first depends on all previous ones. Start with foundational pieces (database schema, auth) and end with optional/nice-to-have integrations.

CRITICAL RULES:
- If projectType is HEADLESS_ENGINE or BACKEND_API: do NOT suggest UI dashboards, theme systems, or onboarding flows as features
- If projectType is CLI_TOOL: do NOT suggest frontend frameworks, browser APIs, or UI components
- If projectType is LIBRARY_OR_SDK: do NOT suggest auth, databases, or deployment pipelines
- Every feature name in criticalPath must exactly match a feature name inside epics
- dependsOn must only reference other feature names that appear in your epics list
- Return valid JSON only — no markdown, no code fences, no explanation

JSON structure:
{
  "epics": [
    {
      "name": "Epic Name",
      "features": [
        {
          "name": "Feature Name",
          "epic": "Epic Name",
          "description": "One sentence describing what the user gets",
          "priority": "must-have | should-have | nice-to-have",
          "userRole": "end-user | admin | system | developer | guest",
          "acceptanceCriteria": ["Specific testable statement 1", "Specific testable statement 2"],
          "outOfScope": ["Thing this feature will NOT do"],
          "dependsOn": ["Other Feature Name"],
          "technicalImplications": ["database", "authentication"]
        }
      ]
    }
  ],
  "criticalPath": ["Feature A", "Feature B", "Feature C"],
  "outOfScopeGlobal": ["Thing the entire project will not do"]
}`;

  const userPrompt = `Extract features for this project:

Project Name: ${projectName}
Description: ${description}
Platform: ${platform}
Project Type: ${projectType}

Features the user already has (DO NOT duplicate these): ${existingFeatures.length > 0 ? existingFeatures.join(", ") : "none"}

Suggest 6-12 features in total across all epics. Make every feature specific to THIS project — not generic boilerplate that would apply to any app. Think about what a real architect would scope and sequence for this exact product.`;

  try {
    const result = await claudeJson(
      systemPrompt,
      userPrompt,
      richFeatureSetSchema,
      0,
      MODELS.REASONING,
    );

    // Secondary deduplication pass: strip any feature the AI hallucinated anyway
    const deduped: typeof result = {
      ...result,
      epics: result.epics.map((epic) => ({
        ...epic,
        features: epic.features.filter(
          (f) => !existingFeatureNames.has(f.name.toLowerCase()),
        ),
      })).filter((epic) => epic.features.length > 0),
    };

    return Response.json({
      ...deduped,
      features: flattenFeatureNames(deduped), // backwards-compat flat list
      engine: "ai",
    });
  } catch (err) {
    console.error("[SuggestFeatures Error]", err);
    // Graceful structured fallback — never returns the old flat-array shape
    const set = heuristicRichFeatureSet(description, platform, projectType, existingFeatureNames);
    return Response.json({
      ...set,
      features: flattenFeatureNames(set),
      engine: "heuristic",
      error: err instanceof Error ? err.message : "AI call failed",
    });
  }
}
