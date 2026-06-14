"use client";

import { AlignJustify, Download, Eye, Shield } from "lucide-react";

interface QuickAction {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  onClick: () => void;
}

interface QuickActionsProps {
  onDownload: () => void;
  onViewContents: () => void;
  onScanPackage: () => void;
  onViewSummary: () => void;
}

export function QuickActions({
  onDownload,
  onViewContents,
  onScanPackage,
  onViewSummary,
}: QuickActionsProps) {
  const actions: QuickAction[] = [
    {
      icon: Download,
      label: "Download Package",
      description: "Download as ZIP file",
      onClick: onDownload,
    },
    {
      icon: Eye,
      label: "View Contents",
      description: "Explore package files",
      onClick: onViewContents,
    },
    {
      icon: Shield,
      label: "Scan Package",
      description: "Run security scan",
      onClick: onScanPackage,
    },
    {
      icon: AlignJustify,
      label: "View Summary",
      description: "View package details",
      onClick: onViewSummary,
    },
  ];

  return (
    <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#111111] p-5">
      <h3 className="mb-3.5 text-[15px] font-semibold text-white">Quick Actions</h3>

      <div className="flex flex-col gap-2.5">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              onClick={action.onClick}
              className="flex cursor-pointer items-center gap-3.5 rounded-[10px] border border-[rgba(255,255,255,0.06)] bg-[#1A1A1A] px-4 py-3.5 text-left transition-colors hover:bg-[rgba(255,255,255,0.06)]"
            >
              {/* Icon square */}
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[rgba(255,255,255,0.06)]">
                <Icon className="size-4 text-white" />
              </div>

              <div className="flex flex-col">
                <span className="text-[13px] font-medium text-white">{action.label}</span>
                <span className="mt-0.5 text-xs text-[#888]">{action.description}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
