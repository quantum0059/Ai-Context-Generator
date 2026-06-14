import { cn } from "@/lib/utils";

const STEPS = [
  { number: 1, label: "Basics", slug: "basics" },
  { number: 2, label: "Features", slug: "features" },
  { number: 3, label: "Stack", slug: "stack" },
  { number: 4, label: "Continuous", slug: "continuous" },
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
  return (
    <div className="border-b border-white/[0.08] bg-[#0A0A0A] px-4 py-6 sm:px-6">
      <div className="mx-auto flex max-w-3xl items-start justify-center">
        {STEPS.map((step, index) => {
          const status = stepStatus(step.number, currentStep);

          return (
            <div key={step.slug} className="flex items-start">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full text-xs font-medium",
                    status === "active" && "bg-white text-[#0A0A0A]",
                    status === "completed" &&
                      "border border-white text-white",
                    status === "upcoming" &&
                      "border border-white/[0.20] text-[#888]",
                  )}
                >
                  {step.number}
                </div>
                <span
                  className={cn(
                    "mt-2 text-xs",
                    status === "active"
                      ? "font-semibold text-white"
                      : "text-[#888]",
                  )}
                >
                  {step.label}
                </span>
              </div>

              {index < STEPS.length - 1 && (
                <span className="mx-2 mt-3 text-sm text-[#888] sm:mx-4">
                  →
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { STEPS, type StepSlug };
