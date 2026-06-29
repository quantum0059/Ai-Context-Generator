import { z } from "zod";
import { claudeJson, isClaudeConfigured } from "../../lib/claude";
import { registryFor, registryByName } from "../registry";
import type { PackageFiles, ProjectSpec, StackEntry } from "../../types/projectspec";
import { buildConstraintBlock, buildTechCodeSnippets, decisionFileName, lockedEntries } from "./shared";
import { MODELS } from "../../lib/ai-models";

/** One ADR per locked category (Section 6). Prevents AI from changing architecture later. */
export async function generateDecisions(spec: ProjectSpec, sharedContext: string = ''): Promise<PackageFiles> {
  const files: PackageFiles = {};
  const entries = lockedEntries(spec);

  const systemPrompt = `${buildConstraintBlock(spec)}You are a senior architect writing an Architecture Decision Record that will be read by AI coding assistants. The ADR must prevent the AI from ever suggesting alternatives to this decision or implementing it incorrectly.

Be extremely specific. Include real code. Every statement must apply to this project specifically, not software development in general.
${sharedContext}`;

  await Promise.all(
    entries.map(async ([category, entry], index) => {
      const chosen = entry.value;
      const numberStr = String(index + 1).padStart(3, "0");
      const filename = decisionFileName(spec, category);

      const userPrompt = `Generate a complete ADR for:

Project: ${spec.projectName}
Decision: ${category} — chosen tool: ${chosen}
Platform: ${spec.platform}
Other stack choices: ${JSON.stringify(spec.stack)}

Structure the ADR exactly as:

# ADR ${numberStr}: ${category} — ${chosen}

## Status
LOCKED — Do not change this decision without creating a new ADR and updating agents.md.

## Context
One paragraph: what problem this decision solves and why it mattered for ${spec.projectName} specifically.

## Decision
${chosen} for all ${category} concerns.

## Exact Integration Pattern
The precise way this technology is used in ${spec.projectName}. Include:
- The exact import statement
- The exact initialization/setup pattern
- A complete real usage example (not a toy example — something that would actually appear in this project)

\`\`\`typescript
[complete working code example]
\`\`\`

## What This Means For The AI
A numbered list of specific instructions the AI must follow when working with ${chosen} in this project.
Each instruction must be concrete and verifiable.
Example format: 'ALWAYS use auth() from @clerk/nextjs/server in API routes — never use getAuth() or any other Clerk auth function'

## What We Considered and Rejected
For each rejected alternative (list 2-3 real ones that would have been reasonable choices):
- **{Alternative}**: Why it was rejected for ${spec.projectName} specifically. Be honest about tradeoffs — do not say it is simply 'worse'.

## Constraints This Decision Imposes
A list of specific constraints this choice creates for the rest of the codebase. Other generators and the AI must respect these.
Example: 'All database rows owned by a user must have user_id text referencing the Clerk userId, never a separate users table primary key'

## Common AI Mistakes With ${chosen}
3-5 specific mistakes AI assistants commonly make when using ${chosen}, with the correct approach for each.`;

      let content = "";
      if (isClaudeConfigured()) {
        try {
          const responseSchema = z.object({
            content: z.string().describe("The fully formatted markdown content for the ADR"),
          });

          const result = await claudeJson(
            systemPrompt,
            userPrompt,
            responseSchema,
            1,
            MODELS.REASONING,
          );
          content = result.content;
        } catch (e) {
          content = fallbackDecision(spec, category, entry);
        }
      } else {
        content = fallbackDecision(spec, category, entry);
      }

      if (entry.confidence === "low") {
        content = `> ⚠️ LOW CONFIDENCE: This tool was community-suggested. Verify all code examples against current official documentation before using.\n\n` + content;
      }

      files[filename] = content;
    })
  );

  return files;
}

