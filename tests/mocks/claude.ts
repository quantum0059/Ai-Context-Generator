/**
 * Claude API mock for testing without API keys.
 * Provides deterministic responses for all Claude-powered features.
 */

import type { DraftInput, ProjectSpec } from "../../src/types/projectspec";

export const mockClaudeResponses = {
  // Discovery responses
  discovery: {
    requiredCategories: [
      "frontendFramework",
      "styling",
      "stateManagement",
      "database",
      "authentication",
      "hosting",
    ],
  },

  // Suggestion responses by category
  suggestions: {
    frontendFramework: {
      tier: "registry" as const,
      candidates: [
        {
          name: "Next.js",
          rationale: "Industry standard for React web applications with excellent DX",
          docsUrl: "https://nextjs.org/docs",
          pricing: "Free and open source",
          freeTier: "Yes",
          source: "suggested" as const,
          confidence: "high" as const,
        },
      ],
    },
    database: {
      tier: "registry" as const,
      candidates: [
        {
          name: "Supabase",
          rationale: "Postgres with auth, storage, and realtime built-in",
          docsUrl: "https://supabase.com/docs",
          pricing: "Free tier (500MB DB)",
          freeTier: "Yes",
          source: "suggested" as const,
          confidence: "high" as const,
        },
      ],
    },
  },

  // Aspect responses for prompts
  aspects: {
    default: ["ui", "backend"],
    "backend-only": ["backend"],
    api: ["api", "integration"],
  },

  // UI screen identification
  screens: [
    { name: "Onboarding Flow", rationale: "Every new user passes through onboarding" },
    { name: "Home Dashboard", rationale: "The primary surface users return to" },
    { name: "Settings Screen", rationale: "Account and preferences live here" },
  ],
};

/**
 * Mock Claude JSON responses for testing.
 * Replace the actual claudeJson function in tests.
 */
export async function mockClaudeJson(
  prompt: string,
  schema: any,
): Promise<any> {
  // Determine response type based on prompt content
  if (prompt.includes("technology categories")) {
    return mockClaudeResponses.discovery;
  }

  if (prompt.includes("implementation aspects")) {
    const aspects =
      prompt.includes("backend-only") || prompt.includes("cli")
        ? mockClaudeResponses.aspects["backend-only"]
        : mockClaudeResponses.aspects.default;
    return { aspects };
  }

  if (prompt.includes("UI screens")) {
    return { screens: mockClaudeResponses.screens };
  }

  throw new Error("Unhandled mock prompt");
}

/**
 * Mock draft input for testing.
 */
export function createMockDraftInput(overrides: Partial<DraftInput> = {}): DraftInput {
  return {
    projectName: "TestApp",
    description: "A test application for unit testing",
    platform: "web",
    features: ["Authentication", "Dashboard"],
    constraints: { budget: "Free tiers only" },
    ...overrides,
  };
}

/**
 * Mock ProjectSpec for testing.
 */
export function createMockProjectSpec(overrides: Partial<ProjectSpec> = {}): ProjectSpec {
  return {
    id: "test-spec-id",
    projectName: "TestApp",
    description: "A test application for unit testing",
    platform: "web",
    features: ["Authentication", "Dashboard"],
    requiredCategories: ["frontendFramework", "database", "authentication"],
    stack: {
      frontendFramework: { value: "Next.js", source: "user" },
      database: { value: "Supabase", source: "suggested", confidence: "high" },
      authentication: { value: "Clerk", source: "user" },
    },
    constraints: { budget: "Free tiers only" },
    projectSpecVersion: "1.0.0",
    ...overrides,
  };
}
