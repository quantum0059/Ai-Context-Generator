import { z } from "zod";
import { claudeJson, claudeText, isClaudeConfigured } from "../../lib/claude";
import type { PackageFiles, ProjectSpec } from "../../types/projectspec";
import { buildConstraintBlock, buildTechCodeSnippets, buildSharedDatabaseSchema, lockedEntries, slugify } from "./shared";
import { MODELS } from "../../lib/ai-models";

const aspectSchema = z.object({
  aspect: z.string(),
  title: z.string(),
  description: z.string(),
});

type Aspect = z.infer<typeof aspectSchema>;

async function getFeatureAspects(spec: ProjectSpec, feature: string, sharedContext: string = ''): Promise<Aspect[]> {
  if (isClaudeConfigured()) {
    try {
      const systemPrompt = `${buildConstraintBlock(spec)}You are a senior engineer. Given a feature and a technology stack, determine the implementation aspects that need separate build prompts. An aspect is a distinct implementation concern that an AI works on independently.

Return a JSON object only, no other text:
{
  "aspects": [{
    "aspect": "database-schema",
    "title": "Build the database schema",
    "description": "Create tables, RLS policies, types"
  }]
}

Common aspects to consider (only include what applies):
- database-schema (if there is a database in the stack)
- api-routes (if there is a backend)
- ui-components (if there is a frontend)
- state-management (if there is a state library)
- authentication-integration (if auth is involved)
- error-handling
- testing
${sharedContext}`;

      const userPrompt = `Feature: ${feature}
Stack: ${JSON.stringify(spec.stack)}
Platform: ${spec.platform}

What aspects does this feature need? Return only aspects that are relevant to this specific stack.`;

      const result = await claudeJson(
        systemPrompt,
        userPrompt,
        z.object({ aspects: z.array(aspectSchema) }),
        1,
        MODELS.CONTENT,
      );
      return filterAspectsAgainstConstraints(ensureRequiredAspects(feature, result.aspects), spec);
    } catch {
      // fall through to heuristics
    }
  }
  return filterAspectsAgainstConstraints(ensureRequiredAspects(feature, heuristicFeatureAspects(spec, feature)), spec);
}

function ensureRequiredAspects(feature: string, aspects: Aspect[]): Aspect[] {
  if (!/\b(ast|parser|concept detection)\b/i.test(feature)) return aspects;
  if (aspects.some((aspect) => aspect.aspect === "concept-detection")) return aspects;
  return [
    ...aspects,
    {
      aspect: "concept-detection",
      title: `Build concept detection for ${feature}`,
      description: "Detect programming concepts from normalized AST nodes and query matches",
    },
  ];
}

/**
 * Post-processes the aspect list returned by the AI to remove any aspects that
 * are architecturally invalid given the project constraints. This is the key
 * gate that prevents api-routes and authentication-integration prompts from
 * ever being generated for offline, no-backend projects.
 */
function filterAspectsAgainstConstraints(aspects: Aspect[], spec: ProjectSpec): Aspect[] {
  const isOffline = spec.constraints?.technical?.mustBeOffline;

  const hasHttpServer = Object.values(spec.stack ?? {}).some((v) =>
    ['express', 'fastify', 'hono', 'nestjs'].some((f) =>
      v?.value?.toLowerCase().includes(f)
    )
  );

  return aspects.filter((aspect) => {
    // Remove auth aspects for offline single-user apps
    if (isOffline && aspect.aspect.includes('authentication')) {
      console.log(
        `[AspectFilter] Removed ${aspect.aspect} — auth not valid for offline app`
      );
      return false;
    }

    // Remove API route aspects when no HTTP server is in the stack
    if (aspect.aspect === 'api-routes' && !hasHttpServer) {
      console.log(
        `[AspectFilter] Removed api-routes — no HTTP server in stack`
      );
      return false;
    }

    return true;
  });
}

