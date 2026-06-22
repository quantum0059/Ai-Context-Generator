// Quick script to generate a package and dump all files for review
import { finalizeProjectSpec } from "./src/contextforge/spec.ts";
import { assemblePackage } from "./src/contextforge/assembler.ts";

const draft = {
  projectName: "TaskFlow",
  description: "A collaborative project management tool for remote teams with real-time task boards, team chat, and AI-powered task prioritization.",
  platform: "web",
  features: ["Authentication", "Task Board", "Team Chat", "AI Task Prioritization", "Billing"],
  constraints: { budget: "free tiers only", avoid: ["Firebase"] },
};

const stack = {
  frontendFramework: { value: "Next.js", source: "suggested", confidence: "high" },
  authentication: { value: "Clerk", source: "suggested", confidence: "high" },
  database: { value: "Supabase", source: "suggested", confidence: "high" },
  stateManagement: { value: "Zustand", source: "suggested", confidence: "high" },
  styling: { value: "Tailwind CSS", source: "suggested", confidence: "high" },
  aiProvider: { value: "Google Gemini", source: "suggested", confidence: "high" },
  payments: { value: "Stripe", source: "user", confidence: "high" },
  hosting: { value: "Vercel", source: "suggested", confidence: "high" },
};

const categories = Object.keys(stack);
const spec = finalizeProjectSpec(draft, categories, stack);
const { files } = await assemblePackage(spec);

// Print all files sorted
const sorted = Object.keys(files).sort();
console.log(`\n=== PACKAGE CONTAINS ${sorted.length} FILES ===\n`);
for (const path of sorted) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`FILE: ${path}`);
  console.log(`${"=".repeat(80)}`);
  console.log(files[path]);
}
