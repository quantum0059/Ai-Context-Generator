# ContextForge

ContextForge generates a complete, versioned **AI development context package**
for your project - a long-term memory layer you feed to AI coding assistants
(Claude, Cursor, ChatGPT, Gemini, Codex) so they stay architecturally
consistent across the entire project lifecycle.

ContextForge does **not** generate application code, and it does **not** impose
a tech stack. Your choices (typed directly or confirmed from suggestions) are
final and binding for everything generated.

## The ProjectSpec pipeline (single source of truth)

```
User Input
  -> Draft ProjectSpec
  -> Dynamic Category Discovery   (Claude determines required categories)
  -> Suggestion Resolution        (hybrid: registry tier 1 / community tier 2)
  -> User Confirmation            (review step; spec locked at 1.0.0)
  -> Finalized ProjectSpec        (validated, versioned, immutable)
  -> Generators                   (all read the SAME finalized spec)
  -> Package Assembly             (No Generic Content check)
  -> ZIP download (client-side JSZip) / Supabase save (Clerk users)
```

Hard rules implemented in code:
- Generators **never** infer or choose technologies; they only read
  `stack[category].value` from the finalized spec.
- Technology selection happens exactly once, during Suggestion Resolution.
- Low-confidence (community-suggested) tools propagate explicit
  "verify against current docs" warnings into every generated skill file
  and into the `Low-Confidence Areas` section of `agents.md`.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000 and walk the 6-step wizard. The app runs with zero
configuration (heuristic fallbacks); add keys from `.env.example` to enable:

| Variable | Enables |
| --- | --- |
| `ANTHROPIC_API_KEY` | Claude-powered discovery, suggestions, aspects, dependency ordering |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` | Sign-in and package saving |
| `NEXT_PUBLIC_SUPABASE_URL` + keys | Persistence of saved ProjectSpecs/packages |

### Supabase schema

```sql
create table context_packages (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  spec_id text not null,
  project_name text not null,
  spec jsonb not null,
  package_version text not null,
  project_spec_version text not null,
  generated_at timestamptz not null,
  created_at timestamptz not null default now()
);
```

## Generated package contents

`README.md`, `agents.md` (AI constitution with LOCKED stack), `ai-context.json`,
`package-meta.json` (packageVersion + projectSpecVersion), `roadmap.md`,
`resources.md`, `dependency-graph.md`, `prompts/<feature>/build-<feature>-<aspect>.md`,
`skills/<technology>/` (skill, install, examples, env-vars, common-mistakes),
`templates/`, `decisions/` (one ADR per locked category),
`context-manifests/<feature>.json` (exactly which files to load per feature),
`setup/` (install.sh, install.ps1, setup-guide.md).

## Architecture

```
src/
|- app/                      # 6-step wizard UI + API routes
|  |- api/contextforge/
|     |- discover/           # POST: dynamic category discovery
|     |- suggest/            # POST: hybrid suggestion resolution (cached)
|     |- generate/           # POST: finalized spec -> file map (+ meta)
|     |- save/               # POST: Supabase save for Clerk users
|- contextforge/
|  |- spec.ts                # zod schemas + finalizeProjectSpec (freeze + validate)
|  |- discovery.ts           # Claude discovery + heuristic fallback
|  |- suggestions.ts         # Tier 1 registry / Tier 2 community + TTL cache
|  |- registry.ts            # technology_registry view + category aliases
|  |- assembler.ts           # parallel generators + No Generic Content check
|  |- generators/            # agents, skills, prompts, decisions, manifests,
|                            # dependencyGraph, docs (meta/context/resources/
|                            # roadmap/readme/templates/setup), shared helpers
|- lib/                      # claude.ts (schema-validated JSON + retries),
|                            # cache.ts, supabase.ts
|- registry/technologies.ts  # seed registry data
|- types/projectspec.ts      # ProjectSpec and package types
```

## Testing

```bash
npm test
```

Covers: heuristic discovery, tier 1/tier 2 suggestion resolution, spec
finalization (validation + immutability), full package assembly, low-confidence
warning propagation, manifest correctness, and the No Generic Content rule.

## Phase 2 (implemented)

- **prompt_material/**: Claude-identified UI reference sheets per key screen
  (layout hierarchy, spacing, typography, interactions, rationale) plus a full
  design system (`colors`, `typography`, `spacing`, `animation-guidelines`,
  `component-guidelines`) derived from uploaded references when present,
  otherwise platform defaults explicitly marked as defaults. Manifests link
  matching UI references per feature.
- **Selective regeneration** (`src/contextforge/regenerate.ts` +
  `POST /api/contextforge/regenerate`): edit the spec and confirm again - only
  affected generators re-run (changed stack entries swap their skill packages,
  added features get new prompts/manifests); unrelated files carry over
  byte-for-byte. `projectSpecVersion` and `packageVersion` bump automatically.
- **Registry buildout**: hosting category (Vercel, Netlify, Railway) plus
  Auth0, Neon, Lemon Squeezy, Plausible, SendGrid.
- **Templates expansion**: hook, service, repository and test templates.
- **Image upload**: the design-reference step accepts up to 10 JPG, PNG, WebP,
  or GIF images. `POST /api/contextforge/upload` stores them in Cloudinary;
  secure URLs flow into the ProjectSpec.
- **Stripe paywall scaffold**: `POST /api/billing/checkout` (Checkout session)
  and `POST /api/billing/webhook` (signature-verified, records subscriptions).
- **Dashboard** (`/dashboard`): lists saved packages with both versions.

### Subscriptions schema

```sql
create table subscriptions (
  user_id text primary key,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null,
  created_at timestamptz not null default now()
);
```

## Phase 3 Completed

- Registry admin panel UI with local edits persisted in browser storage for admin demos.
- Plan enforcement on generation limits: free tier limited to 5 monthly generations, Pro tier limited to 100.
- Loading a saved package back into the wizard from the dashboard for selective regeneration.

<!-- this is mirrored -->
