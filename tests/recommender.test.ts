import { describe, expect, it } from "vitest";
import { analyzeProject } from "../src/generators/analyzer";
import { buildPackage } from "../src/generators/packageBuilder";
import { recommend } from "../src/generators/recommender";
import type { ProjectInput } from "../src/types";

const input: ProjectInput = {
  name: "LingoQuest",
  description:
    "A Duolingo-inspired language learning mobile app with an AI chat tutor, video lessons and XP progression.",
  platform: "mobile",
  targetUsers: "Language learners",
  budget: "free-only",
  preferredTechnologies: ["clerk", "zustand"],
  features: ["AI chat tutor", "video lessons", "XP progression"],
  designInspirations: [],
};

describe("recommender", () => {
  it("detects AI and video categories from the description", async () => {
    const analysis = await analyzeProject(input);
    expect(analysis.requiredCategories).toContain("ai");
    expect(analysis.requiredCategories).toContain("video");
  });

  it("prefers free technologies for a free-only budget", async () => {
    const analysis = await analyzeProject(input);
    const recs = recommend(input, analysis);
    for (const rec of recs) {
      const anyFree = [rec.primary, ...rec.alternatives].some((t) => t.freeTier);
      if (anyFree) expect(rec.primary.freeTier).toBe(true);
    }
  });

  it("honours user technology preferences", async () => {
    const analysis = await analyzeProject(input);
    const recs = recommend(input, analysis);
    const auth = recs.find((r) => r.category === "authentication");
    expect(auth?.primary.id).toBe("clerk");
  });

  it("builds a complete package with all core files", async () => {
    const analysis = await analyzeProject(input);
    const recs = recommend(input, analysis);
    const files = buildPackage(input, analysis, recs, {});
    expect(files["agents.md"]).toContain("LingoQuest");
    expect(files["ai-context.json"]).toContain("clerk");
    expect(files["roadmap.md"]).toContain("Phase 1");
    expect(files["setup/install.sh"]).toContain("npm install");
    expect(Object.keys(files).some((p) => p.startsWith("prompts/"))).toBe(true);
    expect(Object.keys(files).some((p) => p.startsWith("skills/"))).toBe(true);
    expect(Object.keys(files).some((p) => p.startsWith("decisions/"))).toBe(true);
  });
});
