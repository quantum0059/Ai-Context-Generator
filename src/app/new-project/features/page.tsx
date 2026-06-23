"use client";

import { useEffect, useState } from "react";
import { useWizard } from "../wizard-context";
import { WizardBreadcrumb } from "@/components/wizard/breadcrumb";
import { StepIndicator } from "@/components/wizard/step-indicator";
import { WizardBottomNav } from "@/components/wizard/wizard-bottom-nav";
import { Button } from "@/components/ui/button";

interface SuggestedFeature {
  name: string;
  description: string;
}

export default function FeaturesPage() {
  const { state, updateState } = useWizard();
  const [suggestedFeatures, setSuggestedFeatures] = useState<SuggestedFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [engine, setEngine] = useState<string>("");

  useEffect(() => {
    async function fetchFeatures() {
      if (!state.projectName || !state.description) {
        setLoading(false);
        setError("Please go back and fill in your project name and description.");
        return;
      }
      try {
        // Step 1: Discover categories and project type
        let currentProjectType = state.projectType;
        if (!currentProjectType) {
          const discoverRes = await fetch("/api/contextforge/discover", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              projectName: state.projectName,
              description: state.description,
              platform: "web",
              features: state.features,
            }),
          });
          if (discoverRes.ok) {
            const discoverData = await discoverRes.json();
            if (discoverData.projectType) {
              currentProjectType = discoverData.projectType;
              updateState({
                projectType: discoverData.projectType,
                classificationReason: discoverData.classificationReason,
              });
            }
          }
        }

        // Step 2: Suggest features with classification context
        const res = await fetch("/api/contextforge/suggest-features", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectName: state.projectName,
            description: state.description,
            platform: "web",
            projectType: currentProjectType,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error?.fieldErrors ?? "Failed to fetch suggestions");
        }
        setSuggestedFeatures(data.features);
        setEngine(data.engine);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      } finally {
        setLoading(false);
      }
    }
    fetchFeatures();
  }, [state.projectName, state.description]);

  const toggleFeature = (feature: string, checked: boolean) => {
    const nextFeatures = checked
      ? [...state.features, feature]
      : state.features.filter((f) => f !== feature);
    updateState({ features: nextFeatures });
  };

  const addCustomFeature = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    if (suggestedFeatures.some((f) => f.name.toLowerCase() === trimmed.toLowerCase())) {
      setCustomInput("");
      return;
    }
    if (state.features.includes(trimmed)) {
      setCustomInput("");
      return;
    }
    setSuggestedFeatures((prev) => [...prev, { name: trimmed, description: "Custom feature" }]);
    setCustomInput("");
  };

  const isContinueDisabled = state.features.length === 0;

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-16 text-white">
      <WizardBreadcrumb />
      <StepIndicator currentStep={2} />

      <main className="mx-auto max-w-[680px] px-4 py-10">
        <div className="text-center">
          <h1 className="text-[28px] font-bold text-white">Select Features</h1>
          <p className="mx-auto mt-3 max-w-[480px] text-sm text-[#888]">
            {loading
              ? "Generating feature suggestions based on your description..."
              : engine === "ai"
                ? "AI-suggested features based on your project description. Select what applies."
                : "Suggested features based on your project. Select what applies or add your own."}
          </p>
        </div>

        <div className="mt-8 rounded-xl border border-white/[0.08] bg-[#111111] p-6">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-[#888]">
                <svg
                  className="size-5 animate-spin text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <span className="text-sm">Analyzing your project description...</span>
              </div>
            </div>
          )}

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

          {!loading && !error && (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {suggestedFeatures.map((feature) => (
                  <label
                    key={feature.name}
                    className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-white/[0.08] bg-[#1A1A1A] px-3 py-2.5 transition-colors hover:border-white/[0.16] has-[:checked]:border-white/30 has-[:checked]:bg-white/[0.04]"
                  >
                    <input
                      type="checkbox"
                      checked={state.features.includes(feature.name)}
                      onChange={(e) => toggleFeature(feature.name, e.target.checked)}
                      className="mt-0.5 size-4 shrink-0 rounded border-white/[0.20] bg-transparent accent-white"
                    />
                    <div>
                      <span className="block text-sm text-white">{feature.name}</span>
                      <span className="mt-0.5 block text-xs text-[#666]">{feature.description}</span>
                    </div>
                  </label>
                ))}
              </div>

              {/* Custom feature input */}
              <div className="mt-5 flex gap-2">
                <input
                  type="text"
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addCustomFeature())}
                  placeholder="Add a custom feature..."
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
            </>
          )}
        </div>

        {/* Selected features summary */}
        {state.features.length > 0 && !loading && (
          <div className="mt-4 rounded-lg border border-white/[0.06] bg-[#0D0D0D] p-3">
            <p className="text-xs text-[#666]">
              <span className="text-white">{state.features.length}</span> feature{state.features.length !== 1 ? "s" : ""} selected
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
