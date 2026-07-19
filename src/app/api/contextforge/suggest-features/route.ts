import { z } from "zod";
import { isClaudeConfigured } from "@/lib/claude";
import type { Feature, FeatureSet } from "@/types/projectspec";
import { normalizeAndGroupFeatures } from "@/contextforge/feature-pipeline";
import { withCompression } from "@/lib/compression";

// ─── Request schema ───────────────────────────────────────────────────────────

const requestSchema = z.object({
  projectName: z.string().min(1),
  description: z.string().min(1),
  platform: z.string().optional(),
  projectType: z.string().optional(),
  /** Features the user has already typed/selected — we will NOT duplicate these */
  existingFeatures: z.array(z.string()).optional(),
  /** Functional requirements extracted in the previous step */
  functionalRequirements: z.array(z.any()).optional(),
});

// ─── Product-archetype inference (vague-description fallback) ─────────────────

type FeatureDefBase = Omit<Feature, "isUserProvided">;

/**
 * When a description names no concrete features, infer the baseline feature
 * set a comparable real product in the same category would ship. This is the
 * deterministic stand-in for "look up what products like this normally do":
 * it maps the description to a product archetype and returns that archetype's
 * standard features. Only used by the heuristic path (no AI configured).
 */
function archetypeFeatures(text: string, projectType: string): FeatureDefBase[] {
  // Backend/CLI/library projects do not get UI-centric archetype features.
  if (projectType === "CLI_TOOL" || projectType === "LIBRARY_OR_SDK") return [];

  const f = (
    name: string,
    description: string,
    priority: Feature["priority"],
    dependencies: string[] = [],
  ): FeatureDefBase => ({
    id: `feat-${name.toLowerCase().replace(/\s+/g, "-")}`,
    title: name,
    epic: "Core Product",
    description,
    priority,
    dependencies,
    source: "implicit",
    functionalRequirementIds: [],
  });

  const archetypes: Array<{ match: RegExp; features: FeatureDefBase[] }> = [
    {
      match: /\b(marketplace|classified|listing|buy and sell|two[- ]sided)\b/,
      features: [
        f("Listing Creation & Management", "Sellers can create, edit, and remove listings with images and pricing.", "must"),
        f("Browse & Search Listings", "Buyers can browse, search, and filter available listings.", "must"),
        f("Buyer–Seller Messaging", "Buyers and sellers communicate about a listing in-app.", "should"),
      ],
    },
    {
      match: /\b(booking|reservation|appointment|schedule|calendar)\b/,
      features: [
        f("Availability & Scheduling", "Providers publish availability and customers book open slots.", "must"),
        f("Booking Management", "Customers and providers view, reschedule, and cancel bookings.", "must"),
        f("Reminders & Notifications", "Automated reminders reduce no-shows.", "should"),
      ],
    },
    {
      match: /\b(social|community|feed|follow|post|share)\b/,
      features: [
        f("User Profiles", "Members have a public profile with their activity.", "must"),
        f("Content Feed", "Members create posts and see a personalised feed.", "must"),
        f("Follow & Engagement", "Members follow others and react to content.", "should"),
      ],
    },
    {
      match: /\b(saas|dashboard|b2b|productivity|management tool|internal tool|crm|erp)\b/,
      features: [
        f("Workspace & Team Management", "Users work inside a shared workspace with roles.", "must"),
        f("Core Records Management", "Users create, view, update, and delete the primary domain records.", "must"),
        f("Reporting & Insights", "Users see key metrics for their workspace.", "should"),
      ],
    },
    {
      match: /\b(shop|store|e[- ]?commerce|cart|product catalog|retail)\b/,
      features: [
        f("Product Catalog", "Shoppers browse products organised by category.", "must"),
        f("Shopping Cart & Checkout", "Shoppers add items to a cart and check out.", "must"),
        f("Order History", "Customers review their past orders and status.", "should"),
      ],
    },
    {
      match: /\b(blog|cms|publication|magazine|news|editorial|articles?)\b/,
      features: [
        f("Content Authoring", "Authors write and publish richly formatted content.", "must"),
        f("Content Browsing", "Readers browse and read published content.", "must"),
        f("Categories & Search", "Readers find content by topic or search.", "should"),
      ],
    },
  ];

  for (const archetype of archetypes) {
    if (archetype.match.test(text)) return archetype.features;
  }

  // Generic UI application baseline when no specific archetype matches but the
  // project clearly has an interface. Better than a lone "Core Feature" stub.
  return [
    f("Primary User Workflow", "The main end-to-end task the product exists to support.", "must"),
    f("Content or Data Management", "Users create and manage the core data the product works with.", "must"),
    f("Account & Settings", "Users manage their profile and preferences.", "should"),
  ];
}

