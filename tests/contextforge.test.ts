import { describe, expect, it } from "vitest";
import { assemblePackage } from "../src/contextforge/assembler";
import { discoverCategories } from "../src/contextforge/discovery";
import { finalizeProjectSpec } from "../src/contextforge/spec";
import { suggestForCategory } from "../src/contextforge/suggestions";
import type { DraftInput } from "../src/types/projectspec";
import { inferPlatform } from "../src/lib/inferPlatform";
import { sanitizeConflictReport } from "../src/contextforge/conflicts";
import type { ConflictReport, ProjectSpec } from "../src/types/projectspec";
import { getAspectTestCode, getAspectAcceptanceCriteria, richFallbackPrompt } from "../src/contextforge/generators/prompt-builder";
import { derivedEntitiesFromFeatures } from "../src/contextforge/generators/shared";

const draft: DraftInput = {
  projectName: "LingoQuest",
  description:
    "A Duolingo-inspired language learning mobile app with an AI chat tutor, video lessons and XP progression.",
  platform: "mobile-ios-android",
  features: ["Authentication", "AI Chat Tutor", "Video Lessons"],
  constraints: { budget: "free tiers only", avoid: ["Firebase"] },
};

describe("platform inference", () => {
  it("derives mobile targets from the project description", () => {
    expect(inferPlatform("A mobile app for iOS and Android learners")).toBe("mobile-ios-android");
  });

  it("defaults unspecified applications to web", () => {
    expect(inferPlatform("A project management application for teams")).toBe("web");
  });
});

describe("conflict report reconciliation", () => {
  it("removes false conflicts for resolved custom tools and a separate local dashboard", () => {
    const spec = {
      id: "offline-mentor",
      projectName: "Offline Mentor",
      description: "A fully offline personal programming mentor with AST parsing and complexity analysis.",
      platform: "web",
      features: ["AST Analysis"],
      requiredCategories: ["runtime", "astParser", "complexityAnalysis", "algorithmRecognition", "dashboardUi"],
      stack: {
        runtime: { value: "Node.js + TypeScript", source: "suggested" },
        astParser: { value: "tree-sitter", source: "suggested" },
        complexityAnalysis: { value: "Custom AST rules engine", source: "suggested" },
        algorithmRecognition: { value: "Custom pattern matcher", source: "suggested" },
        dashboardUi: { value: "Vite + React + Tailwind CSS", source: "suggested" },
        codeExecution: { value: "Node.js child_process", source: "suggested" },
      },
      constraints: {},
      projectSpecVersion: "1.0.0",
      projectType: "HEADLESS_ENGINE",
    } satisfies ProjectSpec;
    const item = (description: string, offendingTool: string, type = "MISSING_CRITICAL_TOOL") => ({
      severity: "blocking" as const,
      type,
      description,
      offendingTool,
      conflictingRequirement: description,
      suggestion: "Use another tool",
    });
    const report: ConflictReport = {
      hasBlockingConflicts: true,
      hasWarnings: false,
      conflicts: [
        item("The project requires a custom AST rules engine, but no tool was chosen.", ""),
        item("The project requires a custom pattern matcher, but no tool was chosen.", ""),
        item("CPU-intensive processing is not suited to Vite + React.", "Vite + React", "PERFORMANCE_CONFLICT"),
        item("The project is a CLI tool, but a frontend framework was chosen.", "Vite + React", "PLATFORM_CONFLICT"),
      ],
      warnings: [],
    };

    expect(sanitizeConflictReport(report, spec)).toEqual({
      hasBlockingConflicts: false,
      hasWarnings: false,
      conflicts: [],
      warnings: [],
    });
  });
});

