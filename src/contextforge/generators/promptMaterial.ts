import { z } from "zod";
import { claudeJson, isClaudeConfigured } from "../../lib/claude";
import { MODELS } from "../../lib/ai-models";
import type { PackageFiles, ProjectSpec } from "../../types/projectspec";
import { lockedEntries, slugify } from "./shared";

const screensSchema = z.object({
  screens: z
    .array(z.object({
      name: z.string().min(1),
      rationale: z.string().min(1),
      keyElements: z.array(z.string()).min(1).max(6),
      userActions: z.array(z.string()).min(1).max(4),
    }))
    .min(1)
    .max(10),
});

type ScreenInfo = {
  name: string;
  rationale: string;
  keyElements: string[];
  userActions: string[];
};

async function identifyScreens(spec: ProjectSpec): Promise<ScreenInfo[]> {
  if (isClaudeConfigured()) {
    try {
      const r = await claudeJson(
        `You are a UI/UX expert identifying the key screens for a ${spec.platform} application. Return JSON only, no prose.`,
        `Identify the key UI screens for this ${spec.platform} project.\n` +
          `Project: "${spec.projectName}" — ${spec.description}\nFeatures: ${spec.features.join(", ")}\n` +
          `For each screen, provide:\n` +
          `- "name": Screen name\n` +
          `- "rationale": Why this screen is needed\n` +
          `- "keyElements": 3-6 specific UI elements on this screen (e.g., "Search bar with autocomplete", "User avatar with status indicator")\n` +
          `- "userActions": 2-4 primary user actions on this screen\n` +
          `Return JSON: {"screens":[...]} (max 8 screens).`,
        screensSchema,
        1,
        MODELS.CONTENT,
      );
      return r.screens.slice(0, 8);
    } catch {
      // fall through
    }
  }
  return heuristicScreens(spec);
}

function heuristicScreens(spec: ProjectSpec): ScreenInfo[] {
  const isBackendOnly = spec.platform === "backend-only" || spec.platform === "cli";
  if (isBackendOnly) return [];

  const screens: ScreenInfo[] = [
    {
      name: "Onboarding Flow",
      rationale: "First-time user experience that sets expectations, collects preferences, and guides users to their first success moment.",
      keyElements: ["Welcome illustration or animation", "Progress stepper (3-5 steps)", "Skip option for returning users", "Primary CTA button per step", "Social proof or trust signals"],
      userActions: ["Complete each onboarding step", "Skip to main app", "Connect social accounts", "Set initial preferences"],
    },
    {
      name: "Home Dashboard",
      rationale: "The primary surface users return to — anchors navigation, surfaces key metrics, and provides quick access to core actions.",
      keyElements: ["Navigation bar or tab bar", "Summary cards with key metrics", "Recent activity feed", "Quick action buttons", "User greeting with avatar"],
      userActions: ["Navigate to features", "View recent activity", "Trigger quick actions", "Access notifications"],
    },
    {
      name: "Settings & Profile",
      rationale: "Account management, preferences, and platform-specific settings. Must follow platform conventions for toggle/form patterns.",
      keyElements: ["Profile header with avatar and name", "Grouped settings sections", "Toggle switches for preferences", "Account actions (logout, delete)", "Version info footer"],
      userActions: ["Edit profile information", "Toggle preferences", "Manage connected accounts", "Sign out or delete account"],
    },
  ];

  for (const feature of spec.features) {
    if (screens.length >= 8) break;
    const text = feature.toLowerCase();
    if (text.includes("auth") || text.includes("login")) {
      screens.push({
        name: "Authentication",
        rationale: `Handles sign-in, sign-up, and password recovery for ${spec.projectName}.`,
        keyElements: ["Email/password input fields", "Social login buttons (Google, Apple, GitHub)", "Forgot password link", "Terms of service checkbox", "Error message display area"],
        userActions: ["Sign in with email", "Sign in with social provider", "Create new account", "Reset forgotten password"],
      });
    } else if (text.includes("chat") || text.includes("message")) {
      screens.push({
        name: `${feature}`,
        rationale: `Core messaging interface for ${spec.projectName}.`,
        keyElements: ["Message list with bubbles/cards", "Text input with send button", "Typing indicator", "Message status icons (sent/delivered/read)", "Attachment button"],
        userActions: ["Send a message", "Attach media or files", "Scroll through history", "React to or reply to a message"],
      });
    } else if (text.includes("payment") || text.includes("billing") || text.includes("subscription")) {
      screens.push({
        name: `${feature}`,
        rationale: `Monetization flow for ${spec.projectName} — plan selection, checkout, and billing management.`,
        keyElements: ["Plan comparison cards", "Price display with billing cycle toggle", "Payment form or payment sheet", "Current plan indicator", "Invoice history list"],
        userActions: ["Select a plan", "Enter payment details", "Upgrade or downgrade", "View billing history"],
      });
    } else {
      screens.push({
        name: `${feature}`,
        rationale: `Directly supports the "${feature}" feature. This is a core interaction surface for ${spec.projectName}.`,
        keyElements: [`${feature} content area`, "Action toolbar or FAB", "Empty state illustration", "Loading skeleton", "Error recovery UI"],
        userActions: [`Interact with ${feature} content`, "Create or modify items", "Filter or search", "Share or export"],
      });
    }
  }
  return screens;
}

