import { normalizeCategory } from "../registry";
import type { ProjectSpec, StackEntry } from "../../types/projectspec";

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/** Stack entries the user locked in (value != null), in category order. */
export function lockedEntries(spec: ProjectSpec): Array<[string, StackEntry & { value: string }]> {
  return Object.entries(spec.stack).filter(
    (e): e is [string, StackEntry & { value: string }] => e[1].value !== null,
  );
}

export function lowConfidenceEntries(spec: ProjectSpec): Array<[string, StackEntry & { value: string }]> {
  return lockedEntries(spec).filter(([, e]) => e.confidence === "low");
}

/** Deterministic ADR filename per locked category, shared by generators. */
export function decisionFileName(spec: ProjectSpec, category: string): string {
  const locked = lockedEntries(spec).map(([c]) => c);
  const index = locked.indexOf(category);
  const num = String((index === -1 ? locked.length : index) + 1).padStart(3, "0");
  return `decisions/${num}-${slugify(category)}.md`;
}

const FEATURE_CATEGORY_KEYWORDS: Array<{ keywords: string[]; normalized: string }> = [
  { keywords: ["auth", "login", "signup", "account"], normalized: "authentication" },
  { keywords: ["ai", "chat", "tutor", "assistant", "llm"], normalized: "ai" },
  { keywords: ["video", "stream", "call", "lesson"], normalized: "video" },
  { keywords: ["payment", "subscription", "billing", "checkout"], normalized: "payments" },
  { keywords: ["email", "newsletter"], normalized: "email" },
  { keywords: ["upload", "file", "image", "media", "storage"], normalized: "storage" },
  { keywords: ["profile", "user", "settings", "dashboard", "onboard", "xp", "progress"], normalized: "database" },
];

/**
 * Locked stack categories relevant to one feature (keyword heuristic).
 * The core framework, state and styling choices are always relevant.
 */
export function relevantCategoriesForFeature(spec: ProjectSpec, feature: string): string[] {
  const text = feature.toLowerCase();
  const wanted = new Set<string>(["framework", "stateManagement", "styling"]);
  for (const { keywords, normalized } of FEATURE_CATEGORY_KEYWORDS) {
    if (keywords.some((k) => text.includes(k))) wanted.add(normalized);
  }
  return lockedEntries(spec)
    .filter(([category]) => wanted.has(normalizeCategory(category)))
    .map(([category]) => category);
}

export function lowConfidenceWarning(tool: string): string {
  return `> **WARNING - LOW CONFIDENCE:** \"${tool}\" was community-suggested and its
> current state could not be verified. Before relying on any convention in this
> file, verify it against the tool's current official documentation.

`;
}