describe("dynamic category discovery (offline heuristic)", () => {
  it("detects AI and video categories from description/features", async () => {
    const { requiredCategories, engine } = await discoverCategories(draft);
    expect(engine).toBe("heuristic");
    expect(requiredCategories).toContain("aiProvider");
    expect(requiredCategories).toContain("videoProvider");
    expect(requiredCategories).toContain("authentication");
  });

  it("uses description and selected features instead of a fixed web stack", async () => {
    const result = await discoverCategories({
      projectName: "Code Analyzer",
      description: "An offline headless engine that parses source code and generates analysis reports.",
      platform: "web",
      features: ["AST Parsing", "Report Generation"],
      constraints: {},
    });

    expect(result.projectType).toBe("HEADLESS_ENGINE");
    expect(result.requiredCategories).toContain("backendFramework");
    expect(result.requiredCategories).not.toContain("frontendFramework");
    expect(result.requiredCategories).not.toContain("styling");
    expect(result.fullCategories?.map((category) => category.key)).toEqual(result.requiredCategories);
  });

  it("adds feature-specific categories only when selected", async () => {
    const result = await discoverCategories({
      projectName: "Storefront",
      description: "A web storefront for a small catalog.",
      platform: "web",
      features: ["Subscription Billing"],
      constraints: {},
    });

    expect(result.requiredCategories).toContain("payments");
    expect(result.requiredCategories).not.toContain("aiProvider");
  });

  it("builds a local code-mentor stack without unrelated cloud concerns", async () => {
    const result = await discoverCategories({
      projectName: "Offline Programming Mentor",
      description: "A fully offline personal programming mentor that parses source code into an AST, recognizes algorithms, estimates complexity, runs submitted solutions, stores skill profiles in SQLite, and recommends the next problem. No internet or external AI APIs.",
      platform: "web",
      features: ["AST Analysis", "Algorithm Recognition", "Complexity Analysis", "Skill Profiles", "Local Code Execution"],
      constraints: {},
    });

    expect(result.projectType).toBe("HEADLESS_ENGINE");
    expect(result.requiredCategories).toEqual(expect.arrayContaining([
      "runtime",
      "astParser",
      "localDatabase",
      "cliToolkit",
      "codeExecution",
      "dashboardUi",
      "testingEngine",
      "complexityAnalysis",
      "algorithmRecognition",
    ]));
    expect(result.requiredCategories).not.toEqual(expect.arrayContaining([
      "authentication",
      "aiProvider",
      "videoProvider",
      "storage",
      "mapsProvider",
    ]));

    const categories = result.fullCategories ?? [];
    expect(categories.find((category) => category.key === "runtime")?.suggestedTools?.[0]?.name).toBe("Node.js + TypeScript");
    expect(categories.find((category) => category.key === "astParser")?.suggestedTools?.[0]?.name).toBe("tree-sitter");
    expect(categories.find((category) => category.key === "localDatabase")?.suggestedTools?.[0]?.name).toBe("better-sqlite3");
  });
});

describe("suggestion resolution", () => {
  it("returns registry-backed (tier 1) candidates with low confidence in heuristic mode", async () => {
    const result = await suggestForCategory("authentication", draft);
    expect(result.tier).toBe("registry");
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.recommendationSummary.length).toBeGreaterThan(20);
    expect(Array.isArray(result.tradeoffs)).toBe(true);
    for (const c of result.candidates) {
      expect(c.source).toBe("suggested");
      // Without an AI key, the heuristic fallback correctly reports low
      // confidence — the selection is by registry priority, not contextual
      // reasoning. This ensures downstream skill files carry a verify warning.
      expect(c.confidence).toBe("low");
    }
  });

  it("falls back to community tier for novel categories", async () => {
    // Use a category with zero registry entries — walletProvider now has
    // real entries (Wagmi, RainbowKit, Privy) after the Phase 2 buildout.
    const result = await suggestForCategory("quantumComputing", draft);
    expect(result.tier).toBe("community");
    expect(result.candidates[0].source).toBe("community");
    expect(result.candidates[0].confidence).toBe("low");
    expect(result.recommendationSummary).toContain("quantum computing");
    expect(result.tradeoffs[0]).toContain("Manual validation");
  });

  it("does not recommend a tool explicitly avoided by the user", async () => {
    const result = await suggestForCategory("authentication", {
      ...draft,
      constraints: { ...draft.constraints, avoid: ["Clerk"] },
    });
    expect(result.candidates.map((candidate) => candidate.name)).not.toContain("Clerk");
  });
});

