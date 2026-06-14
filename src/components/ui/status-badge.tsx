import { cn } from "@/lib/utils";

export type ProjectStatus = "In progress" | "Completed" | "Draft" | "In review";

const variantStyles: Record<ProjectStatus, string> = {
  "In progress":
    "bg-[rgba(59,130,246,0.15)] text-[#60A5FA] border border-[rgba(59,130,246,0.2)]",
  Completed:
    "bg-[rgba(34,197,94,0.15)] text-[#4ADE80] border border-[rgba(34,197,94,0.2)]",
  Draft:
    "bg-[rgba(255,255,255,0.06)] text-[#888888] border border-[rgba(255,255,255,0.08)]",
  "In review":
    "bg-[rgba(168,85,247,0.15)] text-[#C084FC] border border-[rgba(168,85,247,0.2)]",
};

export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[6px] px-2.5 py-1 text-xs font-medium whitespace-nowrap",
        variantStyles[status],
      )}
    >
      {status}
    </span>
  );
}
