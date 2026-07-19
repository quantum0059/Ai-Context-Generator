import { z } from "zod";
import { claudeJson, isClaudeConfigured } from "../lib/claude";
import { extractProjectConstraints } from "./constraint-extractor";
import {
  callGroqJsonWithKey,
  estimateGroqRequestTokens,
  groqKeyPool,
  shouldUseGroqKeyPool,
} from "./groq-key-pool";
import type {
  ArchitecturalRequirements,
  DomainModel,
  EdgeCase,
  FunctionalRequirement,
  NonFunctionalRequirements,
  ProjectConstraints,
} from "../types/projectspec";
import { MODELS } from "../lib/ai-models";

// ─── Zod schemas ─────────────────────────────────────────────────────────────

const domainModelSchema = z.object({
  actors: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      permissions: z.array(z.string()).optional(),
    }),
  ),
  entities: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      attributes: z.array(z.string()),
      relatedEntities: z.array(z.string()),
    }),
  ),
  coreWorkflows: z.array(z.string()),
});

const functionalRequirementSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  type: z.enum(["explicit", "implicit"]).catch("implicit"),
  actors: z.array(z.string()),
  priority: z.enum(["must-have", "should-have", "nice-to-have"]).catch("should-have"),
});

const nonFunctionalSchema = z.object({
  performance: z.array(z.string()),
  security: z.array(z.string()),
  scalability: z.array(z.string()),
  availability: z.array(z.string()),
  accessibility: z.array(z.string()),
  compliance: z.array(z.string()),
  maintainability: z.array(z.string()),
  other: z.array(z.string()),
});

const edgeCaseSchema = z.object({
  scenario: z.string(),
  expectedBehaviour: z.string(),
  category: z.enum([
    "network",
    "data",
    "auth",
    "concurrency",
    "input-validation",
    "external-service",
    "other",
  ]).catch("other"),
});

const architecturalAnalysisSchema = z.object({
  businessGoals: z.array(z.string()).min(1),
  successCriteria: z.array(z.string()).min(1),
  targetAudience: z.array(z.string()).min(1),
  domain: domainModelSchema,
  functional: z.array(functionalRequirementSchema).min(1),
  nonFunctional: nonFunctionalSchema,
  edgeCases: z.array(edgeCaseSchema).min(1),
});

// ─── Heuristic fallback ───────────────────────────────────────────────────────

