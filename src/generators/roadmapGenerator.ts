import type { Analysis, ProjectInput, Recommendation } from "../types";

interface Phase {
  title: string;
  goals: string[];
  deliverables: string[];
  dependencies: string[];
}

/** Generates roadmap.md with phased development plans. */
export function generateRoadmap(
  input: ProjectInput,
  analysis: Analysis,
  selected: Recommendation[],
): string {
  const has = (c: string) => selected.some((r) => r.category === c);
  const phases: Phase[] = [
    {
      title: "Foundation & Setup",
      goals: ["Bootstrap project", "Configure stack", "CI + lint + tests"],
      deliverables: ["Running app skeleton", "setup/ scripts executed", "agents.md adopted"],
      dependencies: ["None"],
    },
  ];
  if (has("authentication"))
    phases.push({
      title: "Authentication",
      goals: ["Sign up / sign in / sign out", "Protected routes"],
      deliverables: ["Auth flows", "Session handling", "Auth tests"],
      dependencies: ["Foundation & Setup"],
    });
  phases.push({
    title: "Onboarding & Core Features",
    goals: ["First-run experience", `Core features: ${input.features.join(", ") || "as described"}`],
    deliverables: ["Onboarding flow", "Core feature screens", "State stores"],
    dependencies: [has("authentication") ? "Authentication" : "Foundation & Setup"],
  });
  if (has("ai"))
    phases.push({
      title: "AI Integration",
      goals: ["Wire AI provider", "Prompt + safety handling"],
      deliverables: ["AI service layer", "AI-powered features"],
      dependencies: ["Onboarding & Core Features"],
    });
  if (has("payments"))
    phases.push({
      title: "Payments",
      goals: ["Checkout / subscriptions", "Webhooks"],
      deliverables: ["Billing flows", "Webhook handlers", "Entitlement checks"],
      dependencies: ["Onboarding & Core Features"],
    });
  phases.push({
    title: "Production Readiness",
    goals: ["Monitoring, analytics, performance", "Release pipeline"],
    deliverables: ["Error tracking live", "Analytics events", "Deployment docs"],
    dependencies: [phases[phases.length - 1].title],
  });

  const body = phases
    .map(
      (p, i) => `## Phase ${i + 1}: ${p.title}

**Goals**
${p.goals.map((g) => `- ${g}`).join("\n")}

**Deliverables**
${p.deliverables.map((d) => `- ${d}`).join("\n")}

**Dependencies**
${p.dependencies.map((d) => `- ${d}`).join("\n")}
`,
    )
    .join("\n");

  return `# Roadmap: ${input.name}

Complexity: **${analysis.complexity}**

${body}`;
}
