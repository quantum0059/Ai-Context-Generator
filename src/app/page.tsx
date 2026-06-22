"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Play } from "lucide-react";
import { useAuth, SignInButton, SignUpButton } from "@clerk/nextjs";

import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { StatsRow } from "@/components/dashboard/stats-row";
import { RecentProjects } from "@/components/dashboard/recent-projects";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { FooterBar } from "@/components/dashboard/footer-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const clerkEnabled = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

function ClerkAuthButtons() {
  const { isSignedIn } = useAuth();

  if (isSignedIn) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button
          render={<Link href="/new-project/basics?reset=true" />}
          className="h-10 rounded-full bg-white px-6 font-medium text-[#0A0A0A] hover:bg-white/90"
        >
          Get Started Free
        </Button>
        <Button
          render={<Link href="#demo" />}
          variant="outline"
          className="h-10 gap-2 rounded-full border-white/20 bg-[#111111] px-6 font-medium text-white hover:bg-[#1a1a1a]"
        >
          View Demo
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
      <SignUpButton forceRedirectUrl="/new-project/basics?reset=true" mode="modal">
        <Button className="h-10 rounded-full bg-white px-6 font-medium text-[#0A0A0A] hover:bg-white/90">
          Get Started Free
        </Button>
      </SignUpButton>
      <SignInButton forceRedirectUrl="/new-project/basics?reset=true" mode="modal">
        <Button
          variant="outline"
          className="h-10 gap-2 rounded-full border-white/20 bg-[#111111] px-6 font-medium text-white hover:bg-[#1a1a1a]"
        >
          Sign In
        </Button>
      </SignInButton>
    </div>
  );
}

function DefaultAuthButtons() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
      <Button
        render={<Link href="/new-project/basics?reset=true" />}
        className="h-10 rounded-full bg-white px-6 font-medium text-[#0A0A0A] hover:bg-white/90"
      >
        Get Started Free
      </Button>
      <Button
        render={<Link href="#demo" />}
        variant="outline"
        className="h-10 gap-2 rounded-full border-white/20 bg-[#111111] px-6 font-medium text-white hover:bg-[#1a1a1a]"
      >
        View Demo
      </Button>
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const template = sessionStorage.getItem("contextforge_template_spec");
      if (template) {
        router.push("/new-project/review" + window.location.search);
      }
    }
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Hero */}
      <section className="px-4 py-16 text-center sm:py-20">
        <Badge
          variant="outline"
          className="mb-6 border-white/20 bg-transparent px-3 py-1 text-xs font-normal text-[#888]"
        >
          ✦ AI Powered · Developer-First
        </Badge>

        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight tracking-tight text-white sm:text-5xl lg:text-[56px]">
          The AI Development
          <br />
          Context Generator
        </h1>

        <p className="mx-auto mt-5 max-w-[520px] text-sm leading-relaxed text-[#888] sm:text-base">
          Generate a complete, production-ready AI context package for your
          project. Keep your AI coding assistants aligned with your
          architecture.
        </p>

        <div className="mt-8">
          {clerkEnabled ? <ClerkAuthButtons /> : <DefaultAuthButtons />}
        </div>
      </section>

      {/* Dashboard Preview Mockup */}
      <div id="demo" className="mx-auto max-w-7xl px-4 pb-20 lg:px-8">
        <div className="relative overflow-hidden rounded-xl border border-white/[0.08] bg-[#0A0A0A] shadow-[0_0_50px_rgba(255,255,255,0.03)]">
          {/* Simulated Browser Bar */}
          <div className="flex h-11 items-center gap-2 border-b border-white/[0.08] bg-[#0D0D0D] px-4">
            <div className="flex gap-1.5">
              <span className="size-3 rounded-full bg-[#FF5F56]" />
              <span className="size-3 rounded-full bg-[#FFBD2E]" />
              <span className="size-3 rounded-full bg-[#27C93F]" />
            </div>
            <div className="mx-auto flex h-6 w-80 items-center justify-center rounded bg-white/[0.03] text-[11px] text-[#555] border border-white/[0.04]">
              localhost:3000/dashboard
            </div>
          </div>

          {/* Read-Only Mockup Dashboard Interface */}
          <div className="flex min-h-[500px] pointer-events-none opacity-85 select-none">
            <DashboardSidebar showUserProfile={false} />

            <main className="flex-1 p-5 md:p-6">
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
