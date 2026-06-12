import type { GeneratedPackage, ProjectInput } from "../types";

/** Generates curated design reference material under prompt_material/. */
export function generatePromptMaterial(input: ProjectInput): GeneratedPackage {
  const inspirations = input.designInspirations.length
    ? input.designInspirations.map((d) => `- ${d} (provided by you)`).join("\n")
    : "- _No inspirations provided; use the curated sources below._";

  return {
    "prompt_material/ui-references/README.md": `# UI References

Curated sources for ${input.platform} UI patterns relevant to "${input.name}":

- Mobbin (https://mobbin.com) - real app screen flows; selected for breadth of ${input.platform} patterns.
- Dribbble (https://dribbble.com) - visual exploration; selected for high-fidelity concepts.
- Page Flows (https://pageflows.com) - recorded user flows; selected for onboarding and auth journeys.
`,
    "prompt_material/design-system/README.md": `# Design System References

- Material Design 3 (https://m3.material.io) - comprehensive component and token guidance.
- Apple HIG (https://developer.apple.com/design/human-interface-guidelines) - required reading for iOS targets.
- Radix UI (https://www.radix-ui.com) - accessible primitives for web; pairs well with Tailwind.

Selected because they cover accessibility, tokens and component anatomy your AI assistant should follow.
`,
    "prompt_material/wireframes/README.md": `# Wireframes

Place low-fidelity wireframes for each major screen here before prompting AI
assistants. Recommended naming: \`01-onboarding.png\`, \`02-dashboard.png\`, ...

A wireframe per screen dramatically improves layout consistency in AI output.
`,
    "prompt_material/inspiration/README.md": `# Inspiration

${inspirations}

When referencing inspiration in prompts, describe WHAT to borrow (layout,
navigation pattern, progression mechanics) rather than asking to copy a design.
`,
  };
}
