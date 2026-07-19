import { afterEach, describe, expect, it, vi } from "vitest";
import { MODELS } from "../src/lib/ai-models";
import { generateSetup } from "../src/contextforge/generators/docs";
import { generateManifests } from "../src/contextforge/generators/manifests";
import { generatePrompts, isPromptContentValid } from "../src/contextforge/generators/prompts";
import type { ProjectSpec } from "../src/types/projectspec";
import { groqText } from "../src/lib/groq";

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GROQ_API_KEY;
});

const spec: ProjectSpec = {
  id: "offline-review-engine",
  projectName: "Offline Review Engine",
  description: "A fully offline code review engine that parses source code into an AST using tree-sitter, detects programming concepts, and stores skill profiles in SQLite.",
  platform: "backend-only",
  features: ["AST Parser"],
  requiredCategories: ["astParser", "localDatabase"],
  stack: {
    astParser: { value: "tree-sitter", source: "suggested", confidence: "high" },
    localDatabase: { value: "better-sqlite3", source: "suggested", confidence: "high" },
  },
  constraints: {
    technical: {
      mustBeOffline: true,
      mustUseLocalStorage: true,
      forbiddenCategories: [],
      forbiddenTools: [],
      requiredToolTypes: ["AST parser", "local SQLite database"],
      rawConstraints: ["fully offline"],
    },
  },
  projectSpecVersion: "1.0.0",
  projectType: "HEADLESS_ENGINE",
};

describe("generation model roles", () => {
  it("uses the current live Groq models (verified against console.groq.com/docs/models)", () => {
    // openai/gpt-oss-20b  — replaces llama-3.1-8b-instant (deprecated 2026-08-16)
    expect(MODELS.FAST).toBe("openai/gpt-oss-20b");
    // openai/gpt-oss-120b — replaces llama-3.3-70b-versatile (deprecated 2026-08-16)
    expect(MODELS.CONTENT).toBe("openai/gpt-oss-120b");
    // openai/gpt-oss-20b  — replaces llama-3.1-8b-instant (deprecated 2026-08-16)
    expect(MODELS.CONTENT_FALLBACK).toBe("openai/gpt-oss-20b");
    // openai/gpt-oss-120b — replaces deepseek-r1-distill-llama-70b (decommissioned 2025-10-02)
    expect(MODELS.REASONING).toBe("openai/gpt-oss-120b");
  });

  it("retries a rate-limited content request with the content fallback", async () => {
    process.env.GROQ_API_KEY = "test-key";
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response("rate limited", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: "generated content" } }],
      }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(groqText("Generate", "", 0, MODELS.CONTENT)).resolves.toBe("generated content");
    const models = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).model);
    // First 3 calls: retry on CONTENT with backoff. 4th call: fall back to CONTENT_FALLBACK.
    expect(models).toEqual([MODELS.CONTENT, MODELS.CONTENT, MODELS.CONTENT, MODELS.CONTENT_FALLBACK]);
  });
});

describe("prompt quality guard", () => {
  it("rejects stub prompts and accepts substantial implementation prompts", () => {
    expect(isPromptContentValid("expect(true).toBe(true)", "AST Parser", "concept-detection")).toBe(false);
    const valid = `# AST Parser concept-detection\n\nPath: src/analysis/concepts.ts\n\ninterface ConceptMatch { name: string }\n\n## Acceptance Criteria\n- [ ] Detect recursion\n- [ ] Detect loops\n- [ ] Add tests\n\n## Definition of Done\n- [ ] All files compile\n\n## Self-Verification\n1. Did I use only locked-stack imports?\n\n${"Detailed implementation guidance. ".repeat(30)}`;
    expect(isPromptContentValid(valid, "AST Parser", "concept-detection")).toBe(true);

    // A substantial prompt missing the completion contract is now rejected.
    const missingContract = `# AST Parser concept-detection\n\nPath: src/analysis/concepts.ts\n\ninterface ConceptMatch { name: string }\n\n## Acceptance Criteria\n- [ ] Detect recursion\n\n${"Detailed implementation guidance. ".repeat(30)}`;
    expect(isPromptContentValid(missingContract, "AST Parser", "concept-detection")).toBe(false);
  });

  it("emits a rich static fallback prompt when AI is unavailable", async () => {
    const files = await generatePrompts(spec);
    const prompt = files["prompts/ast-parser/concept-detection.md"];
    expect(prompt).toContain("Required File Structure");
    expect(prompt).toContain("Acceptance Criteria");
    expect(prompt).not.toContain("expect(true).toBe(true)");
    expect(prompt).not.toContain("export default function feature");
  });
});

describe("manifest and setup fallbacks", () => {
  it("interpolates guide context and prompt paths", async () => {
    const promptFiles = {
      "prompts/ast-parser/concept-detection.md": "# generated",
    };
    const files = await generateManifests(spec, promptFiles);
    const guide = files["context-manifests/ast-parser-guide.md"];
    expect(guide).toContain("prompts/ast-parser/concept-detection.md");
    expect(guide).toContain("agents.md");
    expect(guide).not.toContain("${");
  });

  it("writes real install commands for unregistered packages without TODOs", async () => {
    const files = await generateSetup(spec);
    expect(files["setup/install.sh"]).toContain("npm install tree-sitter");
    expect(files["setup/install.sh"]).toContain("npm install better-sqlite3");
    expect(files["setup/install.sh"]).not.toContain("# TODO: install");
  });
});