// ─── Heuristic fallback (no AI configured) ───────────────────────────────────

/**
 * Produces a structured RichFeatureSet from pure heuristics when no AI
 * provider is available. Grouped by Epic with priorities, acceptance criteria,
 * and dependency edges derived from keyword analysis — NOT a hardcoded
 * IDE-centric pool.
 */
function heuristicFeatureSet(
  description: string,
  platform: string,
  projectType: string,
  existingFeatureNames: Set<string>,
): FeatureSet {
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

  type FeatureDef = Omit<Feature, "isUserProvided">;

  // Infrastructure / foundation
  const foundationFeatures: FeatureDef[] = [];
  if (hasDB && !isLib) {
    foundationFeatures.push({
      id: "feat-db",
      title: "Database Schema & Migrations",
      epic: "Core Infrastructure",
      description: "Define the data model, relationships, and migration strategy for persistent storage.",
      priority: "must",
      dependencies: [],
      source: "implicit",
      functionalRequirementIds: [],
    });
  }
  if (hasAuth && !isBackend && !isCli && !isLib) {
    foundationFeatures.push({
      id: "feat-auth",
      title: "User Authentication",
      epic: "Core Infrastructure",
      description: "Secure sign-up, sign-in, session management, and password reset flows.",
      priority: "must",
      dependencies: ["Database Schema & Migrations"],
      source: "implicit",
      functionalRequirementIds: [],
    });
  }

  // Domain features
  const domainFeatures: FeatureDef[] = [];
  if (hasSearch) {
    domainFeatures.push({
      id: "feat-search",
      title: "Search & Filtering",
      epic: "Core Product",
      description: "Full-text and faceted search across the primary content type.",
      priority: "should",
      dependencies: hasDB ? ["Database Schema & Migrations"] : [],
      source: "implicit",
      functionalRequirementIds: [],
    });
  }
  if (hasMedia) {
    domainFeatures.push({
      id: "feat-media",
      title: "File Upload & Management",
      epic: "Core Product",
      description: "Upload, store, and retrieve files (images, documents, or media) with validation.",
      priority: "should",
      dependencies: hasAuth ? ["User Authentication"] : [],
      source: "implicit",
      functionalRequirementIds: [],
    });
  }
  if (hasAI) {
    domainFeatures.push({
      id: "feat-ai",
      title: "AI Integration",
      epic: "Core Product",
      description: "Connect to an AI provider to generate, analyse, or assist with content.",
      priority: "must",
      dependencies: hasAuth ? ["User Authentication"] : [],
      source: "implicit",
      functionalRequirementIds: [],
    });
  }

  // Monetisation
  const monetisationFeatures: FeatureDef[] = [];
  if (hasPayments) {
    monetisationFeatures.push({
      id: "feat-pay",
      title: "Payment & Subscription",
      epic: "Monetisation",
      description: "Handle one-time payments or recurring subscriptions with a payment gateway.",
      priority: "must",
      dependencies: hasAuth ? ["User Authentication"] : [],
      source: "implicit",
      functionalRequirementIds: [],
    });
  }

  // Operations
  const operationsFeatures: FeatureDef[] = [];
  if (hasNotifications) {
    operationsFeatures.push({
      id: "feat-notify",
      title: "Notification System",
      epic: "Operations & Engagement",
      description: "Send in-app, email, or push notifications for key user-facing events.",
      priority: "should",
      dependencies: hasAuth ? ["User Authentication"] : [],
      source: "implicit",
      functionalRequirementIds: [],
    });
  }
  if (hasAnalytics) {
    operationsFeatures.push({
      id: "feat-analytics",
      title: "Analytics Dashboard",
      epic: "Operations & Engagement",
      description: "Visualise key product metrics for operators or admins.",
      priority: "nice",
      dependencies: hasDB ? ["Database Schema & Migrations"] : [],
      source: "implicit",
      functionalRequirementIds: [],
    });
  }
  if (hasAdmin) {
    operationsFeatures.push({
      id: "feat-admin",
      title: "Admin Panel",
      epic: "Operations & Engagement",
      description: "Back-office interface for managing users, content, and configuration.",
      priority: "should",
      dependencies: hasAuth ? ["User Authentication"] : [],
      source: "implicit",
      functionalRequirementIds: [],
    });
  }

  // Onboarding
  const uxFeatures: FeatureDef[] = [];
  if (hasOnboarding || (!isBackend && !isCli && !isLib)) {
    uxFeatures.push({
      id: "feat-onboard",
      title: "Onboarding Flow",
      epic: "User Experience",
      description: "Guide new users from registration to their first meaningful action.",
      priority: hasOnboarding ? "must" : "nice",
      dependencies: hasAuth ? ["User Authentication"] : [],
      source: "implicit",
      functionalRequirementIds: [],
    });
  }

  // Assemble epics, filtering out already-provided features
  function notProvided(f: FeatureDef): boolean {
    return !existingFeatureNames.has(f.title.toLowerCase());
  }

  const epics: FeatureSet["epics"] = [];

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

  // If keyword analysis produced nothing (a vague description that names no
  // concrete features), infer the baseline feature set from the product
  // archetype instead of emitting a single useless "Core Feature" placeholder.
  if (epics.length === 0) {
    const inferred = archetypeFeatures(text, projectType).filter(notProvided);
    if (inferred.length > 0) {
      epics.push({ name: "Core Product", features: inferred });
    } else {
      epics.push({
        name: "Core Product",
        features: [
          {
            id: "feat-core",
            title: "Core Feature",
            epic: "Core Product",
            description: "Primary functionality of the project.",
            priority: "must",
            dependencies: [],
            source: "implicit",
            functionalRequirementIds: [],
          },
        ],
      });
    }
  }

  // Derive critical path: foundation first, then domain, then the rest
  const allFeatures = epics.flatMap((e) => e.features);
  const criticalPath = allFeatures
    .filter((f) => f.priority === "must")
    .sort((a, b) => a.dependencies.length - b.dependencies.length)
    .map((f) => f.title);

  return {
    epics,
    criticalPath: criticalPath.length > 0 ? criticalPath : [allFeatures[0]?.title ?? "Core Feature"],
    outOfScopeGlobal: [
      "Third-party integrations not explicitly listed in the project description",
      "Internationalisation and localisation (unless specified)",
      "Automated DevOps / CI/CD pipeline setup",
    ],
  };
}

