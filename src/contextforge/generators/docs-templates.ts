import type { PackageFiles, ProjectSpec } from "../../types/projectspec";
import { lockedEntries } from "./shared";
import { detectPlatformParadigm } from "./platform";

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


  templates["templates/service-template.md"] = `# Service Template — ${spec.projectName}

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
