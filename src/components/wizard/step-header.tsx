import type { LucideIcon } from "lucide-react";

interface WizardStepHeaderProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
}

/**
 * Consistent, professional heading block for every wizard step: a subtle
 * icon chip above a centered title and supporting sentence.
 */
export function WizardStepHeader({ icon: Icon, title, subtitle }: WizardStepHeaderProps) {
  return (
    <div className="flex flex-col items-center text-center">
      <span className="mb-4 flex size-11 items-center justify-center rounded-xl border border-white/[0.10] bg-white/[0.04] shadow-[0_0_24px_rgba(255,255,255,0.04)]">
        <Icon className="size-5 text-white" />
      </span>
      <h1 className="text-[26px] font-bold tracking-tight text-white sm:text-[28px]">{title}</h1>
      <p className="mx-auto mt-2.5 max-w-[480px] text-sm leading-relaxed text-[#888]">{subtitle}</p>
    </div>
  );
}