export function isPromptContentValid(content: string, featureName: string, aspect: string): boolean {
  const checks = [
    content.includes(featureName),
    content.includes("src/"),
    content.includes("Acceptance Criteria") || content.includes("- [ ]"),
    !content.includes("expect(true).toBe(true)"),
    !content.includes("export default function feature"),
    content.includes("interface "),
    content.includes(aspect) || content.toLowerCase().includes(aspect.replaceAll("-", " ").toLowerCase()),
    content.length > 500,
  ];
  return checks.every(Boolean);
}

function heuristicFeatureAspects(spec: ProjectSpec, feature: string): Aspect[] {
  const isBackendOnly = spec.platform === "backend-only" || spec.platform === "cli";
  if (isBackendOnly) {
    return [
      { aspect: "api-routes", title: `Build API routes for ${feature}`, description: "Endpoints and business logic" }
    ];
  }
  return [
    { aspect: "ui-components", title: `Build UI components for ${feature}`, description: "User interface and state" },
    { aspect: "api-routes", title: `Build API routes for ${feature}`, description: "Endpoints and integration" }
  ];
}

// ─── Aspect-specific deliverable descriptors ─────────────────────────────────

function getAspectDeliverables(
  aspectKey: string,
  feature: string,
  spec: ProjectSpec,
): { description: string; files: string[] } {
  const slug = slugify(feature);
  const platform = spec.platform.toLowerCase();
  const isMobile = /mobile|ios|android|react.?native|expo/.test(platform);
  const isWeb = /web|saas|browser|extension/.test(platform);
  // Next.js paths are ONLY valid on a web/saas platform. On mobile we never
  // emit App Router paths even if "next" appears in the stack by mistake.
  const isNextjs = isWeb && Object.values(spec.stack ?? {}).some(
    (v) => v?.value?.toLowerCase().includes('next'),
  );
  const isExpress = Object.values(spec.stack ?? {}).some(
    (v) => v?.value?.toLowerCase().includes('express') || v?.value?.toLowerCase().includes('fastify'),
  );

  if (/ui|component|frontend|client/.test(aspectKey)) {
    const cmp = `src/components/${slug}/${feature.replace(/\s+/g, '')}`;
    let files: string[];
    if (isMobile) {
      // Expo Router screen + presentational components.
      files = [`app/${slug}.tsx`, `${cmp}Screen.tsx`, `src/components/${slug}/index.ts`];
    } else if (isNextjs) {
      files = [`src/app/${slug}/page.tsx`, `${cmp}Client.tsx`, `src/components/${slug}/index.ts`];
    } else {
      files = [`src/pages/${slug}.tsx`, `src/components/${slug}/index.tsx`];
    }
    return {
      description: `Build the complete **${feature}** user interface for ${spec.projectName}. This includes the ${isMobile ? 'screen' : 'page'} component, all child components, loading/error/empty states, and navigation integration. All external data must arrive via props or hooks — no SDK imports in this layer.`,
      files,
    };
  }
  if (/api|backend|route|server|endpoint/.test(aspectKey)) {
    const routeFile = isNextjs
      ? `src/app/api/${slug}/route.ts`
      : isExpress
      ? `src/routes/${slug}.ts`
      : `src/api/${slug}.ts`;
    return {
      description: `Build the **${feature}** backend layer for ${spec.projectName}. This includes API routes, input validation with Zod, the service module that encapsulates all SDK/DB calls, and typed domain types. No SDK imports in route files — all DB/SDK access goes through the service module.`,
      files: [routeFile, `src/services/${slug}.ts`, `src/types/${slug}.ts`],
    };
  }
  if (/database|schema|migration/.test(aspectKey)) {
    const usesPostgres = Object.values(spec.stack ?? {}).some(
      (v) => /supabase|postgres|neon|drizzle|prisma/.test(v?.value?.toLowerCase() ?? ''),
    );
    const usesSupabase = Object.values(spec.stack ?? {}).some(
      (v) => v?.value?.toLowerCase().includes('supabase'),
    );
    const securityNote = usesSupabase
      ? ' RLS policies (Supabase enforces row ownership at the database layer),'
      : usesPostgres
      ? ' row-ownership constraints,'
      : ' user-scoping enforced in every query (this database has no row-level security),';
    return {
      description: `Define the **${feature}** database schema for ${spec.projectName}. This includes table definitions, indexes,${securityNote} and migration files.`,
      files: [`src/lib/schema/${slug}.sql`, `src/lib/migrations/001_${slug}.sql`],
    };
  }
  if (/state|store/.test(aspectKey)) {
    return {
      description: `Implement the **${feature}** client-side state store for ${spec.projectName}. Define state shape, actions, and selectors. Server data is fetched in the data layer, not stored here.`,
      files: [`src/stores/${slug}Store.ts`],
    };
  }
  if (/auth/.test(aspectKey)) {
    return {
      description: `Integrate authentication for the **${feature}** feature in ${spec.projectName}. This includes route protection, session propagation, and user-scoped data access.`,
      files: isNextjs
        ? ['src/middleware.ts', `src/app/api/${slug}/route.ts`]
        : ['src/middleware/auth.ts'],
    };
  }
  if (/test/.test(aspectKey)) {
    return {
      description: `Write comprehensive tests for the **${feature}** feature in ${spec.projectName}. Cover happy paths, failure paths, and edge cases for all public service functions.`,
      files: [`src/__tests__/${slug}.test.ts`],
    };
  }
  // Generic fallback
  return {
    description: `Implement the **${aspectKey}** concern for the **${feature}** feature in ${spec.projectName}.`,
    files: [`src/features/${slug}/${aspectKey}.ts`],
  };
}

