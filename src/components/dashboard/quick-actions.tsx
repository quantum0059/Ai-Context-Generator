import Link from "next/link";
import {
  ChevronRight,
  LayoutGrid,
  Plus,
  Upload,
  UserPlus,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const actions = [
  {
    title: "Create New Project",
    subtitle: "Start from scratch with AI context",
    icon: Plus,
    href: "/new-project/basics",
  },
  {
    title: "Import Project",
    subtitle: "Upload an existing codebase",
    icon: Upload,
    href: "#import",
  },
  {
    title: "Explore Templates",
    subtitle: "Browse pre-built project templates",
    icon: LayoutGrid,
    href: "#templates",
  },
  {
    title: "Invite Team Members",
    subtitle: "Collaborate on shared projects",
    icon: UserPlus,
    href: "#invite",
  },
];

export function QuickActions() {
  return (
    <Card className="rounded-xl border border-white/[0.06] bg-[#111111] ring-0">
      <CardHeader>
        <CardTitle className="text-base font-semibold text-white">
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {actions.map((action) => (
          <Link
            key={action.title}
            href={action.href}
            className="flex w-full items-center gap-3 rounded-lg px-1 py-3 text-left transition-colors hover:bg-white/[0.03]"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#1a1a1a]">
              <action.icon className="size-4 text-[#888]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-white">{action.title}</p>
              <p className="text-xs text-[#888]">{action.subtitle}</p>
            </div>
            <ChevronRight className="size-4 shrink-0 text-[#555]" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
