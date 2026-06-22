"use client";

import { useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { AlertCircle } from "lucide-react";

import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { StatsRow } from "@/components/dashboard/stats-row";
import { RecentProjects, type DashboardPackage } from "@/components/dashboard/recent-projects";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { formatRelativeTime } from "@/lib/utils";

export default function DashboardOverviewPage() {
  const { user, isLoaded } = useUser();
  const firstName = user?.firstName || "Guest";

  const [packages, setPackages] = useState<DashboardPackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchPackages() {
      try {
        const res = await fetch("/api/contextforge/packages");
        if (!res.ok) throw new Error("Failed to fetch packages");
        const data = await res.json();
        setPackages(data.packages || []);
      } catch (err) {
        setError("Could not load your packages. Try refreshing.");
      } finally {
        setIsLoading(false);
      }
    }

    if (isLoaded) {
      if (user) {
        fetchPackages();
      } else {
        setIsLoading(false);
      }
    }
  }, [isLoaded, user]);

  const totalProjects = new Set(packages.map((p) => p.spec_id)).size;
  const contextsGenerated = packages.length;

  let lastGenerated = "Never";
  let packageVersion = "N/A";

  if (packages.length > 0) {
    const sorted = [...packages].sort(
      (a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime()
    );
    const latest = sorted[0];
    packageVersion = `v${latest.package_version || 1}`;
    lastGenerated = formatRelativeTime(latest.generated_at);
  }

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-white">
      <DashboardSidebar />

      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mb-8">
          <h2 className="text-[28px] font-bold text-white">
            Welcome back, {isLoaded ? firstName : "..."} 👋
          </h2>
          <p className="mt-1 text-sm text-[#888]">
            Here&apos;s what&apos;s going on with your projects.
          </p>
        </div>

        {error && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
            <AlertCircle className="size-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        <div className="space-y-5">
          <StatsRow
            totalProjects={totalProjects}
            contextsGenerated={contextsGenerated}
            lastGenerated={lastGenerated}
            packageVersion={packageVersion}
            isLoading={isLoading}
          />

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <RecentProjects packages={packages} isLoading={isLoading} />
            <QuickActions />
          </div>
        </div>
      </main>
    </div>
  );
}
