import { normalizeCategory } from "../registry";
import type { ProjectSpec, StackEntry } from "../../types/projectspec";

/**
 * Builds a hard-constraint block from the ProjectSpec to be injected at the
 * TOP of every AI system prompt. Prevents the model from hallucinating
 * Express routes, JWT auth, cloud services, or forbidden packages.
 */
export function buildConstraintBlock(spec: ProjectSpec): string {
  const lines: string[] = [];

  if (spec.constraints?.technical?.mustBeOffline) {
    lines.push(
      '🚫 HARD CONSTRAINT: This is a FULLY OFFLINE ' +
      'application. No internet access. No cloud ' +
      'services. No external APIs of any kind. ' +
      'Every library must work without a network connection.'
    );
  }

  if (spec.constraints?.technical?.mustUseLocalStorage) {
    lines.push(
      '🚫 HARD CONSTRAINT: All data must be stored ' +
      'locally. Do NOT use Supabase, Firebase, ' +
      'PostgreSQL hosted remotely, or any cloud database.'
    );
  }

  const forbidden = [
    ...(spec.constraints?.technical?.forbiddenTools ?? []),
    ...(spec.constraints?.avoid ?? []),
  ];
  if (forbidden.length > 0) {
    lines.push(
      '🚫 FORBIDDEN TOOLS — do NOT import, reference, ' +
      'or suggest these under any circumstances: ' +
      forbidden.join(', ')
    );
  }

  if (spec.constraints?.technical?.forbiddenCategories?.length) {
    lines.push(
      '🚫 FORBIDDEN CATEGORIES — do not generate code ' +
      'for: ' +
      spec.constraints.technical.forbiddenCategories.join(', ')
    );
  }

  // Derive additional constraints from stack choices
  const stackValues = Object.values(spec.stack ?? {})
    .filter((v) => v?.value)
    .map((v) => v!.value!.toLowerCase());

  const hasBackend = stackValues.some((v) =>
    ['express', 'fastify', 'hono', 'nestjs', 'koa'].some((b) => v.includes(b))
  );
  if (!hasBackend) {
    lines.push(
      '🚫 NO HTTP SERVER: There is no Express, ' +
      'Fastify, or any HTTP framework in this stack. ' +
      'Do NOT generate API routes, middleware, or ' +
      'HTTP handlers.'
    );
  }

  const hasAuth = stackValues.some((v) =>
    ['clerk', 'auth0', 'nextauth', 'lucia', 'passport'].some((a) => v.includes(a))
  );
  if (!hasAuth && spec.constraints?.technical?.mustBeOffline) {
    lines.push(
      '🚫 NO AUTHENTICATION SYSTEM: This is a single-' +
      'user offline application. Do NOT generate JWT, ' +
      'sessions, login flows, user registration, or ' +
      'any authentication code.'
    );
  }

  const lockedPackages = Object.values(spec.stack ?? {})
    .filter((v) => v?.value)
    .map((v) => v!.value!);

  if (lockedPackages.length > 0) {
    lines.push(
      '✅ LOCKED PACKAGES — ONLY use these: ' +
      lockedPackages.join(', ') +
      '. Do not introduce any package not in this list.'
    );
  }

  if (lines.length === 0) return '';

  return `

## ⚠️ HARD CONSTRAINTS — READ BEFORE GENERATING
These constraints override everything else. Any output that violates these constraints is incorrect regardless of how technically sound it appears.

${lines.join('\n\n')}

## End of Constraints
`;
}

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

/**
 * Builds a shared context string from the already-generated agents.md and
 * template files so that all subsequent AI generators see the constitutional
 * rules and canonical code patterns before producing any output.
 *
 * This is injected at the END of every system prompt (after the constraint
 * block) to prevent generated files from contradicting agents.md or templates.
 */
export function buildSharedContext(
  agentsContent: string,
  templateFiles: Record<string, string>,
): string {
  // First 100 lines contain the project constitution (rules, stack, conventions)
  const agentsSummary = agentsContent
    .split('\n')
    .slice(0, 100)
    .join('\n');

  // The two most critical pattern files: service layer and API routes
  const serviceTemplate =
    templateFiles['templates/service-template.md'] ?? '';

  const apiTemplate =
    templateFiles['templates/api-route-template.md'] ?? '';

  return `

## Shared Project Context
The following rules are ALREADY ESTABLISHED in this project's agents.md and
templates. Every file you generate MUST comply with them. Any output that
contradicts these rules is incorrect regardless of how technically sound it
appears.

### Established Architecture Rules (from agents.md)
${agentsSummary}

### Established Service Pattern (from templates/service-template.md)
The excerpt below shows the canonical service-layer pattern for this project.
SDKs (including tree-sitter, better-sqlite3, and all other packages) are
imported ONLY in service files. API routes and components MUST NOT import them.

${serviceTemplate.slice(0, 500)}

### Established API Route Pattern (from templates/api-route-template.md)
API routes delegate ALL database/SDK work to service modules — they never
import tree-sitter, better-sqlite3, or any other SDK directly.

${apiTemplate.slice(0, 500)}

## End of Shared Context
`;
}

export type Ecosystem = 
  | 'javascript'
  | 'typescript' 
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'kotlin'
  | 'swift'
  | 'csharp'
  | 'cpp'
  | 'ruby'
  | 'php'
  | 'unknown'

export function detectPrimaryEcosystem(
  spec: ProjectSpec
): Ecosystem {
  const text = [
    spec.description,
    spec.platform,
    ...Object.values(spec.stack ?? {})
      .map(v => v?.value ?? '')
  ].join(' ').toLowerCase()

  // Check for explicit language mentions first
  if (text.includes('rust') || 
      text.includes('cargo') || 
      text.includes('.rs')) return 'rust'
      
  if (text.includes(' go ') || 
      text.includes('golang') || 
      text.includes('go module') ||
      text.includes('.go')) return 'go'
      
  if (text.includes('python') || 
      text.includes('pip ') ||
      text.includes('django') || 
      text.includes('fastapi') ||
      text.includes('flask') ||
      text.includes('.py')) return 'python'
      
  if (text.includes('java ') || 
      text.includes('spring boot') ||
      text.includes('maven') || 
      text.includes('gradle') ||
      text.includes('.java')) return 'java'
      
  if (text.includes('kotlin') || 
      text.includes('android') ||
      text.includes('.kt')) return 'kotlin'
      
  if (text.includes('swift') || 
      text.includes('ios') ||
      text.includes('xcode') ||
      text.includes('.swift')) return 'swift'
      
  if (text.includes('c#') || 
      text.includes('csharp') ||
      text.includes('.net') ||
      text.includes('dotnet') ||
      text.includes('blazor')) return 'csharp'
      
  if (text.includes('c++') || 
      text.includes('cpp') ||
      text.includes('cmake') ||
      text.includes('.cpp')) return 'cpp'
      
  if (text.includes('ruby') || 
      text.includes('rails') ||
      text.includes('gemfile') ||
      text.includes('.rb')) return 'ruby'
      
  if (text.includes('php') || 
      text.includes('laravel') ||
      text.includes('composer') ||
      text.includes('.php')) return 'php'

  // Default: assume JS/TS ecosystem
  // (Next.js, React, Node, Expo, etc.)
  return 'typescript'
}

const JS_TS_ECOSYSTEMS: Ecosystem[] = [
  'javascript', 
  'typescript'
]

export function isNonJsEcosystem(
  ecosystem: Ecosystem
): boolean {
  return !JS_TS_ECOSYSTEMS.includes(ecosystem)
}