function fallbackDecision(spec: ProjectSpec, category: string, entry: StackEntry & { value: string }): string {
  const chosen = entry.value;
  const reg = registryByName(chosen);
  const alternatives = registryFor(category).filter(
    (e) => e.name.toLowerCase() !== chosen.toLowerCase(),
  );

  // Derive a code snippet for this specific tool
  const allSnippets = buildTechCodeSnippets(spec);
  const toolKey = chosen.toLowerCase();

  // AI-specific rules per tool
  const aiRules = getAiRulesForTool(chosen, category, spec);
  const commonMistakes = getCommonMistakesForTool(chosen, category);

  return `# ADR: ${category} — ${chosen}

## Status
LOCKED (at projectSpecVersion ${spec.projectSpecVersion}) — Do not change this decision without creating a new ADR and updating agents.md.

## Decision
Use **${chosen}** for all ${category} concerns in ${spec.projectName}.

## Provenance
- Source: **${entry.source}** ${entry.source === "user" ? "(chosen directly by the developer - binding)" : entry.source === "suggested" ? "(registry-backed suggestion confirmed by the developer)" : "(community-suggested, confirmed by the developer)"}
${entry.confidence ? `- Confidence: **${entry.confidence}**${entry.confidence === "low" ? " — verify conventions against current official docs" : ""}` : ""}

## Context
${spec.projectName} targets **${spec.platform}**.${spec.constraints.budget ? ` Budget constraint: ${spec.constraints.budget}.` : ""}${spec.constraints.avoid?.length ? ` Excluded tools: ${spec.constraints.avoid.join(", ")}.` : ""}

## Reasoning
${reg ? `${reg.skillGenerationHints} Pros: ${reg.pros.join("; ")}.` : `The developer locked ${chosen} for ${category}. No registry metadata is available; the choice stands as confirmed.`}

## Exact Integration Pattern

The following shows the correct way to initialize and use **${chosen}** in ${spec.projectName}:

${allSnippets.includes(toolKey) || allSnippets.length > 0
  ? allSnippets
  : `\`\`\`typescript\n// Install: ${reg?.installCommands.join(' && ') ?? `npm install ${chosen.toLowerCase()}`}\n// Initialize ${chosen} and import it only in src/services/ or src/lib/\n// See official docs: ${reg?.docsUrl ?? 'https://www.npmjs.com/package/' + chosen.toLowerCase()}\n\`\`\``}

## What This Means For The AI

${aiRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}

## Rejected Alternatives
${alternatives.length ? alternatives.map((a) => `- **${a.name}** — not selected for ${spec.projectName}: ${a.cons[0] ?? "lower overall fit"} (docs: ${a.docsUrl})`).join("\n") : "_No registry alternatives were evaluated for this category._"}

## Trade-offs
${reg ? reg.cons.map((c) => `- ${c}`).join("\n") : `- Conventions for ${chosen} must be verified against its official documentation.`}

## Common AI Mistakes With ${chosen}

${commonMistakes.map((m, i) => `${i + 1}. ${m}`).join('\n')}

