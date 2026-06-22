"use client";

import { useEffect } from "react";
import { useWizard } from "../wizard-context";
import { WizardBreadcrumb } from "@/components/wizard/breadcrumb";
import { StepIndicator } from "@/components/wizard/step-indicator";
import { WizardBottomNav } from "@/components/wizard/wizard-bottom-nav";

export default function BasicsPage() {
  const { state, updateState, resetWizard } = useWizard();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("reset") === "true") {
        resetWizard();
        // Clean up the URL search param so refresh doesn't reset it again
        const newUrl = window.location.pathname;
        window.history.replaceState({}, "", newUrl);
      }
    }
  }, [resetWizard]);

  const isContinueDisabled = !state.projectName.trim() || state.description.trim().length < 10;

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
              value={state.projectName}
              onChange={(e) => updateState({ projectName: e.target.value })}
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
              value={state.description}
              onChange={(e) => updateState({ description: e.target.value })}
              className="w-full rounded-lg border border-white/[0.10] bg-[#1A1A1A] px-3 py-2 text-sm text-white placeholder:text-[#555] outline-none focus:border-white/[0.20]"
            />
          </div>
        </div>


      </main>

      <WizardBottomNav
        backHref="/dashboard"
        continueHref="/new-project/features"
        continueDisabled={isContinueDisabled}
      />
    </div>
  );
}
