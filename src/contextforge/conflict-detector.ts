import type { ProjectSpec, ConflictReport } from "../types/projectspec";

export async function detectStackConflicts(
  spec: ProjectSpec
): Promise<ConflictReport> {
  const empty: ConflictReport = {
    hasBlockingConflicts: false,
    hasWarnings: false,
    conflicts: [],
    warnings: [],
  };

  try {
    const res = await fetch("/api/contextforge/check-conflicts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(spec),
    });

    if (!res.ok) {
      console.warn("Conflict detection API failed, proceeding without checks", res.status);
      return empty;
    }

    const data = (await res.json()) as ConflictReport;
    return data;
  } catch (err) {
    console.error("Failed to detect stack conflicts:", err);
    return empty; // Fallback so generation isn't completely broken
  }
}
