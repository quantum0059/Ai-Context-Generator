/**
 * Infer the target platform when the wizard description is the source of truth.
 *
 * Priority order:
 * 1. Browser/desktop/CLI extensions — narrow and unambiguous.
 * 2. Full-stack apps that mention React Native + a backend technology
 *    are classified as "saas" so the registry returns cross-platform tools
 *    (auth, DB, hosting, etc.) rather than mobile-only tools.
 * 3. Pure mobile apps with no backend mention → "mobile-ios-android".
 * 4. Pure backend APIs → "backend-only".
 * 5. Default → "web".
 */
export function inferPlatform(description: string): string {
  const text = description.toLowerCase();

  if (/\b(browser extension|chrome extension|firefox extension)\b/.test(text)) return "browser-extension";
  if (/\b(desktop app|electron app|tauri app)\b/.test(text)) return "desktop";
  if (/\b(cli|command[- ]line|terminal tool)\b/.test(text)) return "cli";

  const hasMobileSignal = /\b(mobile app|ios app|android app|ios and android|react native|expo)\b/.test(text);

  // Detect explicit backend technology mentions that indicate a full-stack architecture.
  // When a mobile frontend is paired with a self-hosted/server backend, the project
  // should be treated as "saas" so cross-platform registry entries are surfaced.
  const hasBackendSignal = /\b(spring boot|spring framework|django|fastapi|flask|express|nestjs|nest\.js|laravel|rails|ruby on rails|node\.js server|go server|golang|rust server|hapi|koa|feathers)\b/.test(text);
  const hasFullStackSignal = /\b(full[- ]?stack|backend.{0,30}frontend|frontend.{0,30}backend|server[- ]side|rest api|graphql api|api service|microservice|websocket server|postgresql|mongodb|mysql|redis)\b/.test(text);

  if (hasMobileSignal && (hasBackendSignal || hasFullStackSignal)) return "saas";
  if (hasMobileSignal) return "mobile-ios-android";
  if (/\b(backend[- ]only|backend api|rest api|graphql api|api service)\b/.test(text)) return "backend-only";
  return "web";
}
