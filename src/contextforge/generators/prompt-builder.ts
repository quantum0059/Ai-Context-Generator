import { claudeText, isClaudeConfigured } from "../../lib/claude";
import type { ProjectSpec } from "../../types/projectspec";
import { MODELS } from "../../lib/ai-models";
import { buildConstraintBlock, buildTechCodeSnippets, buildSharedDatabaseSchema, lockedEntries, slugify } from "./shared";
import type { Aspect } from "./prompt-detector";
import { isPromptContentValid } from "./prompt-validator";

/**
 * Pulls the requirement signal already computed upstream (by the
 * requirement-extractor and feature-extraction pipelines) for THIS feature and
 * formats it into a markdown block. Feeding these real acceptance criteria,
 * edge cases, and domain entities into the implementation prompt is what makes
 * the generated instructions project-specific and hard to get wrong — the
 * agent is told exactly what "done" means and exactly what must not break.
 *
 * Returns an empty string when no structured requirements are available so the
 * prompt degrades gracefully to its generic sections.
 */
export function buildFeatureRequirementContext(spec: ProjectSpec, feature: string): string {
  const req = spec.architecturalRequirements;
  if (!req) return "";

  const featureText = feature.toLowerCase();
  const words = featureText.split(/[^a-z0-9]+/).filter((w) => w.length > 3);
  const matches = (haystack: string): boolean => {
    const h = haystack.toLowerCase();
    return words.some((w) => h.includes(w));
  };

  const sections: string[] = [];

  // Functional requirements that relate to this feature.
  const relatedFunctional = (req.functional ?? []).filter(
    (fr) => matches(fr.title) || matches(fr.description),
  );
  if (relatedFunctional.length > 0) {
    sections.push(
      "### Requirements This Aspect Must Satisfy\n" +
        relatedFunctional
          .map(
            (fr) =>
              `- **${fr.id} (${fr.priority}${fr.type === "implicit" ? ", implicit" : ""}):** ${fr.title} — ${fr.description}`,
          )
          .join("\n"),
    );
  }

  // Edge cases relevant to this feature (or universally important categories).
  const relatedEdgeCases = (req.edgeCases ?? []).filter(
    (ec) =>
      matches(ec.scenario) ||
      matches(ec.expectedBehaviour) ||
      ["input-validation", "data", "auth", "network"].includes(ec.category),
  );
  if (relatedEdgeCases.length > 0) {
    sections.push(
      "### Edge Cases That MUST Be Handled\n" +
        "Every one of these must have explicit handling and a test. Silent failure is a defect.\n" +
        relatedEdgeCases
          .slice(0, 8)
          .map((ec) => `- **${ec.category}:** When ${ec.scenario} → ${ec.expectedBehaviour}`)
          .join("\n"),
    );
  }

  // Domain entities this feature likely touches.
  const relatedEntities = (req.domain?.entities ?? []).filter(
    (e) => matches(e.name) || matches(e.description),
  );
  if (relatedEntities.length > 0) {
    sections.push(
      "### Domain Entities In Play\n" +
        relatedEntities
          .map(
            (e) =>
              `- **${e.name}** (${e.attributes.join(", ")})${e.relatedEntities.length ? ` → related to ${e.relatedEntities.join(", ")}` : ""}`,
          )
          .join("\n"),
    );
  }

  if (sections.length === 0) return "";

  return `\n## Feature Requirement Context\n\nThe following was extracted from the project's requirement analysis and is specific to this feature. Treat it as authoritative.\n\n${sections.join("\n\n")}\n`;
}

// ─── Aspect-specific deliverable descriptors ─────────────────────────────────

