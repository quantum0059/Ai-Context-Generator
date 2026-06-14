"use client";

import { useState } from "react";
import { ChevronDown, Users } from "lucide-react";

import { StatusBadge, type ProjectStatus } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

export interface ProjectRowData {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: ProjectStatus;
  members: string;
}

export function ProjectRow({ project }: { project: ProjectRowData }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = project.icon;

  return (
    <div>
      {/* Main row */}
      <div
        className="flex items-center gap-4 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#111111] px-5 py-4.5"
        style={{ borderRadius: "12px" }}
      >
        {/* Icon */}
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.06)]">
          <Icon className="size-[18px] text-white" />
        </div>

        {/* Middle */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-medium text-white">
            {project.name}
          </p>
          <p className="mt-0.5 truncate text-[13px] text-[#888]">
            {project.description}
          </p>
        </div>

        {/* Right */}
        <div className="hidden shrink-0 items-center gap-4 sm:flex">
          <StatusBadge status={project.status} />

          <span className="flex items-center gap-1 text-[13px] text-[#888]">
            <Users className="size-3.5" />
            {project.members}
          </span>

          <button
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-[13px] text-white transition-colors hover:text-[#ccc]"
          >
            Manage
            <ChevronDown
              className={cn(
                "size-3.5 text-[#888] transition-transform",
                expanded && "rotate-180",
              )}
            />
          </button>
        </div>
      </div>

      {/* Expanded detail panel */}
      {expanded && (
        <div className="mt-2 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#111111] px-5 py-4">
          <div className="flex h-24 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.04)]">
            <p className="text-sm text-[#888]">Project details coming soon</p>
          </div>
        </div>
      )}
    </div>
  );
}
