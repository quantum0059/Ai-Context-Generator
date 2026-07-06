import { z } from "zod";
import { claudeText, isClaudeConfigured } from "../../lib/claude";
import { MODELS } from "../../lib/ai-models";
import type { ProjectSpec, ArchitecturalRequirements } from "../../types/projectspec";
import { lockedEntries, slugify } from "./shared";

// ─── AI-generated context schema ─────────────────────────────────────────────

const contextSchema = z.object({
  productVision: z.string().min(50),
  problemStatement: z.string().min(30),
  targetUsers: z.array(z.object({
    persona: z.string(),
    description: z.string(),
    primaryGoal: z.string(),
  })).min(1),
  coreUserJourneys: z.array(z.object({
    journey: z.string(),
    steps: z.array(z.string()),
    successDefinition: z.string(),
  })).min(1),
  domainGlossary: z.array(z.object({
    term: z.string(),
    definition: z.string(),
  })).min(1),
  businessRules: z.array(z.string()).min(1),
  uxPrinciples: z.array(z.string()).min(1),
  outOfScope: z.array(z.string()).min(1),
  featurePriority: z.array(z.object({
    feature: z.string(),
    whyItMatters: z.string(),
    buildFirst: z.boolean(),
  })).min(1),
});

type ContextData = z.infer<typeof contextSchema>;

// ─── Heuristic fallback builders ─────────────────────────────────────────────

function heuristicTargetUsers(spec: ProjectSpec) {
  const text = `${spec.description} ${spec.features.join(" ")}`.toLowerCase();
  const users: ContextData["targetUsers"] = [];

  if (/team|collaborate|member|workspace/.test(text)) {
    users.push({
      persona: "Team Member",
      description: "Works within a shared workspace alongside colleagues",
      primaryGoal: "Complete tasks efficiently without friction or context-switching",
    });
    users.push({
      persona: "Team Admin / Owner",
      description: "Sets up the workspace, manages access, and monitors activity",
      primaryGoal: "Maintain team productivity and keep the system running smoothly",
    });
  } else if (/saas|subscription|customer|client/.test(text)) {
    users.push({
      persona: "End Customer",
      description: "Pays for and uses the product to solve a specific problem",
      primaryGoal: "Accomplish their core task quickly and reliably",
    });
    users.push({
      persona: "Account Admin",
      description: "Manages the subscription and user access for their organisation",
      primaryGoal: "Control costs and ensure the right people have the right access",
    });
  } else if (/developer|api|sdk|cli|engineer/.test(text)) {
    users.push({
      persona: "Developer",
      description: "Integrates the product into their own application or workflow",
      primaryGoal: "Ship fast with clear docs and predictable, reliable behaviour",
    });
  } else {
    users.push({
      persona: "Primary User",
      description: `The main person using ${spec.projectName}`,
      primaryGoal: "Accomplish the core task described by the product features",
    });
  }

  return users;
}

function heuristicJourneys(spec: ProjectSpec): ContextData["coreUserJourneys"] {
  const text = `${spec.description} ${spec.features.join(" ")}`.toLowerCase();
  const journeys: ContextData["coreUserJourneys"] = [];

  // Onboarding journey — nearly universal
  if (/auth|login|sign.?in|account|onboard/.test(text)) {
    journeys.push({
      journey: "Onboarding — First-Time Setup",
      steps: [
        "User lands on the marketing or sign-in page",
        "User signs up with email or OAuth provider",
        "User completes any required profile or workspace setup",
        "User is routed to the main dashboard",
        "User sees the first-run empty state with a clear call to action",
      ],
      successDefinition: "User reaches a working state with at least one meaningful action available within 2 minutes of sign-up",
    });
  }

  // Core feature journey — derive from first feature
  if (spec.features.length > 0) {
    const coreFeature = spec.features[0];
    journeys.push({
      journey: `Core Loop — ${coreFeature}`,
      steps: [
        `User navigates to the ${coreFeature} section`,
        "User initiates the primary action",
        "System processes the request and provides real-time feedback",
        "User sees the result and can act on it",
        "User can share, export, or continue to the next step",
      ],
      successDefinition: `User completes the ${coreFeature} workflow end-to-end without needing documentation or support`,
    });
  }

  // Billing journey — if payments in stack
  if (/payment|billing|subscription|stripe/.test(text)) {
    journeys.push({
      journey: "Upgrade — Free to Paid",
      steps: [
        "User hits a feature gate or clicks upgrade CTA",
        "User sees a clear pricing comparison",
        "User selects a plan and enters payment details",
        "Stripe Checkout session completes",
        "Webhook confirms payment — premium features unlock instantly",
        "User lands back in the app with the new plan active",
      ],
      successDefinition: "Premium features are accessible within 5 seconds of payment confirmation, without a page refresh",
    });
  }

  return journeys.length > 0 ? journeys : [{
    journey: "Primary Workflow",
    steps: [
      "User opens the application",
      "User performs the core action",
      "System responds with the expected output",
      "User reviews and acts on the result",
    ],
    successDefinition: `User accomplishes their goal in ${spec.projectName} without assistance`,
  }];
}

