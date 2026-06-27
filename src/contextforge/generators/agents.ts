import { z } from "zod";
import { claudeJson, isClaudeConfigured } from "../../lib/claude";
import { MODELS } from "../../lib/ai-models";
import type { ProjectSpec } from "../../types/projectspec";
import { buildConstraintBlock, decisionFileName, lockedEntries, lowConfidenceEntries, slugify } from "./shared";

/** agents.md - the AI constitution (Section 7), generated solely from the finalized ProjectSpec. */
export async function generateAgents(spec: ProjectSpec): Promise<string> {
  const locked = lockedEntries(spec);
  const stackSummary = locked.map(([category, entry]) => `- ${category}: ${entry.value}`).join("\n");

  const constraintBlock = buildConstraintBlock(spec);

  const systemPrompt = `${constraintBlock}You are an expert software architect writing an AI development constitution for a specific project. This document will be fed to AI coding assistants (Claude, Cursor, ChatGPT, Copilot) as their primary instruction file. It must be so specific that an AI reading it produces architecturally correct code on the first attempt without any additional explanation from the developer.

Rules for what you write:
- Every rule must reference the exact technology chosen for this project by name
- Include exact code patterns (real TypeScript/code snippets) not descriptions of patterns
- Include a 'What NOT to do' section with specific anti-patterns for this exact stack
- Include exact file naming conventions with examples
- Include the exact error handling contract this project uses with a code snippet
- Include exact import patterns (which package to import from for each concern)
- Never write generic advice that applies to all projects
- Every sentence must only be true for THIS specific project's stack`;

  const userPrompt = `Generate a complete agents.md AI constitution for this project:

Project: ${spec.projectName}
Platform: ${spec.platform}
Description: ${spec.description}

Locked Tech Stack:
${stackSummary}

Features being built:
${spec.features.join(", ")}

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

  const stackList = locked
    .map(([category, entry]) => `- **${category}:** ${entry.value} _(source: ${entry.source}${entry.confidence ? `, confidence: ${entry.confidence}` : ""})_`)
    .join("\n");

  const archRules = locked
    .map(([category, entry]) => `- All ${category} concerns go through **${entry.value}** exclusively; see \`${decisionFileName(spec, category)}\` for why it was chosen.`)
    .join("\n");

  const lowConfSection = lowConf.length
    ? lowConf
        .map(([category, entry]) => `- **${category}: ${entry.value}** - community-suggested with low confidence. Verify current APIs and conventions against official docs before relying on them.`)
        .join("\n")
    : "_None. All locked stack entries are high confidence._";

  const constraintBlock = buildConstraintBlock(spec);

  return `# ${spec.projectName} - AI Development Constitution
${constraintBlock}

## Project Overview
${spec.description}

- **Platform:** ${spec.platform}
- **Features:** ${spec.features.join(", ") || "see description"}
${spec.constraints.budget ? `- **Budget constraint:** ${spec.constraints.budget}` : ""}
${spec.constraints.avoid?.length ? `- **Explicitly avoided:** ${spec.constraints.avoid.join(", ")}` : ""}

## Tech Stack (LOCKED - projectSpecVersion: ${spec.projectSpecVersion})
${stackList || "_No technologies locked._"}

Categories marked "not needed" by the user: ${
    Object.entries(spec.stack)
      .filter(([, e]) => e.value === null)
      .map(([c]) => c)
      .join(", ") || "none"
  }

## Architecture Rules
${archRules || "_No locked stack entries._"}
- External SDK calls live only in the service layer; components never import SDKs directly.
- Validate all external input at the boundary before it reaches business logic.

## Coding Conventions
- Write idiomatic code for the locked frameworks above - follow their official style guides.
- TypeScript/typed code where the stack supports it; explicit error handling everywhere.
- Small, single-responsibility modules; one component per file.

## What NOT to do
- Do NOT introduce technologies outside the LOCKED stack above.
- Do NOT change architecture without creating a new ADR in \`decisions/\`.
- Do NOT "helpfully" swap a locked tool for a similar one (${locked.map(([, e]) => e.value).slice(0, 3).join(", ") || "none"} are final).
${spec.constraints.avoid?.length ? `- Do NOT use: ${spec.constraints.avoid.join(", ")} (explicitly excluded by the developer).` : ""}

## Low-Confidence Areas
${lowConfSection}

## When stuck
- \`tech-stack.md\` for complete technology reference, setup details, and best practices.
- \`decisions/\` for why choices were made.
- \`context-manifests/${spec.features[0] ? slugify(spec.features[0]) : "<feature>"}-guide.md\` for a human-readable guide on what to load before working on a feature.
`;
}
