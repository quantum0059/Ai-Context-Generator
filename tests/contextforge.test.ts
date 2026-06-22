import { describe, expect, it } from "vitest";
import { assemblePackage } from "../src/contextforge/assembler";
import { discoverCategories } from "../src/contextforge/discovery";
import { finalizeProjectSpec } from "../src/contextforge/spec";
import { suggestForCategory } from "../src/contextforge/suggestions";
import type { DraftInput } from "../src/types/projectspec";

const draft: DraftInput = {
  projectName: "LingoQuest",
  description:
    "A Duolingo-inspired language learning mobile app with an AI chat tutor, video lessons and XP progression.",
  platform: "mobile-ios-android",
  features: ["Authentication", "AI Chat Tutor", "Video Lessons"],
  constraints: { budget: "free tiers only", avoid: ["Firebase"] },
};

describe("dynamic category discovery (offline heuristic)", () => {
  it("detects AI and video categories from description/features", async () => {
    const { requiredCategories, engine } = await discoverCategories(draft);
    expect(engine).toBe("heuristic");
    expect(requiredCategories).toContain("aiProvider");
    expect(requiredCategories).toContain("videoProvider");
    expect(requiredCategories).toContain("authentication");
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
      const parsed = JSON.parse(manifest) as { requiredContext: string[] };
      expect(parsed.requiredContext).toContain("agents.md");
      expect(parsed.requiredContext.some((p) => p.startsWith(`prompts/${slug}/`))).toBe(true);
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
