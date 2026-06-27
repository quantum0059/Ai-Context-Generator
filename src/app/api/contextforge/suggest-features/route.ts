import { z } from "zod";
import { claudeJson, isClaudeConfigured } from "@/lib/claude";
import { MODELS } from "@/lib/ai-models";

const requestSchema = z.object({
  projectName: z.string().min(1),
  description: z.string().min(1),
  platform: z.string().optional(),
  projectType: z.string().optional(),
});

const featuresSchema = z.object({
  features: z
    .array(
      z.object({
        name: z.string().min(1),
        description: z.string().min(1),
      }),
    )
    .min(1)
    .max(12),
});

/**
 * Hardcoded fallback feature sets by platform keyword when no AI provider is configured.
 */
function heuristicFeatures(description: string, platform: string): Array<{ name: string; description: string }> {
  const text = `${description} ${platform}`.toLowerCase();
  const pool: Array<{ name: string; description: string; keywords: string[] }> = [
    { name: "AI Chat", description: "Conversational AI interface with context awareness", keywords: ["ai", "chat", "assistant", "llm", "agent", "ide", "copilot"] },
    { name: "Code Editor", description: "Syntax-highlighted code editing with language support", keywords: ["ide", "editor", "code", "coding", "dev"] },
    { name: "File Explorer", description: "Tree-based project file navigation and management", keywords: ["ide", "editor", "file", "project", "workspace"] },
    { name: "Terminal Integration", description: "Embedded terminal for running commands", keywords: ["ide", "terminal", "shell", "command", "cli"] },
    { name: "Git Integration", description: "Version control with commit, branch, and diff views", keywords: ["git", "version", "commit", "branch", "vcs"] },
    { name: "Extension System", description: "Plugin architecture for third-party extensions", keywords: ["plugin", "extension", "addon", "marketplace"] },
    { name: "Debugging Tools", description: "Breakpoints, call stack, and variable inspection", keywords: ["debug", "breakpoint", "inspect", "devtools"] },
    { name: "Multi-Cursor Editing", description: "Edit multiple locations simultaneously", keywords: ["editor", "edit", "cursor", "multi"] },
    { name: "Syntax Highlighting", description: "Language-aware code coloring and formatting", keywords: ["syntax", "highlight", "language", "code"] },
    { name: "Search & Replace", description: "Project-wide regex search with refactoring support", keywords: ["search", "find", "replace", "refactor"] },
    { name: "Settings Sync", description: "Sync preferences and keybindings across devices", keywords: ["sync", "settings", "preferences", "cloud"] },
    { name: "Collaborative Editing", description: "Real-time multiplayer code editing", keywords: ["collab", "realtime", "multiplayer", "pair"] },
    { name: "Authentication", description: "User sign-in and session management", keywords: ["auth", "login", "user", "account", "session"] },
    { name: "Dashboard", description: "Overview panel with key metrics and activity", keywords: ["dashboard", "analytics", "metrics", "overview"] },
    { name: "Notifications", description: "In-app and push notification system", keywords: ["notify", "notification", "alert", "push"] },
    { name: "User Profiles", description: "Customizable user profile pages", keywords: ["profile", "user", "avatar", "account"] },
    { name: "Payments", description: "Subscription or one-time payment processing", keywords: ["payment", "billing", "subscription", "stripe"] },
    { name: "API Integration", description: "REST/GraphQL API layer for external services", keywords: ["api", "rest", "graphql", "endpoint", "integration"] },
    { name: "Theme System", description: "Dark/light mode with custom theme support", keywords: ["theme", "dark", "light", "ui", "appearance"] },
    { name: "Command Palette", description: "Quick-access searchable command interface", keywords: ["command", "palette", "shortcut", "quick", "search"] },
  ];

  const scored = pool.map((item) => ({
    ...item,
    score: item.keywords.filter((k) => text.includes(k)).length,
  }));

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ name, description }) => ({ name, description }));
}

export async function POST(req: Request) {
  const parsed = requestSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { projectName, description, platform = "web", projectType } = parsed.data;

  if (!isClaudeConfigured()) {
    const fallback = heuristicFeatures(description, platform);
    return Response.json({
      features: fallback.length > 0 ? fallback : [
        { name: "Core Feature 1", description: "Primary functionality for your project" },
        { name: "User Management", description: "Account creation and management" },
        { name: "Data Storage", description: "Persistent data storage and retrieval" },
      ],
      engine: "heuristic",
    });
  }

  try {
    const result = await claudeJson(
      `You are analyzing a software project to suggest the most relevant features it should have.\n\n` +
        `Project name: ${projectName}\n` +
        `Description: ${description}\n` +
        `Platform: ${platform}\n` +
        (projectType ? `Project Classification: ${projectType}\n\n` : `\n`) +
        `Based on this specific project, suggest 6-10 features that would be most relevant and valuable. ` +
        `Think about what this particular type of application needs - do NOT suggest generic features that would apply to any app. ` +
        `Tailor each feature to the project's actual purpose. If this is a HEADLESS_ENGINE or BACKEND_API, do not suggest UI features like 'User Dashboard'.\n\n` +
        `Return JSON: {"features":[{"name":"Feature Name","description":"Brief description of why this feature matters for THIS project"}]}`,
      featuresSchema,
      1,
      MODELS.FAST,
    );
    return Response.json({ features: result.features, engine: "ai" });
  } catch (err) {
    console.error("[SuggestFeatures Error]", err);
    const fallback = heuristicFeatures(description, platform);
    return Response.json({
      features: fallback.length > 0 ? fallback : [
        { name: "Core Feature 1", description: "Primary functionality for your project" },
        { name: "User Management", description: "Account creation and management" },
      ],
      engine: "heuristic",
      error: err instanceof Error ? err.message : "AI call failed",
    });
  }
}
