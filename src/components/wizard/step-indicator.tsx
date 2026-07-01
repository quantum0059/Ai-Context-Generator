import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { number: 1, label: "Basics", slug: "basics" },
  { number: 2, label: "Features", slug: "features" },
  { number: 3, label: "Stack", slug: "stack" },
  { number: 4, label: "Constraints", slug: "continuous" },
  { number: 5, label: "Design", slug: "design" },
  { number: 6, label: "Review", slug: "review" },
] as const;

type StepSlug = (typeof STEPS)[number]["slug"];

interface StepIndicatorProps {
  currentStep: number;
}

function stepStatus(stepNumber: number, currentStep: number) {
  if (stepNumber < currentStep) return "completed";
  if (stepNumber === currentStep) return "active";
  return "upcoming";
}

export function StepIndicator({ currentStep }: StepIndicatorProps) {
  // Progress track fills from the first to the current step.
  const progress = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="border-b border-white/[0.08] bg-gradient-to-b from-[#0C0C0C] to-[#0A0A0A] px-4 py-7 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <div className="relative">
          {/* Background track */}
          <div className="absolute left-0 right-0 top-4 h-px bg-white/[0.10]" aria-hidden />
          {/* Filled track */}
          <div
            className="absolute left-0 top-4 h-px bg-gradient-to-r from-white/60 to-white transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
            aria-hidden
          />

          <ol className="relative flex items-start justify-between">
            {STEPS.map((step) => {
              const status = stepStatus(step.number, currentStep);
              return (
                <li key={step.slug} className="flex flex-1 flex-col items-center">
                  <div
                    className={cn(
                      "flex size-8 items-center justify-center rounded-full text-xs font-semibold transition-all duration-300",
                      status === "active" &&
                        "bg-white text-[#0A0A0A] ring-4 ring-white/15 shadow-[0_0_18px_rgba(255,255,255,0.25)]",
                      status === "completed" &&
                        "bg-white/10 text-white ring-1 ring-white/40",
                      status === "upcoming" &&
                        "bg-[#0A0A0A] text-[#666] ring-1 ring-white/[0.12]",
                    )}
                  >
                    {status === "completed" ? <Check className="size-4" /> : step.number}
                  </div>
                  <span
                    className={cn(
                      "mt-2.5 text-center text-[11px] transition-colors sm:text-xs",
                      status === "active"
                        ? "font-semibold text-white"
                        : status === "completed"
                        ? "text-white/70"
                        : "text-[#666]",
                    )}
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <p className="mt-5 text-center text-[11px] font-medium uppercase tracking-widest text-[#555]">
          Step {currentStep} of {STEPS.length}
        </p>
      </div>
    </div>
  );
}

export { STEPS, type StepSlug };
