import { registryByName } from "../registry";
import type { PackageMeta, ProjectSpec } from "../../types/projectspec";
import { lockedEntries, slugify, detectPrimaryEcosystem, isNonJsEcosystem } from "./shared";

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
For a consolidated setup and usage reference, see \`tech-stack.md\`.

${sections.join("\n\n") || "_No technologies locked._"}
`;
}

export function generateRoadmap(
  spec: ProjectSpec,
  ordered: Array<{ feature: string; reason: string }>,
): string {
  const phases: string[] = [];
  const locked = lockedEntries(spec);
  const hasPrisma = locked.some(([, e]) => e.value.toLowerCase().includes('prisma'));
  const hasDrizzle = locked.some(([, e]) => e.value.toLowerCase().includes('drizzle'));
  const hasSupabase = locked.some(([, e]) => e.value.toLowerCase().includes('supabase'));
  const hasVitest = locked.some(([, e]) => e.value.toLowerCase().includes('vitest'));
  const hasJest = locked.some(([, e]) => e.value.toLowerCase().includes('jest'));
  const hasExpo = locked.some(([, e]) => e.value.toLowerCase().includes('expo'));
  const hasNext = locked.some(([, e]) => e.value.toLowerCase().includes('next'));
  const testCmd = hasVitest ? '`npx vitest run`' : hasJest ? '`npx jest`' : '`npm test`';
  const dbSetupCmd = hasPrisma ? '`npx prisma migrate dev`' : hasDrizzle ? '`npx drizzle-kit push`' : hasSupabase ? '`supabase db push`' : null;

  phases.push(`## Phase 1: Foundation & Setup

**Goals**
- Bootstrap ${spec.projectName} for ${spec.platform} with the locked stack
- Run \`setup/install.sh\` (or \`install.ps1\`); configure \`.env.local\` from \`setup/.env.example\`
- Adopt \`agents.md\` as the AI development constitution

**Deliverables**
- Skeleton project compiles without errors${hasNext ? ': `npm run build` passes' : hasExpo ? ': `npx expo export` passes' : ''}
${dbSetupCmd ? `- Database schema initialised: ${dbSetupCmd} succeeds` : '- Data layer configured and connection verified'}
- All required environment variables in \`.env.local\` and validated at startup
- ${testCmd} runs with zero failures (even if no tests yet)
- \`agents.md\` and \`context.md\` checked into the repository root

**Dependencies**
- None`);

  ordered.forEach((o, i) => {
    const featureSlug = slugify(o.feature);
    const ft = o.feature.toLowerCase();
    // Derive feature-specific deliverables from keywords
    const specificDeliverables: string[] = [];
    if (/auth|login|sign/.test(ft)) specificDeliverables.push(`- Auth middleware protecting all private routes — unauthenticated requests return 401`);
    if (/payment|billing|stripe/.test(ft)) specificDeliverables.push(`- Stripe webhook handler at \`/api/webhooks/stripe\` with signature verification`);
    if (/database|schema|migration/.test(ft)) specificDeliverables.push(dbSetupCmd ? `- Migration applied: ${dbSetupCmd}` : '- Schema deployed to the data layer');
    if (/ui|component|screen|page/.test(ft)) specificDeliverables.push(`- Loading, empty, and error states implemented for all new screens`);
    if (/api|endpoint|route/.test(ft)) specificDeliverables.push(`- All new endpoints return typed responses matching \`src/types/${featureSlug}.ts\``);

    phases.push(`## Phase ${i + 2}: ${o.feature}

**Goals**
- ${o.reason}
- Implement using \`prompts/${featureSlug}/\` with \`context-manifests/${featureSlug}.json\`

**Deliverables**
- Working "${o.feature}" on ${spec.platform}, verified end-to-end
${specificDeliverables.join('\n') || `- Service layer at \`src/services/${featureSlug}.ts\` — no SDK imports outside this file`}
- All public functions in \`src/services/${featureSlug}.ts\` covered by unit tests: ${testCmd} passes
- Relevant ADR in \`decisions/\` committed before any architecture choices are made

**Dependencies**
- ${i === 0 ? "Phase 1: Foundation & Setup" : `Phase ${i + 1}: ${ordered[i - 1].feature}`}`);
  });

  phases.push(`## Phase ${ordered.length + 2}: Production Readiness

**Goals**
- Monitoring, performance, and release pipeline

**Deliverables**
- Error tracking configured (Sentry or equivalent) — every unhandled exception surfaces an alert
- Performance audit complete: ${hasNext ? 'Lighthouse score ≥ 90 on desktop' : hasExpo ? 'Expo build passes and loads in < 3s on device' : 'Core user flows complete in < 2s'}
- Deployment documented in \`setup/setup-guide.md\`
- All secrets rotated and confirmed present in the production environment

**Dependencies**
- ${ordered.length ? `Phase ${ordered.length + 1}: ${ordered[ordered.length - 1].feature}` : "Phase 1: Foundation & Setup"}`);

  return `# Roadmap: ${spec.projectName}

Phase order is driven by \`dependency-graph.md\`.

${phases.join("\n\n")}
`;
}


