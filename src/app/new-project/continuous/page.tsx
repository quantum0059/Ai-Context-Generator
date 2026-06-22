"use client";

import { useWizard } from "../wizard-context";
import { WizardBreadcrumb } from "@/components/wizard/breadcrumb";
import { StepIndicator } from "@/components/wizard/step-indicator";
import { WizardBottomNav } from "@/components/wizard/wizard-bottom-nav";

export default function ContinuousPage() {
  const { state, updateState } = useWizard();

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-16 text-white">
      <WizardBreadcrumb />
      <StepIndicator currentStep={4} />

      <main className="mx-auto max-w-[680px] px-4 py-10">
        <div className="text-center">
          <h1 className="text-[28px] font-bold text-white">Constraints</h1>
          <p className="mx-auto mt-3 max-w-[480px] text-sm text-[#888]">
            Set budget limits and technologies to avoid.
          </p>
        </div>

        <div className="mt-8 space-y-4 rounded-xl border border-white/[0.08] bg-[#111111] p-6">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">
              Budget
            </label>
            <input
              type="text"
              placeholder="Free tiers only / up to $50 per month"
              value={state.budget}
              onChange={(e) => updateState({ budget: e.target.value })}
              className="w-full rounded-lg border border-white/[0.10] bg-[#1A1A1A] px-3 py-2 text-sm text-white placeholder:text-[#555] outline-none focus:border-white/[0.20]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">
              Avoid
            </label>
            <input
              type="text"
              placeholder="Firebase, Redux"
              value={state.avoid}
              onChange={(e) => updateState({ avoid: e.target.value })}
              className="w-full rounded-lg border border-white/[0.10] bg-[#1A1A1A] px-3 py-2 text-sm text-white placeholder:text-[#555] outline-none focus:border-white/[0.20]"
            />
          </div>
        </div>
      </main>

      <WizardBottomNav
        backHref="/new-project/stack"
        continueHref="/new-project/design"
      />
    </div>
  );
}
