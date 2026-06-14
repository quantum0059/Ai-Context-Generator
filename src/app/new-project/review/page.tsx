import Link from "next/link";

import { Button } from "@/components/ui/button";
import { WizardBreadcrumb } from "@/components/wizard/breadcrumb";
import { StepIndicator } from "@/components/wizard/step-indicator";
import { WizardBottomNav } from "@/components/wizard/wizard-bottom-nav";

export default function ReviewPage() {
  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-16 text-white">
      <WizardBreadcrumb />
      <StepIndicator currentStep={6} />

      <main className="mx-auto max-w-[680px] px-4 py-10">
        <div className="text-center">
          <h1 className="text-[28px] font-bold text-white">Review & Confirm</h1>
          <p className="mx-auto mt-3 max-w-[480px] text-sm text-[#888]">
            Review your project configuration before generating the context
            package.
          </p>
        </div>

        <div className="mt-8 rounded-xl border border-white/[0.08] bg-[#111111] p-6 text-sm">
          <p className="text-[#888]">
            Full review and generation will connect to the existing ContextForge
            API. For now, use the classic wizard to generate your package.
          </p>
          <Button
            render={<Link href="/" />}
            className="mt-4 rounded-lg bg-white px-5 font-medium text-[#0A0A0A] hover:bg-white/90"
          >
            Open Classic Wizard
          </Button>
        </div>
      </main>

      <WizardBottomNav
        backHref="/new-project/design"
        continueHref="/"
      />
    </div>
  );
}
