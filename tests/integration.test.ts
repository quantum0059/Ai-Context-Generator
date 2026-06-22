/**
 * Integration tests for the full ContextForge pipeline.
 * Tests the complete flow from draft input to package generation.
 */

import { describe, it, expect } from "vitest";
import { discoverCategories } from "../src/contextforge/discovery";
import { finalizeProjectSpec } from "../src/contextforge/spec";
import { assemblePackage } from "../src/contextforge/assembler";
import { regeneratePackage } from "../src/contextforge/regenerate";
import { createMockDraftInput, createMockProjectSpec } from "./mocks/claude";

describe("Full Pipeline Integration", () => {
  it("should complete the full discovery → finalization → generation pipeline", async () => {
    // Step 1: Discovery
    const draft = createMockDraftInput();
    const discovery = await discoverCategories(draft);

    expect(discovery.requiredCategories).toBeDefined();
    expect(discovery.requiredCategories.length).toBeGreaterThan(0);
    expect(["claude", "heuristic"]).toContain(discovery.engine);

    // Step 2: Build stack from discovery
    const stack: Record<string, any> = {};
    for (const category of discovery.requiredCategories) {
      stack[category] = {
        value: `${category}-tool`,
        source: "user",
      };
    }

    // Step 3: Finalize spec
    const spec = finalizeProjectSpec(
      draft,
      discovery.requiredCategories,
      stack,
    );

    expect(spec.projectSpecVersion).toBe("1.0.0");
    expect(spec.id).toBeDefined();
    expect(spec.stack).toEqual(stack);

    // Step 4: Generate package
    const { files, meta } = await assemblePackage(spec);

    expect(files).toBeDefined();
    expect(Object.keys(files).length).toBeGreaterThan(10);

    // Verify core files exist
    expect(files["agents.md"]).toBeDefined();
    expect(files["ai-context.json"]).toBeDefined();
    expect(files["package-meta.json"]).toBeDefined();
    expect(files["README.md"]).toBeDefined();
    expect(files["roadmap.md"]).toBeDefined();
    expect(files["resources.md"]).toBeDefined();
    expect(files["dependency-graph.md"]).toBeDefined();

    // Verify meta
    expect(meta.packageVersion).toBeDefined();
    expect(meta.projectSpecVersion).toBe("1.0.0");
    expect(meta.generatedAt).toBeDefined();
  });

  it("should handle regeneration with changed features", async () => {
    const oldSpec = createMockProjectSpec();
    const { files: oldFiles } = await assemblePackage(oldSpec);

    const editedSpec = createMockProjectSpec({
      features: ["Authentication", "Dashboard", "Payments"],
      projectSpecVersion: oldSpec.projectSpecVersion,
    });

    const result = await regeneratePackage(oldSpec, editedSpec, oldFiles);

    expect(result.spec.projectSpecVersion).toBe("1.1.0");
    expect(result.changed.length).toBeGreaterThan(0);
    expect(result.files).toBeDefined();
    expect(Object.keys(result.files).length).toBeGreaterThan(10);
  });

  it("should handle regeneration with changed stack", async () => {
    const oldSpec = createMockProjectSpec();
    const { files: oldFiles } = await assemblePackage(oldSpec);

    const editedSpec = createMockProjectSpec({
      stack: {
        ...oldSpec.stack,
        frontendFramework: { value: "Remix", source: "user" },
      },
      projectSpecVersion: oldSpec.projectSpecVersion,
    });

    const result = await regeneratePackage(oldSpec, editedSpec, oldFiles);

    expect(result.spec.projectSpecVersion).toBe("1.1.0");
    expect(result.files["tech-stack.md"]).toBeDefined();
    expect(result.files["tech-stack.json"]).toBeDefined();
  });

  it("should enforce No Generic Content rule", async () => {
    const spec = createMockProjectSpec();
    const { files } = await assemblePackage(spec);

    // Check no placeholders
    for (const [path, content] of Object.entries(files)) {
      expect(content).not.toContain("[PLACEHOLDER]");
    }

    // Check agents.md references project name
    expect(files["agents.md"]).toContain(spec.projectName);
  });
});

describe("Error Handling", () => {
  it("should handle invalid spec gracefully", async () => {
    const invalidSpec = {
      id: "test",
      projectName: "", // Empty name should fail validation
      description: "Test",
      platform: "web",
      features: [],
      requiredCategories: [],
      stack: {},
      constraints: {},
      projectSpecVersion: "1.0.0",
    };

    await expect(assemblePackage(invalidSpec as any)).rejects.toThrow();
  });

  it("should handle regeneration with removed features", async () => {
    const oldSpec = createMockProjectSpec({
      features: ["Authentication", "Dashboard", "Payments"],
    });
    const { files: oldFiles } = await assemblePackage(oldSpec);

    const editedSpec = createMockProjectSpec({
      features: ["Authentication"],
      projectSpecVersion: oldSpec.projectSpecVersion,
    });

    const result = await regeneratePackage(oldSpec, editedSpec, oldFiles);

    // Removed feature artifacts should be deleted
    const hasDashboardPrompts = Object.keys(result.files).some((p) =>
      p.startsWith("prompts/dashboard/"),
    );
    expect(hasDashboardPrompts).toBe(false);
  });
});

describe("Subscription Limits", () => {
  it("should allow generation under free tier limit", async () => {
    const { checkSubscriptionLimits } = await import("../src/lib/subscription");

    // Mock: no Supabase = allowed
    const result = await checkSubscriptionLimits("test-user");
    expect(result.allowed).toBe(true);
    expect(result.status.generationLimit).toBe(5);
  });
});

describe("Rate Limiting", () => {
  it("should allow requests under limit", async () => {
    const { checkRateLimit } = await import("../src/lib/rateLimit");

    const result = checkRateLimit("test-user", "/api/contextforge/discover");
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });

  it("should block requests over limit", async () => {
    const { checkRateLimit } = await import("../src/lib/rateLimit");

    const identifier = "rate-limit-test-user";
    const endpoint = "/api/contextforge/generate";

    // Exhaust the limit (5 requests per minute)
    for (let i = 0; i < 5; i++) {
      checkRateLimit(identifier, endpoint);
    }

    // 6th request should be blocked
    const result = checkRateLimit(identifier, endpoint);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe("Upload Validation", () => {
  it("should validate file size", async () => {
    const { validateUpload } = await import("../src/lib/uploadValidation");

    const mockFile = new File(["test"], "test.jpg", { type: "image/jpeg" });
    Object.defineProperty(mockFile, "size", { value: 6 * 1024 * 1024 }); // 6MB

    const result = validateUpload(mockFile);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("too large");
  });

  it("should validate file type", async () => {
    const { validateUpload } = await import("../src/lib/uploadValidation");

    const mockFile = new File(["test"], "test.exe", { type: "application/x-executable" });

    const result = validateUpload(mockFile);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid file type");
  });
});

describe("Environment Validation", () => {
  it("should warn about missing API keys in development", async () => {
    const { validateEnvironment } = await import("../src/lib/envValidation");

    const result = validateEnvironment();
    expect(result.errors).toBeDefined();
    expect(result.warnings).toBeDefined();

    // Should warn about missing keys (since we're in test environment)
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});
