import { z } from "zod";
import { claudeJson, isClaudeConfigured } from "../../../../lib/claude";
import type { ProjectSpec } from "../../../../types/projectspec";

const conflictItemSchema = z.object({
  severity: z.enum(["blocking", "warning"]),
  type: z.string(),
  description: z.string(),
  offendingTool: z.string(),
  conflictingRequirement: z.string(),
  suggestion: z.string(),
});

const conflictReportSchema = z.object({
  hasBlockingConflicts: z.boolean(),
  hasWarnings: z.boolean(),
  conflicts: z.array(conflictItemSchema),
  warnings: z.array(conflictItemSchema),
});

export async function POST(req: Request) {
  if (!isClaudeConfigured()) {
    // If no AI is configured, assume no conflicts
    return Response.json({
      hasBlockingConflicts: false,
      hasWarnings: false,
      conflicts: [],
      warnings: [],
    });
  }

  try {
    const spec = (await req.json()) as ProjectSpec;

    const systemPrompt = `You are a senior architect performing a pre-flight check on a technology stack before development begins. You are looking for conflicts between the chosen tools and the project's stated requirements.

A BLOCKING conflict means the chosen tool directly violates a hard requirement — development cannot proceed without resolving it.

A WARNING means the tool is suboptimal or creates risk but does not directly violate a hard requirement.

Return valid JSON only.`;

    const stackString = Object.entries(spec.stack)
      .filter(([_, tool]) => tool.value !== null)
      .map(([cat, tool]) => `${cat}: ${tool.value}`)
      .join("\\n");

    const userPrompt = `Check this technology stack for conflicts with the project requirements.

Project: ${spec.projectName}
Description: ${spec.description}
Platform: ${spec.platform}

Hard constraints already identified:
${JSON.stringify(spec.constraints?.technical ?? {})}

Chosen stack:
${stackString}

Check for these conflict types and any others you identify:

CONNECTIVITY CONFLICTS:
- Project requires offline operation but chosen tools require internet (e.g. Supabase, Firebase, any cloud-hosted service)

PLATFORM CONFLICTS:
- Project is a CLI tool but frontend framework is chosen
- Project is a mobile app but Node.js-only libraries are chosen
- Project is browser-based but Node.js native modules are chosen

PERFORMANCE CONFLICTS:
- Project requires CPU-intensive processing (AST parsing, ML inference, video processing) but is built on a framework not suited for it (e.g. Next.js API routes for heavy CPU work)

MISSING CRITICAL TOOLS:
- Project description requires a specific type of library that is not in the stack (e.g. description mentions AST parsing but no parser library is chosen, description mentions PDF generation but no PDF library is chosen)

LICENSING CONFLICTS:
- Project states 'open source only' but chosen tool has proprietary license

Return exactly:
{
  "hasBlockingConflicts": boolean,
  "hasWarnings": boolean,
  "conflicts": [
    {
      "severity": "blocking",
      "type": "CONNECTIVITY_CONFLICT",
      "description": "(clear one sentence explanation a developer understands)",
      "offendingTool": "(exact tool name)",
      "conflictingRequirement": "(direct quote or close paraphrase from the description)",
      "suggestion": "(specific alternative tool that resolves the conflict)"
    }
  ],
  "warnings": [
    (same structure but severity: "warning")
  ]
}

If no conflicts exist return:
{
  "hasBlockingConflicts": false,
  "hasWarnings": false,
  "conflicts": [],
  "warnings": []
}`;

    const report = await claudeJson(`${systemPrompt}\n\n${userPrompt}`, conflictReportSchema);
    return Response.json(report);
  } catch (err) {
    console.error("[CheckConflicts Error]", err);
    // On failure, return safe default so we don't block generation due to AI downtime
    return Response.json({
      hasBlockingConflicts: false,
      hasWarnings: false,
      conflicts: [],
      warnings: [],
    });
  }
}
