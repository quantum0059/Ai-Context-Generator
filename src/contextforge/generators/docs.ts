import { registryByName } from "../registry";
import type { PackageFiles, PackageMeta, ProjectSpec } from "../../types/projectspec";
import { lockedEntries, slugify } from "./shared";

export function generatePackageMeta(spec: ProjectSpec): { json: string; meta: PackageMeta } {
  const meta: PackageMeta = {
    packageVersion: "1.0.0",
    projectSpecVersion: spec.projectSpecVersion,
    generatedAt: new Date().toISOString(),
  };
  return { json: JSON.stringify(meta, null, 2) + "\n", meta };
}

export function generateAiContext(spec: ProjectSpec): string {
  const stack: Record<string, string> = {};
  for (const [category, entry] of lockedEntries(spec)) stack[category] = entry.value;
  return (
    JSON.stringify(
      {
        projectName: spec.projectName,
        platform: spec.platform,
        projectSpecVersion: spec.projectSpecVersion,
        features: spec.features,
        stack,
        notNeeded: Object.entries(spec.stack)
          .filter(([, e]) => e.value === null)
          .map(([c]) => c),
      },
      null,
      2,
    ) + "\n"
  );
}

export function generateResources(spec: ProjectSpec): string {
  const sections = lockedEntries(spec).map(([category, entry]) => {
    const reg = registryByName(entry.value);
    return `## ${category}: ${entry.value}
- **Provenance:** ${entry.source}${entry.confidence ? ` (confidence: ${entry.confidence})` : ""}
${reg ? `- **Why:** ${reg.skillGenerationHints}\n- **Pricing:** ${reg.pricing}\n- **Free tier:** ${reg.freeTier}\n- **Docs:** ${reg.docsUrl}\n- **Pros:** ${reg.pros.join("; ")}\n- **Cons:** ${reg.cons.join("; ")}` : `- **Why:** Locked by the developer for ${spec.projectName}. ${entry.confidence === "low" ? "Community-suggested with LOW confidence - verify pricing and current docs before committing." : "Verify pricing and docs from the official site."}`}`;
  });
  return `# Resources: ${spec.projectName}

Every locked stack choice with provenance and reference data.

${sections.join("\n\n") || "_No technologies locked._"}
`;
}

export function generateRoadmap(
  spec: ProjectSpec,
  ordered: Array<{ feature: string; reason: string }>,
): string {
  const phases: string[] = [];
  phases.push(`## Phase 1: Foundation & Setup

**Goals**
- Bootstrap ${spec.projectName} for ${spec.platform} with the locked stack
- Run \`setup/install.sh\` (or \`install.ps1\`); adopt \`agents.md\`

**Deliverables**
- Running skeleton, configured tooling, CI basics

**Dependencies**
- None`);

  ordered.forEach((o, i) => {
    phases.push(`## Phase ${i + 2}: ${o.feature}

**Goals**
- ${o.reason}
- Implement using \`prompts/${slugify(o.feature)}/\` with \`context-manifests/${slugify(o.feature)}.json\`

**Deliverables**
- Working \"${o.feature}\" on ${spec.platform}, with tests

**Dependencies**
- ${i === 0 ? "Phase 1: Foundation & Setup" : `Phase ${i + 1}: ${ordered[i - 1].feature}`}`);
  });

  phases.push(`## Phase ${ordered.length + 2}: Production Readiness

**Goals**
- Monitoring, performance, release pipeline

**Deliverables**
- Error tracking live, deployment documented

**Dependencies**
- ${ordered.length ? `Phase ${ordered.length + 1}: ${ordered[ordered.length - 1].feature}` : "Phase 1: Foundation & Setup"}`);

  return `# Roadmap: ${spec.projectName}

Phase order is driven by \`dependency-graph.md\`.

${phases.join("\n\n")}
`;
}

