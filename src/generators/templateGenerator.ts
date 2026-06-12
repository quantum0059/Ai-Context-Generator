import type { GeneratedPackage, ProjectInput, Recommendation } from "../types";

/** Generates reusable code templates that follow project conventions. */
export function generateTemplates(
  input: ProjectInput,
  selected: Recommendation[],
): GeneratedPackage {
  const state = selected.find((r) => r.category === "stateManagement")?.primary.name ?? "Zustand";
  const isMobile = input.platform === "mobile";
  const view = isMobile ? "View" : "div";
  const text = isMobile ? "Text" : "p";

  return {
    "templates/component-template.md": `# Template: Component

Use this structure for every reusable component.

\`\`\`tsx
interface MyComponentProps {
  title: string;
}

export function MyComponent({ title }: MyComponentProps) {
  return (
    <${view}>
      <${text}>{title}</${text}>
    </${view}>
  );
}
\`\`\`

Rules: named export, typed props interface, no inline business logic.
`,
    "templates/screen-template.md": `# Template: Screen / Page

\`\`\`tsx
export default function MyScreen() {
  // 1. hooks (data, store, navigation)
  // 2. derived state
  // 3. handlers
  // 4. render: loading -> error -> empty -> content
  return <${view} />;
}
\`\`\`

Rules: screens compose feature components; no direct SDK calls here.
`,
    "templates/store-template.md": `# Template: ${state} Store

\`\`\`ts
import { create } from "zustand";

interface CounterState {
  count: number;
  increment: () => void;
}

export const useCounterStore = create<CounterState>((set) => ({
  count: 0,
  increment: () => set((s) => ({ count: s.count + 1 })),
}));
\`\`\`

Rules: one store per domain, actions live inside the store.
`,
    "templates/api-template.md": `# Template: API Route / Endpoint

\`\`\`ts
import { z } from "zod";

const bodySchema = z.object({ name: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  // delegate to a service - no business logic in the route
  return Response.json({ ok: true });
}
\`\`\`

Rules: validate input at the edge, delegate to services, typed responses.
`,
    "templates/service-template.md": `# Template: Service Layer

\`\`\`ts
// The ONLY place where an external SDK may be imported.
export async function getUserProfile(userId: string) {
  // call SDK / fetch here, map to a domain type, throw typed errors
}
\`\`\`

Rules: services return domain types, never raw SDK responses.
`,
    "templates/hook-template.md": `# Template: Hook

\`\`\`ts
import { useEffect, useState } from "react";

export function useThing(id: string) {
  const [data, setData] = useState<unknown>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    // fetch via service layer, update state, handle cleanup
  }, [id]);
  return { data, error, loading };
}
\`\`\`

Rules: hooks expose { data, error, loading }; no JSX inside hooks.
`,
    "templates/repository-template.md": `# Template: Repository

\`\`\`ts
export interface UserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
}
\`\`\`

Rules: repositories abstract the database; queried entities map to domain types.
`,
  };
}