function heuristicRequirements(
  description: string,
  platform: string,
  constraints: ProjectConstraints,
): ArchitecturalRequirements {
  const text = description.toLowerCase();
  const isWeb = ["web", "browser-extension"].includes(platform);
  const isMobile = ["mobile-ios-android", "ios", "android"].includes(platform);
  const isDesktop = platform === "desktop";
  const isCli = platform === "cli";

  // Business goals — inferred from verbs and domain
  const businessGoals: string[] = [
    `Deliver a ${platform} application that fulfils the following: ${description.slice(0, 120)}`,
  ];

  // Audience
  const targetAudience = constraints.targetAudience ?? ["End users of the application"];

  // Domain — minimal skeleton
  const actors: DomainModel["actors"] = [{ name: "User", description: "Primary user of the application" }];
  if (/\b(admin|administrator|manager)\b/.test(text)) {
    actors.push({ name: "Admin", description: "Administrator with elevated privileges", permissions: ["manage users", "view all data"] });
  }

  const entities: DomainModel["entities"] = [];
  if (/\b(user|account|profile)\b/.test(text)) {
    entities.push({ name: "User", description: "Application user account", attributes: ["id", "name", "email", "createdAt"], relatedEntities: [] });
  }
  if (/\b(product|item|listing)\b/.test(text)) {
    entities.push({ name: "Product", description: "Core item managed by the system", attributes: ["id", "name", "description", "price"], relatedEntities: ["User"] });
  }
  if (/\b(order|purchase|transaction)\b/.test(text)) {
    entities.push({ name: "Order", description: "Purchase transaction", attributes: ["id", "total", "status", "createdAt"], relatedEntities: ["User", "Product"] });
  }
  if (entities.length === 0) {
    entities.push({ name: "Record", description: "Primary data record managed by this application", attributes: ["id", "createdAt", "updatedAt"], relatedEntities: [] });
  }

  const coreWorkflows = ["User onboarding", "Core CRUD operations", "Data retrieval and display"];
  if (/\b(auth|login|sign.?in)\b/.test(text)) coreWorkflows.push("Authentication and session management");
  if (/\b(payment|checkout)\b/.test(text)) coreWorkflows.push("Payment processing");
  if (/\b(search)\b/.test(text)) coreWorkflows.push("Search and filtering");

  // Functional requirements
  const functional: FunctionalRequirement[] = [
    {
      id: "FR-001",
      title: "Core application functionality",
      description: description.slice(0, 200),
      type: "explicit",
      actors: ["User"],
      priority: "must-have",
    },
  ];
  if (/\b(auth|login|sign.?in|register|signup)\b/.test(text)) {
    functional.push({
      id: "FR-002",
      title: "User authentication",
      description: "Users must be able to register, log in, and manage their sessions securely.",
      type: "explicit",
      actors: ["User"],
      priority: "must-have",
    });
  }
  if (/\b(offline)\b/.test(text)) {
    functional.push({
      id: `FR-${String(functional.length + 1).padStart(3, "0")}`,
      title: "Offline operation",
      description: "The application must work entirely without an internet connection.",
      type: "explicit",
      actors: ["User"],
      priority: "must-have",
    });
  }
  // Implicit: any mobile app needs push notifications capability
  if (isMobile && /\b(notification|alert|remind)\b/.test(text)) {
    functional.push({
      id: `FR-${String(functional.length + 1).padStart(3, "0")}`,
      title: "Push notifications",
      description: "The app must support push notifications to alert users of important events.",
      type: "implicit",
      actors: ["User"],
      priority: "should-have",
    });
  }

  // NFRs
  const nfr: NonFunctionalRequirements = {
    performance: [
      isWeb ? "Page load time under 3 seconds on a 4G connection" : "",
      isMobile ? "App launch time under 2 seconds on mid-range devices" : "",
      "Core operations must complete within 500ms",
    ].filter(Boolean),
    security: [
      "All user input must be validated and sanitised before processing",
      "Sensitive data must not be logged in plaintext",
      constraints.mustBeOffline ? "All data at rest must be stored securely on the local device" : "Data in transit must use TLS 1.2+",
    ].filter(Boolean),
    scalability: [
      isCli || isDesktop ? "Must handle large input files without memory exhaustion" : "Must support concurrent users without degradation",
    ],
    availability: [
      constraints.mustBeOffline ? "Application must function 100% offline with no degradation" : "99.9% uptime target for production deployment",
    ],
    accessibility: [
      isWeb || isMobile ? "Must meet WCAG 2.1 AA accessibility standards" : "Must support keyboard-only navigation",
    ],
    compliance: constraints.compliance ?? [],
    maintainability: [
      "All modules must have unit test coverage ≥ 80%",
      "Code must pass TypeScript strict mode without errors",
    ],
    other: [],
  };

  // Edge cases
  const edgeCases: EdgeCase[] = [
    {
      scenario: "User submits an empty or malformed form",
      expectedBehaviour: "Display a clear validation error message; do not process the request",
      category: "input-validation",
    },
    {
      scenario: "Database or storage layer is unavailable",
      expectedBehaviour: "Show a user-friendly error; log the failure; do not crash the application",
      category: "data",
    },
  ];
  if (!constraints.mustBeOffline) {
    edgeCases.push({
      scenario: "External API or third-party service is unreachable or rate-limited",
      expectedBehaviour: "Retry with exponential backoff; surface a meaningful error to the user after max retries",
      category: "external-service",
    });
    edgeCases.push({
      scenario: "Network connection is lost mid-operation",
      expectedBehaviour: "Detect the disconnection, preserve in-flight work, and allow retry when connection is restored",
      category: "network",
    });
  }
  if (/\b(auth|login)\b/.test(text)) {
    edgeCases.push({
      scenario: "Authentication token or session expires during an active session",
      expectedBehaviour: "Redirect the user to the login page; preserve navigation state for post-login redirect",
      category: "auth",
    });
  }

  return {
    businessGoals,
    successCriteria: [
      "All must-have functional requirements are implemented and pass automated tests",
      "The application deploys successfully to the target platform",
      "Core user workflows complete without errors",
    ],
    targetAudience,
    domain: { actors, entities, coreWorkflows },
    functional,
    nonFunctional: nfr,
    edgeCases,
    constraints,
  };
}

