"use client";

import Link from "next/link";
import {
  Activity,
  Archive,
  Database,
  File,
  GitBranch,
  LayoutDashboard,
  LayoutGrid,
  BrainCircuit,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type InnerSidebarActiveItem =
  | "overview"
  | "files"
  | "prompts"
  | "data"
  | "database"
  | "backups"
  | "automations"
  | "settings";

interface InnerNavItem {
  id: InnerSidebarActiveItem;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: InnerNavItem[] = [
  { id: "overview", label: "Overview", href: "#overview", icon: LayoutDashboard },
  { id: "files", label: "Files", href: "#files", icon: File },
  { id: "prompts", label: "Prompts", href: "/dashboard/prompts", icon: BrainCircuit },
  { id: "data", label: "Data", href: "#data", icon: Activity },
  { id: "database", label: "Database", href: "#database", icon: LayoutGrid },
  { id: "backups", label: "Backups", href: "#backups", icon: Archive },
  { id: "automations", label: "Automations", href: "#automations", icon: GitBranch },
  { id: "settings", label: "Settings", href: "#settings", icon: Settings },
];

interface InnerSidebarProps {
  activeItem?: InnerSidebarActiveItem;
  projectName?: string;
  version?: string;
}

export function InnerSidebar({
  activeItem = "overview",
  projectName = "AI Chat: EMS Platform",
  version = "v2.4.7 (2024-05-28 14:30)",
}: InnerSidebarProps) {
  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r border-[rgba(255,255,255,0.08)] bg-[#0D0D0D]">
      {/* Project info */}
      <div className="px-5 py-5 pb-0">
        <p className="text-[15px] font-semibold text-white">{projectName}</p>
        <p className="mt-1 text-xs text-[#888]">Version: {version}</p>
      </div>

      {/* Nav items */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.id;
          const isExternalLink = item.href.startsWith("/");

          const content = (
            <div
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[rgba(255,255,255,0.08)] text-white"
                  : "text-[#888] hover:bg-[rgba(255,255,255,0.04)] hover:text-white"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </div>
          );

          return isExternalLink ? (
            <Link key={item.id} href={item.href}>
              {content}
            </Link>
          ) : (
            <div key={item.id}>{content}</div>
          );
        })}
      </nav>
    </aside>
  );
}
