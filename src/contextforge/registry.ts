import { TECHNOLOGIES } from "../registry/technologies";

/** Tier 1 registry entry shape (Section 5 of the brief). */
export interface RegistryEntry {
  name: string;
  category: string;
  docsUrl: string;
  pricing: string;
  freeTier: string;
  installCommands: string[];
  pros: string[];
  cons: string[];
  envVars: string[];
  skillGenerationHints: string;
}

/**
 * Dynamic Category Discovery may return any camelCase category name.
 * Aliases map discovered names onto registry categories where they overlap.
 * Unknown categories simply have no registry entries -> Tier 2 path.
 */
const CATEGORY_ALIASES: Record<string, string> = {
  frontendframework: "framework",
  backendframework: "framework",
  cliframework: "framework",
  framework: "framework",
  authentication: "authentication",
  auth: "authentication",
  database: "database",
  statemanagement: "stateManagement",
  styling: "styling",
  ai: "ai",
  aiprovider: "ai",
  video: "video",
  videoprovider: "video",
  payments: "payments",
  email: "email",
  emailprovider: "email",
  analytics: "analytics",
  monitoring: "monitoring",
  storage: "storage",
};

export function normalizeCategory(category: string): string {
  return CATEGORY_ALIASES[category.toLowerCase()] ?? category;
}

export const REGISTRY: RegistryEntry[] = TECHNOLOGIES.map((t) => ({
  name: t.name,
  category: t.category,
  docsUrl: t.docsUrl,
  pricing: t.pricing,
  freeTier: t.freeTier ? "Yes" : "No",
  installCommands: t.installCommands,
  pros: t.pros,
  cons: t.cons,
  envVars: t.envVars,
  skillGenerationHints: t.description,
}));

export function registryFor(category: string): RegistryEntry[] {
  const normalized = normalizeCategory(category);
  return REGISTRY.filter((e) => e.category === normalized);
}

export function registryByName(name: string): RegistryEntry | undefined {
  const n = name.trim().toLowerCase();
  return (
    REGISTRY.find((e) => e.name.toLowerCase() === n) ??
    REGISTRY.find((e) => e.name.toLowerCase().includes(n) || n.includes(e.name.toLowerCase()))
  );
}
