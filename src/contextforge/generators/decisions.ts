import { z } from "zod";
import { claudeJson, isClaudeConfigured } from "../../lib/claude";
import { registryFor, registryByName } from "../registry";
import type { PackageFiles, ProjectSpec, StackEntry } from "../../types/projectspec";
import { decisionFileName, lockedEntries } from "./shared";

/** One ADR per locked category (Section 6). Prevents AI from changing architecture later. */
export async function generateDecisions(spec: ProjectSpec): Promise<PackageFiles> {
  const files: PackageFiles = {};
  const entries = lockedEntries(spec);

  const systemPrompt = `You are a senior architect writing an Architecture Decision Record that will be read by AI coding assistants. The ADR must prevent the AI from ever suggesting alternatives to this decision or implementing it incorrectly.

Be extremely specific. Include real code. Every statement must apply to this project specifically, not software development in general.`;

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
            systemPrompt + "\n\n" + userPrompt,
            responseSchema
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

  return `# ADR: ${category}

## Status
Accepted (locked at projectSpecVersion ${spec.projectSpecVersion})

## Decision
Use **${chosen}** for ${category} in ${spec.projectName}.

## Provenance
- Source: **${entry.source}** ${entry.source === "user" ? "(chosen directly by the developer - binding)" : entry.source === "suggested" ? "(registry-backed suggestion confirmed by the developer)" : "(community-suggested, confirmed by the developer)"}
${entry.confidence ? `- Confidence: **${entry.confidence}**${entry.confidence === "low" ? " - verify conventions against current official docs" : ""}` : ""}

## Context
${spec.projectName} targets **${spec.platform}**.${spec.constraints.budget ? ` Budget constraint: ${spec.constraints.budget}.` : ""}${spec.constraints.avoid?.length ? ` Excluded tools: ${spec.constraints.avoid.join(", ")}.` : ""}

## Reasoning
${reg ? `${reg.skillGenerationHints} Pros: ${reg.pros.join("; ")}.` : `The developer locked ${chosen} for ${category}. No registry metadata is available; the choice stands as confirmed.`}

## Rejected Alternatives
${alternatives.length ? alternatives.map((a) => `- **${a.name}** - not selected: ${a.cons[0] ?? "lower overall fit"} (docs: ${a.docsUrl})`).join("\n") : "_No registry alternatives were evaluated for this category._"}

## Trade-offs
${reg ? reg.cons.map((c) => `- ${c}`).join("\n") : `- Conventions for ${chosen} must be verified against its official documentation.`}

## Consequence
AI assistants and developers MUST NOT replace ${chosen} without superseding
this ADR with a new, approved record.
`;
}
