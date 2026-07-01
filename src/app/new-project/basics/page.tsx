"use client";

import { useEffect } from "react";
import { Rocket } from "lucide-react";
import { useWizard } from "../wizard-context";
import { WizardBreadcrumb } from "@/components/wizard/breadcrumb";
import { StepIndicator } from "@/components/wizard/step-indicator";
import { WizardStepHeader } from "@/components/wizard/step-header";
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

  const descriptionLength = state.description.trim().length;
  const isContinueDisabled = !state.projectName.trim() || descriptionLength < 10;

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-16 text-white">
      <WizardBreadcrumb />
      <StepIndicator currentStep={1} />

      <main className="mx-auto max-w-[680px] px-4 py-10">
        <WizardStepHeader
          icon={Rocket}
          title="Project Basics"
          subtitle="Name your project and describe what you're building. The more detail you give, the sharper every later step becomes."
        />

        <div className="mt-8 space-y-5 rounded-2xl border border-white/[0.08] bg-[#111111] p-6 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-white">
              Project name
            </label>
            <input
              type="text"
              placeholder="LingoQuest"
              value={state.projectName}
              onChange={(e) => updateState({ projectName: e.target.value })}
              className="w-full rounded-lg border border-white/[0.10] bg-[#1A1A1A] px-3.5 py-2.5 text-sm text-white placeholder:text-[#555] outline-none transition-colors focus:border-white/30 focus:ring-2 focus:ring-white/10"
            />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-sm font-medium text-white">
                Description
              </label>
              <span
                className={
                  descriptionLength < 10
                    ? "text-xs text-[#666]"
                    : "text-xs text-emerald-400/80"
                }
              >
                {descriptionLength < 10
                  ? `${10 - descriptionLength} more characters`
                  : "Looks good"}
              </span>
            </div>
            <textarea
              rows={5}
              placeholder="A language learning app with AI tutoring, streak tracking, and spaced-repetition review..."
              value={state.description}
              onChange={(e) => updateState({ description: e.target.value })}
              className="w-full resize-none rounded-lg border border-white/[0.10] bg-[#1A1A1A] px-3.5 py-2.5 text-sm leading-relaxed text-white placeholder:text-[#555] outline-none transition-colors focus:border-white/30 focus:ring-2 focus:ring-white/10"
            />
            <p className="mt-2 text-xs text-[#666]">
              Tip: mention who it's for and its 2-3 key capabilities.
            </p>
          </div>
        </div>
      </main>

      <WizardBottomNav
        backHref="/dashboard"
        continueHref="/new-project/features"
        continueDisabled={isContinueDisabled}
        hint="Basics feed feature and stack suggestions"
      />
    </div>
  );
}
