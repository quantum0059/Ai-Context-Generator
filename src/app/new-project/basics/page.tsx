import Link from "next/link";

import { WizardBreadcrumb } from "@/components/wizard/breadcrumb";
import { StepIndicator } from "@/components/wizard/step-indicator";
import { WizardBottomNav } from "@/components/wizard/wizard-bottom-nav";

export default function BasicsPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-16 text-white">
      <WizardBreadcrumb />
      <StepIndicator currentStep={1} />

      <main className="mx-auto max-w-[680px] px-4 py-10">
        <div className="text-center">
          <h1 className="text-[28px] font-bold text-white">Project Basics</h1>
          <p className="mx-auto mt-3 max-w-[480px] text-sm text-[#888]">
            Name your project and describe what you&apos;re building.
          </p>
        </div>

        <div className="mt-8 space-y-4 rounded-xl border border-white/[0.08] bg-[#111111] p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">
              Project name
            </label>
            <input
              type="text"
              placeholder="LingoQuest"
              className="w-full rounded-lg border border-white/[0.10] bg-[#1A1A1A] px-3 py-2 text-sm text-white placeholder:text-[#555] outline-none focus:border-white/[0.20]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">
              Description
            </label>
            <textarea
              rows={4}
              placeholder="A language learning app with AI tutoring..."
              className="w-full rounded-lg border border-white/[0.10] bg-[#1A1A1A] px-3 py-2 text-sm text-white placeholder:text-[#555] outline-none focus:border-white/[0.20]"
            />
          </div>
        </div>

        <p className="mt-4 text-center text-xs text-[#888]">
          Or use the{" "}
          <Link href="/" className="text-white underline underline-offset-2">
            classic wizard
          </Link>{" "}
          to generate a full context package now.
        </p>
      </main>

      <WizardBottomNav
        backHref="/dashboard"
        continueHref="/new-project/features"
      />
    </div>
  );
}