function heuristicGlossary(spec: ProjectSpec): ContextData["domainGlossary"] {
  const text = `${spec.description} ${spec.features.join(" ")}`.toLowerCase();
  const terms: ContextData["domainGlossary"] = [
    {
      term: spec.projectName,
      definition: spec.description,
    },
  ];

  if (/workspace|organisation|org/.test(text)) {
    terms.push({ term: "Workspace", definition: "A shared environment belonging to a team or organisation. All members see the same data within a workspace." });
  }
  if (/project|board/.test(text)) {
    terms.push({ term: "Project", definition: "A container for a discrete unit of work within a workspace. Projects have their own members, settings, and timeline." });
  }
  if (/task|todo|item|card/.test(text)) {
    terms.push({ term: "Task", definition: "The smallest unit of trackable work. Tasks belong to a project and can be assigned to members." });
  }
  if (/member|team|user/.test(text)) {
    terms.push({ term: "Member", definition: "A user who belongs to a workspace and has been granted a role (owner, admin, or member)." });
  }
  if (/subscription|plan/.test(text)) {
    terms.push({ term: "Plan", definition: "The billing tier a workspace is on (Free, Pro, Enterprise). Plans control which features are available." });
  }
  if (/ai|llm|prompt|generate/.test(text)) {
    terms.push({ term: "Generation", definition: "An AI-produced output triggered by user input. Generations are stored and can be reviewed, edited, or exported." });
  }

  return terms;
}

function heuristicBusinessRules(spec: ProjectSpec): string[] {
  const text = `${spec.description} ${spec.features.join(" ")}`.toLowerCase();
  const rules: string[] = [
    `All data in ${spec.projectName} is scoped to the authenticated user or workspace — no cross-tenant data access is permitted under any circumstances`,
  ];

  if (/subscription|billing|payment|stripe/.test(text)) {
    rules.push("Premium features are gated at the API layer, not just the UI — bypassing the UI does not grant access");
    rules.push("Access is granted ONLY after the Stripe webhook confirms successful payment — never at the checkout redirect");
    rules.push("Subscription status is always read from the database, never from client-side state");
  }
  if (/auth|login|session/.test(text)) {
    rules.push("Unauthenticated users are redirected server-side — they never see a blank or broken authenticated view");
    rules.push("Session tokens are validated on every API call — expired sessions return 401 immediately");
  }
  if (/realtime|websocket|live/.test(text)) {
    rules.push("Realtime subscriptions are established on mount and torn down on unmount — duplicate listeners are a defect");
  }
  if (/upload|file|image|media/.test(text)) {
    rules.push("File uploads are validated for type and size before being processed — malformed or oversized files are rejected at the boundary");
  }
  if (spec.constraints?.technical?.mustBeOffline) {
    rules.push("All features must function fully offline — any dependency on network connectivity is a defect");
  }

  return rules;
}

function heuristicUxPrinciples(spec: ProjectSpec): string[] {
  const text = `${spec.description} ${spec.features.join(" ")}`.toLowerCase();
  const principles: string[] = [
    "Every action has visible feedback — loading, success, and error states are always shown, never silent",
    "Empty states are meaningful — they explain what will appear here and offer a clear action to get started",
    "Errors are human — never show raw error codes or stack traces to users; provide a clear message and a retry action",
    "Progress is preserved — users never lose unsaved work due to a session expiry or navigation error",
  ];

  if (/mobile|ios|android|expo/.test(text)) {
    principles.push("Touch targets are at least 44×44px — accessibility and usability on small screens are non-negotiable");
    principles.push("Offline-first: the UI renders with cached data immediately while fresh data loads in the background");
  }
  if (/realtime|live|websocket/.test(text)) {
    principles.push("Optimistic UI: user actions reflect immediately in the UI and reconcile with the server response in the background");
  }
  if (/dashboard|analytics|chart/.test(text)) {
    principles.push("Data visualisations are responsive — they adapt to the available screen width without losing information");
  }

  return principles;
}

