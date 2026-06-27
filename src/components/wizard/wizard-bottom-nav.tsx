import Link from "next/link";

import { Button } from "@/components/ui/button";

interface WizardBottomNavProps {
  backHref: string;
  continueHref?: string;
  onContinue?: () => void;
  continueDisabled?: boolean;
  continueLabel?: string;
}

export function WizardBottomNav({
  backHref,
  continueHref,
  onContinue,
  continueDisabled,
  continueLabel,
}: WizardBottomNavProps) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-between border-t border-white/[0.08] bg-[#0A0A0A] px-4 sm:px-6">
      <Button
        render={<Link href={backHref} />}
        variant="outline"
        className="h-10 rounded-lg border-white/[0.12] bg-[#111111] px-5 text-white hover:bg-white/[0.06]"
      >
        ← Back
      </Button>
      <Button
        render={continueHref && !continueDisabled ? <Link href={continueHref} /> : undefined}
        onClick={onContinue}
        disabled={continueDisabled}
        className="h-10 rounded-lg bg-white px-6 font-medium text-[#0A0A0A] hover:bg-white/90 disabled:opacity-50"
      >
        {continueLabel || "Continue →"}
      </Button>
    </div>
  );
}
