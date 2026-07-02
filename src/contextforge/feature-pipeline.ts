import { z } from "zod";
import { groqJson } from "../lib/groq";
import { MODELS } from "../lib/ai-models";
import type { Feature, FeatureSet, FunctionalRequirement } from "../types/projectspec";

// ─── Response Zod schema ──────────────────────────────────────────────────────

const groqResponseSchema = z.object({
  epics: z.record(z.array(z.string())), // Epic Name -> Array of feature IDs
  criticalPathIds: z.array(z.string()),
  outOfScopeGlobal: z.array(z.string()),
});

export async function normalizeAndGroupFeatures(
  requirements: FunctionalRequirement[],
  projectName: string,
  existingFeatureNames: string[] = []
): Promise<FeatureSet> {
  // Deterministic Stage 1: Map Functional Requirements to Features 1:1
  const existingLower = new Set(existingFeatureNames.map((n) => n.toLowerCase()));
  
  const mappedFeatures: Feature[] = requirements
    .filter((req) => !existingLower.has(req.title.toLowerCase()))
    .map((req) => ({
      id: req.id,
      title: req.title,
      description: req.description,
      epic: "Unassigned", // Will be assigned by AI
      priority: req.priority === "must-have" ? "must" : req.priority === "should-have" ? "should" : "nice",
      dependencies: [],
      source: req.type,
      functionalRequirementIds: [req.id],
    }));

  if (mappedFeatures.length === 0) {
    return { epics: [], criticalPath: [], outOfScopeGlobal: [] };
  }

  // Create lightweight prompt payload
  const payload = mappedFeatures.map((f) => ({
    id: f.id,
    title: f.title,
    description: f.description,
  }));

  const systemPrompt = `You are an expert Software Architect organizing features into Epics and determining the critical path.

RULES:
1. Group the provided features into logical Epics (e.g. "Core Infrastructure", "User Experience"). Do NOT invent new features. Use exact IDs.
2. Return a topological sort of the feature IDs in "criticalPathIds", starting with foundational features.
3. Return valid JSON only.

Expected JSON Format:
{
  "epics": {
    "Epic Name": ["FR-001", "FR-002"]
  },
  "criticalPathIds": ["FR-001", "FR-002"],
  "outOfScopeGlobal": ["Explicit out of scope item"]
}`;

  const userPrompt = `Project Name: ${projectName}
Features to group:
${JSON.stringify(payload, null, 2)}`;

  let result;
  try {
    result = await groqJson(
      systemPrompt,
      userPrompt,
      groqResponseSchema,
      0,
      MODELS.FAST
    );
  } catch (err) {
    console.error("[Groq Epic Grouping Failed]", err);
    // Fallback if Groq fails
    result = {
      epics: { "Core Product": mappedFeatures.map((f) => f.id) },
      criticalPathIds: mappedFeatures.map((f) => f.id),
      outOfScopeGlobal: [],
    };
  }

  // Reconstruct the FeatureSet
  const featureMap = new Map(mappedFeatures.map((f) => [f.id, f]));
  const epics: FeatureSet["epics"] = [];

  for (const [epicName, featureIds] of Object.entries(result.epics)) {
    const epicFeatures: Feature[] = [];
    for (const id of featureIds) {
      const feature = featureMap.get(id);
      if (feature) {
        feature.epic = epicName;
        epicFeatures.push(feature);
        featureMap.delete(id); // mark as assigned
      }
    }
    if (epicFeatures.length > 0) {
      epics.push({ name: epicName, features: epicFeatures });
    }
  }

  // Any left over features that Groq missed go into a generic epic
  const leftovers = Array.from(featureMap.values());
  if (leftovers.length > 0) {
    epics.push({ name: "Core Product", features: leftovers });
  }

  const criticalPath = result.criticalPathIds
    .map((id) => mappedFeatures.find((f) => f.id === id)?.title)
    .filter((title): title is string => Boolean(title));

  // Ensure all features are in the critical path if missed by Groq
  for (const f of mappedFeatures) {
    if (!criticalPath.includes(f.title)) {
      criticalPath.push(f.title);
    }
  }

  return {
    epics,
    criticalPath,
    outOfScopeGlobal: result.outOfScopeGlobal,
  };
}
