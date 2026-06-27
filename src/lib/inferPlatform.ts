/** Infer the target platform when the wizard description is the source of truth. */
export function inferPlatform(description: string): string {
  const text = description.toLowerCase();
  if (/\b(browser extension|chrome extension|firefox extension)\b/.test(text)) return "browser-extension";
  if (/\b(mobile app|ios app|android app|ios and android|react native)\b/.test(text)) return "mobile-ios-android";
  if (/\b(desktop app|electron app|tauri app)\b/.test(text)) return "desktop";
  if (/\b(cli|command[- ]line|terminal tool)\b/.test(text)) return "cli";
  if (/\b(backend[- ]only|backend api|rest api|graphql api|api service)\b/.test(text)) return "backend-only";
  return "web";
}