function uiReferenceContent(spec: ProjectSpec, screen: ScreenInfo): string {
  const elementsSection = screen.keyElements
    .map((el, i) => `${i + 1}. ${el}`)
    .join("\n");

  const actionsSection = screen.userActions
    .map((a) => `- ${a}`)
    .join("\n");

  const styling = lockedEntries(spec).find(([c]) => c.toLowerCase().includes("styling"))?.[1].value;
  const framework = lockedEntries(spec).find(([c]) => c.toLowerCase().includes("framework"))?.[1].value;

  return `# UI Reference: ${screen.name}

> **Project:** ${spec.projectName} (${spec.platform})
> **Framework:** ${framework ?? "see agents.md"}
> **Styling:** ${styling ?? "see agents.md"}

## Purpose

${screen.rationale}

## Key UI Elements

${elementsSection}

## User Actions

${actionsSection}

## Layout Guidelines

### Structure
- Top-level container must respect ${spec.platform} safe areas and navigation conventions.
- Group related elements visually — use cards or sections with clear hierarchy.
- Single primary action per viewport; secondary actions should be visually subordinate.
- Empty states must include an illustration/icon, explanatory text, and a CTA to resolve.

### Responsive Behavior
${spec.platform.includes("mobile") ? `- Bottom sheet for contextual actions (not modals on mobile).
- Pull-to-refresh on scrollable content.
- Swipe gestures for common actions (delete, archive).
- Touch targets minimum 44×44pt.` : `- Content max-width ~1200px centered; sidebar navigation for complex apps.
- Stack layouts vertically on narrow viewports (< 768px).
- Use responsive grid (12-column on desktop, single column on mobile).
- Hover states on all interactive elements.`}

### States to Implement
- **Loading:** Skeleton screens matching the final layout shape (not spinners).
- **Empty:** Illustration + message + CTA ("No messages yet — start a conversation").
- **Error:** Inline error with retry action; never a dead-end.
- **Success:** Brief confirmation toast or inline feedback; auto-dismiss after 3s.

## Design Token References

- **Spacing:** Follow \`prompt_material/design-system/spacing.md\` — use the 4px scale exclusively.
- **Typography:** Follow \`prompt_material/design-system/typography.md\` — one display style per screen.
- **Colors:** Follow \`prompt_material/design-system/colors.md\` — use semantic tokens (not raw hex).
- **Animation:** Follow \`prompt_material/design-system/animation-guidelines.md\` for transitions.

## AI Prompt Tip

When asking an AI to build this screen, include this file AND the relevant
design system files. Describe what you want to keep from reference designs
(layout, flow, element placement) — never ask to "copy" a design.
`;
}