export function generatePackageReadme(spec: ProjectSpec): string {
  const stackTable = lockedEntries(spec)
    .map(([cat, entry]) => {
      const reg = registryByName(entry.value);
      return `| ${cat} | ${entry.value} | ${reg ? reg.docsUrl : "_see official docs_"} |`;
    })
    .join("\n");

  const featureList = spec.features.length > 0
    ? spec.features.map((f) => `- ${f}`).join("\n")
    : "- _See project description_";

  let readmeContent = `# ${spec.projectName} — AI Context Package

> This package is your AI assistant's memory for building **${spec.projectName}**.
> It ensures every AI tool you use (Claude, ChatGPT, Cursor, Copilot, Gemini)
> builds with the same architecture, stack, and conventions.

Generated from ProjectSpec version ${spec.projectSpecVersion}.

---

## 🚀 Quick Start

1. **Read the product brief** → Open \`context.md\` — this is the first file every AI agent must read. It defines what the product is, who it is for, and what success looks like.
2. **Read the constitution** → Open \`agents.md\` — this defines the architecture rules, locked stack, and coding conventions.
3. **Check your stack** → Open \`tech-stack.md\` for a complete reference of every technology, why it was chosen, and how to set it up.
4. **Pick a feature to build** → Open \`roadmap.md\` to see the recommended build order.
5. **Load the prompt** → Go to \`prompts/<feature>/\` and paste the prompt into your AI assistant. It contains all the context needed.
6. **Follow the guides** → Each feature has a guide in \`context-manifests/\` explaining exactly which files to load.

---

## 📁 What's in This Package

| File / Folder | What It Is | When to Use It |
|---|---|---|
| \`context.md\` | Product brief — what the product is, who it's for, user journeys, domain glossary, and business rules | **Always load this first** — before agents.md and before any feature prompt |
| \`agents.md\` | Project constitution — architecture rules, locked stack, coding conventions | **Always load this second** in every AI session |
| \`tech-stack.md\` | Complete reference for every technology — setup, env vars, best practices | When you need setup or usage details for any tool |
| \`tech-stack.json\` | Machine-readable version of the tech stack | For automated tooling or AI context injection |
| \`roadmap.md\` | Build order with phases and dependencies | Before starting a new feature |
| \`dependency-graph.md\` | Why features are ordered the way they are | When questioning build order |
| \`prompts/\` | Ready-to-paste prompts for building each feature | **Every time you start working on a feature** |
| \`context-manifests/\` | Per-feature guides listing exactly what files to load | Before working on any feature |
| \`decisions/\` | Architecture Decision Records — why each technology was chosen | When questioning a tech choice |
| \`templates/\` | Code patterns for components, services, hooks, tests, etc. | When creating new files |
| \`resources.md\` | Every stack choice with provenance and pricing data | For project planning and budgeting |
| \`setup/\` | Install scripts and setup guide | When bootstrapping the project |
| \`prompt_material/\` | Design system tokens, UI references, wireframes | When building UI features |
| \`ai-context.json\` | Machine-readable project summary | For automated context loading |
| \`package-meta.json\` | Package metadata and generation timestamp | For version tracking |

---

## 🏗️ Project Overview

| | |
|---|---|
| **Project** | ${spec.projectName} |
| **Platform** | ${spec.platform} |
| **Description** | ${spec.description} |
${spec.constraints.budget ? `| **Budget** | ${spec.constraints.budget} |\n` : ""}${spec.constraints.avoid?.length ? `| **Excluded** | ${spec.constraints.avoid.join(", ")} |\n` : ""}
### Features
${featureList}

---

## 🔧 Tech Stack at a Glance

| Category | Technology | Docs |
|---|---|---|
${stackTable || "| _No stack entries_ | | |"}

---

## 💡 Tips for Best Results

- **Always load \`context.md\` first** — it grounds the AI agent in the product vision so every implementation decision is aligned with what the product actually does and who it serves.
- **Then load \`agents.md\`** — it's the constitution that keeps your AI assistant on track with architecture rules.
- **One feature at a time** — follow \`roadmap.md\` order. Each feature builds on the previous one.
- **Use the prompts as-is** — they're designed to be self-contained. Just copy-paste into your AI assistant.
- **Don't skip the tests** — every prompt includes testing requirements. Catch bugs early.
- **Check \`decisions/\` before changing anything** — if you're tempted to swap a technology, read the ADR first to understand why it was chosen.
`;

  const ecosystem = detectPrimaryEcosystem(spec)

  if (isNonJsEcosystem(ecosystem)) {
    const ecosystemName = ecosystem.charAt(0)
      .toUpperCase() + ecosystem.slice(1)
      
    const warning = `
> ## ⚠️ Non-JavaScript Ecosystem Detected: ${ecosystemName}
>
> ContextForge has the most complete registry 
> coverage for **JavaScript and TypeScript** projects.
>
> For **${ecosystemName}** projects:
> - Verify all package names against official 
>   ${ecosystemName} package registries before 
>   installing
> - Generated \`install.sh\` commands may use 
>   \`npm install\` — replace with the correct 
>   package manager (\`cargo add\`, \`go get\`, 
>   \`pip install\`, \`maven\`, etc.)
> - Code examples in prompts use TypeScript syntax 
>   — translate patterns to ${ecosystemName} idioms
> - ADR technology choices are best-effort for 
>   this ecosystem — consult official docs to verify
>
> The generated \`agents.md\`, \`dependency-graph.json\`, 
> and \`context-manifests/\` remain fully useful 
> as architectural guides regardless of ecosystem.
`
    // Prepend warning after the first heading
    readmeContent = readmeContent.replace(
      /^(# .+\n)/,
      `$1\n${warning}\n`
    )
  }

  return readmeContent;
}