// ─── AI-powered extraction ────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a Senior Software Architect conducting a formal requirement extraction and domain analysis session. Your job is to think the way an architect does when they first read a project brief — NOT to build, but to deeply understand.

You must extract ALL of the following from the project description:

1. BUSINESS GOALS — Why is this software being built? What business problem does it solve? What value does it deliver?
2. SUCCESS CRITERIA — How will the stakeholders know this project succeeded? These are measurable outcomes.
3. TARGET AUDIENCE — Who are the intended users? Describe each user type (persona).
4. DOMAIN MODEL — What are the core entities (nouns) in this system? Who are the actors? What are their attributes and relationships? What are the core workflows?
5. FUNCTIONAL REQUIREMENTS — Every independent user-facing capability must become its own Functional Requirement. Do not collapse multiple capabilities into generic requirements such as "AI Enhancements", "Image Editing", or "Media Processing". If a project explicitly mentions Background Removal, Upscaling, Multiple AI Models, Cloud Storage, Style Presets, Generation Settings, Cross-device Sync, or similar capabilities, each must become an independent Functional Requirement. Format as FR-001, FR-002, etc.
6. NON-FUNCTIONAL REQUIREMENTS — Performance targets, security mandates, scalability needs, availability requirements, accessibility standards, regulatory compliance (GDPR, HIPAA, PCI-DSS, etc.), and maintainability expectations.
7. EDGE CASES — What can go wrong? List failure modes, boundary conditions, race conditions, and error states the system must handle gracefully.

Rules:
- Think like an architect who has seen many similar projects fail due to overlooked requirements.
- Implicit requirements are AS important as explicit ones. Flag them clearly.
- Do NOT suggest a tech stack — you are only extracting requirements.
- Return valid JSON only, matching the schema exactly.`;

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Full architectural requirement extraction pipeline.
 *
 * Runs in two parallel tracks:
 *   Track A — AI reasoning (domain model, functional, NFRs, edge cases, goals)
 *   Track B — Hard constraint detection (existing constraint-extractor logic)
 *
 * Falls back to a deterministic heuristic when no AI is configured.
 */
export async function extractArchitecturalRequirements(
  description: string,
  platform: string,
  projectName: string,
): Promise<ArchitecturalRequirements> {
  // Always run the constraint extractor — it runs independently of the main AI call
  const constraintsPromise = extractProjectConstraints(description, platform);

  if (!isClaudeConfigured()) {
    const constraints = await constraintsPromise;
    return heuristicRequirements(description, platform, constraints);
  }

  // Run AI analysis and constraint extraction in parallel
  const [aiResult, constraints] = await Promise.allSettled([
    runAiAnalysis(description, platform, projectName),
    constraintsPromise,
  ]);

  const resolvedConstraints: ProjectConstraints =
    constraints.status === "fulfilled"
      ? constraints.value
      : {
          mustBeOffline: false,
          mustUseLocalStorage: false,
          forbiddenCategories: [],
          forbiddenTools: [],
          requiredToolTypes: [],
          rawConstraints: [],
        };

  if (aiResult.status === "rejected") {
    console.warn("[RequirementExtractor] AI analysis failed, using heuristic fallback:", aiResult.reason);
    return heuristicRequirements(description, platform, resolvedConstraints);
  }

  // Merge: AI result provides the rich analysis; constraint extractor provides hard technical constraints
  const ai = aiResult.value;
  return {
    businessGoals: ai.businessGoals,
    successCriteria: ai.successCriteria,
    targetAudience: ai.targetAudience,
    domain: ai.domain as DomainModel,
    functional: ai.functional as FunctionalRequirement[],
    nonFunctional: ai.nonFunctional as NonFunctionalRequirements,
    edgeCases: ai.edgeCases as EdgeCase[],
    // The constraint extractor has deterministic rules that the AI prompt
    // cannot override — merge the hard flags onto whatever compliance
    // the AI found in the NFR section.
    constraints: {
      ...resolvedConstraints,
      compliance: [
        ...(resolvedConstraints.compliance ?? []),
        ...ai.nonFunctional.compliance,
      ].filter((v, i, a) => a.indexOf(v) === i), // deduplicate
    },
  };
}

async function runAiAnalysis(
  description: string,
  platform: string,
  projectName: string,
) {
  const userPrompt = `Perform a full architectural requirement extraction for this project.

