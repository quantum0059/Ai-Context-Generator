import type { ProjectSpec } from "../../types/projectspec";

/**
 * Platform paradigm classification.
 *
 * The generators lock the *technology stack*, but historically they never
 * enforced the *platform paradigm* — so a `node-cli` project would still
 * receive React component templates, UI build prompts, and web-centric
 * dependency ordering. This module derives what a project actually is so the
 * downstream generators can strip out concerns that make no sense for it.
 */
export interface PlatformParadigm {
  /** Renders a graphical user interface (web, mobile, desktop GUI, extension). */
  hasUI: boolean;
  /** Exposes an HTTP surface (web app, SaaS backend, REST/GraphQL API). */
  hasHttpServer: boolean;
  /** Command-line tool with no persistent GUI. */
  isCli: boolean;
  /** Long-running backend/daemon/worker with no UI. */
  isBackendOnly: boolean;
  /** Native/hybrid mobile app. */
  isMobile: boolean;
  /** Browser-based frontend (web/saas/browser extension). */
  isWeb: boolean;
  /** Fully offline — no network access allowed by the project constraints. */
  isOffline: boolean;
}

function stackIncludes(spec: ProjectSpec, needles: string[]): boolean {
  return Object.values(spec.stack ?? {}).some((entry) => {
    const value = entry?.value?.toLowerCase() ?? "";
    return needles.some((n) => value.includes(n));
  });
}

/**
 * Classifies a project's platform paradigm from its `platform` string, its
 * locked stack, and its constraints. This is the single source of truth for
 * "does this project have a UI / HTTP server / etc." and MUST be used by every
 * generator that would otherwise assume a web app.
 */
export function detectPlatformParadigm(spec: ProjectSpec): PlatformParadigm {
  const platform = (spec.platform ?? "").toLowerCase();

  const isMobile = /mobile|ios|android|react.?native|expo|flutter/.test(platform);
  const isWeb = /web|saas|browser|extension|frontend|spa|pwa/.test(platform);
  const isCli = /\bcli\b|command.?line|terminal|node-cli|console/.test(platform);
  const isDesktopGui = /desktop|electron|tauri/.test(platform);
  const isBackendOnly =
    /backend|server-only|backend-only|api-only|service|daemon|worker|microservice/.test(
      platform,
    );

  const isOffline = Boolean(spec.constraints?.technical?.mustBeOffline);

  // An HTTP server exists when the platform is web/saas/backend OR when an HTTP
  // framework is actually in the locked stack. A CLI never gets one unless it
  // explicitly locked an HTTP framework.
  const hasHttpFramework = stackIncludes(spec, [
    "express",
    "fastify",
    "hono",
    "nestjs",
    "koa",
    "next", // Next.js API routes
  ]);
  const hasHttpServer =
    !isOffline && (isWeb || isBackendOnly || hasHttpFramework) && !isCli;

  // A UI exists for web, mobile, and desktop GUI targets. CLI and backend-only
  // never render a GUI.
  const hasUI = (isWeb || isMobile || isDesktopGui) && !isCli && !isBackendOnly;

  return {
    hasUI,
    hasHttpServer,
    isCli,
    isBackendOnly,
    isMobile,
    isWeb,
    isOffline,
  };
}