function heuristicOutOfScope(spec: ProjectSpec): string[] {
  const text = `${spec.description} ${spec.features.join(" ")}`.toLowerCase();
  const outOfScope: string[] = [
    "Native mobile apps are out of scope unless the platform is explicitly mobile",
    "Internationalisation (i18n) and multi-language support are out of scope for the initial version",
    "Offline mode is out of scope unless explicitly required by the project constraints",
  ];

  if (!/payment|billing|stripe/.test(text)) {
    outOfScope.push("In-app payments and billing management are out of scope");
  }
  if (!/admin|backoffice/.test(text)) {
    outOfScope.push("An admin back-office or internal tooling dashboard is out of scope");
  }
  if (!/api|sdk|integration/.test(text)) {
    outOfScope.push("Third-party developer API or public SDK are out of scope");
  }

  return outOfScope;
}

function heuristicFeaturePriority(spec: ProjectSpec): ContextData["featurePriority"] {
  return spec.features.map((feature, i) => ({
    feature,
    whyItMatters: `${feature} is required for the core user workflow described in the project description`,
    buildFirst: i === 0,
  }));
}

// ─── Fallback renderer ────────────────────────────────────────────────────────

function buildFallbackContext(spec: ProjectSpec): ContextData {
  return {
    productVision: `${spec.projectName} is a ${spec.platform} application that ${spec.description}`,
    problemStatement: `Users need ${spec.projectName} because the current alternatives require too much manual effort, context-switching, or technical overhead to accomplish the core goal described by: "${spec.description}"`,
    targetUsers: heuristicTargetUsers(spec),
    coreUserJourneys: heuristicJourneys(spec),
    domainGlossary: heuristicGlossary(spec),
    businessRules: heuristicBusinessRules(spec),
    uxPrinciples: heuristicUxPrinciples(spec),
    outOfScope: heuristicOutOfScope(spec),
    featurePriority: heuristicFeaturePriority(spec),
  };
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderContextMd(spec: ProjectSpec, data: ContextData, req: ArchitecturalRequirements | undefined, engine: "claude" | "heuristic"): string {
  const now = new Date().toISOString().split("T")[0];
  const stackTable = lockedEntries(spec)
    .map(([cat, entry]) => `| ${cat} | \`${entry.value}\` |`)
    .join("\n");

  const targetUsersSection = data.targetUsers
    .map(u => `### ${u.persona}\n${u.description}\n\n**Primary goal:** ${u.primaryGoal}`)
    .join("\n\n");

  const journeysSection = data.coreUserJourneys
    .map(j => {
      const steps = j.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
      return `### ${j.journey}\n\n${steps}\n\n✅ **Success:** ${j.successDefinition}`;
    })
    .join("\n\n---\n\n");

  const glossarySection = data.domainGlossary
    .map(g => `| \`${g.term}\` | ${g.definition} |`)
    .join("\n");

  const businessRulesSection = data.businessRules
    .map((r, i) => `${i + 1}. ${r}`)
    .join("\n");

  const uxSection = data.uxPrinciples
    .map(p => `- ${p}`)
    .join("\n");

  const outOfScopeSection = data.outOfScope
    .map(o => `- ❌ ${o}`)
    .join("\n");

  const featurePrioritySection = data.featurePriority
    .map(f => {
      const badge = f.buildFirst ? " 🏁 **Build first**" : "";
      return `- **${f.feature}**${badge} — ${f.whyItMatters}\n  → Prompts: \`prompts/${slugify(f.feature)}/\``;
    })
    .join("\n");

  // Architectural requirements section — only present when AI-extracted
  let requirementsSection = "";
  if (req && req.businessGoals.length > 0) {
    const goals = req.businessGoals.map(g => `- ${g}`).join("\n");
    const success = req.successCriteria.map((c, i) => `${i + 1}. ${c}`).join("\n");
    const workflows = req.domain.coreWorkflows.map((w, i) => `${i + 1}. ${w}`).join("\n");
    requirementsSection = `

---

## 7. Business Goals & Success Criteria

### Business Goals
${goals}

### The project is successful when:
${success}

### Core System Workflows
${workflows}
`;
  }

  // Constraints section
  const tc = spec.constraints?.technical;
  const constraintLines: string[] = [];
  if (tc?.mustBeOffline) constraintLines.push("🚫 **Fully offline** — no internet access at runtime");
  if (tc?.mustUseLocalStorage) constraintLines.push("🚫 **Local storage only** — no cloud database");
  if (tc?.forbiddenTools?.length) constraintLines.push(`🚫 **Forbidden tools:** ${tc.forbiddenTools.join(", ")}`);
  if (spec.constraints?.avoid?.length) constraintLines.push(`🚫 **Explicitly avoided:** ${spec.constraints.avoid.join(", ")}`);
  if (spec.constraints?.budget) constraintLines.push(`💰 **Budget constraint:** ${spec.constraints.budget}`);
  const constraintsSection = constraintLines.length > 0
    ? `\n\n---\n\n## 8. Hard Constraints\n\nThese constraints are absolute — they override all other considerations:\n\n${constraintLines.join("\n")}`
    : "";

  const engineNote = engine === "heuristic"
    ? `\n> ⚠️ **Heuristic mode** — generated from keyword analysis without AI. Configure \`ANTHROPIC_API_KEY\` and regenerate for a richer, more accurate product context.\n`
    : "";

  return `# Context — ${spec.projectName}

> **This is the first file every AI agent must read before implementing any feature.**
> It defines what the product is, who it is for, and what makes it succeed.
> Load this file before \`agents.md\` and before any feature prompt.

Generated by ContextForge on ${now}.${engineNote}

---

## 1. Product Vision

${data.productVision}

**Platform:** ${spec.platform}
${spec.constraints?.budget ? `**Budget tier:** ${spec.constraints.budget}` : ""}

---

## 2. Problem Statement

${data.problemStatement}

---

## 3. Target Users

${targetUsersSection}

---

## 4. Core User Journeys

> These are the workflows your implementation must support end-to-end.
> Every feature prompt is derived from making these journeys succeed.

${journeysSection}

---

## 5. Domain Glossary

> These are the **canonical terms** for this product. AI agents must use them consistently in variable names, file names, API routes, and database columns. Never invent synonyms.

| Term | Definition |
|------|-----------|
${glossarySection}

---

## 6. Business Rules

> These rules are **invariants** — they must hold true in every code path, including edge cases, error states, and asynchronous flows.

${businessRulesSection}${requirementsSection}

---

## ${requirementsSection ? "9" : "7"}. UX Principles

> Every component, API response, and state transition must honour these principles.

${uxSection}

---

## ${requirementsSection ? "10" : "8"}. Out of Scope

> Do not implement these. If a feature prompt seems to require them, stop and ask for clarification.

${outOfScopeSection}

---

## ${requirementsSection ? "11" : "9"}. Feature Build Order & Why It Matters

${featurePrioritySection}

---

## ${requirementsSection ? "12" : "10"}. Tech Stack Reference

| Category | Technology |
|----------|-----------|
${stackTable || "| _(not yet locked)_ | |"}

> For full setup instructions, import patterns, and anti-patterns see \`agents.md\` and \`tech-stack.md\`.

---

## How to Use This File

### For an AI Coding Agent
1. **Read this file completely** before opening any feature prompt
2. Identify which **Target User** and **User Journey** the feature serves
3. Use **Domain Glossary** terms exactly in all code (types, variables, routes, columns)
4. Verify your implementation against the **Business Rules** — each one must hold in your code
5. Check the **UX Principles** before shipping any UI change
6. If you are unsure whether something is in scope, check **Out of Scope** before proceeding

### For a Developer
- Open \`roadmap.md\` to see the recommended build order
- Open \`context-manifests/<feature>-guide.md\` to see exactly what to load for each feature
- Open \`prompts/<feature>/<aspect>.md\` and paste into your AI assistant

---

*This file is the single source of truth for product intent. All generated prompts, agents.md, and context manifests derive their product understanding from this document.*
`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generates `context.md` — the product context brief that every AI agent
 * reads FIRST before applying any feature prompt.
 *
 * This is the foundation of the agent grounding system:
 *   1. Agent reads context.md  → "What is this product and who is it for?"
 *   2. Agent reads agents.md   → "What are the architecture rules?"
 *   3. Agent reads the feature prompt → "What exactly do I build now?"
 *
 * Generation uses the strongest available reasoning model because a
 * misunderstanding of the product vision here propagates into every
 * downstream feature prompt and agent.md section.
 */
export async function generateContext(spec: ProjectSpec): Promise<string> {
  const req = spec.architecturalRequirements as ArchitecturalRequirements | undefined;

  if (isClaudeConfigured()) {
    try {
      const systemPrompt = `You are a Principal Product Manager and software architect. You are writing the definitive product context document that will be the FIRST file read by every AI coding assistant before they implement any feature of this project.

This document must be so clear, specific, and vivid that an AI assistant reading it can make correct product decisions independently — knowing who the users are, what success looks like, what the domain terminology means, and what is categorically out of scope.

Rules:
- Be extremely specific to THIS project — no generic advice
- Use concrete, vivid language for user journeys (what does the user see, click, and feel?)
- Domain glossary terms must be exactly the terms that should appear in code (PascalCase entities, camelCase fields)
- Business rules must be written as invariants — truths that are always enforced
- Out of scope must be specific — name what is explicitly not being built
- Feature priority must explain WHY each feature matters to the user journey, not just list it

Return a JSON object matching this TypeScript type exactly:
{
  productVision: string;                              // 2-4 sentences: what this product is and why it exists
  problemStatement: string;                           // 1-2 sentences: the specific pain this solves
  targetUsers: Array<{
    persona: string;                                  // short label, e.g. "Indie Developer", "Team Admin"
    description: string;                              // 1-2 sentences about who they are
    primaryGoal: string;                              // what they are trying to achieve with this product
  }>;
  coreUserJourneys: Array<{
    journey: string;                                  // descriptive title
    steps: string[];                                  // 4-7 concrete, sequential steps the user takes
    successDefinition: string;                        // one sentence: what does "done" look like for this journey?
  }>;
  domainGlossary: Array<{
    term: string;                                     // the exact term to use in code
    definition: string;                               // what it means in this product's domain
  }>;
  businessRules: string[];                            // 4-8 invariants that must always be true in the code
  uxPrinciples: string[];                             // 4-6 principles every UI component must honour
  outOfScope: string[];                               // 3-5 explicit things NOT being built in this version
  featurePriority: Array<{
    feature: string;                                  // must exactly match a feature in the project features list
    whyItMatters: string;                             // why this feature serves the core user journey
    buildFirst: boolean;                              // true for the foundation feature only
  }>;
}`;

      const userPrompt = `Generate the product context document for this project:

Project Name: ${spec.projectName}
Platform: ${spec.platform}
Description: ${spec.description}
Features: ${spec.features.join(", ")}
${spec.constraints?.budget ? `Budget: ${spec.constraints.budget}` : ""}
${spec.constraints?.avoid?.length ? `Explicitly avoided: ${spec.constraints.avoid.join(", ")}` : ""}

${req ? `
Extracted Architectural Requirements:
Business Goals: ${req.businessGoals.join("; ")}
Target Audience: ${req.targetAudience.join("; ")}
Domain Actors: ${req.domain.actors.map(a => a.name).join(", ")}
Domain Entities: ${req.domain.entities.map(e => e.name).join(", ")}
Core Workflows: ${req.domain.coreWorkflows.join("; ")}
` : ""}

Return only valid JSON matching the schema. No markdown fences, no explanation.`;

      // Use the reasoning model — this document grounds all downstream generation
      const raw = await (await import("../../lib/claude")).claudeJson(
        systemPrompt,
        userPrompt,
        contextSchema,
        0,
        MODELS.REASONING,
      );

      console.log("[ContextGenerator] AI-generated context.md for", spec.projectName);
      return renderContextMd(spec, raw, req, "claude");
    } catch (err) {
      console.error("[ContextGenerator] AI generation failed, using heuristic fallback:", err instanceof Error ? err.message : err);
    }
  }

  // Heuristic fallback — always produces a complete, useful document
  console.log("[ContextGenerator] Using heuristic fallback for context.md");
  const fallbackData = buildFallbackContext(spec);
  return renderContextMd(spec, fallbackData, req, "heuristic");
}
