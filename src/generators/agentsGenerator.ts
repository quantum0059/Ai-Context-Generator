import type { Analysis, ProjectInput, Recommendation } from "../types";

/** Generates agents.md - the project constitution for AI coding assistants. */
export function generateAgents(
  input: ProjectInput,
  analysis: Analysis,
  selected: Recommendation[],
): string {
  const stackRows = selected
    .map((r) => `| ${r.category} | ${r.primary.name} | ${r.primary.docsUrl} |`)
    .join("\n");

  return `# ${input.name} - AI Assistant Instructions (Project Constitution)

This file is the single source of truth for AI coding assistants working on
this project. Treat every rule below as binding. Never change the stack or
architecture without an explicit, approved ADR in \`decisions/\`.

## Project
- **Purpose:** ${analysis.purpose}
- **Platform:** ${input.platform}
- **Target users:** ${input.targetUsers || "general users"}
- **Complexity:** ${analysis.complexity}

## Architecture
${analysis.architecture}

## Locked Technology Stack
| Category | Technology | Docs |
| --- | --- | --- |
${stackRows}

## Folder Structure
- \`src/app/\` - routes/screens
- \`src/components/\` - reusable UI components
- \`src/features/<feature>/\` - feature modules (components, hooks, services)
- \`src/services/\` - external SDK wrappers (the ONLY place SDKs are imported)
- \`src/stores/\` - state management stores
- \`src/lib/\` - pure utilities

## Coding Conventions
- TypeScript strict mode; no \`any\` unless justified by a comment.
- Named exports; one component per file.
- Async functions must handle and surface errors; no silent catches.

## UI Conventions
- Use the styling solution from the locked stack exclusively.
- All spacing/colors come from design tokens; no magic values.
- Every async UI state needs loading, empty and error variants.

## State Management Rules
- Server data lives in the data layer; client/UI state lives in stores.
- One store per domain; no monolithic global store.

## Authentication Rules
- Auth checks happen at the route/screen boundary, not inside components.
- Never store tokens in plain storage; use the auth SDK's session handling.

## Database Rules
- All queries go through the repository/service layer.
- Schema changes require a migration and an ADR note.

## Deployment Rules
- Environment-specific config only via environment variables.
- Production builds must pass typecheck, lint and tests.

## Hard Constraints for AI Assistants
1. Do NOT replace any technology in the locked stack.
2. Do NOT restructure folders without instruction.
3. Do NOT invent endpoints, env vars or APIs - check \`skills/\` first.
4. When in doubt, ask; do not guess architecture decisions.
`;
}
