import { describe, expect, it } from "vitest";
import { assemblePackage } from "../src/contextforge/assembler";
import { discoverCategories } from "../src/contextforge/discovery";
import { finalizeProjectSpec } from "../src/contextforge/spec";
import { suggestForCategory } from "../src/contextforge/suggestions";
import type { DraftInput } from "../src/types/projectspec";
import { inferPlatform } from "../src/lib/inferPlatform";
import { sanitizeConflictReport } from "../src/contextforge/conflicts";
import type { ConflictReport, ProjectSpec } from "../src/types/projectspec";

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
  it("returns registry-backed (tier 1) high-confidence candidates", async () => {
    const result = await suggestForCategory("authentication", draft);
    expect(result.tier).toBe("registry");
    expect(result.candidates.length).toBeGreaterThan(0);
    for (const c of result.candidates) {
      expect(c.source).toBe("suggested");
      expect(c.confidence).toBe("high");
    }
  });

  it("falls back to community tier for novel categories", async () => {
    const result = await suggestForCategory("walletProvider", draft);
    expect(result.tier).toBe("community");
    expect(result.candidates[0].source).toBe("community");
    expect(result.candidates[0].confidence).toBe("low");
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
