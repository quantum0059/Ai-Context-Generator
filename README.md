# AI Project Context Generator

Generates a complete, downloadable **AI context package** for a software
project: `agents.md`, feature prompts, technology skill files, code templates,
architecture decision records, a roadmap, design references and install
scripts. Feed the package to any AI coding assistant (ChatGPT, Claude, Cursor,
Gemini) to get consistent, architecture-aligned code generation.

The app does **not** generate application code. It generates the context
artifacts that guide AI assistants.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000, describe your project, review the recommended
stack, and download the generated `.zip` package.

## Environment variables (optional)

The app works fully offline using a heuristic analyzer. Configure an LLM to
enhance the analysis step:

| Variable | Description |
| --- | --- |
| `LLM_PROVIDER` | `openai` or `anthropic` (default: `openai`) |
| `LLM_API_KEY` | API key for the chosen provider |
| `LLM_MODEL` | Optional model override |

Copy `.env.example` to `.env` and fill in values.

## Architecture

```
src/
├── app/                  # Next.js App Router UI + API routes
│   ├── page.tsx          # Intake form -> review -> generate flow
│   └── api/
│       ├── analyze/      # POST: analysis + recommendations
│       └── generate/     # POST: builds and streams the .zip package
├── registry/
│   ├── technologies.ts   # Single source of truth for all supported tools
│   └── profiles.ts       # Platform profiles + keyword-to-category triggers
├── generators/           # Composable package generators
│   ├── analyzer.ts       # Heuristic + optional LLM project analysis
│   ├── recommender.ts    # Registry-driven recommendation engine
│   ├── agentsGenerator.ts
│   ├── promptGenerator.ts
│   ├── skillGenerator.ts
│   ├── decisionGenerator.ts
│   ├── templateGenerator.ts
│   ├── roadmapGenerator.ts
│   ├── installGenerator.ts
│   ├── contextGenerator.ts
│   ├── promptMaterialGenerator.ts
│   └── packageBuilder.ts # Assembles everything into a file map
├── lib/
│   ├── llm/adapter.ts    # Provider-agnostic LLM adapter (OpenAI/Anthropic)
│   └── schemas.ts        # zod request validation
└── types/                # Shared TypeScript types
```

### Extending the registry

Adding a new technology requires **only** a new entry in
`src/registry/technologies.ts`. It automatically appears in recommendations,
skill files, ADRs, resources and install scripts.

## Testing

```bash
npm test
```

Unit tests cover the registry integrity, the recommendation engine and the
package builder.
