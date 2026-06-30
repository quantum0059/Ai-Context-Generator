import type { ProjectSpec } from "../../types/projectspec";
import { lockedEntries } from "./shared";

/**
 * Generates architecture.md — a deterministic, single high-level architectural
 * reference derived entirely from the locked ProjectSpec. No AI call: this is
 * a structural document so it must be 100% consistent with the locked stack.
 */
export function generateArchitecture(spec: ProjectSpec): string {
  const platform = spec.platform.toLowerCase();
  const isMobile = /mobile|ios|android|react.?native|expo/.test(platform);
  const isWeb = /web|saas|browser|extension/.test(platform);

  const stackRows = lockedEntries(spec)
    .map(([cat, e]) => `| ${cat} | ${e.value} | ${e.source}${e.confidence ? ` (${e.confidence})` : ""} |`)
    .join("\n");

  const ar = (spec as { architecturalRequirements?: {
    domain?: { entities?: Array<{ name: string }>; coreWorkflows?: string[] };
  } }).architecturalRequirements;
  const entities = ar?.domain?.entities?.map((e) => e.name) ?? [];
  const workflows = ar?.domain?.coreWorkflows ?? [];

  const uiLayer = isMobile
    ? "**Screens & components** (React Native) — presentational only; receive data via props/hooks."
    : isWeb
    ? "**Pages & components** — presentational only; receive data via props/hooks. No SDK imports here."
    : "**Entry layer** — the primary interface for this platform.";

  return `# Architecture — ${spec.projectName}

> High-level architectural reference. This document is derived directly from the
> locked ProjectSpec (v${spec.projectSpecVersion}) and must never contradict
> \`agents.md\` or \`tech-stack.md\`.

**Platform:** ${spec.platform}

## Layered architecture

This project follows a strict layered architecture. Each layer may only depend
on the layer directly beneath it:

1. ${uiLayer}
2. **State / hooks** — client state and data-fetching orchestration.
3. **Service layer** — the ONLY layer permitted to import external SDKs or touch the database. Returns domain types, never raw SDK responses.
4. **Data layer** — database, storage, and external providers from the locked stack.

### The service-layer boundary (hard rule)

Components, screens, and route handlers MUST NOT import an SDK directly. All
SDK and database access is encapsulated in \`src/services/*\`. This keeps the
UI testable and the data access swappable, and it is enforced by the package
stack validator.

## Locked stack

| Category | Technology | Source |
|---|---|---|
${stackRows || "| (none) | (none) | — |"}

## Domain model

${entities.length > 0 ? `Core entities: ${entities.join(", ")}.` : "Core entities are documented in \`requirements.md\`."}

${workflows.length > 0 ? `### Core workflows\n\n${workflows.map((w) => `- ${w}`).join("\n")}` : ""}

## Data flow

\`\`\`
${isMobile ? "Screen" : "Page"} → hook/state → service → ${describeData(spec)} → service → hook/state → ${isMobile ? "Screen" : "Page"}
\`\`\`

User actions flow down through the layers; data flows back up mapped to domain
types. No layer skips the service boundary.

## Build order

Features are built in dependency order — see \`dependency-graph.md\` and
\`roadmap.md\`. Per-feature implementation prompts live in \`prompts/<feature>/\`.
`;
}

function describeData(spec: ProjectSpec): string {
  const stack = lockedEntries(spec).map(([, e]) => e.value.toLowerCase());
  if (stack.some((v) => v.includes("supabase"))) return "Supabase (Postgres + RLS)";
  if (stack.some((v) => v.includes("sqlite"))) return "local SQLite (query-scoped by owner)";
  if (stack.some((v) => v.includes("postgres") || v.includes("neon"))) return "PostgreSQL";
  if (stack.some((v) => v.includes("firebase"))) return "Firebase";
  return "the data layer";
}
