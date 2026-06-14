import { WizardBreadcrumb } from "@/components/wizard/breadcrumb";
import { StepIndicator } from "@/components/wizard/step-indicator";
import { WizardBottomNav } from "@/components/wizard/wizard-bottom-nav";

const FEATURES = [
  "Authentication",
  "Onboarding",
  "Dashboard",
  "AI Chat",
  "Video Lessons",
  "Payments",
  "User Profiles",
  "Notifications",
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-16 text-white">
      <WizardBreadcrumb />
      <StepIndicator currentStep={2} />

      <main className="mx-auto max-w-[680px] px-4 py-10">
        <div className="text-center">
          <h1 className="text-[28px] font-bold text-white">
            Select Features
          </h1>
          <p className="mx-auto mt-3 max-w-[480px] text-sm text-[#888]">
            Choose the features your project needs. This helps tailor stack
            suggestions.
          </p>
        </div>

        <div className="mt-8 rounded-xl border border-white/[0.08] bg-[#111111] p-6">
          <div className="grid grid-cols-2 gap-3">
            {FEATURES.map((feature) => (
              <label
                key={feature}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-white/[0.08] bg-[#1A1A1A] px-3 py-2.5 text-sm text-white transition-colors hover:border-white/[0.16]"
              >
                <input
                  type="checkbox"
                  className="size-4 rounded border-white/[0.20] bg-transparent accent-white"
                />
                {feature}
              </label>
            ))}
          </div>
        </div>
      </main>

      <WizardBottomNav
        backHref="/new-project/basics"
        continueHref="/new-project/stack"
      />
    </div>
  );
}
