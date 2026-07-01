"use client";

import { useEffect, useState } from "react";
import { useWizard } from "../wizard-context";
import { ListChecks } from "lucide-react";
import { WizardBreadcrumb } from "@/components/wizard/breadcrumb";
import { StepIndicator } from "@/components/wizard/step-indicator";
import { WizardStepHeader } from "@/components/wizard/step-header";
import { WizardBottomNav } from "@/components/wizard/wizard-bottom-nav";
import { Button } from "@/components/ui/button";
import { inferPlatform } from "@/lib/inferPlatform";
import type { RichFeature } from "@/types/projectspec";

// ─── Local types ──────────────────────────────────────────────────────────────

interface RichEpic {
  name: string;
  features: RichFeature[];
}

interface RichFeatureSetResponse {
  epics: RichEpic[];
  criticalPath: string[];
  outOfScopeGlobal: string[];
  /** Backwards-compat flat list for wizard state */
  features: string[];
  engine: "ai" | "heuristic";
  error?: string;
}

// ─── Priority badge helpers ───────────────────────────────────────────────────

const PRIORITY_STYLES: Record<string, string> = {
  "must-have": "bg-red-500/10 text-red-400 border border-red-500/20",
  "should-have": "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20",
  "nice-to-have": "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
};

const PRIORITY_LABEL: Record<string, string> = {
  "must-have": "Must",
  "should-have": "Should",
  "nice-to-have": "Nice",
};

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${PRIORITY_STYLES[priority] ?? "bg-white/10 text-white/50"}`}>
      {PRIORITY_LABEL[priority] ?? priority}
    </span>
  );
}

// ─── Feature card ─────────────────────────────────────────────────────────────

function FeatureCard({
  feature,
  isSelected,
  onToggle,
}: {
  feature: RichFeature;
  isSelected: boolean;
  onToggle: (name: string, checked: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasCriteria = feature.acceptanceCriteria?.length > 0;
  const hasDeps = feature.dependsOn?.length > 0;

  return (
    <div
      className={`rounded-lg border transition-colors ${
        isSelected
          ? "border-white/30 bg-white/[0.06]"
          : "border-white/[0.08] bg-[#1A1A1A]"
      }`}
    >
      {/* Main row */}
      <label className="flex cursor-pointer items-start gap-2.5 px-3 py-2.5">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={(e) => onToggle(feature.name, e.target.checked)}
          className="mt-0.5 size-4 shrink-0 rounded border-white/[0.20] bg-transparent accent-white"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium text-white">{feature.name}</span>
            <PriorityBadge priority={feature.priority} />
            {hasDeps && (
              <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">
                depends on {feature.dependsOn.length}
              </span>
            )}
          </div>
          <span className="mt-0.5 block text-xs text-[#666]">{feature.description}</span>
        </div>
        {hasCriteria && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setExpanded((v) => !v);
            }}
            className="ml-1 shrink-0 text-[#555] transition-colors hover:text-white"
            aria-label={expanded ? "Collapse criteria" : "Expand criteria"}
          >
            <svg
              className={`size-4 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </label>

      {/* Expanded acceptance criteria + deps */}
      {expanded && (
        <div className="border-t border-white/[0.06] px-3 pb-3 pt-2">
          {hasCriteria && (
            <>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#555]">
                Acceptance Criteria
              </p>
              <ul className="space-y-0.5">
                {feature.acceptanceCriteria.map((criterion, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-0.5 text-emerald-500">✓</span>
                    <span className="text-xs text-[#888]">{criterion}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {hasDeps && (
            <div className="mt-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#555]">
                Depends On
              </p>
              <div className="flex flex-wrap gap-1">
                {feature.dependsOn.map((dep) => (
                  <span
                    key={dep}
                    className="rounded bg-white/5 px-2 py-0.5 text-xs text-white/50"
                  >
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}
          {feature.outOfScope?.length > 0 && (
            <div className="mt-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#555]">
                Out of Scope
              </p>
              <ul className="space-y-0.5">
                {feature.outOfScope.map((item, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-0.5 text-red-500/70">✗</span>
                    <span className="text-xs text-[#666]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FeaturesPage() {
  const { state, updateState } = useWizard();
  const [richSet, setRichSet] = useState<RichFeatureSetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [engineWarning, setEngineWarning] = useState<string | null>(null);
  const [engine, setEngine] = useState<string>("");

  useEffect(() => {
    async function fetchFeatures() {
      if (!state.projectName || !state.description) {
        setLoading(false);
        setError("Please go back and fill in your project name and description.");
        return;
      }
      try {
        const platform = inferPlatform(state.description);

        // Step 1: discover project type
        let currentProjectType = state.projectType;
        const discoverRes = await fetch("/api/contextforge/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectName: state.projectName,
            description: state.description,
            platform,
            features: state.features,
          }),
        });
        if (discoverRes.ok) {
          const discoverData = await discoverRes.json();
          currentProjectType = discoverData.projectType || currentProjectType;
          const fullCategories = discoverData.fullCategories?.length
            ? discoverData.fullCategories
            : (discoverData.requiredCategories || []).map((key: string) => ({
                key,
                label: key
                  .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
                  .replace(/\b\w/g, (letter: string) => letter.toUpperCase()),
                reason: "Required based on the project description and selected features",
                relevantToProjectType: true,
              }));
          updateState({
            projectType: discoverData.projectType || "",
            classificationReason: discoverData.classificationReason || "",
            fullCategories,
          });
        }

        // Step 2: extract rich features — pass existing user selections for deduplication
        const res = await fetch("/api/contextforge/suggest-features", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectName: state.projectName,
            description: state.description,
            platform,
            projectType: currentProjectType,
            existingFeatures: state.features,
          }),
        });
        const data: RichFeatureSetResponse = await res.json();
        if (!res.ok) {
          throw new Error((data as any).error?.fieldErrors ?? "Failed to fetch suggestions");
        }
        setRichSet(data);
        setEngine(data.engine);
        setEngineWarning(data.engine === "heuristic" ? data.error ?? null : null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    fetchFeatures();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.projectName, state.description]);

  const toggleFeature = (featureName: string, checked: boolean) => {
    const nextFeatures = checked
      ? [...state.features, featureName]
      : state.features.filter((f) => f !== featureName);
    updateState({ features: nextFeatures });
  };

  const addCustomFeature = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;

    // Deduplication: check against both existing selections and suggested features
    const allSuggestedNames = (richSet?.epics ?? [])
      .flatMap((e) => e.features.map((f) => f.name.toLowerCase()));
    const isDuplicate =
      allSuggestedNames.includes(trimmed.toLowerCase()) ||
      state.features.some((f) => f.toLowerCase() === trimmed.toLowerCase());

    if (isDuplicate) {
      setDuplicateWarning(`"${trimmed}" is already in the feature list.`);
      setTimeout(() => setDuplicateWarning(null), 3000);
      setCustomInput("");
      return;
    }

    // Add a minimal RichFeature to the first epic (or create a "Custom" epic)
    const customFeature: RichFeature = {
      name: trimmed,
      epic: "Custom",
      description: "Custom feature added by the user.",
      priority: "should-have",
      userRole: "end-user",
      acceptanceCriteria: [],
      outOfScope: [],
      dependsOn: [],
      technicalImplications: [],
      isUserProvided: true,
    };

    setRichSet((prev) => {
      if (!prev) return prev;
      const customEpicIndex = prev.epics.findIndex((e) => e.name === "Custom");
      if (customEpicIndex >= 0) {
        const updated = [...prev.epics];
        updated[customEpicIndex] = {
          ...updated[customEpicIndex],
          features: [...updated[customEpicIndex].features, customFeature],
        };
        return { ...prev, epics: updated };
      }
      return { ...prev, epics: [...prev.epics, { name: "Custom", features: [customFeature] }] };
    });

    // Also auto-select it
    updateState({ features: [...state.features, trimmed] });
    setCustomInput("");
  };

  const isContinueDisabled = state.features.length === 0;

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-16 text-white">
      <WizardBreadcrumb />
      <StepIndicator currentStep={2} />

      <main className="mx-auto max-w-[720px] px-4 py-10">
        <WizardStepHeader
          icon={ListChecks}
          title="Select Features"
          subtitle={
            loading
              ? "Analysing your project description…"
              : engine === "ai"
              ? "Features have been grouped into Epics and prioritised by a senior architect. Select what applies."
              : "Suggested features based on your project. Select what applies or add your own."
          }
        />

        <div className="mt-8 rounded-xl border border-white/[0.08] bg-[#111111] p-6">
          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-[#888]">
                <svg className="size-5 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm">Analysing your project description…</span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-center">
              <p className="text-sm text-red-400">{error}</p>
              <Button
                variant="outline"
                className="mt-3 border-white/20 text-white hover:bg-white/5"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </div>
          )}

          {engineWarning && !loading && !error && (
            <div className="mb-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-4">
              <p className="text-sm text-yellow-300">
                AI feature extraction failed, so these suggestions came from the heuristic fallback.
              </p>
              <p className="mt-1 text-xs text-yellow-200/80">{engineWarning}</p>
            </div>
          )}

          {/* Epic-grouped feature list */}
          {!loading && !error && richSet && (
            <div className="space-y-6">
              {richSet.epics.map((epic) => (
                <div key={epic.name}>
                  <h2 className="mb-2 text-xs font-semibold uppercase tracking-widest text-[#555]">
                    {epic.name}
                  </h2>
                  <div className="space-y-2">
                    {epic.features.map((feature) => (
                      <FeatureCard
                        key={feature.name}
                        feature={feature}
                        isSelected={state.features.includes(feature.name)}
                        onToggle={toggleFeature}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Global out-of-scope */}
              {richSet.outOfScopeGlobal?.length > 0 && (
                <div className="rounded-lg border border-white/[0.05] bg-[#0D0D0D] p-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[#444]">
                    Out of Scope (project-wide)
                  </p>
                  <ul className="space-y-0.5">
                    {richSet.outOfScopeGlobal.map((item, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <span className="text-red-500/50">✗</span>
                        <span className="text-xs text-[#555]">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Custom feature input */}
              <div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && (e.preventDefault(), addCustomFeature())
                    }
                    placeholder="Add a custom feature…"
                    className="flex-1 rounded-lg border border-white/[0.08] bg-[#1A1A1A] px-3 py-2 text-sm text-white placeholder:text-[#555] focus:border-white/20 focus:outline-none"
                  />
                  <Button
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/5"
                    onClick={addCustomFeature}
                    disabled={!customInput.trim()}
                  >
                    Add
                  </Button>
                </div>
                {duplicateWarning && (
                  <p className="mt-1.5 text-xs text-yellow-400">{duplicateWarning}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Selected features summary */}
        {state.features.length > 0 && !loading && (
          <div className="mt-4 rounded-lg border border-white/[0.06] bg-[#0D0D0D] p-3">
            <p className="text-xs text-[#666]">
              <span className="text-white">{state.features.length}</span>{" "}
              feature{state.features.length !== 1 ? "s" : ""} selected
            </p>
          </div>
        )}
      </main>

      <WizardBottomNav
        backHref="/new-project/basics"
        continueHref="/new-project/stack"
        continueDisabled={isContinueDisabled}
      />
    </div>
  );
}
