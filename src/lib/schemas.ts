import { z } from "zod";

export const projectInputSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().min(10, "Describe your project in at least 10 characters"),
  platform: z.enum(["web", "mobile", "backend", "saas", "chrome-extension", "agentic"]),
  targetUsers: z.string().default(""),
  budget: z.enum(["free-only", "low", "flexible"]),
  preferredTechnologies: z.array(z.string()).default([]),
  features: z.array(z.string()).default([]),
  designInspirations: z.array(z.string()).default([]),
});

export const analysisSchema = z.object({
  purpose: z.string(),
  requiredCategories: z.array(z.string()),
  complexity: z.enum(["low", "medium", "high"]),
  architecture: z.string(),
});

export const generateRequestSchema = z.object({
  input: projectInputSchema,
  analysis: analysisSchema,
  selections: z.record(z.string(), z.string()).default({}),
});
