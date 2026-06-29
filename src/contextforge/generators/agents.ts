import { z } from "zod";
import { claudeJson, isClaudeConfigured } from "../../lib/claude";
import { MODELS } from "../../lib/ai-models";
import type { ProjectSpec, ArchitecturalRequirements } from "../../types/projectspec";
import { buildConstraintBlock, buildTechCodeSnippets, buildSharedDatabaseSchema, decisionFileName, lockedEntries, lowConfidenceEntries, slugify } from "./shared";

/** Formats ArchitecturalRequirements into a compact context block for AI prompts */
function buildRequirementsBlock(req: ArchitecturalRequirements): string {
  const fr = req.functional
    .map((r) => `  - [${r.id}] ${r.type === "implicit" ? "*(implicit)* " : ""}**${r.title}** (${r.priority}): ${r.description}`)
    .join("\n");

  const nfr = [
    ...req.nonFunctional.performance.map((s) => `  - [PERF] ${s}`),
    ...req.nonFunctional.security.map((s) => `  - [SEC] ${s}`),
    ...req.nonFunctional.scalability.map((s) => `  - [SCALE] ${s}`),
    ...req.nonFunctional.availability.map((s) => `  - [AVAIL] ${s}`),
    ...req.nonFunctional.accessibility.map((s) => `  - [A11Y] ${s}`),
    ...req.nonFunctional.compliance.map((s) => `  - [COMPLIANCE] ${s}`),
    ...req.nonFunctional.maintainability.map((s) => `  - [MAINT] ${s}`),
    ...req.nonFunctional.other.map((s) => `  - [OTHER] ${s}`),
  ].join("\n");

  const edges = req.edgeCases
    .map((e) => `  - [${e.category.toUpperCase()}] **${e.scenario}** → ${e.expectedBehaviour}`)
    .join("\n");

  const entities = req.domain.entities
    .map((e) => `  - **${e.name}**: ${e.description} | attrs: ${e.attributes.join(", ")}`)
    .join("\n");

  const actors = req.domain.actors
    .map((a) => `  - **${a.name}**: ${a.description}${a.permissions?.length ? ` | can: ${a.permissions.join(", ")}` : ""}`)
    .join("\n");

  return `
## Extracted Architectural Requirements

### Business Goals
${req.businessGoals.map((g) => `- ${g}`).join("\n")}

### Success Criteria
${req.successCriteria.map((c) => `- ${c}`).join("\n")}

### Target Audience
${req.targetAudience.map((a) => `- ${a}`).join("\n")}

### Domain Model
**Actors:**
${actors}

**Core Entities:**
${entities}

**Core Workflows:** ${req.domain.coreWorkflows.join("; ")}

### Functional Requirements
${fr}

### Non-Functional Requirements
${nfr}

### Edge Cases & Failure Modes
${edges}
`;
}

