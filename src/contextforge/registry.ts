import { TECHNOLOGIES } from "../registry/technologies";

/** Tier 1 registry entry shape (Section 5 of the brief). */
export interface RegistryEntry {
  name: string;
  category: string;
  docsUrl: string;
  pricing: string;
  freeTier: string;
  installCommands: string[];
  /** Platform-specific install commands override. Key is platform name, value is install command array. */
  platformInstallCommands?: Partial<Record<string, string[]>>;
  pros: string[];
  cons: string[];
  envVars: string[];
  skillGenerationHints: string;
  /** Platforms this technology supports — used for platform-aware filtering. */
  platforms: string[];
}

/**
 * Dynamic Category Discovery may return any camelCase category name.
 * Aliases map discovered names onto registry categories where they overlap.
 * Unknown categories simply have no registry entries -> Tier 2 path.
 */
const CATEGORY_ALIASES: Record<string, string> = {
  // Frameworks
  frontendframework: "framework",
  backendframework: "framework",
  cliframework: "framework",
  framework: "framework",
  // Auth
  authentication: "authentication",
  auth: "authentication",
  // Data
  database: "database",
  db: "database",
  // State
  statemanagement: "stateManagement",
  // Styling
  styling: "styling",
  css: "styling",
  // AI
  ai: "ai",
  aiprovider: "ai",
  llm: "ai",
  // Video
  video: "video",
  videoprovider: "video",
  // Payments
  payments: "payments",
  billing: "payments",
  // Email
  email: "email",
  emailprovider: "email",
  // Analytics
  analytics: "analytics",
  // Monitoring
  monitoring: "monitoring",
  errortracking: "monitoring",
  // Storage
  storage: "storage",
  filestorage: "storage",
  objectstorage: "storage",
  // ORM
  orm: "orm",
  objectrelationalmapper: "orm",
  // Testing
  testing: "testing",
  tests: "testing",
  testframework: "testing",
  testrunner: "testing",
  // Bundler
  bundler: "bundler",
  // Runtime
  runtime: "runtime",
  // Forms
  forms: "forms",
  formvalidation: "forms",
  // i18n
  i18n: "i18n",
  internationalisation: "i18n",
  internationalization: "i18n",
  // Caching
  caching: "caching",
  cache: "caching",
  // Queueing
  queueing: "queueing",
  queue: "queueing",
  backgroundjobs: "queueing",
  jobqueue: "queueing",
  // WebSocket / Realtime
  websocket: "websocket",
  realtime: "websocket",
  realtimemessaging: "websocket",
  pubsub: "websocket",
  // CMS
  cms: "cms",
  contentmanagement: "cms",
  headlesscms: "cms",
  // Search
  searchprovider: "searchProvider",
  search: "searchProvider",
  fulltextsearch: "searchProvider",
  // Image Processing
  imageprocessing: "imageProcessing",
  imagetransformation: "imageProcessing",
  mediastorage: "imageProcessing",
  // Feature Flags
  featureflags: "featureFlags",
  featuretoggles: "featureFlags",
  abtesting: "featureFlags",
  // Logging
  logging: "logging",
  logs: "logging",
  observability: "logging",
  // Wallet / Web3
  walletprovider: "walletProvider",
  wallet: "walletProvider",
  web3: "walletProvider",
  blockchain: "walletProvider",
  // Maps
  mapsprovider: "mapsProvider",
  maps: "mapsProvider",
  geolocation: "mapsProvider",
  mapping: "mapsProvider",
  // Rate Limiting
  ratelimit: "rateLimit",
  ratelimiting: "rateLimit",
  throttling: "rateLimit",
  // Notifications
  notifications: "notifications",
  pushnotifications: "notifications",
  // Data Fetching
  datafetching: "dataFetching",
  // Speech
  speechrecognition: "speechRecognition",
  stt: "speechRecognition",
  texttospeech: "textToSpeech",
  tts: "textToSpeech",
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
  platformInstallCommands: t.platformInstallCommands,
  pros: t.pros,
  cons: t.cons,
  envVars: t.envVars,
  skillGenerationHints: t.description,
  platforms: t.platforms,
}));

/**
 * Returns all registry entries for a category, optionally filtered to only
 * those that support the given platform. This prevents web frameworks from
 * being suggested for CLI or backend projects, and vice versa.
 *
 * @param category - The camelCase category key (will be normalized via aliases)
 * @param platform - Optional platform string to filter by (e.g. "web", "backend", "mobile")
 */
export function registryFor(category: string, platform?: string): RegistryEntry[] {
  const normalized = normalizeCategory(category);
  const entries = REGISTRY.filter((e) => e.category === normalized);

  if (!platform) return entries;

  // Normalize incoming platform to one of the known platform strings
  const normalizedPlatform = normalizePlatform(platform);
  if (!normalizedPlatform) return entries; // unknown platform — return all

  const filtered = entries.filter((e) => e.platforms.includes(normalizedPlatform));
  // If platform filtering removes ALL entries, fall back to the full list so
  // the pipeline doesn't silently drop to Tier 2 for a configuration mistake.
  return filtered.length > 0 ? filtered : entries;
}

/**
 * Maps incoming platform strings (from user input or discovery) onto the
 * canonical platform identifiers used in technologies.ts.
 */
function normalizePlatform(platform: string): string | null {
  const p = platform.toLowerCase().replace(/[-_\s]/g, "");
  const map: Record<string, string> = {
    web: "web",
    webapp: "web",
    website: "web",
    frontend: "web",
    mobile: "mobile",
    mobileiosandroid: "mobile",
    ios: "mobile",
    android: "mobile",
    reactnative: "mobile",
    backend: "backend",
    api: "backend",
    server: "backend",
    saas: "saas",
    softwareasaservice: "saas",
    chromeextension: "chrome-extension",
    browserextension: "chrome-extension",
    extension: "chrome-extension",
    agentic: "agentic",
    agent: "agentic",
    aiagent: "agentic",
    cli: "backend", // CLI tools run on backend/server — backend entries are valid
  };
  return map[p] ?? null;
}

export function registryByName(name: string): RegistryEntry | undefined {
  const n = name.trim().toLowerCase();
  return (
    REGISTRY.find((e) => e.name.toLowerCase() === n) ??
    REGISTRY.find((e) => e.name.toLowerCase().includes(n) || n.includes(e.name.toLowerCase()))
  );
}

/**
 * Called once at module load to detect KEYWORD_TRIGGERS categories that have
 * no registry coverage. These would silently fall to Tier 2 hallucination.
 * Emits a console.warn so developers notice gaps immediately.
 */
export function validateRegistryCoverage(keywordTriggerCategories: string[]): void {
  for (const rawCategory of keywordTriggerCategories) {
    const normalized = normalizeCategory(rawCategory);
    const entries = REGISTRY.filter((e) => e.category === normalized);
    if (entries.length === 0) {
      console.warn(
        `[Registry] ⚠️  Category "${rawCategory}" (normalized: "${normalized}") has NO registry entries. ` +
        `Projects triggering this category will always fall through to Tier 2 LLM suggestions. ` +
        `Add at least one entry to registry/technologies.ts.`
      );
    }
  }
}