## Consequence
AI assistants and developers MUST NOT replace **${chosen}** without superseding this ADR with a new, approved record.
`;
}

function getAiRulesForTool(tool: string, category: string, spec: ProjectSpec): string[] {
  const t = tool.toLowerCase();
  if (t.includes('clerk')) return [
    'ALWAYS use `auth()` from `@clerk/nextjs/server` in API routes — never `getAuth()` (deprecated)',
    'ALWAYS use `clerkMiddleware()` in `src/middleware.ts` to protect routes',
    'NEVER import `useUser` in a Server Component — it is a Client Component hook only',
    'ALWAYS check `userId` before any database query that touches user data',
  ];
  if (t.includes('supabase')) return [
    'ALWAYS include `.eq("user_id", userId)` on every query — RLS is enabled on all user-owned tables',
    'ALWAYS import the Supabase client from `src/lib/supabase/` only — never create inline clients',
    'ALWAYS call `supabase.removeChannel()` in the React cleanup function for realtime subscriptions',
    'NEVER call `supabase.auth.getUser()` on the client when `userId` is already available from Clerk/Auth',
  ];
  if (t.includes('stripe')) return [
    'ALWAYS verify webhook signatures with `stripe.webhooks.constructEvent()` — never skip this check',
    'NEVER use the Stripe Publishable Key on the server — use `STRIPE_SECRET_KEY` only',
    'ALWAYS wait for the `customer.subscription.created` webhook before granting access — not the redirect',
    'ALWAYS store `stripeCustomerId` and `stripeSubscriptionId` in your database — never recompute from Stripe',
  ];
  if (t.includes('prisma')) return [
    'ALWAYS import `prisma` from `src/lib/prisma.ts` singleton — never `new PrismaClient()` in a handler',
    'ALWAYS use `prisma.$transaction()` for multi-table writes that must be atomic',
    'NEVER expose raw Prisma types to the API layer — map to domain types in the service',
  ];
  if (t.includes('zustand')) return [
    'ALWAYS define all state mutations (actions) inside the `create()` call — never outside',
    'NEVER store server-fetched data in Zustand unless it needs cross-component sync — use SWR/React Query for server state',
    'ALWAYS use the devtools middleware in development',
  ];
  if (t.includes('next')) return [
    'ALWAYS default to Server Components — add `"use client"` only when the component uses hooks or browser APIs',
    'ALWAYS fetch data in Server Components and pass as props to Client Components',
    'NEVER import Server-only modules (Prisma, Stripe server SDK) in Client Components',
    'ALWAYS put API routes in `src/app/api/` as `route.ts` files — never in `pages/api/`',
  ];
  return [
    `Use ${tool} through a dedicated service module in src/services/ — never import directly in components`,
    `Initialize ${tool} once at application startup`,
    `Map ${tool} responses to domain types before returning from service functions`,
  ];
}

function getCommonMistakesForTool(tool: string, category: string): string[] {
  const t = tool.toLowerCase();
  if (t.includes('clerk')) return [
    '`import { useUser } from "@clerk/nextjs"` in a Server Component → causes runtime error. Use `auth()` instead.',
    'Using `getAuth()` (deprecated) instead of `auth()` → may work but is not the current API.',
    'Calling `auth()` without `await` → returns undefined, causing silent 401 failures.',
  ];
  if (t.includes('supabase')) return [
    'Querying without `.eq("user_id", userId)` → returns all rows from all users (RLS bypass).',
    'Not cleaning up realtime channels → causes memory leaks and duplicate events in development.',
    'Calling `createServerClient` from `@supabase/ssr` without cookies → server queries will be unauthenticated.',
  ];
  if (t.includes('stripe')) return [
    'Granting premium access on checkout redirect instead of webhook → users get access before payment confirms.',
    'Not storing `stripe-signature` raw body before parsing → webhook verification always fails.',
    'Using `stripe.prices.list()` in a request handler → expensive API call; cache price IDs in env vars.',
  ];
  if (t.includes('next')) return [
    'Adding `"use client"` to a layout or page that only needs to pass data → kills server rendering for entire subtree.',
    'Fetching data inside `useEffect` in a Client Component instead of a Server Component → causes loading flash.',
    'Using `params` directly without `await` in Next.js 15+ App Router → `params` is now async.',
  ];
  if (t.includes('zustand')) return [
    'Calling `useStore()` outside a React component → causes invariant violation.',
    'Storing derived state as separate state slices → leads to sync bugs. Compute with selectors instead.',
    'Using Zustand for server-fetched data that only one component uses → overengineered; use local state.',
  ];
  return [
    `Importing ${tool} in multiple files instead of a singleton → causes initialization errors and resource leaks.`,
    `Not handling ${tool} errors explicitly → silent failures that are hard to debug in production.`,
    `Using undocumented ${tool} internal APIs → breaks on minor version upgrades.`,
  ];
}
