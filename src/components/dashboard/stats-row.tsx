import { Code, FileText, FolderKanban, Users } from "lucide-react";

import { Card } from "@/components/ui/card";

const stats = [
  { label: "Total Projects", value: "12", icon: FolderKanban },
  { label: "Contexts Generated", value: "28", icon: Code },
  { label: "Total Lines of Code", value: "120+", icon: FileText },
  { label: "Team Members", value: "5", icon: Users },
];

export function StatsRow() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card
          key={stat.label}
          className="gap-3 rounded-xl border border-white/[0.06] bg-[#111111] p-5 ring-0"
        >
          <stat.icon className="size-4 text-[#888]" />
          <p className="text-xs text-[#888]">{stat.label}</p>
          <p className="text-2xl font-bold text-white">{stat.value}</p>
        </Card>
      ))}
    </div>
  );
}
