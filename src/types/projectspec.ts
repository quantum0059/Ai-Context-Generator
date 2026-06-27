export type StackSource = "user" | "suggested" | "community";
export type Confidence = "high" | "low";

export interface StackEntry {
  /** Tool name, or null when the user marked the category "not needed". */
  value: string | null;
  source: StackSource;
  confidence?: Confidence;
}

/**
 * Single source of truth. No file is ever generated from raw user input -
 * all input flows into a ProjectSpec which is finalized and validated before
 * any generator runs. Generators NEVER infer or choose technologies; they
 * only read stack[category].value.
 */
export interface ProjectSpec {
  id: string;
  projectName: string;
  description: string;
  platform: string;
  features: string[];
  requiredCategories: string[];
  stack: Record<string, StackEntry>;
  constraints: { budget?: string; avoid?: string[]; technical?: ProjectConstraints };
  designReferences?: string[];
  projectSpecVersion: string;
  projectType?: string;
  classificationReason?: string;
}

/** Pre-discovery draft: what the user has entered in steps 1-2/4-5. */
export interface DraftInput {
  projectName: string;
  description: string;
  platform: string;
  features: string[];
  constraints: { budget?: string; avoid?: string[]; technical?: ProjectConstraints };
  designReferences?: string[];
  projectType?: string;
  classificationReason?: string;
}

export interface SuggestionCandidate {
  name: string;
  rationale: string;
  docsUrl?: string;
  pricing?: string;
  freeTier?: string;
  source: "suggested" | "community";
  confidence: Confidence;
}

/** Relative path inside the package -> file content. */
export type PackageFiles = Record<string, string>;

export interface PackageMeta {
  packageVersion: string;
  projectSpecVersion: string;
  generatedAt: string;
}

export interface ProjectConstraints {
  mustBeOffline: boolean;
  mustUseLocalStorage: boolean;
  forbiddenCategories: string[];
  forbiddenTools: string[];
  requiredToolTypes: string[];
  rawConstraints: string[];
}

export interface ConflictItem {
  severity: "blocking" | "warning";
  type: string;
  description: string;
  offendingTool: string;
  conflictingRequirement: string;
  suggestion: string;
}

export interface ConflictReport {
  hasBlockingConflicts: boolean;
  hasWarnings: boolean;
  conflicts: ConflictItem[];
  warnings: ConflictItem[];
}

export interface DiscoveredCategory {
  key: string;
  label: string;
  reason: string;
  relevantToProjectType: boolean;
  isCustom?: boolean;
  suggestedTools?: {
    name: string;
    reason: string;
    installCommand?: string;
    docsUrl?: string;
  }[];
}