function getAspectAcceptanceCriteria(aspectKey: string, feature: string, spec: ProjectSpec): string[] {
  const base = [
    `All code uses only the locked stack (${lockedEntries(spec).map(([, e]) => e.value).join(', ')})`,
    `No technology outside the locked stack is imported`,
    `TypeScript strict mode passes — no implicit \`any\``,
  ];
  if (/ui|component|frontend/.test(aspectKey)) return [
    ...base,
    `${feature} renders correctly on ${spec.platform} — loading skeleton visible while data fetches`,
    `Empty state shows an illustration, message, and call-to-action`,
    `Error state shows a user-friendly message and a retry button`,
    `All interactive elements are keyboard-accessible and meet WCAG 2.1 AA`,
  ];
  if (/api|backend|route/.test(aspectKey)) return [
    ...base,
    `POST/PUT requests validate input with Zod before touching the service layer`,
    `Invalid input returns 400 with \`{ error: string, details: ZodError }\``,
    `Unauthenticated requests return 401`,
    `Service module is the only layer that imports external SDKs`,
    `All async operations have try/catch with logged errors`,
  ];
  if (/database|schema/.test(aspectKey)) {
    const usesPostgres = Object.values(spec.stack ?? {}).some(
      (v) => /supabase|postgres|neon|drizzle|prisma/.test(v?.value?.toLowerCase() ?? ''),
    );
    const ownershipCriterion = usesPostgres
      ? `RLS policies prevent users from accessing other users' rows`
      : `Every query is scoped by user/owner id — no row-level security is assumed (this DB does not support it)`;
    return [
      ...base,
      `Migration runs without error on a clean database`,
      ownershipCriterion,
      `All foreign keys have ON DELETE CASCADE where appropriate`,
      `Indexes exist on columns used in WHERE clauses`,
    ];
  }
  if (/auth/.test(aspectKey)) return [
    ...base,
    `Unauthenticated user accessing protected route is redirected to sign-in`,
    `Authenticated user's ID is correctly propagated to all service calls`,
    `Session expiry is handled gracefully — user is redirected without data loss`,
  ];
  return [
    ...base,
    `${feature} ${aspectKey} works end-to-end on ${spec.platform}`,
    `Unit tests cover happy path and at least one failure path`,
  ];
}