export function generatePackageReadme(spec: ProjectSpec): string {
  return `# ${spec.projectName} - AI Context Package

This package is the persistent AI memory for ${spec.projectName} (${spec.platform}).
Generated from ProjectSpec version ${spec.projectSpecVersion}.

## How to use
1. Before working on any feature, open \`context-manifests/<feature>.json\`.
2. Load every file listed in \`requiredContext\` into your AI assistant
   (Claude, Cursor, ChatGPT, Gemini, Codex - any of them).
3. Use the matching prompt in \`prompts/<feature>/\` to start the work.
4. Follow \`roadmap.md\` for build order; never deviate from \`agents.md\`.

## Contents
- \`agents.md\` - the AI constitution (locked stack + rules)
- \`ai-context.json\` - machine-readable stack summary
- \`dependency-graph.md\` / \`roadmap.md\` - build order and phases
- \`resources.md\` - every stack choice with provenance
- \`prompts/\`, \`skills/\`, \`decisions/\`, \`templates/\`, \`context-manifests/\`, \`setup/\`
`;
}

export function generateTemplates(spec: ProjectSpec): PackageFiles {
  const framework = lockedEntries(spec).find(([c]) => c.toLowerCase().includes("framework"))?.[1].value ?? "the locked framework";
  const state = lockedEntries(spec).find(([c]) => c.toLowerCase().includes("state"))?.[1].value ?? "the locked state library";
  return {
    "templates/component-template.md": `# ${spec.projectName}: Component Template

Write components idiomatic to **${framework}**: named export, typed props,
no business logic inside; presentation only. Handle loading/error/empty states.
`,
    "templates/api-route-template.md": `# ${spec.projectName}: API Route Template

Validate input at the edge, delegate to a service module, return typed
responses. No direct SDK imports in routes - only services.
`,
    "templates/store-template.md": `# ${spec.projectName}: Store Template

Use **${state}** with one store per domain. Actions live inside the store;
server data stays in the data layer, UI state in stores.
`,
    "templates/hook-template.md": `# ${spec.projectName}: Hook Template

Hooks expose \\\`{ data, error, loading }\\\`, fetch via the service layer only,
clean up subscriptions on unmount, and contain no JSX.
`,
    "templates/service-template.md": `# ${spec.projectName}: Service Template

The service layer is the ONLY place external SDKs are imported. Services
return ${spec.projectName} domain types - never raw SDK responses - and throw
typed errors callers can handle.
`,
    "templates/repository-template.md": `# ${spec.projectName}: Repository Template

Repositories abstract persistence behind an interface (findById, save, delete).
Queries map rows/documents to domain types; no persistence details leak upward.
`,
    "templates/test-template.md": `# ${spec.projectName}: Test Template

Every public function gets: one happy-path test, one failure-path test.
Arrange-Act-Assert structure; mock only at the service boundary.
`,
  };
}

export function generateSetup(spec: ProjectSpec): PackageFiles {
  const known: string[] = [];
  const unknown: string[] = [];
  for (const [, entry] of lockedEntries(spec)) {
    const reg = registryByName(entry.value);
    if (reg) known.push(...reg.installCommands);
    else unknown.push(entry.value);
  }
  const commands = Array.from(new Set(known));
  const unknownLines = unknown.map(
    (t) => `# TODO: install \"${t}\" - no registry data; consult its official docs`,
  );

  return {
    "setup/install.sh": `#!/usr/bin/env bash
set -euo pipefail
echo "Installing the locked stack for ${spec.projectName}..."
${[...commands, ...unknownLines].join("\n") || "echo 'No install commands - stack has no locked entries.'"}
echo "Done."
`,
    "setup/install.ps1": `Write-Host "Installing the locked stack for ${spec.projectName}..."
${[...commands, ...unknownLines].join("\n") || "Write-Host 'No install commands - stack has no locked entries.'"}
Write-Host "Done."
`,
    "setup/setup-guide.md": `# Setup Guide: ${spec.projectName}

1. Run \`setup/install.sh\` (macOS/Linux) or \`setup/install.ps1\` (Windows).
2. Configure environment variables - see \`skills/<technology>/env-vars.md\` for each locked tool.
3. Copy \`agents.md\` to your repository root so every AI assistant reads it.
4. Start with the first phase in \`roadmap.md\`, loading context from \`context-manifests/\`.
${unknown.length ? `\n> Note: no verified install commands for: ${unknown.join(", ")}. Verify against official docs.` : ""}
`,
  };
}
