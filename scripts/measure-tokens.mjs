/**
 * Measures exact token counts for the Groq calls in:
 *   - discoverCategories  (discovery.ts)
 *   - runAiAnalysis        (requirement-extractor.ts)
 *
 * Uses the same React Native + Spring Boot hybrid test project from earlier logs.
 * Token counting: GPT-style (≈ chars/4). Groq uses the same tokenizer family for
 * openai/gpt-oss-120b. This gives ±5% accuracy — sufficient for budgeting.
 */

// ── Test project (same one from the logs) ────────────────────────────────────
const TEST_PROJECT = {
  name: "CollabPlatform",
  platform: "saas",
  description: `A SaaS collaboration platform for remote engineering teams. Built with a scalable architecture using Spring Boot, PostgreSQL, JWT authentication, WebSockets, and a modern React Native frontend. Teams can create workspaces, invite members, assign roles (RBAC), chat in real-time, share files, track projects with Kanban boards, and get AI-powered meeting summaries. GDPR-compliant data handling and right-to-be-forgotten procedures. CCPA awareness for US customers.`,
  features: ["real-time chat", "file sharing", "kanban board", "AI meeting summaries", "RBAC", "GDPR compliance"],
  constraints: {
    forbiddenTools: [],
    forbiddenCategories: [],
    requiredToolTypes: ["Spring Boot backend", "PostgreSQL database", "JWT authentication", "WebSocket server", "React Native frontend"],
    mustBeOffline: false,
    mustUseLocalStorage: false,
    rawConstraints: ["Built with a scalable architecture using Spring Boot, PostgreSQL, JWT authentication, WebSockets, and a modern React Native frontend"],
    compliance: ["GDPR-compliant data handling and right-to-be-forgotten procedures", "CCPA awareness for US customers"],
  },
};

// ── Prompts (exact copies from source files) ─────────────────────────────────

// ─── discovery.ts: discoverySystemPrompt ─────────────────────────────────────
const DISCOVERY_SYSTEM = `You are a senior software architect analyzing a project description to determine its technical architecture requirements.

Your job has TWO steps and you must complete them in order:

STEP 1 — CLASSIFY THE PROJECT TYPE
Before suggesting any categories, determine which of these project types applies:

- UI_APPLICATION: Has a user interface as its primary output (web app, mobile app, desktop app, browser extension)
- HEADLESS_ENGINE: Core output is processed data, generated files, or transformed content — no UI required to deliver value (generators, parsers, converters, AI pipelines)
- BACKEND_API: Primary output is HTTP endpoints consumed by other services or clients
- CLI_TOOL: Primary interface is a terminal command
- LIBRARY_OR_SDK: Primary output is code consumed by other developers
- HYBRID: Has both a meaningful UI AND a meaningful headless/API core (treat as the heavier concern)

STEP 2 — SUGGEST CATEGORIES BASED ON CLASSIFICATION
Use the classification to constrain your suggestions:

If UI_APPLICATION:
  Include: frontend framework, styling, state management, and UI-specific concerns
  
If HEADLESS_ENGINE:
  DO NOT suggest: frontend framework, styling, UI component libraries, state management
  DO suggest: processing pipeline architecture, output format/serialization, job queuing if async, storage for outputs, API layer only if the engine exposes one
  
If BACKEND_API:
  DO NOT suggest: frontend framework, styling, UI libraries
  DO suggest: API framework, database, auth (if endpoints are user-scoped), validation, rate limiting, documentation (OpenAPI)
  
If CLI_TOOL:
  DO NOT suggest: frontend framework, web server, UI libraries
  DO suggest: CLI framework, config management, output formatting, distribution/packaging
  
If LIBRARY_OR_SDK:
  DO NOT suggest: auth, database, frontend concerns
  DO suggest: package distribution, versioning, documentation generation, testing framework, TypeScript types
  
If HYBRID:
  Suggest categories for both concerns but clearly separate them in your response

CRITICAL RULES:
- A project that GENERATES files is a HEADLESS_ENGINE, even if it has a web interface for input collection
- A project that PROCESSES data is a HEADLESS_ENGINE
- Do not suggest categories based on keywords alone — read the actual purpose of the project
- Never suggest a category the project does not need
- A dashboard for a headless engine is a secondary concern, not the primary architecture

Custom category rules:
- Create one category per distinct technical concern
- Name the category key in camelCase (e.g. 'astParser', 'mlRuntime', 'pdfEngine', 'imageProcessor', 'cliFramework', 'testRunner')
- Set a human-readable label (e.g. 'AST Parser', 'ML Runtime', 'PDF Engine')
- Include a reason explaining why this project specifically needs it
- Set isCustom: true so the UI renders it correctly
- Pre-populate suggestedTools with 2-3 real, installable npm package names or pip package names

Your ENTIRE response must be a single JSON object matching this structure exactly:
{
  "projectType": "UI_APPLICATION | HEADLESS_ENGINE | BACKEND_API | CLI_TOOL | LIBRARY_OR_SDK | HYBRID",
  "classificationReason": "one sentence explaining why this classification applies",
  "requiredCategories": [
    {
      "key": "camelCase category key",
      "label": "Human readable label",
      "reason": "why this project needs this category",
      "relevantToProjectType": true,
      "isCustom": true,
      "suggestedTools": [
        { "name": "tool-name", "reason": "why", "installCommand": "npm install tool-name", "docsUrl": "https://..." }
      ]
    }
  ],
  "excludedCategories": [
    { "key": "category that might seem relevant", "reason": "why this project does NOT need it" }
  ]
}

Return valid JSON only.`;