export function getAspectDeliverables(
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

export function getAspectAcceptanceCriteria(aspectKey: string, feature: string, spec: ProjectSpec): string[] {
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

export function getAspectAntiPatterns(aspectKey: string, spec: ProjectSpec): string[] {
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

export function getAspectTestCode(aspectKey: string, feature: string, spec: ProjectSpec): string {
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
export function richFallbackPrompt(
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
  const requirementContext = buildFeatureRequirementContext(spec, feature);

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

1. \`context.md\` — product brief (read this first — understand the product before writing code)
2. \`agents.md\` — project constitution (architecture rules and locked stack)
3. \`tech-stack.md\` — technology reference with setup details
4. \`context-manifests/${slugify(feature)}-guide.md\` — feature guide
5. \`decisions/\` — ADRs for why each technology was chosen
6. \`templates/service-template.md\` — service layer pattern

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
${requirementContext}
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

## Definition of Done

This aspect is complete ONLY when every one of the following is true. If any is false, the work is not done.

- [ ] Every file listed in **Required File Structure** exists at its exact path and compiles.
- [ ] Every item in **Acceptance Criteria** is satisfied.
- [ ] Every scenario in **Edge Cases That MUST Be Handled** has explicit handling and a corresponding test (when this section is present).
- [ ] No technology outside the locked stack is imported anywhere.
- [ ] All inputs crossing a trust boundary are validated before use.
- [ ] Every async operation has explicit error handling — no unhandled rejections, no swallowed errors.
- [ ] The test file runs and all tests pass with the project's runner.

---

## Self-Verification (run before you report done)

After implementing, verify your own output by answering each question. If any answer is "no", fix it before finishing:

1. Did I create files at the EXACT paths above, and only those paths?
2. Did I import ONLY packages from the locked stack table?
3. For every edge case listed, can I point to the line that handles it and the test that proves it?
4. Does every exported function have an explicit return type and no \`any\`?
5. Would another feature depending on this one find the exports and types it expects?

---

## Test Cases

Implement these tests and ensure they pass. Add one test per listed edge case.

\`\`\`typescript
${testCode}
\`\`\`
`;
}

export async function generateAspectPrompt(
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
    const requirementContext = buildFeatureRequirementContext(spec, feature);

    const systemPrompt = `${constraintBlock}You are a Principal Engineer writing an implementation brief for an AI coding assistant. The assistant will read ONLY this file before implementing this aspect — it has no other context. Your brief must be so precise, complete, and unambiguous that a correct implementation is the ONLY reasonable output. Leave no decision to guesswork.

Rules:
- Include exact file paths to create or modify (every path starts with src/)
- Include the complete TypeScript interface/type definitions the AI must use
- Include the exact function signatures to implement, with explicit return types
- Include real example code for the most complex part — no pseudo-code, no placeholders
- Every edge case provided in the requirement context MUST appear with explicit expected handling AND a matching test
- Include explicit acceptance criteria as a checklist
- Include a "Definition of Done" and a "Self-Verification" checklist the assistant must satisfy before reporting completion
- Include the exact test cases that prove it works, including one test per edge case
- Include what NOT to do for this specific stack
- Never say 'implement X' without showing what X looks like for this project's stack
- Say "Required File Structure" not "Suggested File Structure"
- Do NOT emit TODO/FIXME/'your code here' or any placeholder — such output is an automatic failure
${requirementContext}${sharedContext}
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
List files to load before starting, in this exact order:
1. \`context.md\` — product brief (always first)
2. \`agents.md\` — architecture rules and locked stack
3. Other relevant files from this context package.

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
Include at least 3 specific, testable checkbox items using - [ ]. If a Feature Requirement Context was provided in the system prompt, every listed requirement and edge case must be reflected here.

## Definition of Done
A checklist (- [ ]) that is true only when the aspect is fully complete: all files compile, all acceptance criteria met, every edge case handled and tested, only locked-stack imports used, all inputs validated, all async paths have error handling.

## Self-Verification
3-5 questions the assistant must answer "yes" to before reporting done (correct paths, only locked-stack imports, every edge case handled and tested, explicit return types with no any, exports usable by dependent features).

## Test Cases
Include real test code without placeholder assertions, with one test per edge case listed above.`;

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