function designSystemFiles(spec: ProjectSpec): PackageFiles {
  const refs = spec.designReferences ?? [];
  const hasRefs = refs.length > 0;
  const styling = lockedEntries(spec).find(([c]) => c.toLowerCase().includes("styling"))?.[1].value;
  const isTailwind = styling?.toLowerCase().includes("tailwind") || styling?.toLowerCase().includes("nativewind");
  const isMobile = spec.platform.includes("mobile") || spec.platform.includes("ios") || spec.platform.includes("android");

  const basis = hasRefs
    ? `Derived from the developer's design references: ${refs.join(", ")}.`
    : `**PLATFORM DEFAULTS** — no design references were provided. These are sensible ${spec.platform} defaults. Replace with your brand values once a visual direction exists.`;

  return {
    "prompt_material/design-system/colors.md": `# Color System — ${spec.projectName}

> ${basis}

## Token Structure

Define all colors as tokens. **Never use raw hex/rgb values in components** — always reference tokens.

### Primary Palette
| Token | Purpose | Example Value |
|---|---|---|
| \`--color-primary\` | Brand color, primary CTAs, active states | \`#6366F1\` (indigo) |
| \`--color-primary-hover\` | Primary hover/press state | \`#4F46E5\` |
| \`--color-primary-subtle\` | Backgrounds, badges, light accents | \`#EEF2FF\` |

### Accent
| Token | Purpose | Example Value |
|---|---|---|
| \`--color-accent\` | Secondary actions, highlights, links | \`#06B6D4\` (cyan) |
| \`--color-accent-hover\` | Accent hover state | \`#0891B2\` |

### Neutrals (Light/Dark Mode)
| Token | Light | Dark |
|---|---|---|
| \`--color-bg\` | \`#FFFFFF\` | \`#0A0A0A\` |
| \`--color-bg-subtle\` | \`#F9FAFB\` | \`#141414\` |
| \`--color-bg-muted\` | \`#F3F4F6\` | \`#1F1F1F\` |
| \`--color-border\` | \`#E5E7EB\` | \`#2A2A2A\` |
| \`--color-text\` | \`#111827\` | \`#F9FAFB\` |
| \`--color-text-muted\` | \`#6B7280\` | \`#9CA3AF\` |
| \`--color-text-subtle\` | \`#9CA3AF\` | \`#6B7280\` |

### Semantic
| Token | Purpose | Value |
|---|---|---|
| \`--color-success\` | Confirmations, completed states | \`#10B981\` |
| \`--color-warning\` | Caution states, pending actions | \`#F59E0B\` |
| \`--color-error\` | Errors, destructive actions | \`#EF4444\` |
| \`--color-info\` | Informational notices | \`#3B82F6\` |

## Accessibility

- Maintain **WCAG AA** contrast ratio (4.5:1 for normal text, 3:1 for large text).
- Test all color combinations with a contrast checker.
- Never rely on color alone to convey meaning — pair with icons or text.

${isTailwind ? `## Tailwind Integration

Map these tokens in \`tailwind.config.js\`:
\`\`\`js
theme: {
  extend: {
    colors: {
      primary: { DEFAULT: '#6366F1', hover: '#4F46E5', subtle: '#EEF2FF' },
      accent: { DEFAULT: '#06B6D4', hover: '#0891B2' },
      success: '#10B981',
      warning: '#F59E0B',
      error: '#EF4444',
    }
  }
}
\`\`\`
` : ""}
`,

    "prompt_material/design-system/typography.md": `# Typography System — ${spec.projectName}

> ${basis}

## Type Scale

${isMobile ? `Use the platform's system font (San Francisco on iOS, Roboto on Android) unless brand guidelines dictate otherwise.` : `Use a modern sans-serif from Google Fonts (e.g., **Inter**, **Plus Jakarta Sans**, or **Geist**). Load only weights 400, 500, 600, 700.`}

| Style | Size | Weight | Line Height | Usage |
|---|---|---|---|---|
| **Display** | ${isMobile ? "28px" : "36px"} | 700 (Bold) | 1.2 | Hero headings, landing pages (max 1 per screen) |
| **Heading 1** | ${isMobile ? "24px" : "30px"} | 600 (Semibold) | 1.3 | Page titles |
| **Heading 2** | ${isMobile ? "20px" : "24px"} | 600 (Semibold) | 1.3 | Section headers |
| **Heading 3** | ${isMobile ? "17px" : "20px"} | 500 (Medium) | 1.4 | Sub-section headers |
| **Body** | ${isMobile ? "15px" : "16px"} | 400 (Regular) | 1.5 | Paragraphs, descriptions |
| **Body Small** | ${isMobile ? "13px" : "14px"} | 400 (Regular) | 1.5 | Secondary text, metadata |
| **Caption** | ${isMobile ? "11px" : "12px"} | 500 (Medium) | 1.4 | Labels, timestamps, badges |
| **Overline** | ${isMobile ? "11px" : "12px"} | 600 (Semibold) | 1.4 | Section labels, categories (uppercase, letter-spacing 0.5px) |

## Rules

- **One Display style per screen** maximum. Overuse dilutes visual hierarchy.
- **Line height ≥ 1.4** for body text to ensure readability.
- **Max line width:** 65-75 characters for body text (readability sweet spot).
- **No font sizes below ${isMobile ? "11px" : "12px"}** — they're illegible for many users.
- Truncate long text with ellipsis; never let it overflow or break layout.
`,

    "prompt_material/design-system/spacing.md": `# Spacing System — ${spec.projectName}

> ${basis}

## Scale (4px Base Unit)

| Token | Value | Usage |
|---|---|---|
| \`--space-1\` | 4px | Inline element gaps, icon padding |
| \`--space-2\` | 8px | Tight element spacing, input padding |
| \`--space-3\` | 12px | Related element groups |
| \`--space-4\` | 16px | Standard content padding, card padding |
| \`--space-5\` | 20px | Section internal spacing |
| \`--space-6\` | 24px | Between content sections |
| \`--space-8\` | 32px | Major section breaks |
| \`--space-10\` | 40px | Page-level vertical rhythm |
| \`--space-12\` | 48px | Hero section padding |
| \`--space-16\` | 64px | Page margins on desktop |

## Rules

- **Never use arbitrary pixel values.** Always reference the scale above.
- Group related controls tightly (space-2 to space-3); separate groups with space-6 or more.
- Consistent page padding: \`space-4\` on mobile, \`space-8\` to \`space-16\` on desktop.
- Card padding: \`space-4\` (compact) or \`space-6\` (standard).

## Common Patterns

| Pattern | Spacing |
|---|---|
| Between form fields | \`space-4\` (16px) |
| Between form sections | \`space-8\` (32px) |
| Card internal padding | \`space-4\` to \`space-6\` |
| List item gap | \`space-2\` to \`space-3\` |
| Navbar height | \`space-16\` (64px) |
| Button padding | \`space-2\` horizontal, \`space-3\` vertical |
| Icon + label gap | \`space-2\` (8px) |
`,

    "prompt_material/design-system/animation-guidelines.md": `# Animation Guidelines — ${spec.projectName}

> ${basis}

## Duration Scale

| Duration | Name | Usage |
|---|---|---|
| 100ms | Instant | Hover states, color changes, opacity toggles |
| 150ms | Micro | Button presses, checkbox toggles, ripple effects |
| 250ms | Standard | Page transitions, card reveals, dropdown opens |
| 400ms | Emphasis | Modal entrances, skeleton fade-outs, complex reveals |
| 600ms | Dramatic | Onboarding animations, celebration effects (use sparingly) |

## Easing Curves

| Curve | CSS | Usage |
|---|---|---|
| **Ease-out** | \`cubic-bezier(0.0, 0.0, 0.2, 1)\` | Elements entering the viewport |
| **Ease-in** | \`cubic-bezier(0.4, 0.0, 1, 1)\` | Elements leaving the viewport |
| **Ease-in-out** | \`cubic-bezier(0.4, 0.0, 0.2, 1)\` | Elements moving within the viewport |
| **Spring** | \`cubic-bezier(0.34, 1.56, 0.64, 1)\` | Playful bounces (onboarding, success) |

## Rules

1. **Only animate \`opacity\` and \`transform\`** — never animate \`width\`, \`height\`, \`top\`, \`left\`, or \`margin\` (they trigger expensive layout recalculations).
2. **Respect \`prefers-reduced-motion\`** — wrap all animations:
   \`\`\`css
   @media (prefers-reduced-motion: reduce) {
     *, *::before, *::after {
       animation-duration: 0.01ms !important;
       transition-duration: 0.01ms !important;
     }
   }
   \`\`\`
3. **Stagger list animations** by 50ms per item (max 5 items, then batch the rest).
4. **Loading skeletons** use a shimmer animation at 1.5s duration, infinite loop.
5. **No animation on first paint** — elements should be visible immediately, then animate on interaction.

## Common Patterns

| Pattern | Duration | Easing | Properties |
|---|---|---|---|
| Button hover | 100ms | ease-out | background-color, box-shadow |
| Card hover lift | 150ms | ease-out | transform: translateY(-2px), box-shadow |
| Modal entrance | 250ms | ease-out | opacity, transform: scale(0.95→1) |
| Modal exit | 200ms | ease-in | opacity, transform: scale(1→0.95) |
| Toast slide in | 250ms | ease-out | transform: translateY(100%→0) |
| Page transition | 250ms | ease-in-out | opacity |
| Skeleton shimmer | 1500ms | linear | background-position (infinite) |
`,

    "prompt_material/design-system/component-guidelines.md": `# Component Guidelines — ${spec.projectName}

> ${basis}

## Required States

Every interactive component MUST implement all applicable states:

| State | Visual Treatment | Notes |
|---|---|---|
| **Default** | Normal appearance | The baseline |
| **Hover** | Subtle background shift or elevation | Desktop only; 100ms transition |
| **Focus** | Visible focus ring (2px, primary color, 2px offset) | Critical for keyboard accessibility |
| **Active/Pressed** | Scale down slightly (0.98) or darken | Brief tactile feedback |
| **Disabled** | 50% opacity, \`cursor: not-allowed\` | Remove from tab order |
| **Loading** | Spinner or skeleton replacing content | Disable interaction during load |
| **Error** | Red border + error message below | Inline, not toast |

## Component Patterns

### Buttons
- **Primary:** Solid background (\`--color-primary\`), white text. One per visible viewport.
- **Secondary:** Outlined or ghost style. For secondary actions.
- **Destructive:** Red variant. Always requires confirmation dialog.
- **Minimum size:** ${isMobile ? "44×44pt touch target" : "36px height, 80px min-width"}.
- **Loading state:** Replace label with spinner; keep button width stable.

### Forms
- Labels above inputs (not placeholders as labels — placeholders disappear on focus).
- Validation errors appear below the field, in red, with a descriptive message.
- Group related fields in fieldsets with a legend.
- Submit button disabled until form is valid; show validation on blur, not on every keystroke.

### Cards
- Consistent border radius (\`8px\` standard, \`12px\` for featured).
- Padding: \`space-4\` (compact) to \`space-6\` (standard).
- Subtle shadow or border for elevation; avoid heavy drop shadows.
- Click target is the entire card when it links to detail.

### Modals & Dialogs
- Max width 480px for confirmations, 640px for forms.
- Backdrop: semi-transparent black (rgba(0,0,0,0.5)).
- Close via X button, Escape key, and backdrop click.
- Focus trap inside the modal; return focus on close.

### Toast Notifications
- Position: ${isMobile ? "bottom center, above tab bar" : "top right"}.
- Auto-dismiss after 3-5 seconds; include manual dismiss.
- Color-coded by type: success (green), error (red), info (blue), warning (yellow).

## Accessibility Checklist

- [ ] All interactive elements are keyboard-navigable.
- [ ] Focus ring is visible on all focusable elements.
- [ ] Color is never the only indicator of state (pair with icons/text).
- [ ] Images have \`alt\` text; decorative images use \`alt=""\`.
- [ ] Touch targets are at least 44×44pt on mobile.
- [ ] Form inputs have associated \`<label>\` elements.
- [ ] ARIA attributes used correctly where semantic HTML is insufficient.
`,
  };
}

