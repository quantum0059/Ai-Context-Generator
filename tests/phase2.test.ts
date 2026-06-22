import { describe, expect, it } from "vitest";
import { assemblePackage } from "../src/contextforge/assembler";
import { bumpMinor, regeneratePackage } from "../src/contextforge/regenerate";
import { finalizeProjectSpec } from "../src/contextforge/spec";
import type { DraftInput, ProjectSpec } from "../src/types/projectspec";

const draft: DraftInput = {
  projectName: "LingoQuest",
  description:
    "A Duolingo-inspired language learning mobile app with an AI chat tutor, video lessons and XP progression.",
  platform: "mobile-ios-android",
  features: ["Authentication", "AI Chat Tutor"],
  constraints: { budget: "free tiers only" },
};

const stack = {
  frontendFramework: { value: "Expo (React Native)", source: "user" as const },
  authentication: { value: "Clerk", source: "suggested" as const, confidence: "high" as const },
  aiProvider: { value: "Google Gemini", source: "suggested" as const, confidence: "high" as const },
};
const categories = Object.keys(stack);

describe("prompt_material system", () => {
  it("generates ui-references, the full design system, and inspiration", async () => {
    const spec = finalizeProjectSpec(draft, categories, stack);
    const { files } = await assemblePackage(spec);

    expect(Object.keys(files).filter((p) => p.startsWith("prompt_material/ui-references/")).length).toBeGreaterThan(0);
    for (const f of ["colors.md", "typography.md", "spacing.md", "animation-guidelines.md", "component-guidelines.md"]) {
      expect(files[`prompt_material/design-system/${f}`], `missing ${f}`).toBeTruthy();
    }
    expect(files["prompt_material/inspiration.md"]).toBeTruthy();
    // No refs provided -> defaults are explicitly marked as defaults
    expect(files["prompt_material/design-system/colors.md"]).toContain("PLATFORM DEFAULTS");
  });
});

describe("selective regeneration", () => {
  it("bumps minor versions", () => {
    expect(bumpMinor("1.0.0")).toBe("1.1.0");
    expect(bumpMinor("1.4.0")).toBe("1.5.0");
  });

  it("re-runs only affected generators and carries unrelated files over", async () => {
    const oldSpec = finalizeProjectSpec(draft, categories, stack);
    const { files: oldFiles } = await assemblePackage(oldSpec);

    // Edit: swap auth tool and add one feature.
    const editedSpec: ProjectSpec = {
      ...oldSpec,
      features: [...oldSpec.features, "Leaderboards"],
      stack: {
        ...oldSpec.stack,
        authentication: { value: "Auth0", source: "suggested", confidence: "high" },
      },
    };

    const result = await regeneratePackage(oldSpec, editedSpec, oldFiles);

    // Versioning
    expect(result.spec.projectSpecVersion).toBe("1.1.0");
    expect(result.meta.packageVersion).toBe("1.1.0");

    // Changed stack: tech-stack.md is regenerated with new entries
    expect(result.files["tech-stack.md"]).toContain("Auth0");
    expect(result.files["tech-stack.md"]).not.toContain("Clerk");

    // Unchanged components are still present
    expect(result.files["tech-stack.md"]).toContain("Expo (React Native)");

    // New feature got prompts + manifest; existing feature prompts untouched
    expect(Object.keys(result.files).some((p) => p.startsWith("prompts/leaderboards/"))).toBe(true);
    expect(result.files["context-manifests/leaderboards.json"]).toBeTruthy();
    const oldAuthPromptKeys = Object.keys(oldFiles).filter((p) => p.startsWith("prompts/ai-chat-tutor/"));
    for (const key of oldAuthPromptKeys) {
      expect(result.files[key]).toBe(oldFiles[key]);
    }

    // Always-regenerated docs reflect the new stack
    expect(result.files["agents.md"]).toContain("Auth0");
    expect(result.files["agents.md"]).not.toContain("Clerk");
  });
});