describe("projectspec finalization and package assembly", () => {
  const stack = {
    frontendFramework: { value: "Expo (React Native)", source: "user" as const },
    authentication: { value: "Clerk", source: "suggested" as const, confidence: "high" as const },
    aiProvider: { value: "NovelAI Engine X", source: "community" as const, confidence: "low" as const },
    videoProvider: { value: "Stream Video", source: "suggested" as const, confidence: "high" as const },
    analytics: { value: null, source: "user" as const },
  };
  const categories = Object.keys(stack);

  it("finalizes a validated, frozen spec at version 1.0.0", () => {
    const spec = finalizeProjectSpec(draft, categories, stack);
    expect(spec.projectSpecVersion).toBe("1.0.0");
    expect(Object.isFrozen(spec)).toBe(true);
    expect(spec.stack.analytics.value).toBeNull();
  });

  it("assembles a complete package from the finalized spec only", async () => {
    const spec = finalizeProjectSpec(draft, categories, stack);
    const { files, meta } = await assemblePackage(spec);

    expect(meta.packageVersion).toBe("1.0.0");
    expect(meta.projectSpecVersion).toBe("1.0.0");

    // Core files
    for (const f of ["README.md", "agents.md", "ai-context.json", "package-meta.json", "roadmap.md", "resources.md", "dependency-graph.md"]) {
      expect(files[f], `missing ${f}`).toBeTruthy();
    }

    // No generic content
    expect(files["agents.md"]).toContain("LingoQuest");
    expect(files["agents.md"]).toContain("LOCKED");
    for (const content of Object.values(files)) {
      expect(content).not.toContain("[PLACEHOLDER]");
    }

    // Tech stack only for non-null entries; analytics (not needed) goes into notNeeded section
    expect(files["tech-stack.md"]).toContain("Clerk");
    expect(files["tech-stack.md"]).toContain("Expo (React Native)");
    expect(files["tech-stack.md"]).toContain("Categories Not Needed");
    expect(Object.keys(files).some((p) => p.includes("analytics"))).toBe(false);

    // Low-confidence skill carries verify warning
    const stackJson = JSON.parse(files["tech-stack.json"] || "{}");
    const novelEntry = stackJson.stack?.find((e: any) => e.name === "NovelAI Engine X");
    expect(novelEntry).toBeDefined();
    expect(files["tech-stack.md"]).toContain("NovelAI Engine X");
    expect(files["tech-stack.md"]).toContain("WARNING - LOW CONFIDENCE");

    // One manifest per feature, listing agents.md and the feature's prompts
    for (const feature of draft.features) {
      const slug = feature.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const manifest = files[`context-manifests/${slug}.json`];
      expect(manifest, `missing manifest for ${feature}`).toBeTruthy();
      const parsed = JSON.parse(manifest) as { load_before_starting: string[] };
      expect(parsed.load_before_starting).toContain("agents.md");
      expect(parsed.load_before_starting.some((p) => p.startsWith(`prompts/${slug}/`))).toBe(true);
    }

    // agents.md flags the low-confidence area
    expect(files["agents.md"]).toContain("NovelAI Engine X");
    expect(files["agents.md"]).toContain("Low-Confidence Areas");
  });

  it("generates platform-specific install commands for mobile", async () => {
    const spec = finalizeProjectSpec(draft, categories, stack);
    const { files } = await assemblePackage(spec);

    // Clerk install should use @clerk/clerk-expo for mobile platform, not @clerk/nextjs
    const techStack = files["tech-stack.md"];
    expect(techStack).toContain("@clerk/clerk-expo");
    expect(techStack).toContain("expo-web-browser");
    expect(techStack).toContain("expo-secure-store");
    expect(techStack).not.toContain("@clerk/nextjs");
  });
});

// ─── Prompt-Quality Regression Tests ─────────────────────────────────────────
// One test per prompt-quality bug. If any bug is reintroduced, one of these
// fails immediately — making it impossible to silently re-break the fixes.

