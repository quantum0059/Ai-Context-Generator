import { z } from "zod";
import { claudeJson, isClaudeConfigured } from "../../lib/claude";
import type { PackageFiles, ProjectSpec } from "../../types/projectspec";
import { slugify } from "./shared";

const screensSchema = z.object({
  screens: z
    .array(z.object({ name: z.string().min(1), rationale: z.string().min(1) }))
    .min(1)
    .max(10),
});

async function identifyScreens(
  spec: ProjectSpec,
): Promise<Array<{ name: string; rationale: string }>> {
  if (isClaudeConfigured()) {
    try {
      const r = await claudeJson(
        `Identify the key UI screens implied by this ${spec.platform} project.\n` +
          `Project: ${spec.description}\nFeatures: ${spec.features.join(", ")}\n` +
          `Return JSON: {"screens":[{"name":"Authentication Screen","rationale":"..."}]} (max 8 screens).`,
        screensSchema,
      );
      return r.screens.slice(0, 8);
    } catch {
      // fall through
    }
  }
  const screens: Array<{ name: string; rationale: string }> = [
    { name: "Onboarding Flow", rationale: "Every new user passes through onboarding; it sets visual tone and expectations." },
    { name: "Home Dashboard", rationale: "The primary surface users return to; anchors navigation and hierarchy." },
    { name: "Settings Screen", rationale: "Account, preferences and platform conventions live here." },
  ];
  for (const feature of spec.features) {
    if (screens.length >= 8) break;
    screens.push({
      name: `${feature} Screen`,
      rationale: `Directly supports the \"${feature}\" feature from the ProjectSpec.`,
    });
  }
  return screens;
}

function uiReferenceContent(
  spec: ProjectSpec,
  screen: { name: string; rationale: string },
): string {
  return `# UI Reference: ${screen.name}

Project: **${spec.projectName}** (${spec.platform})

## Why this screen is included
${screen.rationale}

## Layout hierarchy
1. Top-level container respecting ${spec.platform} safe areas and navigation conventions.
2. Primary content region for the screen's main task.
3. Single primary action; secondary actions visually subordinate.

## Spacing
- Use the scale in \`prompt_material/design-system/spacing.md\` exclusively.
- Group related controls; separate groups with one full spacing step.

## Typography
- Follow \`prompt_material/design-system/typography.md\`; one display style per screen.

## Interaction patterns
- Every async action shows loading, success and error states.
- Destructive actions require confirmation; provide an undo path where possible.

> If a matching reference image was uploaded, it sits alongside this file with
> the same number prefix. Describe WHAT to borrow from it (layout, navigation,
> progression mechanics) - never copy a design outright.
`;
}

function designSystemFiles(spec: ProjectSpec): PackageFiles {
  const refs = spec.designReferences ?? [];
  const hasRefs = refs.length > 0;
  const basis = hasRefs
    ? `Derived from the developer's design references: ${refs.join(", ")}.`
    : `**PLATFORM DEFAULTS** - the developer provided no design references, so these are reasonable ${spec.platform} defaults, clearly marked as defaults and NOT assumptions about the developer's preference. Replace them once a visual direction exists.`;

  return {
    "prompt_material/design-system/colors.md": `# Colors - ${spec.projectName}\n\n${basis}\n\n- Define one primary, one accent, neutrals (50-900) and semantic colors (success/warning/error).\n- All colors come from tokens; no hard-coded hex values in components.\n- Maintain WCAG AA contrast for text.\n`,
    "prompt_material/design-system/typography.md": `# Typography - ${spec.projectName}\n\n${basis}\n\n- One typeface family with 4-6 named styles (display, title, body, caption).\n- Use platform system fonts on ${spec.platform} unless references dictate otherwise.\n- Line height >= 1.4 for body text.\n`,
    "prompt_material/design-system/spacing.md": `# Spacing - ${spec.projectName}\n\n${basis}\n\n- 4px base unit; allowed steps: 4, 8, 12, 16, 24, 32, 48, 64.\n- No arbitrary values; spacing always references the scale.\n`,
    "prompt_material/design-system/animation-guidelines.md": `# Animation - ${spec.projectName}\n\n${basis}\n\n- Durations: 150ms (micro), 250ms (standard), 400ms (emphasis). Ease-out for entrances, ease-in for exits.\n- Respect reduced-motion preferences on ${spec.platform}.\n- Animate opacity/transform only; never layout properties in hot paths.\n`,
    "prompt_material/design-system/component-guidelines.md": `# Components - ${spec.projectName}\n\n${basis}\n\n- Every component supports default, hover/press, focus, disabled, loading and error states.\n- Touch targets >= 44px on mobile platforms.\n- Compose primitives; avoid one-off variants outside the system.\n`,
  };
}

/** Prompt Material System (Section 13): visual/design context for AI assistants. */
export async function generatePromptMaterial(spec: ProjectSpec): Promise<PackageFiles> {
  const files: PackageFiles = {};

  const screens = await identifyScreens(spec);
  screens.forEach((screen, i) => {
    const num = String(i + 1).padStart(2, "0");
    files[`prompt_material/ui-references/${num}-${slugify(screen.name)}.md`] =
      uiReferenceContent(spec, screen);
  });

  Object.assign(files, designSystemFiles(spec));

  files["prompt_material/wireframes/README.md"] = `# Wireframes - ${spec.projectName}\n\nPlace low-fidelity wireframes here before prompting AI assistants, named to\nmatch the ui-references (e.g. \`01-onboarding-flow.png\`). A wireframe per\nscreen dramatically improves layout consistency in AI output.\n`;

  files["prompt_material/user-assets/README.md"] = `# User Assets - ${spec.projectName}\n\nUploaded design references and brand assets live here. Current references:\n${(spec.designReferences ?? []).map((r) => `- ${r}`).join("\n") || "- _None uploaded yet._"}\n`;

  files["prompt_material/inspiration.md"] = `# Inspiration - ${spec.projectName}\n\n${(spec.designReferences ?? []).map((r) => `- ${r} (provided by the developer)`).join("\n") || "- _No inspirations provided. Curate references on Mobbin (https://mobbin.com) and Page Flows (https://pageflows.com) for " + spec.platform + " patterns._"}\n\nWhen referencing inspiration in prompts, describe WHAT to borrow (layout,\nnavigation pattern, progression mechanics) rather than asking to copy a design.\n`;

  return files;
}
