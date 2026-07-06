import { normalizeCategory } from "../registry";
import type { ProjectSpec, StackEntry } from "../../types/projectspec";

/**
 * Builds a hard-constraint block from the ProjectSpec to be injected at the
 * TOP of every AI system prompt. Prevents the model from hallucinating
 * Express routes, JWT auth, cloud services, or forbidden packages.
 */
export function buildConstraintBlock(spec: ProjectSpec): string {
  const lines: string[] = [];

  if (spec.constraints?.technical?.mustBeOffline) {
    lines.push(
      '🚫 HARD CONSTRAINT: This is a FULLY OFFLINE ' +
      'application. No internet access. No cloud ' +
      'services. No external APIs of any kind. ' +
      'Every library must work without a network connection.'
    );
  }

  if (spec.constraints?.technical?.mustUseLocalStorage) {
    lines.push(
      '🚫 HARD CONSTRAINT: All data must be stored ' +
      'locally. Do NOT use Supabase, Firebase, ' +
      'PostgreSQL hosted remotely, or any cloud database.'
    );
  }

  const forbidden = [
    ...(spec.constraints?.technical?.forbiddenTools ?? []),
    ...(spec.constraints?.avoid ?? []),
  ];
  if (forbidden.length > 0) {
    lines.push(
      '🚫 FORBIDDEN TOOLS — do NOT import, reference, ' +
      'or suggest these under any circumstances: ' +
      forbidden.join(', ')
    );
  }

  if (spec.constraints?.technical?.forbiddenCategories?.length) {
    lines.push(
      '🚫 FORBIDDEN CATEGORIES — do not generate code ' +
      'for: ' +
      spec.constraints.technical.forbiddenCategories.join(', ')
    );
  }

  // Derive additional constraints from stack choices
  const stackValues = Object.values(spec.stack ?? {})
    .filter((v) => v?.value)
    .map((v) => v!.value!.toLowerCase());

  // Next.js, Remix, SvelteKit, and Nuxt have built-in server/API route
  // support — they must NOT trigger the NO HTTP SERVER banner even though
  // they are not standalone HTTP frameworks like Express or Fastify.
  const hasBackend = stackValues.some((v) =>
    ['express', 'fastify', 'hono', 'nestjs', 'koa', 'next', 'remix', 'sveltekit', 'nuxt'].some((b) => v.includes(b))
  );
  if (!hasBackend) {
    lines.push(
      '🚫 NO HTTP SERVER: There is no server-side framework in this stack. ' +
      'Do NOT generate API routes, middleware, or HTTP handlers. ' +
      'All logic must run client-side or through third-party APIs.'
    );
  }

  const hasAuth = stackValues.some((v) =>
    ['clerk', 'auth0', 'nextauth', 'lucia', 'passport'].some((a) => v.includes(a))
  );
  if (!hasAuth && spec.constraints?.technical?.mustBeOffline) {
    lines.push(
      '🚫 NO AUTHENTICATION SYSTEM: This is a single-' +
      'user offline application. Do NOT generate JWT, ' +
      'sessions, login flows, user registration, or ' +
      'any authentication code.'
    );
  }

  const lockedPackages = Object.values(spec.stack ?? {})
    .filter((v) => v?.value)
    .map((v) => v!.value!);

  if (lockedPackages.length > 0) {
    lines.push(
      '✅ LOCKED PACKAGES — ONLY use these: ' +
      lockedPackages.join(', ') +
      '. Do not introduce any package not in this list.'
    );
  }

  if (lines.length === 0) return '';

  return `

## ⚠️ HARD CONSTRAINTS — READ BEFORE GENERATING
These constraints override everything else. Any output that violates these constraints is incorrect regardless of how technically sound it appears.

${lines.join('\n\n')}

## End of Constraints
`;
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

/** Stack entries the user locked in (value != null), in category order. */
export function lockedEntries(spec: ProjectSpec): Array<[string, StackEntry & { value: string }]> {
  return Object.entries(spec.stack).filter(
    (e): e is [string, StackEntry & { value: string }] => e[1].value !== null,
  );
}

export function lowConfidenceEntries(spec: ProjectSpec): Array<[string, StackEntry & { value: string }]> {
  return lockedEntries(spec).filter(([, e]) => e.confidence === "low");
}

/** Deterministic ADR filename per locked category, shared by generators. */
export function decisionFileName(spec: ProjectSpec, category: string): string {
  const locked = lockedEntries(spec).map(([c]) => c);
  const index = locked.indexOf(category);
  const num = String((index === -1 ? locked.length : index) + 1).padStart(3, "0");
  return `decisions/${num}-${slugify(category)}.md`;
}

const FEATURE_CATEGORY_KEYWORDS: Array<{ keywords: string[]; normalized: string }> = [
  { keywords: ["auth", "login", "signup", "account"], normalized: "authentication" },
  { keywords: ["ai", "chat", "tutor", "assistant", "llm"], normalized: "ai" },
  { keywords: ["video", "stream", "call", "lesson"], normalized: "video" },
  { keywords: ["payment", "subscription", "billing", "checkout"], normalized: "payments" },
  { keywords: ["email", "newsletter"], normalized: "email" },
  { keywords: ["upload", "file", "image", "media", "storage"], normalized: "storage" },
  { keywords: ["profile", "user", "settings", "dashboard", "onboard", "xp", "progress"], normalized: "database" },
];

/**
 * Locked stack categories relevant to one feature (keyword heuristic).
 * The core framework, state and styling choices are always relevant.
 */
export function relevantCategoriesForFeature(spec: ProjectSpec, feature: string): string[] {
  const text = feature.toLowerCase();
  const wanted = new Set<string>(["framework", "stateManagement", "styling"]);
  for (const { keywords, normalized } of FEATURE_CATEGORY_KEYWORDS) {
    if (keywords.some((k) => text.includes(k))) wanted.add(normalized);
  }
  return lockedEntries(spec)
    .filter(([category]) => wanted.has(normalizeCategory(category)))
    .map(([category]) => category);
}

export function lowConfidenceWarning(tool: string): string {
  return `> **WARNING - LOW CONFIDENCE:** \"${tool}\" was community-suggested and its
> current state could not be verified. Before relying on any convention in this
> file, verify it against the tool's current official documentation.

`;
}

/**
 * Builds a shared context string from the already-generated agents.md and
 * template files so that all subsequent AI generators see the constitutional
 * rules and canonical code patterns before producing any output.
 *
 * This is injected at the END of every system prompt (after the constraint
 * block) to prevent generated files from contradicting agents.md or templates.
 */
export function buildSharedContext(
  agentsContent: string,
  templateFiles: Record<string, string>,
): string {
  // First 100 lines contain the project constitution (rules, stack, conventions)
  const agentsSummary = agentsContent
    .split('\n')
    .slice(0, 100)
    .join('\n');

  // The two most critical pattern files: service layer and API routes
  const serviceTemplate =
    templateFiles['templates/service-template.md'] ?? '';

  const apiTemplate =
    templateFiles['templates/api-route-template.md'] ?? '';

  return `

## Shared Project Context
The following rules are ALREADY ESTABLISHED in this project's agents.md and
templates. Every file you generate MUST comply with them. Any output that
contradicts these rules is incorrect regardless of how technically sound it
appears.

### Established Architecture Rules (from agents.md)
${agentsSummary}

### Established Service Pattern (from templates/service-template.md)
The excerpt below shows the canonical service-layer pattern for this project.
SDKs (including tree-sitter, better-sqlite3, and all other packages) are
imported ONLY in service files. API routes and components MUST NOT import them.

${serviceTemplate.slice(0, 500)}

### Established API Route Pattern (from templates/api-route-template.md)
API routes delegate ALL database/SDK work to service modules — they never
import tree-sitter, better-sqlite3, or any other SDK directly.

${apiTemplate.slice(0, 500)}

## End of Shared Context
`;
}

export type Ecosystem = 
  | 'javascript'
  | 'typescript' 
  | 'python'
  | 'rust'
  | 'go'
  | 'java'
  | 'kotlin'
  | 'swift'
  | 'csharp'
  | 'cpp'
  | 'ruby'
  | 'php'
  | 'unknown'

export function detectPrimaryEcosystem(
  spec: ProjectSpec
): Ecosystem {
  const text = [
    spec.description,
    spec.platform,
    ...Object.values(spec.stack ?? {})
      .map(v => v?.value ?? '')
  ].join(' ').toLowerCase()

  // Check for explicit language mentions first
  if (text.includes('rust') || 
      text.includes('cargo') || 
      text.includes('.rs')) return 'rust'
      
  if (text.includes(' go ') || 
      text.includes('golang') || 
      text.includes('go module') ||
      text.includes('.go')) return 'go'
      
  if (text.includes('python') || 
      text.includes('pip ') ||
      text.includes('django') || 
      text.includes('fastapi') ||
      text.includes('flask') ||
      text.includes('.py')) return 'python'
      
  if (text.includes('java ') || 
      text.includes('spring boot') ||
      text.includes('maven') || 
      text.includes('gradle') ||
      text.includes('.java')) return 'java'
      
  if (text.includes('kotlin') || 
      text.includes('android') ||
      text.includes('.kt')) return 'kotlin'
      
  if (text.includes('swift') || 
      text.includes('ios') ||
      text.includes('xcode') ||
      text.includes('.swift')) return 'swift'
      
  if (text.includes('c#') || 
      text.includes('csharp') ||
      text.includes('.net') ||
      text.includes('dotnet') ||
      text.includes('blazor')) return 'csharp'
      
  if (text.includes('c++') || 
      text.includes('cpp') ||
      text.includes('cmake') ||
      text.includes('.cpp')) return 'cpp'
      
  if (text.includes('ruby') || 
      text.includes('rails') ||
      text.includes('gemfile') ||
      text.includes('.rb')) return 'ruby'
      
  if (text.includes('php') || 
      text.includes('laravel') ||
      text.includes('composer') ||
      text.includes('.php')) return 'php'

  // Default: assume JS/TS ecosystem
  // (Next.js, React, Node, Expo, etc.)
  return 'typescript'
}

const JS_TS_ECOSYSTEMS: Ecosystem[] = [
  'javascript', 
  'typescript'
]

export function isNonJsEcosystem(
  ecosystem: Ecosystem
): boolean {
  return !JS_TS_ECOSYSTEMS.includes(ecosystem)
}

// ─── Technology code-snippet library ─────────────────────────────────────────
// These snippets are injected DIRECTLY into output prompt files so the AI
// agent that reads them (Claude Code, Cursor, Codex, Gemini CLI) always sees
// the exact import and usage patterns — preventing hallucinated API calls.

type SnippetFn = (platform: string) => string;

const TOOL_SNIPPET_MAP: Record<string, SnippetFn> = {
  clerk: (platform) => {
    const isMobile = platform.includes('mobile');
    if (isMobile) {
      return `\`\`\`typescript
// src/lib/clerk.ts (Expo / React Native)
import { ClerkProvider, useAuth, useUser } from '@clerk/clerk-expo';
import * as SecureStore from 'expo-secure-store';

const tokenCache = {
  async getToken(key: string) { return await SecureStore.getItemAsync(key); },
  async saveToken(key: string, value: string) { await SecureStore.setItemAsync(key, value); }
};

// Wrap root component: <ClerkProvider publishableKey={process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!} tokenCache={tokenCache}>
// Use hooks in components: const { isLoaded, userId } = useAuth();
// ❌ NEVER: use the Next.js SDK in mobile apps
\`\`\``;
    }
    return `\`\`\`typescript
// src/middleware.ts — route protection
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
const isPublic = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)', '/api/webhooks(.*)']);
export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) await auth.protect();
});
export const config = { matcher: ['/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico)).*)', '/(api|trpc)(.*)'] };

// API route / Server Component auth check
import { auth, currentUser } from '@clerk/nextjs/server';
export async function GET() {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  return Response.json({ userId });
}
// ❌ NEVER: import { useUser } from '@clerk/nextjs' in Server Components
\`\`\``;
  },
  supabase: () => `\`\`\`typescript
// src/lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';
export const createClient = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

// ✅ RLS-safe query — always filter by user_id
const { data, error } = await supabase
  .from('tasks').select('id, title, status, created_at')
  .eq('user_id', userId).order('created_at', { ascending: false });

// Realtime subscription + cleanup
const channel = supabase.channel('tasks')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: \`user_id=eq.\${userId}\` },
    (payload) => { /* update local state with payload.new */ })
  .subscribe();
return () => supabase.removeChannel(channel); // always clean up

// ❌ NEVER: await supabase.from('tasks').select('*') — exposes all users' data
\`\`\``,

  stripe: () => `\`\`\`typescript
// src/lib/stripe.ts
import Stripe from 'stripe';
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2025-01-27.acacia' });

// Checkout session (src/app/api/billing/checkout/route.ts)
const session = await stripe.checkout.sessions.create({
  mode: 'subscription', customer_email: userEmail,
  line_items: [{ price: priceId, quantity: 1 }],
  success_url: \`\${process.env.NEXT_PUBLIC_APP_URL}/billing/success\`,
  cancel_url: \`\${process.env.NEXT_PUBLIC_APP_URL}/billing\`,
  metadata: { userId },
});

// Webhook handler (src/app/api/webhooks/stripe/route.ts)
import { headers } from 'next/headers';
export async function POST(req: Request) {
  const body = await req.text();
  const sig = (await headers()).get('stripe-signature')!;
  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  if (event.type === 'customer.subscription.updated') { /* sync to DB */ }
  return Response.json({ received: true });
}
// ❌ NEVER: skip webhook signature verification
\`\`\``,

  'google gemini': () => `\`\`\`typescript
// src/lib/gemini.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY!);

export async function generateText(prompt: string): Promise<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

// Streaming response
export async function* streamText(prompt: string): AsyncGenerator<string> {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const stream = await model.generateContentStream(prompt);
  for await (const chunk of stream.stream) yield chunk.text();
}
// ❌ NEVER: use OpenAI SDK patterns — Gemini has a different API shape
\`\`\``,

  openai: () => `\`\`\`typescript
// src/lib/openai.ts
import OpenAI from 'openai';
export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: prompt }],
  temperature: 0.7,
});
return completion.choices[0].message.content ?? '';
\`\`\``,

  zustand: () => `\`\`\`typescript
// src/stores/<domain>Store.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface TaskStore {
  tasks: Task[]; isLoading: boolean; error: string | null;
  setTasks: (tasks: Task[]) => void;
  addTask: (task: Task) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  removeTask: (id: string) => void;
}
export const useTaskStore = create<TaskStore>()(devtools(
  (set) => ({
    tasks: [], isLoading: false, error: null,
    setTasks: (tasks) => set({ tasks }),
    addTask: (task) => set((s) => ({ tasks: [...s.tasks, task] })),
    updateTask: (id, u) => set((s) => ({ tasks: s.tasks.map(t => t.id === id ? { ...t, ...u } : t) })),
    removeTask: (id) => set((s) => ({ tasks: s.tasks.filter(t => t.id !== id) })),
  }), { name: 'task-store' }
));
// ❌ NEVER: define mutations outside the store; ❌ NEVER: store server data globally
\`\`\``,

  'next.js': () => `\`\`\`typescript
// SERVER Component (default — no "use client" directive)
// src/app/dashboard/page.tsx
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
export default async function DashboardPage() {
  const { userId } = await auth();
  if (!userId) redirect('/sign-in');
  const data = await someService.getData(userId); // fetch in Server Component
  return <DashboardClient initialData={data} />;   // pass to Client Component
}

// CLIENT Component — add "use client" ONLY when using hooks/events/browser APIs
// src/components/dashboard/DashboardClient.tsx
'use client';
import { useState } from 'react';

// API Route — src/app/api/tasks/route.ts
import { NextRequest, NextResponse } from 'next/server';
export async function GET(request: NextRequest) { return NextResponse.json({ tasks: [] }); }

// ❌ NEVER: fetch data in Client Components; ❌ NEVER: use hooks in Server Components
\`\`\``,

  prisma: () => `\`\`\`typescript
// src/lib/prisma.ts — singleton (prevents hot-reload connection exhaustion)
import { PrismaClient } from '@prisma/client';
const g = globalThis as { prisma?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== 'production') g.prisma = prisma;

// Query with relation
const tasks = await prisma.task.findMany({
  where: { userId }, orderBy: { createdAt: 'desc' }, include: { assignee: true },
});

// Atomic transaction
await prisma.$transaction([
  prisma.task.update({ where: { id }, data: { status: 'done' } }),
  prisma.auditLog.create({ data: { taskId: id, action: 'completed', userId } }),
]);
// ❌ NEVER: new PrismaClient() inside a request handler
\`\`\``,

  drizzle: () => `\`\`\`typescript
// src/lib/db.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });

// Query
import { eq } from 'drizzle-orm';
const tasks = await db.select().from(schema.tasks).where(eq(schema.tasks.userId, userId));
\`\`\``,

  'better-sqlite3': () => `\`\`\`typescript
// src/lib/db.ts — sync, no async/await needed
import Database from 'better-sqlite3';
const db = new Database(process.env.DB_PATH ?? './app.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Prepared statements (cache and reuse for performance)
const getTasksStmt = db.prepare('SELECT * FROM tasks WHERE id = ?');
export const getTasks = (userId: string) => getTasksStmt.all(userId) as Task[];

// Transaction
const upsertTask = db.transaction((task: Task) => {
  db.prepare('INSERT OR REPLACE INTO tasks (id, title, user_id) VALUES (?, ?, ?)').run(task.id, task.title, task.userId);
});
// ❌ NEVER: use async with better-sqlite3 — it is synchronous by design
\`\`\``,

  firebase: () => `\`\`\`typescript
// src/lib/firebase.ts
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
const app = getApps().length ? getApps()[0] : initializeApp({ /* config */ });
export const db = getFirestore(app);
\`\`\``,

  resend: () => `\`\`\`typescript
// src/lib/email.ts
import { Resend } from 'resend';
const resend = new Resend(process.env.RESEND_API_KEY!);
export async function sendEmail(to: string, subject: string, html: string) {
  return resend.emails.send({ from: 'noreply@yourdomain.com', to, subject, html });
}
\`\`\``,

  convex: () => `\`\`\`typescript
// convex/tasks.ts — mutation
import { mutation, query } from './_generated/server';
import { v } from 'convex/values';
export const createTask = mutation({
  args: { title: v.string(), userId: v.string() },
  handler: async (ctx, args) => ctx.db.insert('tasks', { ...args, status: 'todo', createdAt: Date.now() }),
});
\`\`\``,
};

/**
 * Returns a markdown block with real import/usage patterns for every locked
 * technology. Injected directly into output prompt files so the receiving
 * AI agent always sees correct patterns without hallucinating alternatives.
 */
export function buildTechCodeSnippets(spec: ProjectSpec): string {
  let snippets = '';
  for (const [category, entry] of lockedEntries(spec)) {
    const toolKey = entry.value.toLowerCase();
    const matchedKey = Object.keys(TOOL_SNIPPET_MAP).find(
      (k) => toolKey.includes(k) || k.includes(toolKey.split(' ')[0])
    );
    if (matchedKey) {
      const fn = TOOL_SNIPPET_MAP[matchedKey];
      snippets += `### ${entry.value} (${category})\n\n${fn(spec.platform)}\n\n`;
    }
  }
  if (snippets === '') return '';
  return `
## Established Code Patterns — Copy These Exactly

The following are the EXACT import and usage patterns for this project.
Use them verbatim. Do NOT invent alternative imports or initialization patterns.

${snippets}
`;
}

// ─── Shared database schema derivation ───────────────────────────────────────

/**
 * Derives a minimal SQL schema from the ProjectSpec so that all prompts
 * touching the database use the same table/column names. Without this,
 * AI agents independently invent incompatible schemas across features.
 */
export function buildSharedDatabaseSchema(spec: ProjectSpec): string {
  const dbEntry = lockedEntries(spec).find(([c]) =>
    /database|db|storage|sql|mongo|firebase|supabase|prisma|drizzle/i.test(c)
  );
  if (!dbEntry) return '';

  const dbTool = dbEntry[1].value.toLowerCase();
  const isSql = !dbTool.includes('mongo') && !dbTool.includes('firebase');
  const isSupabase = dbTool.includes('supabase');

  // Derive entities from architecturalRequirements if available, else from features
  const req = (spec as any).architecturalRequirements as {
    domain?: { entities?: Array<{ name: string; attributes: string[] }> };
  } | undefined;

  const entities: Array<{ name: string; columns: string[] }> =
    req?.domain?.entities?.map((e) => ({
      name: e.name.toLowerCase().replace(/\s+/g, '_') + 's',
      columns: e.attributes,
    })) ?? derivedEntitiesFromFeatures(spec);

  if (entities.length === 0) return '';

  if (!isSql) {
    const collections = entities
      .map((e) => `// Collection: ${e.name}\n// Fields: ${e.columns.join(', ')}`)
      .join('\n\n');
    return `\n## Shared Database Schema\n\nUse these collection/field names across ALL features:\n\n\`\`\`typescript\n${collections}\n\`\`\`\n`;
  }

  const tables = entities
    .map((e) => {
      const cols = ['id uuid primary key default gen_random_uuid()', 'created_at timestamptz default now()', 'updated_at timestamptz default now()'];
      const hasUserId = spec.features.some((f) => /auth|user|profile/.test(f.toLowerCase()));
      if (hasUserId && e.name !== 'users') cols.push('user_id text not null references users(id) on delete cascade');
      // Add custom columns from entity attributes (skip generic ones already added)
      const skip = new Set(['id', 'created_at', 'updated_at', 'user_id', 'userid']);
      e.columns.filter((c) => !skip.has(c.toLowerCase().replace(/\s+/g, '_'))).forEach((c) => {
        cols.push(`${c.toLowerCase().replace(/\s+/g, '_')} text`);
      });
      const rlsBlock = isSupabase
        ? `\nalter table ${e.name} enable row level security;\ncreate policy "Users own their rows" on ${e.name} using (auth.uid()::text = user_id);`
        : '';
      return `create table if not exists ${e.name} (\n  ${cols.join(',\n  ')}\n);${rlsBlock}`;
    })
    .join('\n\n');

  return `\n## Shared Database Schema\n\nUse these EXACT table and column names across ALL features. Do not invent alternatives.\n\n\`\`\`sql\n${tables}\n\`\`\`\n`;
}

function derivedEntitiesFromFeatures(spec: ProjectSpec): Array<{ name: string; columns: string[] }> {
  const entities: Array<{ name: string; columns: string[] }> = [];
  const text = (spec.features.join(' ') + ' ' + spec.description).toLowerCase();
  if (/auth|user|profile|login/.test(text)) entities.push({ name: 'users', columns: ['name', 'email', 'avatar_url'] });
  if (/task|todo|item|card/.test(text)) entities.push({ name: 'tasks', columns: ['title', 'description', 'status', 'priority'] });
  if (/chat|message|comment/.test(text)) entities.push({ name: 'messages', columns: ['content', 'sender_id', 'channel_id'] });
  if (/project|board|workspace/.test(text)) entities.push({ name: 'projects', columns: ['name', 'description', 'status'] });
  if (/payment|billing|subscription|invoice/.test(text)) entities.push({ name: 'subscriptions', columns: ['stripe_customer_id', 'stripe_subscription_id', 'plan', 'status'] });
  if (/channel|room|team/.test(text)) entities.push({ name: 'channels', columns: ['name', 'description', 'type'] });
  return entities;
}