/** agents.md - the AI constitution (Section 7), generated solely from the finalized ProjectSpec. */
export async function generateAgents(spec: ProjectSpec): Promise<string> {
  const locked = lockedEntries(spec);
  const stackSummary = locked.map(([category, entry]) => `- ${category}: ${entry.value}`).join("\n");

  const constraintBlock = buildConstraintBlock(spec);
  const req = spec.architecturalRequirements as ArchitecturalRequirements | undefined;
  const requirementsBlock = req ? buildRequirementsBlock(req) : "";

  const systemPrompt = `${constraintBlock}You are an expert software architect writing an AI development constitution for a specific project. This document will be fed to AI coding assistants (Claude, Cursor, ChatGPT, Copilot) as their primary instruction file. It must be so specific that an AI reading it produces architecturally correct code on the first attempt without any additional explanation from the developer.

Rules for what you write:
- Every rule must reference the exact technology chosen for this project by name
- Include exact code patterns (real TypeScript/code snippets) not descriptions of patterns
- Include a 'What NOT to do' section with specific anti-patterns for this exact stack
- Include exact file naming conventions with examples
- Include the exact error handling contract this project uses with a code snippet
- Include exact import patterns (which package to import from for each concern)
- Never write generic advice that applies to all projects
- Every sentence must only be true for THIS specific project's stack
- The extracted requirements below define WHAT this system must do — write architecture rules that ensure the code delivers exactly these requirements`;

  const userPrompt = `Generate a complete agents.md AI constitution for this project:

Project: ${spec.projectName}
Platform: ${spec.platform}
Description: ${spec.description}

Locked Tech Stack:
${stackSummary}

Features being built:
${spec.features.join(", ")}
${requirementsBlock}
The agents.md must contain ALL of these sections:

## Project Overview
2-3 sentences describing what this project does and who it's for.

## Tech Stack (LOCKED — Do Not Change)
List every technology with its exact npm package name and version constraint. Mark the entire section as LOCKED.

## Architecture Rules
For each technology in the stack, write the exact rule for how it must be used. Include a real code snippet for each rule showing the correct pattern.

Example format for each rule:
### [Technology Name]
Rule: [one sentence stating the rule]
Correct pattern:
\`\`\`typescript
[actual code snippet]
\`\`\`
Never do this:
\`\`\`typescript
[anti-pattern code snippet]
\`\`\`

## File & Folder Conventions
- File naming: exact convention with 3 examples each
- Folder structure: show the exact src/ tree for this project's platform and framework
- Co-location rules: where tests, types, and styles live

## Error Handling Contract
The exact error response shape this project returns, with a TypeScript interface definition and a real example of a route using it correctly.

## What You Are NOT Allowed To Do
A numbered list of 8-12 specific prohibitions, each referencing a specific technology or pattern by name. Examples of what these should look like:
- 'Do not call Supabase directly from React components — all DB access goes through src/lib/db/*.repository.ts'
- 'Do not use any type — every function must have explicit TypeScript types'
- 'Do not create API routes outside src/app/api/'

## Load Order for AI Sessions
Numbered list: exactly which files from this package to load into the AI context window, in order, before starting work on any feature.

## Low Confidence Warnings (only if applicable)
List any stack choices marked confidence: 'low' and tell the AI to verify their documentation before generating code using them.`;

  if (isClaudeConfigured()) {
    try {
      const responseSchema = z.object({
        content: z.string().describe("The fully formatted markdown content for agents.md"),
      });

      const result = await claudeJson(
        systemPrompt,
        userPrompt,
        responseSchema,
        1,
        MODELS.CONTENT,
      );
      
      return result.content;
    } catch (e) {
      // Fallback below
    }
  }

  // Fallback heuristic if no AI is configured or if it fails
  return fallbackAgents(spec);
}

