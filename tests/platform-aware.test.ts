import { describe, expect, it } from "vitest";
import { detectPlatformParadigm } from "../src/contextforge/generators/platform";
import { generateTemplates } from "../src/contextforge/generators/docs";
import { generatePromptMaterial } from "../src/contextforge/generators/promptMaterial";
import { generatePrompts } from "../src/contextforge/generators/prompts";
import type { ProjectSpec } from "../src/types/projectspec";

function baseSpec(overrides: Partial<ProjectSpec>): ProjectSpec {
  return {
    id: "spec-1",
    projectName: "Test Project",
    description: "A test project used to verify platform-aware generation.",
    platform: "web",
    features: ["Core Feature"],
    requiredCategories: [],
    stack: {},
    constraints: {},
    projectSpecVersion: "1.0.0",
    ...overrides,
  };
}

const cliSpec = baseSpec({
  id: "offline-code-reviewer",
  projectName: "offline-code-reviewer",
  platform: "node-cli",
  description:
    "A fully offline code review engine that parses source code into an AST using tree-sitter and stores skill profiles in SQLite.",
  features: ["AST Parser"],
  stack: {
    parser: { value: "tree-sitter", source: "user", confidence: "high" },
    database: { value: "better-sqlite3", source: "user", confidence: "high" },
  },
  constraints: {
    technical: {
      mustBeOffline: true,
      mustUseLocalStorage: true,
      forbiddenCategories: [],
      forbiddenTools: [],
      requiredToolTypes: [],
      rawConstraints: ["fully offline"],
    },
  },
});

const webSpec = baseSpec({
  platform: "web",
  stack: {
    frontendFramework: { value: "Next.js", source: "suggested", confidence: "high" },
    stateManagement: { value: "Zustand", source: "suggested", confidence: "high" },
  },
});

describe("detectPlatformParadigm", () => {
  it("classifies a node-cli offline tool as CLI with no UI and no HTTP server", () => {
    const p = detectPlatformParadigm(cliSpec);
    expect(p.isCli).toBe(true);
    expect(p.hasUI).toBe(false);
    expect(p.hasHttpServer).toBe(false);
    expect(p.isOffline).toBe(true);
  });

  it("classifies a Next.js web project as having a UI and an HTTP server", () => {
    const p = detectPlatformParadigm(webSpec);
    expect(p.hasUI).toBe(true);
    expect(p.hasHttpServer).toBe(true);
    expect(p.isCli).toBe(false);
  });
});

describe("generateTemplates is platform-aware", () => {
  it("emits a CLI command template and no React UI/API templates for a CLI project", () => {
    const files = generateTemplates(cliSpec);
    expect(files["templates/command-template.md"]).toBeDefined();
    expect(files["templates/component-template.md"]).toBeUndefined();
    expect(files["templates/hook-template.md"]).toBeUndefined();
    expect(files["templates/store-template.md"]).toBeUndefined();
    expect(files["templates/api-route-template.md"]).toBeUndefined();
    // Universal templates are always present.
    expect(files["templates/service-template.md"]).toBeDefined();
    expect(files["templates/test-template.md"]).toBeDefined();
  });

  it("emits React UI + API templates for a web project", () => {
    const files = generateTemplates(webSpec);
    expect(files["templates/component-template.md"]).toBeDefined();
    expect(files["templates/api-route-template.md"]).toBeDefined();
    expect(files["templates/command-template.md"]).toBeUndefined();
  });
});

describe("generatePromptMaterial is platform-aware", () => {
  it("emits no UI references, wireframes, or design-system files for a CLI project", async () => {
    const files = await generatePromptMaterial(cliSpec);
    const paths = Object.keys(files);
    expect(paths).toHaveLength(0);
  });
});

describe("generatePrompts is platform-aware", () => {
  it("does not emit UI-component prompts for a CLI project", async () => {
    const files = await generatePrompts(cliSpec);
    const paths = Object.keys(files);
    expect(paths.length).toBeGreaterThan(0);
    expect(paths.some((p) => /ui-components|ui\.md|components/.test(p))).toBe(false);
    // No prompt file should reference a Next.js App Router page path.
    for (const content of Object.values(files)) {
      expect(content).not.toContain("src/app/");
    }
  });
});