function getAspectAntiPatterns(aspectKey: string, spec: ProjectSpec): string[] {
  const stackValues = lockedEntries(spec).map(([, e]) => e.value.toLowerCase());
  const patterns: string[] = [
    'Do not introduce packages not in the locked stack',
    'Do not use `any` type — every value must be explicitly typed',
  ];
  if (stackValues.some((v) => v.includes('supabase'))) {
    patterns.push('Do not query Supabase without a `user_id` filter — this exposes all rows to any user');
    patterns.push('Do not call `supabase` directly in React components — use the service layer');
  }
  if (stackValues.some((v) => v.includes('clerk'))) {
    patterns.push('Do not use `useUser()` in Server Components — use `auth()` from `@clerk/nextjs/server`');
    patterns.push('Do not expose the Clerk `userId` as a URL parameter — use server-side session only');
  }
  if (stackValues.some((v) => v.includes('stripe'))) {
    patterns.push('Do not skip webhook signature verification — always call `stripe.webhooks.constructEvent()`');
    patterns.push('Do not grant subscription access until the webhook confirms it — not at checkout redirect');
  }
  const platform = spec.platform.toLowerCase();
  const isMobile = /mobile|ios|android|react.?native|expo/.test(platform);
  const isWeb = /web|saas|browser|extension/.test(platform);
  if (isWeb && stackValues.some((v) => v.includes('next'))) {
    patterns.push('Do not fetch data in Client Components — fetch in Server Components, pass as props');
    patterns.push('Do not add `"use client"` to a file unless it uses hooks, events, or browser APIs');
  }
  if (isMobile) {
    patterns.push('Do not import next/* , react-dom, or any web-only API — this is a React Native app');
    patterns.push('Do not use <div>/<span>/HTML elements — use React Native <View>/<Text> primitives');
    patterns.push('Do not use the Next.js App Router — navigation uses Expo Router / React Navigation');
  }
  if (/ui|component/.test(aspectKey)) {
    patterns.push('Do not import any SDK (Supabase, Stripe, etc.) directly in a component file');
  }
  if (/api|backend/.test(aspectKey)) {
    patterns.push('Do not put business logic in API route files — it belongs in the service module');
  }
  return patterns;
}

function getAspectTestCode(aspectKey: string, feature: string, spec: ProjectSpec): string {
  const slug = slugify(feature);
  // Vitest is the canonical test runner for the generated project. We never
  // fall back to Jest imports — the stack validator forbids jest.fn()/@jest
  // usage and an AI agent should only ever see one consistent runner.
  const runner = "import { describe, it, expect, vi, beforeEach } from 'vitest';";
  const mockFn = 'vi.fn()';
  const clearMocks = 'vi.clearAllMocks()';

  if (/api|backend|route/.test(aspectKey)) {
    return `${runner}
import { ${slug}Service } from '@/services/${slug}';

vi.mock('@/lib/supabase/client'); // mock only at the service boundary

describe('${feature} service', () => {
  beforeEach(() => { ${clearMocks}; });

  it('returns data for an authenticated user', async () => {
    const result = await ${slug}Service.list('user-123');
    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
  });

  it('throws when user is not authenticated', async () => {
    await expect(${slug}Service.list('')).rejects.toThrow();
  });
});`;
  }

  if (/ui|component|frontend|client/.test(aspectKey)) {
    return `${runner}
import { render, screen } from '@testing-library/react';

describe('${feature} — ${aspectKey}', () => {
  it('renders the primary content when data is provided', () => {
    render(<${slug.replace(/(^|-)([a-z])/g, (_m, _s, c) => c.toUpperCase())}View items={[{ id: '1', title: 'Example' }]} />);
    expect(screen.getByText('Example')).toBeInTheDocument();
  });

  it('shows the empty state when there is no data', () => {
    render(<${slug.replace(/(^|-)([a-z])/g, (_m, _s, c) => c.toUpperCase())}View items={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent(/no .*yet/i);
  });

  it('shows an error message and a retry control on failure', () => {
    render(<${slug.replace(/(^|-)([a-z])/g, (_m, _s, c) => c.toUpperCase())}View error="Failed to load" />);
    expect(screen.getByText('Failed to load')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});`;
  }

  return `${runner}
import { ${slug}Reducer, initialState } from '@/features/${slug}/state';

describe('${feature} — ${aspectKey}', () => {
  it('starts from a well-defined initial state', () => {
    expect(initialState).toBeDefined();
    expect(initialState.error).toBeNull();
  });

  it('updates state in response to a successful action', () => {
    const next = ${slug}Reducer(initialState, { type: 'loaded', payload: [{ id: '1' }] });
    expect(next.items).toHaveLength(1);
    expect(next.error).toBeNull();
  });

  it('records an error when an action fails', () => {
    const next = ${slug}Reducer(initialState, { type: 'failed', error: 'boom' });
    expect(next.error).toBe('boom');
  });
});`;
}