describe("Prompt quality regressions", () => {
  const lingoStack = {
    frontendFramework: { value: "Next.js", source: "user" as const },
    authentication: { value: "Clerk", source: "suggested" as const, confidence: "high" as const },
    database: { value: "Supabase", source: "suggested" as const, confidence: "high" as const },
  };
  const lingoDraft: DraftInput = {
    projectName: "LingoQuest",
    description: "A Duolingo-inspired language learning app with XP, streaks, lessons, and gamification.",
    platform: "web",
    features: ["Gamification Features", "Interactive Language Lessons", "Exercise Completion & Feedback"],
    constraints: {},
  };
  const lingoSpec = finalizeProjectSpec(lingoDraft, Object.keys(lingoStack), lingoStack);

  // Bug 1 — Hyphenated feature names must not produce invalid JS identifiers
  it("Bug 1: test code uses camelCase identifiers, not hyphenated ones", () => {
    const code = getAspectTestCode("api-routes", "Exercise Completion & Feedback", lingoSpec);
    // Paths like '@/services/exercise-completion-feedback' are fine (hyphens in paths are valid).
    // The IDENTIFIER used in `import { X }` and `X.list()` must be camelCase.
    // Check that no hyphenated name appears inside an import brace or as a call target.
    expect(code).not.toMatch(/import \{ [^}]*-[^}]* \}/);           // no hyphens inside import { }
    expect(code).not.toMatch(/await [a-z]+-[a-z]+\w*\./);            // no hyphenated call like foo-bar.list()
    expect(code).toMatch(/exerciseCompletion\w+Service/);             // correct camelCase identifier present
  });

  // Bug 2 — API-route prompts must not open with a NO HTTP SERVER banner
  it("Bug 2: API-route fallback prompt does not contain NO HTTP SERVER", () => {
    const apiAspect = { aspect: "api-routes", title: "API Routes", description: "Backend layer" };
    const prompt = richFallbackPrompt(lingoSpec, "Gamification Features", apiAspect, []);
    expect(prompt).not.toContain("NO HTTP SERVER");
  });

  // Bug 3 — UI acceptance criteria must be feature-specific, not copy-paste clones
  it("Bug 3: gamification UI criteria mention XP, streak, or badge", () => {
    const criteria = getAspectAcceptanceCriteria("ui-components", "Gamification Features", lingoSpec);
    expect(criteria.join(" ").toLowerCase()).toMatch(/xp|streak|badge|leaderboard/);
  });

  it("Bug 3: lesson UI criteria mention answers, progress, or audio", () => {
    const criteria = getAspectAcceptanceCriteria("ui-components", "Interactive Language Lessons", lingoSpec);
    expect(criteria.join(" ").toLowerCase()).toMatch(/answer|progress|audio|feedback/);
  });

  // Bug 4 — Entity derivation must produce domain-specific tables for a language-learning app
  it("Bug 4: entity derivation includes lessons and exercises for a language app", () => {
    const names = derivedEntitiesFromFeatures(lingoSpec).map((e: { name: string }) => e.name);
    expect(names).toContain("lessons");
    expect(names).toContain("exercises");
  });

  it("Bug 4: entity derivation includes xp_transactions and streaks when gamification is mentioned", () => {
    const names = derivedEntitiesFromFeatures(lingoSpec).map((e: { name: string }) => e.name);
    expect(names).toContain("xp_transactions");
    expect(names).toContain("streaks");
  });

  // Bug 5 — Database-schema acceptance criteria must name the actual tables
  it("Bug 5: database-schema criteria include specific domain table names", () => {
    const criteria = getAspectAcceptanceCriteria("database-schema", "Interactive Language Lessons", lingoSpec);
    expect(criteria.join(" ")).toMatch(/lessons|exercises|user_progress/);
  });
});

// ─── Output File Quality Regression Tests ─────────────────────────────────────
// One test per new bug fixed. If any is ever reintroduced, the suite catches it.

import { generateSkills } from "../src/contextforge/generators/skills";
import { generateAgents } from "../src/contextforge/generators/agents";

