import { registryByName } from "../registry";
import type { PackageFiles, PackageMeta, ProjectSpec } from "../../types/projectspec";
import { buildConstraintBlock, lockedEntries, slugify, detectPrimaryEcosystem, isNonJsEcosystem } from "./shared";
import { detectPlatformParadigm } from "./platform";
import { claudeText, isClaudeConfigured } from "../../lib/claude";
import { MODELS } from "../../lib/ai-models";

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

1. **Read the constitution** → Open \`agents.md\` — this is the single source of truth for your project's architecture and rules. Always load this file first.
2. **Check your stack** → Open \`tech-stack.md\` for a complete reference of every technology, why it was chosen, and how to set it up.
3. **Pick a feature to build** → Open \`roadmap.md\` to see the recommended build order.
4. **Load the prompt** → Go to \`prompts/<feature>/\` and paste the prompt into your AI assistant. It contains all the context needed.
5. **Follow the guides** → Each feature has a guide in \`context-manifests/\` explaining exactly which files to load.

---

## 📁 What's in This Package

| File / Folder | What It Is | When to Use It |
|---|---|---|
| \`agents.md\` | Project constitution — architecture rules, locked stack, coding conventions | **Always load this first** in every AI session |
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

- **Always load \`agents.md\` first** — it's the constitution that keeps your AI assistant on track.
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

export function generateTemplates(spec: ProjectSpec): PackageFiles {
  const framework = lockedEntries(spec).find(([c]) => c.toLowerCase().includes("framework"))?.[1].value ?? "the locked framework";
  const state = lockedEntries(spec).find(([c]) => c.toLowerCase().includes("state"))?.[1].value ?? "the locked state library";
  const db = lockedEntries(spec).find(([c]) => c.toLowerCase().includes("database"))?.[1].value ?? "the locked database";
  const isReact = framework.toLowerCase().includes("next") || framework.toLowerCase().includes("react") || framework.toLowerCase().includes("expo");
  const isNextjs = framework.toLowerCase().includes("next");

  // Platform paradigm decides which templates are even valid. Historically
  // every project got React component/hook/store + API-route templates, which
  // derailed CLI and backend-only projects. We now emit only the templates
  // that match the project's paradigm.
  const paradigm = detectPlatformParadigm(spec);

  const templates: PackageFiles = {};

  // ── UI templates: only for projects that render a GUI ──────────────────────
  if (paradigm.hasUI) {
    templates["templates/component-template.md"] = `# Component Template — ${spec.projectName}

> Use this template every time you create a new UI component.

## File Naming

\`src/components/<domain>/<ComponentName>.tsx\` — one component per file, PascalCase.

## Structure

\`\`\`typescript
${isReact ? `"use client"; // Only if this component uses hooks, event handlers, or browser APIs

