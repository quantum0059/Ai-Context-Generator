import type { ConflictItem, ConflictReport, ProjectSpec } from "../types/projectspec";

const CLOUD_TOOLS = [
  "supabase",
  "firebase",
  "vercel",
  "netlify",
  "clerk",
  "openai",
  "anthropic",
  "google gemini",
  "groq",
  "stream video",
  "cloudinary",
];

function selectedEntries(spec: ProjectSpec) {
  return Object.entries(spec.stack).filter((entry): entry is [string, { value: string; source: "user" | "suggested" | "community"; confidence?: "high" | "low" }] => (
    typeof entry[1].value === "string" && entry[1].value.trim().length > 0
  ));
}

function categoryForTool(spec: ProjectSpec, toolName: string): string | undefined {
  const needle = toolName.trim().toLowerCase();
  if (!needle) return undefined;
  return selectedEntries(spec).find(([, entry]) => {
    const value = entry.value.toLowerCase();
    return value === needle || value.includes(needle) || needle.includes(value);
  })?.[0];
}

function hasSelectedCategory(spec: ProjectSpec, keys: string[]): boolean {
  return keys.some((key) => Boolean(spec.stack[key]?.value));
}

function missingConcernIsResolved(item: ConflictItem, spec: ProjectSpec): boolean {
  const text = `${item.type} ${item.description} ${item.offendingTool} ${item.conflictingRequirement} ${item.suggestion}`.toLowerCase();
  if (!/(missing|no tool|requires|required)/.test(text)) return false;

  const mappings: Array<[RegExp, string[]]> = [
    [/\b(ast|abstract syntax tree|ast rules?)\b/, ["astParser", "complexityAnalysis"]],
    [/\b(pattern matcher|algorithm recognition|algorithm matcher)\b/, ["algorithmRecognition"]],
    [/\b(complexity analysis|complexity engine)\b/, ["complexityAnalysis"]],
    [/\b(sqlite|local database|database)\b/, ["localDatabase", "database"]],
    [/\b(code execution|process runner|sandbox)\b/, ["codeExecution"]],
    [/\b(test runner|testing engine|test cases?)\b/, ["testingEngine"]],
    [/\b(cli|command line)\b/, ["cliToolkit", "cliFramework"]],
    [/\b(runtime|node\.js|typescript)\b/, ["runtime"]],
    [/\b(dashboard|user interface|frontend)\b/, ["dashboardUi", "frontendFramework"]],
  ];
  return mappings.some(([pattern, categories]) => pattern.test(text) && hasSelectedCategory(spec, categories));
}

function isPresentationLayerFalsePositive(item: ConflictItem, spec: ProjectSpec): boolean {
  const category = categoryForTool(spec, item.offendingTool);
  if (category !== "dashboardUi") return false;
  const text = `${item.type} ${item.description}`.toLowerCase();
  const hasSeparateEngine = hasSelectedCategory(spec, ["runtime", "astParser", "codeExecution"]);
  return hasSeparateEngine && /(cpu|processing|cli|headless|frontend framework)/.test(text);
}

function isEvidenceBackedBlocker(item: ConflictItem, spec: ProjectSpec): boolean {
  const text = `${item.type} ${item.description}`.toLowerCase();
  const offline = /\b(offline|no internet|without internet|runs locally)\b/i.test(spec.description)
    || spec.constraints.technical?.mustBeOffline;
  const category = categoryForTool(spec, item.offendingTool);
  const tool = item.offendingTool.toLowerCase();

  if (/connectivity/.test(text)) {
    return Boolean(offline && CLOUD_TOOLS.some((cloudTool) => tool.includes(cloudTool)));
  }
  if (/missing/.test(text) || /no tool/.test(text)) return true;
  if (/platform/.test(text) || /cli tool/.test(text)) {
    return spec.projectType === "CLI_TOOL" && category === "frontendFramework";
  }
  if (/forbidden/.test(text)) {
    const forbiddenTools = spec.constraints.technical?.forbiddenTools.map((value) => value.toLowerCase()) ?? [];
    const forbiddenCategories = spec.constraints.technical?.forbiddenCategories ?? [];
    return forbiddenTools.some((value) => tool.includes(value)) || Boolean(category && forbiddenCategories.includes(category));
  }
  if (/licen[cs]/.test(text)) return /open source only/i.test(spec.description);
  return false;
}

/**
 * AI can propose conflicts, but it cannot invent blocking evidence. Reconcile
 * its report with the actual category/value selections before showing it.
 */
export function sanitizeConflictReport(report: ConflictReport, spec: ProjectSpec): ConflictReport {
  const retained: ConflictItem[] = [];
  const downgraded: ConflictItem[] = [];

  for (const item of [...report.conflicts, ...report.warnings]) {
    if (missingConcernIsResolved(item, spec) || isPresentationLayerFalsePositive(item, spec)) continue;
    if (item.severity === "blocking" && !isEvidenceBackedBlocker(item, spec)) {
      downgraded.push({ ...item, severity: "warning" });
    } else if (item.severity === "blocking") {
      retained.push(item);
    } else {
      downgraded.push(item);
    }
  }

  return {
    hasBlockingConflicts: retained.length > 0,
    hasWarnings: downgraded.length > 0,
    conflicts: retained,
    warnings: downgraded,
  };
}
