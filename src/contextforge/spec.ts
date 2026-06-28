import { z } from "zod";
import type { DraftInput, ProjectSpec, StackEntry } from "../types/projectspec";

export const stackEntrySchema = z.object({
  value: z.string().nullable(),
  source: z.enum(["user", "suggested", "community"]),
  confidence: z.enum(["high", "low"]).optional(),
});

export const projectSpecSchema = z.object({
  id: z.string().min(1),
  projectName: z.string().min(1),
  description: z.string().min(10),
  platform: z.string().min(1),
  features: z.array(z.string().min(1)),
  requiredCategories: z.array(z.string().min(1)).min(1),
  stack: z.record(z.string(), stackEntrySchema),
  constraints: z.object({
    budget: z.string().optional(),
    avoid: z.array(z.string()).optional(),
  }),
  designReferences: z.array(z.string()).optional(),
  projectSpecVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  projectType: z.string().optional(),
  classificationReason: z.string().optional(),
  /** Validated upstream by requirement-extractor; passed through as-is. */
  architecturalRequirements: z.any().optional(),
});

export const draftInputSchema = z.object({
  projectName: z.string().min(1),
  description: z.string().min(10),
  platform: z.string().min(1),
  features: z.array(z.string()).default([]),
  constraints: z
    .object({ budget: z.string().optional(), avoid: z.array(z.string()).optional() })
    .default({}),
  designReferences: z.array(z.string()).optional(),
  projectType: z.string().optional(),
  classificationReason: z.string().optional(),
});

/**
 * Finalizes a draft + stack decisions into an immutable, validated ProjectSpec
 * (version 1.0.0). Technology selection happened exactly once before this -
 * after finalization the choices are locked for this generation.
 */
export function finalizeProjectSpec(
  draft: DraftInput,
  requiredCategories: string[],
  stack: Record<string, StackEntry>,
): ProjectSpec {
  const spec: ProjectSpec = {
    id: globalThis.crypto?.randomUUID?.() ?? `spec-${Date.now()}`,
    projectName: draft.projectName,
    description: draft.description,
    platform: draft.platform,
    features: draft.features.filter((f) => f.trim().length > 0),
    requiredCategories,
    stack,
    constraints: draft.constraints,
    designReferences: draft.designReferences,
    projectSpecVersion: "1.0.0",
    projectType: draft.projectType,
    classificationReason: draft.classificationReason,
    architecturalRequirements: draft.architecturalRequirements,
  };
  const parsed = projectSpecSchema.safeParse(spec);
  if (!parsed.success) {
    throw new Error(`ProjectSpec validation failed: ${parsed.error.message}`);
  }
  return Object.freeze(parsed.data) as ProjectSpec;
}
