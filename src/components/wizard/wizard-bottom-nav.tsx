import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

interface WizardBottomNavProps {
  backHref: string;
  continueHref?: string;
  onContinue?: () => void;
  continueDisabled?: boolean;
  continueLabel?: string;
  /** Optional short hint shown centered between the two buttons on larger screens. */
  hint?: string;
}

export function WizardBottomNav({
  backHref,
  continueHref,
  onContinue,
  continueDisabled,
  continueLabel,
  hint,
}: WizardBottomNavProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-[#0A0A0A]/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-3xl items-center justify-between gap-4 px-4 sm:px-6">
        <Button
          render={<Link href={backHref} />}
          variant="outline"
          className="h-10 gap-1.5 rounded-lg border-white/[0.12] bg-[#111111] px-4 text-white transition-colors hover:bg-white/[0.06]"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>

        {hint && (
          <span className="hidden flex-1 text-center text-xs text-[#666] sm:block">
            {hint}
          </span>
        )}

        <Button
          render={continueHref && !continueDisabled ? <Link href={continueHref} /> : undefined}
          onClick={onContinue}
          disabled={continueDisabled}
          className="h-10 gap-1.5 rounded-lg bg-white px-6 font-medium text-[#0A0A0A] transition-all hover:bg-white/90 hover:shadow-[0_0_20px_rgba(255,255,255,0.2)] disabled:opacity-40 disabled:shadow-none"
        >
          {continueLabel || "Continue"}
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
