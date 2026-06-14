import Link from "next/link";
import { Play } from "lucide-react";

import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { StatsRow } from "@/components/dashboard/stats-row";
import { RecentProjects } from "@/components/dashboard/recent-projects";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { FooterBar } from "@/components/dashboard/footer-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Hero */}
      <section className="px-4 py-16 text-center sm:py-20">
        <Badge
          variant="outline"
          className="mb-6 border-white/20 bg-transparent px-3 py-1 text-xs font-normal text-[#888]"
        >
          ✦ AI Powered · Supercharge Your Dev
        </Badge>

        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-[56px]">
          The AI Development
          <br />
          Context Generator
        </h1>

        <p className="mx-auto mt-5 max-w-[520px] text-sm leading-relaxed text-[#888] sm:text-base">
          Generate a complete, production-ready development context for any
          project. Save hours of setup, reduce handoffs, and ship faster with
          AI.
        </p>

        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            render={<Link href="/new-project/basics" />}
            className="h-10 rounded-full bg-white px-6 font-medium text-[#0A0A0A] hover:bg-white/90"
          >
            Get Started Free
          </Button>
          <Button
            variant="outline"
            className="h-10 gap-2 rounded-full border-white/20 bg-[#111111] px-6 font-medium text-white hover:bg-[#1a1a1a]"
          >
            <Play className="size-3.5 fill-white" />
            View Demo
          </Button>
        </div>
      </section>

      {/* Dashboard layout */}
      <div className="mx-auto max-w-7xl px-4 pb-8 lg:px-8">
        <div className="overflow-hidden rounded-xl border border-white/[0.06] bg-[#0A0A0A]">
          <div className="flex min-h-[600px]">
            <DashboardSidebar />

            <main className="flex-1 overflow-y-auto p-5 pb-20 md:p-6 md:pb-6">
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-white">
                  Welcome back, Alex 👋
                </h2>
                <p className="mt-1 text-sm text-[#888]">
                  Here&apos;s what&apos;s going on with your projects.
                </p>
              </div>

              <div className="space-y-5">
                <StatsRow />

                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  <RecentProjects />
                  <QuickActions />
                </div>
              </div>
            </main>
          </div>
        </div>
      </div>

      <FooterBar />
    </div>
  );
}