/** Prompt Material System: visual/design context for AI assistants. */
export async function generatePromptMaterial(spec: ProjectSpec): Promise<PackageFiles> {
  const files: PackageFiles = {};
  const isBackendOnly = spec.platform === "backend-only" || spec.platform === "cli";

  if (!isBackendOnly) {
    const screens = await identifyScreens(spec);
    screens.forEach((screen, i) => {
      const num = String(i + 1).padStart(2, "0");
      files[`prompt_material/ui-references/${num}-${slugify(screen.name)}.md`] =
        uiReferenceContent(spec, screen);
    });

    Object.assign(files, designSystemFiles(spec));
  }

  // Wireframes guide
  files["prompt_material/wireframes/README.md"] = `# Wireframes — ${spec.projectName}

Place low-fidelity wireframes here before prompting AI assistants.

## Naming Convention

Name files to match the UI references:
\`\`\`
01-onboarding-flow.png
02-home-dashboard.png
03-settings-profile.png
\`\`\`

## Why This Matters

A wireframe per screen **dramatically improves layout consistency** in AI output.
Without wireframes, AI assistants will invent layouts — which may not match your vision.

## Tips for Effective Wireframes

- **Keep them simple** — boxes and labels are enough. Don't worry about polish.
- **Show the full screen** — include nav bars, status bars, and footers.
- **Annotate interactions** — arrow for "tapping this opens a modal".
- **Mark priority** — star or highlight the primary action on each screen.

## Tools

- [Excalidraw](https://excalidraw.com) — free, fast, hand-drawn style
- [Figma](https://figma.com) — free tier available
- Paper + phone camera — works perfectly fine
`;

  // User assets guide
  files["prompt_material/user-assets/README.md"] = `# User Assets — ${spec.projectName}

Uploaded design references and brand assets live here.

## Current References
${(spec.designReferences ?? []).map((r) => `- ${r}`).join("\n") || "- _None uploaded yet._"}

## What to Put Here

- **Logo** (SVG preferred, PNG fallback) — at least 512×512px
- **Brand colors** — if you have a brand guide, drop it here
- **App icon** — the icon for your app store listing or favicon
- **Screenshots** — of apps/sites you want yours to look like
- **Fonts** — if using custom fonts, include the .woff2 files

## How AI Uses These

When you include these files in an AI prompt alongside a UI reference,
the assistant will match your brand identity instead of inventing one.
`;

  // Inspiration with actual guidance
  const designRefs = spec.designReferences ?? [];
  files["prompt_material/inspiration.md"] = `# Design Inspiration — ${spec.projectName}

${designRefs.length > 0
    ? `## Developer-Provided References\n${designRefs.map((r) => `- ${r}`).join("\n")}\n\nUse these as the primary visual direction. Describe WHAT to borrow (layout,\nnavigation pattern, progression mechanics) — never ask to copy a design outright.`
    : `## Finding Inspiration

No design references were provided. Here are curated resources for ${spec.platform} patterns:

### Recommended Sources
- **[Mobbin](https://mobbin.com)** — Real app screenshots organized by screen type and pattern
- **[Page Flows](https://pageflows.com)** — Full user flow recordings from real apps
- **[Dribbble](https://dribbble.com)** — Visual design exploration (filter by "Mobile" or "Web")
- **[Awwwards](https://awwwards.com)** — Award-winning web designs
- **[Apple HIG](https://developer.apple.com/design/human-interface-guidelines/)** — iOS design guidelines
- **[Material Design](https://m3.material.io)** — Android design system

### How to Use References Effectively

1. **Collect 3-5 reference screenshots** of apps similar to ${spec.projectName}
2. **Save them to \`prompt_material/user-assets/\`**
3. **For each reference, note specifically what you like:**
   - Layout structure (sidebar nav? bottom tabs? floating action button?)
   - Color mood (dark mode? light? vibrant? minimal?)
   - Typography feel (modern geometric? classic serif? playful rounded?)
   - Interaction patterns (swipe cards? pull-to-refresh? infinite scroll?)
4. **Include these notes when prompting AI assistants** — specificity beats vague "make it look good"
`}

## Prompt Template for Design Work

When asking an AI to design a screen, use this template:

\`\`\`
Build the [Screen Name] for ${spec.projectName}.

Visual direction:
- [Describe layout: e.g., "Clean, card-based layout like Notion"]
- [Describe color mood: e.g., "Dark mode with subtle purple accents"]
- [Describe typography: e.g., "Modern, geometric sans-serif like Inter"]

Refer to these files for design tokens:
- prompt_material/design-system/colors.md
- prompt_material/design-system/typography.md
- prompt_material/design-system/spacing.md
- prompt_material/ui-references/[screen-file].md
\`\`\`
`;

  return files;
}
