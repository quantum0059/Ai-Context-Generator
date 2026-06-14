"use client";

import Link from "next/link";
import {
  BookOpen,
  Building2,
  ChevronDown,
  CreditCard,
  Grid2x2,
  LayoutDashboard,
  LayoutTemplate,
  Plug,
  Settings,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type SidebarActiveItem =
  | "projects"
  | "templates"
  | "members"
  | "components"
  | "workspaces"
  | "integrations"
  | "settings"
  | "billing"
  | "documentation";

interface NavItemDef {
  id: SidebarActiveItem;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const mainNavItems: NavItemDef[] = [
  { id: "projects", label: "Projects", href: "/dashboard/projects", icon: LayoutDashboard },
  { id: "templates", label: "Templates", href: "#templates", icon: LayoutTemplate },
  { id: "members", label: "Members", href: "#members", icon: Users },
  { id: "components", label: "Components", href: "#components", icon: Grid2x2 },
  { id: "workspaces", label: "Workspaces", href: "#workspaces", icon: Building2 },
  { id: "integrations", label: "Integrations", href: "#integrations", icon: Plug },
];

const bottomNavItems: NavItemDef[] = [
  { id: "settings", label: "Settings", href: "#settings", icon: Settings },
  { id: "billing", label: "Billing", href: "#billing", icon: CreditCard },
  { id: "documentation", label: "Documentation", href: "#docs", icon: BookOpen },
];

function ContextForgeLogo() {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <div className="flex size-7 items-center justify-center rounded-lg border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.06)]">
        <LayoutDashboard className="size-[14px] text-white" />
      </div>
      <span className="text-base font-semibold text-white">ContextForge</span>
    </Link>
  );
}

function NavItem({
  label,
  href,
  icon: Icon,
  active = false,
}: {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-[rgba(255,255,255,0.08)] text-white"
          : "text-[#888] hover:bg-[rgba(255,255,255,0.04)] hover:text-white",
      )}
    >
      <Icon className="size-[18px] shrink-0" />
      <span>{label}</span>
    </Link>
  );
}

function UserProfile() {
  return (
    <div className="border-t border-[rgba(255,255,255,0.08)] p-4">
      <div className="flex cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1.5 transition-colors hover:bg-[rgba(255,255,255,0.04)]">
        <img
          src="https://i.pravatar.cc/36"
          alt="Avatar"
          className="size-9 shrink-0 rounded-full object-cover"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-white">Alex Johnson</p>
          <p className="truncate text-xs text-[#888]">alex@contextforge.com</p>
        </div>
        <ChevronDown className="size-4 shrink-0 text-[#888]" />
      </div>
    </div>
  );
}

interface DashboardSidebarProps {
  activeItem?: SidebarActiveItem;
  showUserProfile?: boolean;
}

export function DashboardSidebar({
  activeItem = "projects",
  showUserProfile = true,
}: DashboardSidebarProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-[240px] shrink-0 flex-col border-r border-[rgba(255,255,255,0.08)] bg-[#0D0D0D] md:flex">
        <div className="border-b border-[rgba(255,255,255,0.08)] px-4 py-5">
          <ContextForgeLogo />
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-3">
          {mainNavItems.map((item) => (
            <NavItem key={item.id} {...item} active={activeItem === item.id} />
          ))}

          <div className="my-2 h-px bg-[rgba(255,255,255,0.08)]" />

          {bottomNavItems.map((item) => (
            <NavItem key={item.id} {...item} active={activeItem === item.id} />
          ))}
        </nav>

        {showUserProfile && <UserProfile />}
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-[rgba(255,255,255,0.08)] bg-[#0D0D0D] px-2 py-2 md:hidden">
        {mainNavItems.slice(0, 5).map((item) => (
          <NavItem key={item.id} {...item} active={activeItem === item.id} />
        ))}
      </nav>
    </>
  );
}