const DISCOVERY_USER = `Analyze this project and determine its required technology categories:

Project Name: ${TEST_PROJECT.name}
Description: ${TEST_PROJECT.description}
Platform: ${TEST_PROJECT.platform}
Features mentioned: ${TEST_PROJECT.features.join(', ')}

Hard constraints already extracted:
Forbidden tools: ${TEST_PROJECT.constraints.forbiddenTools.join(', ')}
Forbidden categories: ${TEST_PROJECT.constraints.forbiddenCategories.join(', ')}
Required tool types: ${TEST_PROJECT.constraints.requiredToolTypes.join(', ')}
Must be offline: ${TEST_PROJECT.constraints.mustBeOffline}
Must use local storage: ${TEST_PROJECT.constraints.mustUseLocalStorage}

Rules for this specific project:
- Do NOT suggest any tool in the forbidden list
- Do NOT suggest any category in the forbidden list
- You MUST include categories for each required tool type listed above
- If mustBeOffline is true, every suggestedTool must work without internet
- If mustUseLocalStorage is true, do not suggest any cloud database
- After listing standard categories, scan for specialized technical needs that require a custom category (e.g. AST parsing → astParser, PDF generation → pdfEngine)`;

// ─── requirement-extractor.ts: SYSTEM_PROMPT ─────────────────────────────────
const EXTRACTOR_SYSTEM = `You are a Senior Software Architect conducting a formal requirement extraction and domain analysis session. Your job is to think the way an architect does when they first read a project brief — NOT to build, but to deeply understand.

You must extract ALL of the following from the project description:

1. BUSINESS GOALS — Why is this software being built? What business problem does it solve? What value does it deliver?
2. SUCCESS CRITERIA — How will the stakeholders know this project succeeded? These are measurable outcomes.
3. TARGET AUDIENCE — Who are the intended users? Describe each user type (persona).
4. DOMAIN MODEL — What are the core entities (nouns) in this system? Who are the actors? What are their attributes and relationships? What are the core workflows?
5. FUNCTIONAL REQUIREMENTS — Every independent user-facing capability must become its own Functional Requirement. Do not collapse multiple capabilities into generic requirements such as "AI Enhancements", "Image Editing", or "Media Processing". If a project explicitly mentions Background Removal, Upscaling, Multiple AI Models, Cloud Storage, Style Presets, Generation Settings, Cross-device Sync, or similar capabilities, each must become an independent Functional Requirement. Format as FR-001, FR-002, etc.
6. NON-FUNCTIONAL REQUIREMENTS — Performance targets, security mandates, scalability needs, availability requirements, accessibility standards, regulatory compliance (GDPR, HIPAA, PCI-DSS, etc.), and maintainability expectations.
7. EDGE CASES — What can go wrong? List failure modes, boundary conditions, race conditions, and error states the system must handle gracefully.

Rules:
- Think like an architect who has seen many similar projects fail due to overlooked requirements.
- Implicit requirements are AS important as explicit ones. Flag them clearly.
- Do NOT suggest a tech stack — you are only extracting requirements.
- Return valid JSON only, matching the schema exactly.`;

