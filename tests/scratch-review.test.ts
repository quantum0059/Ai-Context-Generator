import { describe, it } from "vitest";
import { finalizeProjectSpec } from "../src/contextforge/spec";
import { assemblePackage } from "../src/contextforge/assembler";

describe("package output review", () => {
  it("generates a package and prints all files", async () => {
    const draft = {
      projectName: "TaskFlow",
      description: "A collaborative project management tool for remote teams with real-time task boards, team chat, and AI-powered task prioritization.",
      platform: "web",
      features: ["Authentication", "Task Board", "Team Chat", "AI Task Prioritization", "Billing"],
      constraints: { budget: "free tiers only", avoid: ["Firebase"] },
    };

    const stack: Record<string, import("../src/types/projectspec").StackEntry> = {
      frontendFramework: { value: "Next.js", source: "suggested", confidence: "high" as const },
      authentication: { value: "Clerk", source: "suggested", confidence: "high" as const },
      database: { value: "Supabase", source: "suggested", confidence: "high" as const },
      stateManagement: { value: "Zustand", source: "suggested", confidence: "high" as const },
      styling: { value: "Tailwind CSS", source: "suggested", confidence: "high" as const },
      aiProvider: { value: "Google Gemini", source: "suggested", confidence: "high" as const },
      payments: { value: "Stripe", source: "user", confidence: "high" as const },
      hosting: { value: "Vercel", source: "suggested", confidence: "high" as const },
    };

    const categories = Object.keys(stack);
    const spec = finalizeProjectSpec(draft, categories, stack);
    const { files } = await assemblePackage(spec);

    const sorted = Object.keys(files).sort();
    console.log(`\n=== PACKAGE CONTAINS ${sorted.length} FILES ===\n`);
    for (const path of sorted) {
      console.log(`\n${"=".repeat(80)}`);
      console.log(`FILE: ${path}`);
      console.log(`${"=".repeat(80)}`);
      console.log(files[path]);
    }
  });
});
