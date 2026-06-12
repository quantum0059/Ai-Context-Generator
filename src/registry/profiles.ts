import type { Category, Platform } from "../types";

/** Categories that are always considered for a given platform profile. */
export const PROFILES: Record<Platform, Category[]> = {
  web: [
    "framework",
    "authentication",
    "stateManagement",
    "database",
    "styling",
    "analytics",
    "monitoring",
  ],
  mobile: [
    "framework",
    "authentication",
    "stateManagement",
    "database",
    "styling",
    "analytics",
    "monitoring",
  ],
  backend: ["framework", "authentication", "database", "monitoring"],
  saas: [
    "framework",
    "authentication",
    "stateManagement",
    "database",
    "styling",
    "payments",
    "email",
    "analytics",
    "monitoring",
  ],
  "chrome-extension": ["framework", "stateManagement", "storage", "analytics"],
  agentic: ["framework", "ai", "database", "storage", "monitoring"],
};

/** Keyword triggers that add optional categories based on description/features. */
export const KEYWORD_CATEGORIES: Array<{ keywords: string[]; category: Category }> = [
  { keywords: ["ai", "chat", "tutor", "assistant", "llm", "gpt"], category: "ai" },
  { keywords: ["video", "stream", "call", "lesson"], category: "video" },
  { keywords: ["payment", "subscription", "checkout", "billing", "stripe"], category: "payments" },
  { keywords: ["email", "newsletter", "notification"], category: "email" },
  { keywords: ["upload", "file", "image", "storage", "media"], category: "storage" },
  { keywords: ["auth", "login", "signup", "account", "user"], category: "authentication" },
];