/** Rich static fallback — produces differentiated, code-bearing prompts without AI */
function richFallbackPrompt(
  spec: ProjectSpec,
  feature: string,
  aspect: Aspect,
  priorFeatures: string[],
): string {
  const deliverables = getAspectDeliverables(aspect.aspect, feature, spec);
  const criteria = getAspectAcceptanceCriteria(aspect.aspect, feature, spec);
  const antiPatterns = getAspectAntiPatterns(aspect.aspect, spec);
  const testCode = getAspectTestCode(aspect.aspect, feature, spec);
  const snippets = buildTechCodeSnippets(spec);
  const schema = buildSharedDatabaseSchema(spec);

  const stackTable = lockedEntries(spec)
    .map(([cat, e]) => `| ${cat} | ${e.value} |`)
    .join('\n');

  const constraintBlock = buildConstraintBlock(spec);

  return `# Build: ${aspect.title} — ${spec.projectName}
${constraintBlock}
> **Copy-paste this entire prompt into your AI assistant.** It contains everything
> the assistant needs to build this aspect correctly on the first attempt.

---

## Context

Load these files into your AI assistant **before** starting this aspect:

1. \`agents.md\` — project constitution (always required)
2. \`tech-stack.md\` — technology reference with setup details
3. \`context-manifests/${slugify(feature)}-guide.md\` — feature guide
4. \`decisions/\` — ADRs for why each technology was chosen
5. \`templates/service-template.md\` — service layer pattern

---

## Dependencies

**Build these features first:**
${priorFeatures.length > 0
  ? priorFeatures.map((f) => `- ✅ ${f} (must already exist)`).join('\n')
  : '- None — this is the first feature to build.'}

---

## What You Are Building

${deliverables.description}

### Tech Stack (LOCKED — Do Not Change)

| Category | Technology |
|---|---|
${stackTable}

---

## Required File Structure

Create **exactly** these files at **exactly** these paths:

\`\`\`
${deliverables.files.join('\n')}
\`\`\`

For each file:
- Export named exports (never default exports for services/hooks)
- Add a \`// @description\` comment at the top explaining its purpose
- Use TypeScript strict mode — no \`any\`, no non-null assertions without a guard

---
${snippets}
${schema}

---

## What NOT To Do

${antiPatterns.map((p) => `- ❌ ${p}`).join('\n')}

---

## Acceptance Criteria

${criteria.map((c) => `- [ ] ${c}`).join('\n')}

---

## Test Cases

\`\`\`typescript
${testCode}
\`\`\`
`;
}