describe("Output file quality regressions (session 2)", () => {
  // Shared mobile spec
  const mobileDraft: DraftInput = {
    projectName: "LingoQuest",
    description: "A Duolingo-inspired mobile language app with XP and streaks.",
    platform: "mobile-ios-android",
    features: ["Authentication", "Gamification Features"],
    constraints: {},
  };
  const mobileStack = {
    frontendFramework: { value: "Expo (React Native)", source: "user" as const },
    authentication: { value: "Clerk", source: "suggested" as const, confidence: "high" as const },
    database: { value: "Supabase", source: "suggested" as const, confidence: "high" as const },
  };
  const mobileSpec = finalizeProjectSpec(mobileDraft, Object.keys(mobileStack), mobileStack);

  // Shared web spec with a "Google Gemini" tool to test multi-word regex
  const geminiStack = {
    frontendFramework: { value: "Next.js", source: "user" as const },
    aiProvider: { value: "Google Gemini", source: "user" as const, confidence: "high" as const },
  };
  const geminiSpec = finalizeProjectSpec(
    { projectName: "AI Demo", description: "An AI app.", platform: "web", features: ["AI Chat"], constraints: {} },
    Object.keys(geminiStack),
    geminiStack,
  );

  // ── Bug 1: agents.md fallback uses platform-aware folder conventions ────────
  it("Bug 1: agents.md fallback shows Expo Router paths for mobile, not Next.js paths", async () => {
    const content = await generateAgents(mobileSpec);
    // Mobile should reference app/ not src/app/
    expect(content).toMatch(/app\/.*\.tsx/);
    // Should NOT emit the Next.js-specific App Router path as a primary convention
    expect(content).not.toMatch(/src\/app\/\<route\>\/page\.tsx/);
    // Should call out React Native primitive restrictions
    expect(content).toMatch(/React Native|Expo Router|<View>/i);
  });

  it("Bug 1: agents.md fallback contains an Error Handling Contract section", async () => {
    const content = await generateAgents(mobileSpec);
    expect(content).toContain("Error Handling Contract");
    expect(content).toContain("ApiErrorResponse");
  });

  // ── Bug 2: tech-stack.md shows snippet for Google Gemini (multi-word tool) ─
  it("Bug 2: tech-stack.md shows a code snippet for 'Google Gemini' (multi-word tool name)", () => {
    const { "tech-stack.md": md } = generateSkills(geminiSpec);
    // If the regex escaped correctly, the snippet section will have actual code
    expect(md).toContain("Google Gemini");
    // The snippet block should be present — not just the info table
    expect(md).toContain("Code Integration Pattern");
  });

  // ── Bug 3: decisions ADR for Clerk does NOT contain Supabase code ──────────
  it("Bug 3: Clerk ADR does not contain Supabase code or Stripe code", async () => {
    const { generateDecisions } = await import("../src/contextforge/generators/decisions");
    const files = await generateDecisions(mobileSpec);
    const clerkAdr = Object.entries(files).find(([path]) =>
      path.toLowerCase().includes("authentication") || path.toLowerCase().includes("auth")
    )?.[1] ?? "";
    expect(clerkAdr.length).toBeGreaterThan(0);
    // Clerk ADR should reference Clerk
    expect(clerkAdr.toLowerCase()).toContain("clerk");
    // But should NOT contain Supabase or Stripe code snippets
    expect(clerkAdr).not.toContain("createBrowserClient");
    expect(clerkAdr).not.toContain("stripe.webhooks.constructEvent");
  });

  // ── Bug 4: setup fallback always generates .env.example ───────────────────
  it("Bug 4: setup fallback always produces setup/.env.example", async () => {
    const { generateSetup } = await import("../src/contextforge/generators/docs-setup");
    const files = await generateSetup(mobileSpec);
    expect(files["setup/.env.example"]).toBeDefined();
    expect(files["setup/.env.example"].length).toBeGreaterThan(10);
    // Should contain a header
    expect(files["setup/.env.example"]).toContain("Environment Variables");
    // install.sh should copy .env.example to .env.local
    expect(files["setup/install.sh"]).toContain(".env.example");
  });

  // ── Bug 5: manifests use platform-aware files_to_modify ───────────────────
  it("Bug 5: context-manifest for mobile does not hardcode Next.js layout.tsx path", async () => {
    const { generateManifests } = await import("../src/contextforge/generators/manifests");
    const files = await generateManifests(mobileSpec, {});
    const manifest = JSON.parse(files["context-manifests/authentication.json"] ?? "{}");
    const filesToModify: string[] = manifest.files_to_modify ?? [];
    // Should NOT include Next.js App Router layout for a mobile project
    expect(filesToModify).not.toContain("src/app/layout.tsx");
    // Should include Expo-appropriate layout
    expect(filesToModify.some((f: string) => f.includes("_layout") || f.includes("TabNavigator"))).toBe(true);
  });

  // ── Bug 6: feature guide steps are numbered sequentially, not all as "4." ─
  it("Bug 6: feature guide supplementary steps are numbered sequentially (not all 4.)", async () => {
    const { generateManifests } = await import("../src/contextforge/generators/manifests");
    // Create spec with prompts so the guide has supplementary items
    const promptFiles = {
      "prompts/gamification-features/ui-components.md": "# Build: UI",
      "prompts/gamification-features/api-routes.md": "# Build: API",
    };
    const files = await generateManifests(mobileSpec, promptFiles);
    const guide = files["context-manifests/gamification-features-guide.md"] ?? "";
    expect(guide).toBeDefined();
    // Should not have two consecutive "4. " steps
    expect(guide).not.toMatch(/4\. .+\n4\. /);
    // Should have step 5 somewhere after step 4
    expect(guide).toMatch(/5\. /);
  });
});