` : ""}interface <ComponentName>Props {
  // Required props first, optional props second
  title: string;
  items: Item[];
  onAction?: (id: string) => void;
  className?: string;
}

export function <ComponentName>({ title, items, onAction, className }: <ComponentName>Props) {
  // --- Loading State ---
  if (!items) {
    return <ComponentNameSkeleton />;
  }

  // --- Empty State ---
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<IconPlaceholder />}
        title="No items yet"
        description="Create your first item to get started."
        action={{ label: "Create Item", onClick: onAction }}
      />
    );
  }

  // --- Error State (if applicable) ---
  // Handle via error boundary or inline error UI

  // --- Default State ---
  return (
    <div className={className}>
      <h2>{title}</h2>
      {items.map(item => (
        <ItemCard key={item.id} item={item} onAction={onAction} />
      ))}
    </div>
  );
}
\`\`\`

## Checklist

- [ ] Named export (not default export)
- [ ] Props interface defined and exported
- [ ] All props are typed — no \`any\`
- [ ] Loading state renders a skeleton matching the final layout shape
- [ ] Empty state has an illustration, message, and CTA
- [ ] Error state provides a retry action — never a dead end
- [ ] No business logic — presentation only
- [ ] No direct SDK imports — data comes via props or hooks
- [ ] \`className\` prop for style customization
- [ ] Accessible: proper ARIA labels, keyboard navigation
`;

    templates["templates/hook-template.md"] = `# Custom Hook Template — ${spec.projectName}

> Use this template for data-fetching and reusable logic hooks.

## File Naming

\`src/hooks/use<Resource>.ts\` — camelCase with \`use\` prefix.

## Structure

\`\`\`typescript
import { useState, useEffect, useCallback } from "react";
import { <resourceService> } from "@/services/<resource>";

interface Use<Resource>Result {
  data: <Resource>[] | null;
  error: string | null;
  loading: boolean;
  refetch: () => void;
}

export function use<Resource>(filters?: Filters): Use<Resource>Result {
  const [data, setData] = useState<<Resource>[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await <resourceService>.list(filters);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetch();
    // Clean up subscriptions if applicable
    return () => { /* cleanup */ };
  }, [fetch]);

  return { data, error, loading, refetch: fetch };
}
\`\`\`

## Checklist

- [ ] Returns \`{ data, error, loading }\` — always all three
- [ ] Fetches via the service layer only — never imports SDKs directly
- [ ] Cleans up subscriptions/listeners on unmount
- [ ] Contains no JSX — hooks are logic-only
- [ ] Handles all async states (loading, success, error)
- [ ] Uses \`useCallback\` for stable function references
`;
  }

  // ── State store template: only when a UI + state library exist ─────────────
  if (paradigm.hasUI) {
    templates["templates/store-template.md"] = `# Store Template — ${spec.projectName}

> Use this template for client-side state management with **${state}**.

## File Naming

\`src/stores/<domain>Store.ts\` — one store per domain.

## Structure

\`\`\`typescript
${state.toLowerCase().includes("zustand") ? `import { create } from "zustand";

interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

interface TodoStore {
  // --- State ---
  todos: Todo[];
  isLoading: boolean;
  error: string | null;

  // --- Actions ---
  addTodo: (title: string) => void;
  toggleTodo: (id: string) => void;
  removeTodo: (id: string) => void;
  setError: (error: string | null) => void;
}

export const useTodoStore = create<TodoStore>((set) => ({
  // Initial state
  todos: [],
  isLoading: false,
  error: null,

  // Actions (always inside the store, never outside)
  addTodo: (title) =>
    set((state) => ({
      todos: [...state.todos, { id: crypto.randomUUID(), title, completed: false }],
    })),

  toggleTodo: (id) =>
    set((state) => ({
      todos: state.todos.map((t) =>
        t.id === id ? { ...t, completed: !t.completed } : t
      ),
    })),

  removeTodo: (id) =>
    set((state) => ({
      todos: state.todos.filter((t) => t.id !== id),
    })),

  setError: (error) => set({ error }),
}));` : `// Use ${state} patterns — see its official docs for the exact API.
// Key rules:
// - One store per domain
// - Actions live inside the store definition
// - Server data stays in the data/service layer
// - Store manages UI state only (selections, filters, toggles)
`}
\`\`\`

## Rules

- **UI state in stores** — selections, toggles, filters, modal visibility.
- **Server data in the data layer** — fetched via hooks/services, not stored globally.
- **Actions inside the store** — never define state mutations outside the store.
- **Derive, don't duplicate** — use selectors for computed values.
`;
  }

  // ── HTTP route template: only for projects with an HTTP server ─────────────
  if (paradigm.hasHttpServer) {
    templates["templates/api-route-template.md"] = `# API Route Template — ${spec.projectName}

> Use this template every time you create a new API endpoint.

## File Naming

${isNextjs ? `\`src/app/api/<resource>/route.ts\` — Next.js App Router convention.` : `\`src/routes/<resource>.ts\` — one route file per resource.`}

## Structure

\`\`\`typescript
${isNextjs ? `import { NextRequest, NextResponse } from "next/server";` : `// Import your framework's request/response types`}
import { z } from "zod"; // or your validation library
import { <resourceService> } from "@/services/<resource>";