Project Name: ${projectName}
Platform: ${platform}
Description:
${description}

Critical rules:
- functional must be EXTREMELY granular — every independent user-facing capability is its own FR. DO NOT collapse (e.g. 'Background removal' and 'Upscaling' must be separate FRs).
- functional must include BOTH explicit (stated) AND implicit (inferred) requirements.
- nonFunctional must have at least one entry per sub-category where applicable; use [] only if truly not applicable.
- edgeCases must include at least 5 realistic failure scenarios for this specific domain.
- Every string must be specific to THIS project — no generic boilerplate.

Return ONLY valid JSON exactly matching this structure:
{
  "businessGoals": ["string"],
  "successCriteria": ["string"],
  "targetAudience": ["string"],
  "domain": {
    "actors": [
      {
        "name": "string",
        "description": "string",
        "permissions": ["string"]
      }
    ],
    "entities": [
      {
        "name": "string",
        "description": "string",
        "attributes": ["string"],
        "relatedEntities": ["string"]
      }
    ],
    "coreWorkflows": ["string"]
  },
  "functional": [
    {
      "id": "string",
      "title": "string",
      "description": "string",
      "type": "explicit" | "implicit",
      "actors": ["string"],
      "priority": "must-have" | "should-have" | "nice-to-have"
    }
  ],
  "nonFunctional": {
    "performance": ["string"],
    "security": ["string"],
    "scalability": ["string"],
    "availability": ["string"],
    "accessibility": ["string"],
    "compliance": ["string"],
    "maintainability": ["string"],
    "other": ["string"]
  },
  "edgeCases": [
    {
      "scenario": "string",
      "expectedBehaviour": "string",
      "category": "auth" | "data" | "network" | "ui" | "external-service" | "input-validation" | "other"
    }
  ]
}`;

  const maxTokens = 6000;

  // Output budget: 6000 tokens.
  // Since discoverCategories was moved to the 20b model, this extractor has the ENTIRE
  // 8000 TPM limit (120b bucket) to itself! 6000 maxTokens + ~1500 input tokens = 7500 TPM.
  // This perfectly fits the free tier limit while giving massive projects enough room to finish.
  if (shouldUseGroqKeyPool()) {
    const estimatedTokens = estimateGroqRequestTokens(SYSTEM_PROMPT, userPrompt, maxTokens);
    return groqKeyPool.callWithRotation(
      MODELS.CONTENT,
      estimatedTokens,
      (apiKey) =>
        callGroqJsonWithKey({
          apiKey,
          systemPrompt: SYSTEM_PROMPT,
          userPrompt,
          schema: architecturalAnalysisSchema,
          retries: 0,
          model: MODELS.CONTENT,
          maxTokens,
        }),
    );
  }

  return await claudeJson(
    SYSTEM_PROMPT,
    userPrompt,
    architecturalAnalysisSchema,
    0,
    MODELS.CONTENT,
    maxTokens,
  );
}