const EXTRACTOR_USER = `Perform a full architectural requirement extraction for this project.

Project Name: ${TEST_PROJECT.name}
Platform: ${TEST_PROJECT.platform}
Description:
${TEST_PROJECT.description}

Return this exact JSON structure:
{
  "businessGoals": ["..."],
  "successCriteria": ["..."],
  "targetAudience": ["..."],
  "domain": {
    "actors": [{ "name": "...", "description": "...", "permissions": ["..."] }],
    "entities": [{ "name": "...", "description": "...", "attributes": ["..."], "relatedEntities": ["..."] }],
    "coreWorkflows": ["..."]
  },
  "functional": [
    { "id": "FR-001", "title": "...", "description": "...", "type": "explicit|implicit", "actors": ["..."], "priority": "must-have|should-have|nice-to-have" }
  ],
  "nonFunctional": {
    "performance": ["..."],
    "security": ["..."],
    "scalability": ["..."],
    "availability": ["..."],
    "accessibility": ["..."],
    "compliance": ["..."],
    "maintainability": ["..."],
    "other": ["..."]
  },
  "edgeCases": [
    { "scenario": "...", "expectedBehaviour": "...", "category": "network|data|auth|concurrency|input-validation|external-service|other" }
  ]
}

Critical rules:
- functional must be EXTREMELY granular. Every independent user-facing capability must be its own Functional Requirement. DO NOT collapse capabilities (e.g. 'Background removal' and 'Upscaling' must be separate).
- functional must include BOTH explicit (stated) and implicit (inferred) requirements
- nonFunctional must have at least one entry per category where applicable; use [] only if truly not applicable
- edgeCases must include at least 5 realistic scenarios for this domain
- Every string must be specific to THIS project — no generic boilerplate
- Return ONLY valid JSON`;

// ── Token counter (chars / 4, standard GPT approximation) ───────────────────
const tok = (s) => Math.ceil(s.length / 4);

// ── Groq API overhead per message (role tag ≈ 4 tokens each) ────────────────
const MSG_OVERHEAD = 4;

// max_tokens the current code sends for 120b model
const MAX_TOKENS_120B = 4096;

// ── Report ────────────────────────────────────────────────────────────────────
function report(label, system, user, maxTokens) {
  const systemTok  = tok(system)  + MSG_OVERHEAD;
  const userTok    = tok(user)    + MSG_OVERHEAD;
  const promptTok  = systemTok + userTok;
  const totalReserved = promptTok + maxTokens;

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`CALL: ${label}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  System prompt   : ${systemTok.toString().padStart(5)} tokens  (${system.length} chars)`);
  console.log(`  User prompt     : ${userTok.toString().padStart(5)} tokens  (${user.length} chars)`);
  console.log(`  Total input     : ${promptTok.toString().padStart(5)} tokens`);
  console.log(`  max_tokens out  : ${maxTokens.toString().padStart(5)} tokens  ← reserved from TPM`);
  console.log(`  TOTAL RESERVED  : ${totalReserved.toString().padStart(5)} tokens  (hits 8000 TPM limit?  ${totalReserved > 8000 ? '⚠️  YES' : '✅ no'})`);
  console.log(`\n  Breakdown of user prompt:`);

  // For discovery: split into project input vs. rules section
  const rulesSplit = user.indexOf('\nRules for this specific project:');
  if (rulesSplit > 0) {
    const inputPart = user.slice(0, rulesSplit);
    const rulesPart = user.slice(rulesSplit);
    console.log(`    Project input (name/desc/platform/features/constraints): ${tok(inputPart)} tokens`);
    console.log(`    Rules block (do not cut / redundancy check):              ${tok(rulesPart)} tokens`);
  }

  // For extractor: split schema template from project input
  const schemaSplit = user.indexOf('\nReturn this exact JSON structure:');
  if (schemaSplit > 0) {
    const inputPart = user.slice(0, schemaSplit);
    const schemaPart = user.slice(schemaSplit);
    console.log(`    Project input (name/platform/desc):                      ${tok(inputPart)} tokens`);
    console.log(`    JSON schema template + critical rules:                   ${tok(schemaPart)} tokens`);
  }

  return { systemTok, userTok, promptTok, totalReserved };
}

const d = report('discoverCategories (MODELS.REASONING = 120b)', DISCOVERY_SYSTEM, DISCOVERY_USER, MAX_TOKENS_120B);
const e = report('runAiAnalysis (MODELS.CONTENT = 120b)', EXTRACTOR_SYSTEM, EXTRACTOR_USER, MAX_TOKENS_120B);

const combined = d.totalReserved + e.totalReserved;
console.log(`\n${'═'.repeat(60)}`);
console.log(`Both calls fire in the same /discover request (Promise.allSettled)`);
console.log(`Combined TPM reserved for this request: ${combined} tokens`);
console.log(`TPM limit (on-demand tier):             8,000 tokens`);
console.log(`Over limit by:                          ${Math.max(0, combined - 8000)} tokens`);
console.log(`${'═'.repeat(60)}\n`);
