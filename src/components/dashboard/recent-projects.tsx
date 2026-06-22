import { Clock, Package, RefreshCw } from "lucide-react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatRelativeTime } from "@/lib/utils";

export interface DashboardPackage {
  id: string;
  spec_id?: string;
  project_name: string;
  package_version: number;
  generated_at: string;
}

interface RecentProjectsProps {
  packages?: DashboardPackage[];
  isLoading?: boolean;
}

export function RecentProjects({ packages = [], isLoading = false }: RecentProjectsProps = {}) {
  return (
    <Card className="flex h-full flex-col rounded-xl border border-white/[0.06] bg-[#111111] ring-0">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold text-white">
          Recent Projects
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 space-y-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="mt-2 size-1.5 shrink-0 rounded-full bg-[#555]" />
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#1a1a1a] animate-pulse" />
              <div className="min-w-0 flex-1 space-y-2 py-1">
                <div className="h-4 w-32 rounded bg-[#1a1a1a] animate-pulse" />
                <div className="h-3 w-24 rounded bg-[#1a1a1a] animate-pulse" />
              </div>
            </div>
          ))
        ) : packages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center space-y-3 py-8 text-center">
            <Package className="size-8 text-[#555]" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-white">No packages generated yet</p>
              <p className="text-xs text-[#888]">Start by describing your project.</p>
            </div>
            <Link
              href="/"
              className="mt-2 rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-neutral-200"
            >
              Go to Wizard
            </Link>
          </div>
        ) : (
          packages.slice(0, 5).map((pkg) => (
            <div key={pkg.id} className="flex items-center gap-3">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-emerald-500" />
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#1a1a1a]">
                <Package className="size-4 text-[#888]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-white">{pkg.project_name}</p>
                  <span className="rounded bg-[#1a1a1a] px-1.5 py-0.5 text-[10px] font-medium text-[#888]">
                    v{pkg.package_version || 1}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-xs text-[#888]">
                  <Clock className="size-3" />
                  {formatRelativeTime(pkg.generated_at)}
                </div>
              </div>
              <Link
                href={`/?specId=${pkg.id}`}
                className="flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-transparent px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/[0.04]"
              >
                <RefreshCw className="size-3" />
                Reload
              </Link>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
