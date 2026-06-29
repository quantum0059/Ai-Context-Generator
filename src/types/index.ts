export type Platform =
  | "web"
  | "mobile"
  | "backend"
  | "saas"
  | "chrome-extension"
  | "agentic";

export type Category =
  | "framework"
  | "authentication"
  | "stateManagement"
  | "database"
  | "ai"
  | "video"
  | "storage"
  | "email"
  | "payments"
  | "analytics"
  | "monitoring"
  | "hosting"
  | "styling"
  | "dataFetching"
  | "speechRecognition"
  | "textToSpeech"
  | "notifications"
  // Phase 3 — Production registry expansion
  | "caching"
  | "queueing"
  | "websocket"
  | "cms"
  | "searchProvider"
  | "imageProcessing"
  | "i18n"
  | "featureFlags"
  | "logging"
  | "walletProvider"
  | "mapsProvider"
  | "rateLimit"
  | "orm"
  | "testing"
  | "bundler"
  | "runtime"
  | "forms";

export type Budget = "free-only" | "low" | "flexible";

export interface Technology {
  id: string;
  name: string;
  category: Category;
  description: string;
  pricing: string;
  freeTier: boolean;
  docsUrl: string;
  pros: string[];
  cons: string[];
  installCommands: string[];
  /** Platform-specific install commands override. Key is platform name, value is install command array. */
  platformInstallCommands?: Partial<Record<string, string[]>>;
  envVars: string[];
  platforms: Platform[];
  /** Lower number = higher preference within a category. */
  priority: number;
}

export interface ProjectInput {
  name: string;
  description: string;
  platform: Platform;
  targetUsers: string;
  budget: Budget;
  preferredTechnologies: string[];
  features: string[];
  designInspirations: string[];
}

export interface Analysis {
  purpose: string;
  requiredCategories: Category[];
  complexity: "low" | "medium" | "high";
  architecture: string;
}

export interface Recommendation {
  category: Category;
  primary: Technology;
  alternatives: Technology[];
  rationale: string;
}

/** Maps a category to the id of the technology chosen by the user. */
export type Selections = Partial<Record<Category, string>>;

/** Maps a relative file path inside the package to its file content. */
export type GeneratedPackage = Record<string, string>;
