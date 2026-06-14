import {
  BarChart3,
  Database,
  MessageSquare,
  ShoppingCart,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const projects = [
  {
    name: "AI Chat Bot Platform",
    description: "Full-stack chatbot with NLP integration",
    icon: MessageSquare,
    active: true,
  },
  {
    name: "E-commerce Mobile App",
    description: "Cross-platform shopping experience",
    icon: ShoppingCart,
    active: true,
  },
  {
    name: "Project Dashboard",
    description: "Analytics and reporting interface",
    icon: BarChart3,
    active: true,
  },
  {
    name: "Task Management API",
    description: "RESTful backend for task tracking",
    icon: Database,
    active: false,
  },
];

export function RecentProjects() {
  return (
    <Card className="rounded-xl border border-white/[0.06] bg-[#111111] ring-0">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold text-white">
          Recent Projects
        </CardTitle>
        <a
          href="#projects"
          className="text-xs font-medium text-[#888] transition-colors hover:text-white"
        >
          View all
        </a>
      </CardHeader>
      <CardContent className="space-y-4">
        {projects.map((project) => (
          <div key={project.name} className="flex items-start gap-3">
            <span
              className={cn(
                "mt-2 size-1.5 shrink-0 rounded-full",
                project.active ? "bg-emerald-500" : "bg-[#555]",
              )}
            />
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#1a1a1a]">
              <project.icon className="size-4 text-[#888]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">{project.name}</p>
              <p className="text-xs text-[#888]">{project.description}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
