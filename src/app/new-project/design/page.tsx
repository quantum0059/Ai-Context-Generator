"use client";

import { useWizard } from "../wizard-context";
import { WizardBreadcrumb } from "@/components/wizard/breadcrumb";
import { StepIndicator } from "@/components/wizard/step-indicator";
import { WizardBottomNav } from "@/components/wizard/wizard-bottom-nav";

export default function DesignPage() {
  const { state, updateState } = useWizard();

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-16 text-white">
      <WizardBreadcrumb />
      <StepIndicator currentStep={5} />

      <main className="mx-auto max-w-[680px] px-4 py-10">
        <div className="text-center">
          <h1 className="text-[28px] font-bold text-white">
            Design References
          </h1>
          <p className="mx-auto mt-3 max-w-[480px] text-sm text-[#888]">
            Add URLs or descriptions to guide the visual direction.
          </p>
        </div>

        <div className="mt-8 rounded-xl border border-white/[0.08] bg-[#111111] p-6">
          <label className="mb-1.5 block text-sm font-medium text-white">
            Design references
          </label>
          <textarea
            rows={5}
            placeholder="https://duolingo.com, playful rounded UI with bold colors"
            value={state.designReferences}
            onChange={(e) => updateState({ designReferences: e.target.value })}
            className="w-full rounded-lg border border-white/[0.10] bg-[#1A1A1A] px-3 py-2 text-sm text-white placeholder:text-[#555] outline-none focus:border-white/[0.20]"
          />
        </div>
      </main>

      <WizardBottomNav
        backHref="/new-project/continuous"
        continueHref="/new-project/review"
      />
    </div>
  );
}
