import { Code, FolderKanban, Clock, Tag } from "lucide-react";

import { Card } from "@/components/ui/card";

interface StatsRowProps {
  totalProjects?: number;
  contextsGenerated?: number;
  lastGenerated?: string;
  packageVersion?: string;
  isLoading?: boolean;
}

export function StatsRow({
  totalProjects = 0,
  contextsGenerated = 0,
  lastGenerated = "Never",
  packageVersion = "N/A",
  isLoading = false,
}: StatsRowProps = {}) {
  const stats = [
    { label: "Total Projects", value: totalProjects.toString(), icon: FolderKanban },
    { label: "Contexts Generated", value: contextsGenerated.toString(), icon: Code },
    { label: "Last Generated", value: lastGenerated, icon: Clock },
    { label: "Package Version", value: packageVersion, icon: Tag },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card
          key={stat.label}
          className="gap-3 rounded-xl border border-white/[0.06] bg-[#111111] p-5 ring-0"
        >
          <stat.icon className="size-4 text-[#888]" />
          <p className="text-xs text-[#888]">{stat.label}</p>
          {isLoading ? (
            <div className="h-8 w-20 mt-1 rounded bg-[#1a1a1a] animate-pulse" />
          ) : (
            <p className="text-2xl font-bold text-white">{stat.value}</p>
          )}
        </Card>
      ))}
    </div>
  );
}
