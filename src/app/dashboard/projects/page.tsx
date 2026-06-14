"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Code2,
  Database,
  Filter,
  Globe,
  Plus,
  Search,
  Server,
  ShoppingCart,
  Smartphone,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { ProjectRow, type ProjectRowData } from "@/components/dashboard/project-row";
import type { ProjectStatus } from "@/components/ui/status-badge";

/* ------------------------------------------------------------------ */
/*  Static demo data (used as fallback when API is unavailable)       */
/* ------------------------------------------------------------------ */

const DEMO_PROJECTS: ProjectRowData[] = [
  {
    id: "demo-1",
    name: "AI Chat Bot Platform",
    description: "Intelligent chatbot with NLP capabilities",
    icon: Bot,
    status: "In progress",
    members: "8/12",
  },
  {
    id: "demo-2",
    name: "E-commerce Mobile App",
    description: "Modern mobile app for shopping experience",
    icon: ShoppingCart,
    status: "Completed",
    members: "12/12",
  },
  {
    id: "demo-3",
    name: "Project Dashboard",
    description: "Analytics and metrics dashboard for businesses",
    icon: TrendingUp,
    status: "In progress",
    members: "5/8",
  },
  {
    id: "demo-4",
    name: "Task Management API",
    description: "Backend API for task management system",
    icon: Database,
    status: "Draft",
    members: "3/4",
  },
  {
    id: "demo-5",
    name: "AI Image Generator",
    description: "Text-to-image AI generator with advanced models",
    icon: Sparkles,
    status: "In review",
    members: "2/5",
  },
  {
    id: "demo-6",
    name: "Learning Management System",
    description: "Web platform for online courses and education",
    icon: Code2,
    status: "Draft",
    members: "4/6",
  },
];

/* ------------------------------------------------------------------ */
/*  Platform → icon mapping for real saved packages                  */
/* ------------------------------------------------------------------ */

const PLATFORM_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  web: Globe,
  mobile: Smartphone,
  backend: Server,
  saas: Sparkles,
  "chrome-extension": Code2,
  agentic: Bot,
};

/* ------------------------------------------------------------------ */
/*  API response types                                                 */
/* ------------------------------------------------------------------ */

interface SavedSpec {
  description?: string;
  platform?: string;
  features?: string[];
  requiredCategories?: string[];
  stack?: Record<string, { value: string | null }>;
}

interface SavedPackage {
  id: string;
  project_name: string;
  spec: SavedSpec;
  generated_at: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function deriveStatus(pkg: SavedPackage): ProjectStatus {
  const { stack, requiredCategories } = pkg.spec;
  if (!stack || !requiredCategories?.length) return "Completed";
  const filled = requiredCategories.filter((c) => stack[c]?.value).length;
  if (filled === requiredCategories.length) return "Completed";
  if (filled === 0) return "Draft";
  return "In progress";
}

function deriveMembers(pkg: SavedPackage): string {
  const { stack, requiredCategories } = pkg.spec;
  if (!stack || !requiredCategories?.length) return "0/0";
  const filled = requiredCategories.filter((c) => stack[c]?.value).length;
  return `${filled}/${requiredCategories.length}`;
}

function savedPackageToRow(pkg: SavedPackage): ProjectRowData {
  const platform = pkg.spec.platform ?? "web";
  return {
    id: pkg.id,
    name: pkg.project_name,
    description: pkg.spec.description ?? "No description",
    icon: PLATFORM_ICON[platform] ?? Globe,
    status: deriveStatus(pkg),
    members: deriveMembers(pkg),
  };
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

export default function ProjectsPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<ProjectRowData[]>(DEMO_PROJECTS);
  const [loading, setLoading] = useState(true);

  /* Fetch real packages from the API */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/contextforge/packages");
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as { packages: SavedPackage[] };
        if (cancelled) return;
        if (json.packages?.length) {
          setProjects(json.packages.map(savedPackageToRow));
        }
      } catch {
        // API unavailable — keep demo data
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  /* Client-side search */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    );
  }, [query, projects]);

  return (
    <div className="flex h-screen bg-[#0A0A0A] text-white">
      <DashboardSidebar activeItem="projects" />

      <main className="flex-1 overflow-y-auto px-8 py-8">
        {/* Page header */}
        <div>
          <h1 className="text-[28px] font-bold text-white">Projects</h1>
          <p className="mt-1 text-sm text-[#888]">
            Manage your projects and get an overview of everything.
          </p>
        </div>

        {/* Toolbar */}
        <div className="mt-6 flex items-center gap-3">
          {/* Search */}
          <div className="relative max-w-[420px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-[#888]" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects..."
              className="h-10 w-full rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#111111] pl-9 pr-3 text-sm text-white placeholder:text-[#888] outline-none focus:border-[rgba(255,255,255,0.16)]"
            />
          </div>

          {/* Filter */}
          <button className="flex h-10 items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.08)] bg-[#111111] px-4 text-sm text-white transition-colors hover:bg-[rgba(255,255,255,0.04)]">
            <Filter className="size-4 text-[#888]" />
            Filter
            <ChevronDown className="size-3.5 text-[#888]" />
          </button>

          {/* New Project */}
          <button
            onClick={() => router.push("/new-project/basics")}
            className="flex h-10 items-center gap-2 rounded-lg border border-[rgba(255,255,255,0.15)] bg-[#1A1A1A] px-4 text-sm font-medium text-white transition-colors hover:bg-[rgba(255,255,255,0.08)]"
          >
            <Plus className="size-4" />
            New Project
          </button>
        </div>

        {/* Project list */}
        <div className="mt-5 flex flex-col gap-2.5">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex h-[72px] animate-pulse items-center gap-4 rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#111111] px-5"
              >
                <div className="size-10 rounded-lg bg-[rgba(255,255,255,0.06)]" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-40 rounded bg-[rgba(255,255,255,0.06)]" />
                  <div className="h-3 w-64 rounded bg-[rgba(255,255,255,0.04)]" />
                </div>
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#111111]">
              <p className="text-sm text-[#888]">
                {query ? "No projects match your search." : "No projects yet."}
              </p>
            </div>
          ) : (
            filtered.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))
          )}
        </div>

        {/* Pagination */}
        {!loading && filtered.length > 0 && (
          <div className="mt-6 flex items-center justify-between">
            <p className="text-[13px] text-[#888]">
              Showing 1 to {filtered.length} of {filtered.length} projects
            </p>
            <div className="flex items-center gap-2">
              <button className="flex size-9 items-center justify-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#111111] text-[#888] transition-colors hover:text-white">
                <ChevronLeft className="size-4" />
              </button>
              <button className="flex size-9 items-center justify-center rounded-md bg-white text-sm font-medium text-[#0A0A0A]">
                1
              </button>
              <button className="flex size-9 items-center justify-center rounded-md border border-[rgba(255,255,255,0.08)] bg-[#111111] text-[#888] transition-colors hover:text-white">
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