// 1. Define input schema at the top
const createSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
});

// 2. Export the HTTP method handler
export async function POST(request: ${isNextjs ? "NextRequest" : "Request"}) {
  try {
    // 3. Parse and validate input
    const body = await request.json();
    const validated = createSchema.safeParse(body);

    if (!validated.success) {
      return ${isNextjs ? "NextResponse.json" : "Response.json"}(
        { error: "Validation failed", details: validated.error.flatten() },
        { status: 400 }
      );
    }

    // 4. Delegate to the service layer (NEVER import SDKs here)
    const result = await <resourceService>.create(validated.data);

    // 5. Return typed response
    return ${isNextjs ? "NextResponse.json" : "Response.json"}(result, { status: 201 });

  } catch (error) {
    // 6. Catch and categorize errors
    if (error instanceof AuthError) {
      return ${isNextjs ? "NextResponse.json" : "Response.json"}({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[API] POST /<resource> failed:", error);
    return ${isNextjs ? "NextResponse.json" : "Response.json"}({ error: "Internal server error" }, { status: 500 });
  }
}
\`\`\`

## Checklist

- [ ] Input validated with a schema before touching any service
- [ ] All SDK calls go through service modules — never imported directly
- [ ] Error responses include a category (validation, auth, not-found, server)
- [ ] Errors are logged with context (endpoint, operation, error type)
- [ ] Response types are consistent across all endpoints
- [ ] Auth/permission check happens before any business logic
`;
  }

  // ── CLI command template: only for command-line tools ──────────────────────
  if (paradigm.isCli) {
    templates["templates/command-template.md"] = `# CLI Command Template — ${spec.projectName}

> Use this template every time you add a new command to the CLI.

## File Naming

\`src/commands/<command>.ts\` — one file per command, kebab-case.

## Structure

\`\`\`typescript
// A command is a thin layer: parse args, call the service/core layer,
// format output. It NEVER contains business logic itself.
import { <resourceService> } from "@/services/<resource>";

export interface <Command>Options {
  input: string;
  json?: boolean;
  verbose?: boolean;
}

export async function run<Command>(options: <Command>Options): Promise<number> {
  try {
    const result = await <resourceService>.execute(options.input);

    if (options.json) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\\n");
    } else {
      process.stdout.write(formatHuman(result) + "\\n");
    }
    return 0; // exit code — success
  } catch (error) {
    process.stderr.write(
      \`Error: \${error instanceof Error ? error.message : String(error)}\\n\`,
    );
    return 1; // exit code — failure
  }
}

function formatHuman(result: unknown): string {
  // Human-readable, aligned output. Keep machine output behind --json.
  return String(result);
}
\`\`\`

## Checklist

- [ ] Command parses and validates its arguments before doing work
- [ ] All business logic lives in a service/core module, not the command
- [ ] Writes machine-readable output to stdout only when \`--json\` is passed
- [ ] Writes errors to stderr and returns a non-zero exit code on failure
- [ ] No UI, no HTTP, no browser APIs — this is a terminal program
- [ ] Every command has a \`--help\` description
`;
  }


    "templates/service-template.md": `# Service Template — ${spec.projectName}

> The service layer is the **ONLY** place external SDKs are imported.

## File Naming

\`src/services/<resource>.ts\` — one service per external integration or domain.

## Structure

\`\`\`typescript
// This is the ONLY file that imports the SDK
import { externalSdk } from "external-package";

// Domain types — what the rest of the app uses
export interface <Resource> {
  id: string;
  name: string;
  createdAt: Date;
}

// Typed errors — callers can handle these specifically
export class <Resource>NotFoundError extends Error {
  constructor(id: string) {
    super(\`<Resource> \${id} not found\`);
    this.name = "<Resource>NotFoundError";
  }
}

// Service functions — map SDK responses to domain types
export async function list(filters?: Filters): Promise<<Resource>[]> {
  const raw = await externalSdk.query({ ...filters });
  return raw.map(mapToDomain);
}

export async function getById(id: string): Promise<<Resource>> {
  const raw = await externalSdk.findOne(id);
  if (!raw) throw new <Resource>NotFoundError(id);
  return mapToDomain(raw);
}

export async function create(input: Create<Resource>Input): Promise<<Resource>> {
  const raw = await externalSdk.insert(input);
  return mapToDomain(raw);
}

// Private mapper — never expose raw SDK types
function mapToDomain(raw: ExternalSdkType): <Resource> {
  return {
    id: raw.external_id,
    name: raw.display_name,
    createdAt: new Date(raw.created_at),
  };
}
\`\`\`

## Rules

1. **SDK imports ONLY here** — components, hooks, and routes never import SDKs.
2. **Return domain types** — never leak raw SDK response shapes.
3. **Typed errors** — throw specific error classes, not generic \`Error\`.
4. **Single responsibility** — one service per external integration.
`;

  templates["templates/repository-template.md"] = `# Repository Template — ${spec.projectName}

> Repositories abstract persistence behind a clean interface using **${db}**.

## File Naming

\`src/repositories/<resource>Repository.ts\` — one repository per aggregate root.

## Structure

\`\`\`typescript
// Domain type (defined in src/types/)
import type { <Resource> } from "@/types/<resource>";

export interface <Resource>Repository {
  findById(id: string): Promise<<Resource> | null>;
  findMany(filters: <Resource>Filters): Promise<<Resource>[]>;
  save(resource: <Resource>): Promise<<Resource>>;
  delete(id: string): Promise<void>;
}

// Implementation using ${db}
export function create<Resource>Repository(db: DatabaseClient): <Resource>Repository {
  return {
    async findById(id) {
      const row = await db.query("SELECT * FROM <resources> WHERE id = $1", [id]);
      return row ? mapToDomain(row) : null;
    },

    async findMany(filters) {
      const rows = await db.query(buildQuery(filters));
      return rows.map(mapToDomain);
    },

    async save(resource) {
      const row = await db.query(
        "INSERT INTO <resources> (...) VALUES (...) ON CONFLICT (id) DO UPDATE SET ...",
        mapToRow(resource)
      );
      return mapToDomain(row);
    },

    async delete(id) {
      await db.query("DELETE FROM <resources> WHERE id = $1", [id]);
    },
  };
}

// Mappers — no persistence details leak upward
function mapToDomain(row: DbRow): <Resource> { /* ... */ }
function mapToRow(resource: <Resource>): DbRow { /* ... */ }
\`\`\`

## Rules

- Interface first — define the contract, then implement.
- Queries map rows/documents to domain types.
- No SQL or database-specific types leak past the repository boundary.
- Use parameterized queries — never concatenate user input into SQL.
`;

  templates["templates/test-template.md"] = `# Test Template — ${spec.projectName}

> Every public function gets at least one happy-path and one failure-path test.

## File Naming

\`tests/<module>.test.ts\` or \`src/<module>/__tests__/<module>.test.ts\`

## Structure (Arrange-Act-Assert)

\`\`\`typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTodo, deleteTodo } from "@/services/todo";

// Mock ONLY at the service boundary
vi.mock("@/lib/database", () => ({
  query: vi.fn(),
}));

describe("createTodo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ✅ Happy path
  it("creates a todo and returns the domain object", async () => {
    // Arrange
    const input = { title: "Buy milk", userId: "user-1" };
    mockDb.query.mockResolvedValueOnce({ id: "todo-1", ...input });

    // Act
    const result = await createTodo(input);

    // Assert
    expect(result).toEqual({
      id: "todo-1",
      title: "Buy milk",
      userId: "user-1",
    });
    expect(mockDb.query).toHaveBeenCalledOnce();
  });

  // ❌ Failure path
  it("throws ValidationError for empty title", async () => {
    // Arrange
    const input = { title: "", userId: "user-1" };

    // Act & Assert
    await expect(createTodo(input)).rejects.toThrow("Title is required");
  });

  // 🔄 Edge case
  it("handles database timeout gracefully", async () => {
    // Arrange
    mockDb.query.mockRejectedValueOnce(new Error("Connection timeout"));

    // Act & Assert
    await expect(createTodo({ title: "Test" })).rejects.toThrow("Connection timeout");
  });
});
\`\`\`

## Checklist

- [ ] One happy-path test per public function
- [ ] One failure-path test per public function
- [ ] Edge cases for critical paths (null inputs, timeouts, concurrent access)
- [ ] Mock ONLY at the service boundary — never mock implementation details
- [ ] Tests are independent — no shared mutable state between tests
- [ ] Descriptive test names: "creates a todo and returns the domain object"
- [ ] \`beforeEach\` clears mocks to prevent test pollution
`;

  return templates;
}

export async function generateSetup(spec: ProjectSpec, sharedContext: string = ''): Promise<PackageFiles> {
  const systemPrompt = `${buildConstraintBlock(spec)}You are a senior DevOps engineer generating project bootstrapping files. Every file must work correctly when executed against this exact stack — no placeholders, no 'TODO: replace this', no generic commands that might not apply.
${sharedContext}`;

  const userPrompt = `Generate complete setup files for:

Project: ${spec.projectName}
Platform: ${spec.platform}
Stack: ${JSON.stringify(spec.stack)}
Features: ${spec.features.join(', ')}

Generate ALL of the following:

---
FILE: setup/install.sh
---
A bash script that:
1. Checks prerequisites (Node version, required CLIs) and exits with a helpful message if any are missing
2. Runs npm install (or the correct package manager for this stack)
3. Copies .env.example to .env.local if .env.local does not already exist
4. Runs any required setup commands for each service in the stack (e.g. 'npx prisma migrate dev' for Prisma, 'supabase db push' for Supabase, etc.)
5. Prints a 'Setup complete' message with the exact command to start the dev server

---
FILE: setup/install.ps1
---
PowerShell equivalent of install.sh, same steps, correct PowerShell syntax.

---
FILE: setup/.env.example
---
Every environment variable this project requires, with:
- The exact variable name
- A comment explaining what it is and where to get it
- A realistic non-secret example value
- Variables grouped by service (Clerk, Supabase, Stripe, etc.)

Only include variables for services actually in ${JSON.stringify(spec.stack)}. Do not include variables for services not in the stack.

---
FILE: setup/env-validation.ts
---
A TypeScript module using Zod that:
- Validates all required environment variables on startup
- Throws a clear error naming the missing variable and linking to where to get it if any are missing
- Exports the validated env object for use throughout the project

Example structure:
import { z } from 'zod'

const envSchema = z.object({
  // (one entry per required env var, with z.string() and a descriptive error message)
})

export const env = envSchema.parse(process.env)

---
FILE: setup/health-check.ts
---
A TypeScript script that:
- Attempts to connect to each external service in the stack (database, auth provider, payment provider, etc.)
- Prints a green checkmark or red X for each service
- Exits with code 1 if any service is unreachable

---
FILE: setup/setup-guide.md
---
A human-readable guide:
1. Prerequisites (exact versions required)
2. Getting API keys (one section per service with exact steps and links to the correct dashboard page)
3. Running the install script
4. Verifying setup with the health check
5. Starting the development server
6. Common setup problems and solutions (3-5 real ones for this specific stack)`;

  if (isClaudeConfigured()) {
    try {
      const response = await claudeText(systemPrompt, userPrompt, 1, MODELS.CONTENT);
      const files: PackageFiles = {};
      const parts = response.split(/---\nFILE:\s*(.+?)\n---/g);
      for (let i = 1; i < parts.length; i += 2) {
        const path = parts[i].trim();
        const content = parts[i + 1].trim();
        if (path) files[path] = content + "\n";
      }
      if (Object.keys(files).length > 0) {
        return addMissingInstallCommands(spec, files);
      }
    } catch (e) {
      // Fallback below
    }
  }

  return fallbackSetup(spec);
}

export async function getInstallCommands(
  toolName: string,
  platform: string,
  isOffline: boolean,
): Promise<string> {
  const prompt = `Return ONLY the shell commands to install "${toolName}" in a ${platform} project.
No explanation, no markdown, just the commands.
${isOffline ? "The project runs offline — only include packages that work without internet after installation." : ""}

Example format:
npm install tree-sitter
npm install tree-sitter-javascript
npm install tree-sitter-python`;

  if (isClaudeConfigured()) {
    try {
      const response = await claudeText(
        "You are a DevOps engineer. Return ONLY the shell commands to install a package with no explanation, no markdown, just commands. One command per line.",
        prompt,
        1,
        MODELS.FAST,
      );
      const commands = response
        .replace(/```(?:bash|sh|shell)?/gi, "")
        .replace(/```/g, "")
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^(npm|pnpm|yarn|npx|pip|pip3|uv|cargo|go|brew|apt(?:-get)?)\s/.test(line));
      const packageLikeName = /^(@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/i.test(toolName);
      if (packageLikeName && !commands.some((line) => line.toLowerCase().includes(toolName.toLowerCase()))) {
        commands.unshift(`npm install ${toolName}`);
      }
      if (commands.length > 0) return commands.join("\n");
    } catch {
      // Honest fallback below.
    }
  }

  const packageName = toolName.trim().toLowerCase().split(/\s+\+\s+|\s+/)[0];
  return `# Could not auto-generate install command for ${toolName}\n# Please run: npm install ${packageName}`;
}

async function addMissingInstallCommands(spec: ProjectSpec, files: PackageFiles): Promise<PackageFiles> {
  const unknown = lockedEntries(spec)
    .map(([, entry]) => entry.value)
    .filter((toolName) => !registryByName(toolName));
  if (unknown.length === 0) return files;

  const isOffline = Boolean(spec.constraints.technical?.mustBeOffline)
    || /\b(offline|no internet|without internet)\b/i.test(spec.description);
  const generated = await Promise.all(
    unknown.map((toolName) => getInstallCommands(toolName, spec.platform, isOffline)),
  );
  const commandBlock = Array.from(new Set(generated)).join("\n");
  const shell = files["setup/install.sh"] ?? `#!/usr/bin/env bash\nset -euo pipefail\n`;
  const powershell = files["setup/install.ps1"] ?? "";
  const shellWithCommands = shell.includes('echo "Done."')
    ? shell.replace('echo "Done."', `${commandBlock}\necho "Done."`)
    : `${shell.trimEnd()}\n${commandBlock}\n`;
  const powershellWithCommands = powershell.includes('Write-Host "Done."')
    ? powershell.replace('Write-Host "Done."', `${commandBlock}\nWrite-Host "Done."`)
    : `${powershell.trimEnd()}\n${commandBlock}\n`;
  return {
    ...files,
    "setup/install.sh": shellWithCommands,
    "setup/install.ps1": powershellWithCommands,
  };
}

async function fallbackSetup(spec: ProjectSpec): Promise<PackageFiles> {
  const known: string[] = [];
  const unknown: string[] = [];
  for (const [, entry] of lockedEntries(spec)) {
    const reg = registryByName(entry.value);
    if (reg) known.push(...reg.installCommands);
    else unknown.push(entry.value);
  }
  const commands = Array.from(new Set(known));
  const isOffline = Boolean(spec.constraints.technical?.mustBeOffline)
    || /\b(offline|no internet|without internet)\b/i.test(spec.description);
  const unknownLines = await Promise.all(
    unknown.map((toolName) => getInstallCommands(toolName, spec.platform, isOffline)),
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
2. Configure environment variables - see \`tech-stack.md\` for required env vars per technology.
3. Copy \`agents.md\` to your repository root so every AI assistant reads it.
4. Start with the first phase in \`roadmap.md\`, loading context from \`context-manifests/\`.
${unknown.length ? `\n> Note: no verified install commands for: ${unknown.join(", ")}. Verify against official docs.` : ""}
`,
  };
}
