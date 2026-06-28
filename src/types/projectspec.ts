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
  /** Full architectural requirements extracted before stack discovery */
  architecturalRequirements?: ArchitecturalRequirements;
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
  /** Full architectural requirements extracted by the requirement-extractor pipeline */
  architecturalRequirements?: ArchitecturalRequirements;
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
  /** Regulatory / legal constraints inferred from the domain (e.g. GDPR, HIPAA, PCI-DSS) */
  compliance?: string[];
  /** Free-text budget signal if mentioned (e.g. "free-tier only", "open source only") */
  budgetConstraint?: string;
  /** Primary user audience / personas */
  targetAudience?: string[];
}

/** A core domain entity inferred from the project description */
export interface DomainEntity {
  name: string;
  description: string;
  /** Key attributes that will likely need to be persisted */
  attributes: string[];
  /** Names of other DomainEntity this entity relates to */
  relatedEntities: string[];
}

/** Domain model: actors, entities, and core workflows */
export interface DomainModel {
  /** Human actors who interact with the system (user personas and roles) */
  actors: Array<{ name: string; description: string; permissions?: string[] }>;
  entities: DomainEntity[];
  /** High-level workflows / use-case titles */
  coreWorkflows: string[];
}

/** A single formal functional requirement */
export interface FunctionalRequirement {
  /** Sequential ID, e.g. FR-001 */
  id: string;
  title: string;
  description: string;
  /** 'explicit' = stated directly in description; 'implicit' = inferred by the architect */
  type: "explicit" | "implicit";
  /** Which actor(s) this requirement applies to */
  actors: string[];
  priority: "must-have" | "should-have" | "nice-to-have";
}

/** Non-functional requirements derived from domain + constraints */
export interface NonFunctionalRequirements {
  performance: string[];
  security: string[];
  scalability: string[];
  availability: string[];
  accessibility: string[];
  compliance: string[];
  maintainability: string[];
  other: string[];
}

/** A potential failure mode or boundary condition */
export interface EdgeCase {
  scenario: string;
  expectedBehaviour: string;
  category: "network" | "data" | "auth" | "concurrency" | "input-validation" | "external-service" | "other";
}

/** The complete output of the architectural requirement extraction pipeline */
export interface ArchitecturalRequirements {
  businessGoals: string[];
  successCriteria: string[];
  targetAudience: string[];
  domain: DomainModel;
  functional: FunctionalRequirement[];
  nonFunctional: NonFunctionalRequirements;
  edgeCases: EdgeCase[];
  /** Hard technical constraints (unchanged from existing pipeline) */
  constraints: ProjectConstraints;
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

/**
 * A fully decomposed feature node. Carries grouping, priority, dependency
 * edges, acceptance criteria, and explicit out-of-scope boundaries so that
 * every downstream generator (prompts, roadmap, dependency-graph) can read
 * structured data instead of free-form strings.
 */
export interface RichFeature {
  /** Display name of the feature (e.g. "User Authentication") */
  name: string;
  /** Epic / domain this feature belongs to (e.g. "Auth", "Content", "Analytics") */
  epic: string;
  /** One concise sentence describing what this feature does for the user */
  description: string;
  /** MoSCoW priority relative to the other features in this project */
  priority: "must-have" | "should-have" | "nice-to-have";
  /** Which actor primarily benefits (e.g. "end-user", "admin", "system") */
  userRole: string;
  /** 2–4 testable acceptance criteria in Given/When/Then or plain English */
  acceptanceCriteria: string[];
  /** Explicit list of what this feature will NOT do (prevents scope creep) */
  outOfScope: string[];
  /** Names of other features that MUST be built before this one can start */
  dependsOn: string[];
  /** Stack categories or infrastructure pieces this feature requires */
  technicalImplications: string[];
  /** True when the user typed this feature manually instead of selecting it */
  isUserProvided?: boolean;
}

/**
 * The full structured output of the Feature Extraction pipeline.
 * Features are grouped into Epics and a criticalPath is pre-computed so
 * downstream generators have a ready-made dependency order.
 */
export interface RichFeatureSet {
  /** Features organised by their parent Epic */
  epics: Array<{
    /** Epic name (e.g. "Core Infrastructure", "User Experience") */
    name: string;
    features: RichFeature[];
  }>;
  /**
   * Ordered list of feature names representing the minimum sequential
   * build path — each item depends on all previous items.
   */
  criticalPath: string[];
  /** Functionality that has been explicitly decided to be OUT of scope */
  outOfScopeGlobal: string[];
}