function fallbackAgents(spec: ProjectSpec): string {
  const locked = lockedEntries(spec);
  const lowConf = lowConfidenceEntries(spec);
  const snippets = buildTechCodeSnippets(spec);
  const schema = buildSharedDatabaseSchema(spec);

  const stackList = locked
    .map(([category, entry]) => `- **${category}:** ${entry.value} _(source: ${entry.source}${entry.confidence ? `, confidence: ${entry.confidence}` : ""})_`)
    .join("\n");

  // Per-technology architecture rules with specifics
  const archRules = locked.map(([category, entry]) => {
    const tool = entry.value;
    const toolLow = tool.toLowerCase();
    let rules = '';
    if (toolLow.includes('next')) {
      rules = `- All ${category} pages are **Server Components by default**. Add \`'use client'\` only when the file uses React hooks, browser APIs, or event handlers.\n- Fetch data in Server Components, pass as props to Client Components.\n- All API routes live in \`src/app/api/\` as \`route.ts\` files.`;
    } else if (toolLow.includes('clerk')) {
      rules = `- Use \`auth()\` from \`@clerk/nextjs/server\` in API routes and Server Components.\n- Use \`clerkMiddleware()\` in \`src/middleware.ts\` for route protection.\n- NEVER use \`useUser()\` outside Client Components.`;
    } else if (toolLow.includes('supabase')) {
      rules = `- All Supabase queries MUST include a \`.eq('user_id', userId)\` filter — RLS is enabled on all tables.\n- Import Supabase only in \`src/services/\` or \`src/lib/supabase/\` — never in components or routes.\n- Realtime subscriptions must call \`supabase.removeChannel()\` in the cleanup function.`;
    } else if (toolLow.includes('stripe')) {
      rules = `- Checkout sessions are created in \`src/app/api/billing/checkout/route.ts\`.\n- Stripe webhook handler lives at \`src/app/api/webhooks/stripe/route.ts\` and MUST verify signatures with \`stripe.webhooks.constructEvent()\`.\n- Never grant access at the checkout redirect — wait for the webhook.`;
    } else if (toolLow.includes('prisma')) {
      rules = `- Import \`prisma\` only from \`src/lib/prisma.ts\` singleton — never create \`new PrismaClient()\` in a request handler.\n- Use \`prisma.$transaction()\` for multi-table writes.`;
    } else if (toolLow.includes('zustand')) {
      rules = `- Stores live in \`src/stores/<domain>Store.ts\`. One store per domain.\n- Define all mutations inside the store definition — never call \`set()\` from outside.\n- UI state (filters, selections) goes in stores; server data goes through the service layer.`;
    } else if (toolLow.includes('better-sqlite3')) {
      rules = `- \`better-sqlite3\` is SYNCHRONOUS — do not use \`async/await\`.\n- Cache prepared statements at module level. Never prepare inside a loop.\n- Enable WAL mode and foreign keys on startup.`;
    } else {
      rules = `- All ${category} concerns go through **${tool}** exclusively.\n- See \`${decisionFileName(spec, category)}\` for integration patterns.`;
    }
    return `### ${tool} (${category})\n${rules}`;
  }).join('\n\n');

  const lowConfSection = lowConf.length
    ? lowConf
        .map(([category, entry]) => `- **${category}: ${entry.value}** — community-suggested with low confidence. Verify current APIs and conventions against official docs before relying on them.`)
        .join("\n")
    : "_None. All locked stack entries are high confidence._";

  const constraintBlock = buildConstraintBlock(spec);

  return `# ${spec.projectName} — AI Development Constitution
${constraintBlock}

## Project Overview
${spec.description}

- **Platform:** ${spec.platform}
- **Features:** ${spec.features.join(", ") || "see description"}
${spec.constraints.budget ? `- **Budget constraint:** ${spec.constraints.budget}` : ""}
${spec.constraints.avoid?.length ? `- **Explicitly avoided:** ${spec.constraints.avoid.join(", ")}` : ""}

## Tech Stack (LOCKED — Do Not Change — projectSpecVersion: ${spec.projectSpecVersion})
${stackList || "_No technologies locked._"}

Categories marked "not needed" by the user: ${
  Object.entries(spec.stack)
    .filter(([, e]) => e.value === null)
    .map(([c]) => c)
    .join(", ") || "none"
}

## Architecture Rules

${archRules || "_No locked stack entries._"}

### Universal Rules
- External SDK calls live ONLY in the service layer (\`src/services/\`); components and routes never import SDKs directly.
- Validate all external input at the boundary with Zod before it reaches business logic.
- Every async operation must handle loading, success, and error states.
${snippets}
${schema}

## File & Folder Conventions

- **Components:** \`src/components/<domain>/<ComponentName>.tsx\` — PascalCase, one component per file
- **Pages:** \`src/app/<route>/page.tsx\` (Next.js) or \`src/pages/<route>.tsx\`
- **Services:** \`src/services/<domain>.ts\` — the ONLY files that import external SDKs
- **Stores:** \`src/stores/<domain>Store.ts\` — one store per domain
- **Types:** \`src/types/<domain>.ts\` — shared domain interfaces
- **API Routes:** \`src/app/api/<resource>/route.ts\`
- **Tests:** \`src/__tests__/<module>.test.ts\` or co-located \`__tests__/\`

## What NOT to do
- Do NOT introduce technologies outside the LOCKED stack above.
- Do NOT change architecture without creating a new ADR in \`decisions/\`.
- Do NOT "helpfully" swap a locked tool for a similar one (${locked.map(([, e]) => e.value).slice(0, 3).join(", ") || "none"} are final).
${spec.constraints.avoid?.length ? `- Do NOT use: ${spec.constraints.avoid.join(", ")} (explicitly excluded by the developer).` : ""}

## Low-Confidence Areas
${lowConfSection}

## Load Order for AI Sessions

1. \`agents.md\` — this file (always first)
2. \`tech-stack.md\` — technology reference
3. \`requirements.md\` — formal requirement document
4. Feature-specific files from \`context-manifests/<feature>-guide.md\`
5. Build prompts from \`prompts/<feature>/\`

## When stuck
- \`tech-stack.md\` for complete technology reference, setup details, and best practices.
- \`decisions/\` for why choices were made.
- \`context-manifests/${spec.features[0] ? slugify(spec.features[0]) : "<feature>"}-guide.md\` for a human-readable guide on what to load before working on a feature.
`;
}
