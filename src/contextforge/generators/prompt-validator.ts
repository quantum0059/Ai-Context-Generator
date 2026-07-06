export function isPromptContentValid(content: string, featureName: string, aspect: string): boolean {
  const hasPlaceholder =
    /\/\/\s*TODO/i.test(content) ||
    /\/\/\s*FIXME/i.test(content) ||
    /\/\*\s*TODO/i.test(content) ||
    content.includes("add render test") ||
    content.includes("assert error message is visible") ||
    content.toLowerCase().includes("your code here");
  const lower = content.toLowerCase();
  const checks = [
    content.includes(featureName),
    content.includes("src/") || content.includes("app/"),
    content.includes("Acceptance Criteria") || content.includes("- [ ]"),
    // Completion contract: every emitted prompt must define "done" and tell the
    // agent to verify its own work before finishing.
    lower.includes("definition of done"),
    lower.includes("self-verification") || lower.includes("self verification"),
    !content.includes("expect(true).toBe(true)"),
    !content.includes("export default function feature"),
    !hasPlaceholder,
    content.includes("interface "),
    content.includes(aspect) || content.toLowerCase().includes(aspect.replaceAll("-", " ").toLowerCase()),
    content.length > 500,
  ];
  return checks.every(Boolean);
}