// ─── Flatten helper used by the wizard ───────────────────────────────────────

function flattenFeatureNames(set: FeatureSet): string[] {
  return set.epics.flatMap((epic) => epic.features.map((f) => f.title));
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
    functionalRequirements = [],
  } = parsed.data;

  // Build a normalised Set of already-provided feature names for deduplication
  const existingFeatureNames = new Set(existingFeatures.map((f) => f.toLowerCase()));

  // ── Heuristic path (no AI configured) ──────────────────────────────────────
  if (!isClaudeConfigured() || functionalRequirements.length === 0) {
    const set = heuristicFeatureSet(description, platform, projectType, existingFeatureNames);
    return withCompression({
      ...set,
      features: flattenFeatureNames(set), // backwards-compat flat list
      engine: "heuristic",
    }, req);
  }

  // ── AI path ─────────────────────────────────────────────────────────────────
  try {
    const result = await normalizeAndGroupFeatures(
      functionalRequirements,
      projectName,
      existingFeatures
    );

    // Secondary deduplication pass: strip any feature the AI hallucinated anyway
    const deduped: typeof result = {
      ...result,
      epics: result.epics.map((epic) => ({
        ...epic,
        features: epic.features.filter(
          (f) => !existingFeatureNames.has(f.title.toLowerCase()),
        ),
      })).filter((epic) => epic.features.length > 0),
    };

    return withCompression({
      ...deduped,
      features: flattenFeatureNames(deduped), // backwards-compat flat list
      engine: "ai",
    }, req);
  } catch (err) {
    console.error("[SuggestFeatures Error]", err);
    // Graceful structured fallback
    const set = heuristicFeatureSet(description, platform, projectType, existingFeatureNames);
    return withCompression({
      ...set,
      features: flattenFeatureNames(set),
      engine: "heuristic",
      error: err instanceof Error ? err.message : "AI call failed",
    }, req);
  }
}