async function generateAspectPrompt(
  spec: ProjectSpec,
  feature: string,
  aspect: Aspect,
  priorFeatures: string[],
  sharedContext: string = '',
): Promise<string> {
  if (isClaudeConfigured()) {
    const constraintBlock = buildConstraintBlock(spec);
    const snippets = buildTechCodeSnippets(spec);
    const schema = buildSharedDatabaseSchema(spec);

    const systemPrompt = `${constraintBlock}You are a senior engineer writing implementation instructions for an AI coding assistant. The AI will read ONLY this file before implementing this aspect. Be so specific that the AI produces correct code on the first attempt.

Rules:
- Include exact file paths to create or modify
- Include the complete TypeScript interface/type definitions the AI must use
- Include the exact function signatures to implement
- Include real example code for the most complex part
- Include explicit acceptance criteria as a checklist
- Include the exact test cases that prove it works
- Include what NOT to do for this specific stack
- Never say 'implement X' without showing what X looks like for this project's stack
- Say "Required File Structure" not "Suggested File Structure"
${sharedContext}
${snippets}
${schema}`;

    const stackString = Object.entries(spec.stack)
      .map(([cat, tool]) => `${cat}: ${tool?.value}`)
      .join('\n');

    const userPrompt = `Project: ${spec.projectName}
Platform: ${spec.platform}
Feature: ${feature}
Aspect: ${aspect.aspect} — ${aspect.description}

Tech stack in use:
${stackString}

Features already built (assume these exist and do not re-implement them):
${priorFeatures.length > 0 ? priorFeatures.join(', ') : 'None — this is the first feature.'}

Generate the complete implementation prompt for this aspect. Structure it exactly as:

# Build: ${aspect.title}

## Context
Which files to load before starting this aspect (from the context package).

## Dependencies
List features that must already be built: ${priorFeatures.join(', ') || 'None'}

## What You Are Building
One paragraph describing exactly what this aspect produces and how it fits into the larger feature.

## Required File Structure
For each file include an exact path beginning with src/, its purpose, exports, and complete TypeScript interfaces and function signatures.

## Files to Modify
For each existing file include an exact path beginning with src/ and the exact change.

## Implementation Notes
Include one real TypeScript code snippet showing the correct pattern.

## What NOT To Do
List specific anti-patterns for this exact stack.

## Acceptance Criteria
Include at least 3 specific, testable checkbox items using - [ ].

## Test Cases
Include real test code without placeholder assertions.`;

    try {
      const content = await claudeText(systemPrompt, userPrompt, 1, MODELS.CONTENT);
      if (isPromptContentValid(content, feature, aspect.aspect)) return content;
    } catch {
      // Retry with fallback model below.
    }

    try {
      const retrySystemPrompt = `${systemPrompt}\n\nYou MUST include: (1) real file paths starting with src/, (2) TypeScript interfaces, (3) at least 3 acceptance criteria checkboxes. Do not write placeholder code.`;
      const content = await claudeText(retrySystemPrompt, userPrompt, 0, MODELS.CONTENT_FALLBACK);
      if (isPromptContentValid(content, feature, aspect.aspect)) return content;
    } catch {
      // Fall through to rich static fallback below.
    }
  }

  // Rich static fallback — never a stub, always actionable
  const fallback = richFallbackPrompt(spec, feature, aspect, priorFeatures);
  // Validate even the fallback — if it doesn't pass, the project is misconfigured
  if (!isPromptContentValid(fallback, feature, aspect.aspect)) {
    console.warn(`[PromptGenerator] Fallback prompt for ${feature}/${aspect.aspect} did not pass content validation — check project spec.`);
  }
  return fallback;
}

/** Dynamic prompt generation per feature with rich, self-contained context (Section 8). */
export async function generatePrompts(spec: ProjectSpec, sharedContext: string = ''): Promise<PackageFiles> {
  const files: PackageFiles = {};

  for (let featureIndex = 0; featureIndex < spec.features.length; featureIndex++) {
    const feature = spec.features[featureIndex];
    // Features that appear before this one in the build order — agents need to know they exist
    const priorFeatures = spec.features.slice(0, featureIndex);
    console.log(
      `[Generator] Generating ${feature} prompts (${featureIndex + 1}/${spec.features.length})...`,
    );
    const featureSlug = slugify(feature);
    const aspects = await getFeatureAspects(spec, feature, sharedContext);

    const aspectPromises = aspects.map(async (aspect) => {
      const generatedContent = await generateAspectPrompt(spec, feature, aspect, priorFeatures, sharedContext);
      files[`prompts/${featureSlug}/${aspect.aspect}.md`] = generatedContent;
    });

    await Promise.all(aspectPromises);
  }

  return files;
}
