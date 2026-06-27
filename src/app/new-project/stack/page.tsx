"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Cloud,
  Code2,
  Cpu,
  CreditCard,
  Database,
  LayoutGrid,
  Lock,
  Mail,
  Palette,
  Search,
} from "lucide-react";

import { useWizard } from "../wizard-context";
import { WizardBreadcrumb } from "@/components/wizard/breadcrumb";
import { StepIndicator } from "@/components/wizard/step-indicator";
import { StackCategoryRow } from "@/components/wizard/stack-category-row";
import {
  SuggestDialog,
  type SuggestionOption,
} from "@/components/wizard/suggest-dialog";
import { WizardBottomNav } from "@/components/wizard/wizard-bottom-nav";
import { inferPlatform } from "@/lib/inferPlatform";
import type { DiscoveredCategory, SuggestionCandidate } from "@/types/projectspec";

const CATEGORY_META: Record<string, { title: string; description: string; icon: typeof Box }> = {
  frontendFramework: { title: "Frontend Framework", description: "Application UI framework", icon: LayoutGrid },
  backendFramework: { title: "Backend Framework", description: "Server or processing runtime framework", icon: Code2 },
  cliFramework: { title: "CLI Framework", description: "Command-line interface framework", icon: Code2 },
  authentication: { title: "Authentication", description: "Identity and access control", icon: Lock },
  database: { title: "Database", description: "Persistent application data", icon: Database },
  stateManagement: { title: "State Management", description: "Client-side application state", icon: Box },
  styling: { title: "Styling", description: "UI styling and component system", icon: Palette },
  aiProvider: { title: "AI Provider", description: "Models and AI inference", icon: Cpu },
  payments: { title: "Payments", description: "Payments and subscriptions", icon: CreditCard },
  hosting: { title: "Hosting", description: "Application deployment platform", icon: Cloud },
  storage: { title: "File Storage", description: "File and object storage", icon: Database },
  email: { title: "Email", description: "Transactional or marketing email", icon: Mail },
  searchProvider: { title: "Search", description: "Application search infrastructure", icon: Search },
  dataFetching: { title: "Data Fetching", description: "Data fetching and caching", icon: Cloud },
  speechRecognition: { title: "Speech Recognition", description: "Speech to text transcription", icon: Cpu },
  textToSpeech: { title: "Text to Speech", description: "Text to speech generation", icon: Cpu },
  notifications: { title: "Notifications", description: "Push and local notifications", icon: Mail },
  analytics: { title: "Analytics", description: "Product and web analytics", icon: LayoutGrid },
  monitoring: { title: "Monitoring", description: "Error tracking and performance", icon: LayoutGrid },
  video: { title: "Video", description: "Video calling and streaming", icon: LayoutGrid },
};

function humanizeCategory(key: string): string {
  return key
    .replace(/[-_]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function split(value: string): string[] {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function categoryFromKey(key: string): DiscoveredCategory {
  const meta = CATEGORY_META[key];
  return {
    key,
    label: meta?.title ?? humanizeCategory(key),
    reason: meta?.description ?? `Technology required for the ${humanizeCategory(key).toLowerCase()} concern`,
    relevantToProjectType: true,
    isCustom: !meta,
  };
}

export default function StackPage() {
  const { state, updateState, updateStackValue, markStackSkipped } = useWizard();
  // Always rediscover on this step: selected features may have changed after
  // the earlier project classification request.
  const [categories, setCategories] = useState<DiscoveredCategory[]>([]);
  const [suggestions, setSuggestions] = useState<Record<string, SuggestionOption[]>>({});
  const [suggestCategory, setSuggestCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const featureSignature = useMemo(() => [...state.features].sort().join("|"), [state.features]);
  const platform = useMemo(() => inferPlatform(state.description), [state.description]);
  const categorySignature = useMemo(() => categories.map((category) => category.key).join("|"), [categories]);

  // Feature discovery normally runs on the previous step. Re-run it here when
  // entering from a template/direct URL or when no detailed categories survived.
  useEffect(() => {
    if (!state.projectName || state.description.length < 10) return;

    let cancelled = false;
    async function discover() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/contextforge/discover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectName: state.projectName,
            description: state.description,
            platform,
            features: state.features,
            constraints: { budget: state.budget || undefined, avoid: split(state.avoid) },
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Could not determine required stack categories");

        const discovered: DiscoveredCategory[] = data.fullCategories?.length
          ? data.fullCategories
          : (data.requiredCategories ?? []).map(categoryFromKey);
        const relevant = discovered.filter((category) => category.relevantToProjectType !== false);
        if (!relevant.length) throw new Error("No relevant technology categories were discovered");
        if (cancelled) return;
        
        const discoveredKeys = new Set(relevant.map(c => c.key));
        const missingCategories = Object.keys(CATEGORY_META)
          .filter(key => !discoveredKeys.has(key))
          .map(categoryFromKey);
          
        const allCategories = [...relevant, ...missingCategories];
        
        setCategories(allCategories);
        const allowed = new Set(allCategories.map((category) => category.key));
        const relevantStack = Object.fromEntries(
          Object.entries(state.stack).filter(([key]) => allowed.has(key)),
        );
        updateState({
          fullCategories: relevant,
          stack: relevantStack,
          projectType: data.projectType ?? state.projectType,
          classificationReason: data.classificationReason ?? state.classificationReason,
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Stack discovery failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    discover();
    return () => { cancelled = true; };
    // The signatures represent all user inputs that should trigger fresh discovery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.projectName, state.description, featureSignature, state.budget, state.avoid]);

  // Resolve a ranked recommendation plus alternatives for every required category.
  useEffect(() => {
    if (!categorySignature) return;
    let cancelled = false;

    async function recommendStack() {
      setLoading(true);
      setError(null);
      try {
        const draft = {
          projectName: state.projectName,
          description: state.description,
          platform,
          features: state.features,
          constraints: { budget: state.budget || undefined, avoid: split(state.avoid) },
          projectType: state.projectType,
          classificationReason: state.classificationReason,
        };

        const resolved = await Promise.all(categories.map(async (category) => {
          const discoveredOptions: SuggestionOption[] = (category.suggestedTools ?? []).map((tool) => ({
            name: tool.name,
            rationale: tool.reason,
            installCommand: tool.installCommand,
            source: "community",
            confidence: "high",
          }));
          // Discovery already supplied grounded tools for specialized concerns.
          // Use them immediately instead of replacing them with generic AI output.
          if (category.isCustom && discoveredOptions.length > 0) {
            return [category.key, discoveredOptions] as const;
          }
          try {
            const response = await fetch("/api/contextforge/suggest", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ category: category.key, draft }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error ?? "Recommendation failed");
            const apiOptions = (data.candidates as SuggestionCandidate[]).map((candidate) => ({
              name: candidate.name,
              rationale: candidate.rationale,
              source: candidate.source,
              confidence: candidate.confidence,
            }));
            const primaryOptions = category.isCustom ? discoveredOptions : apiOptions;
            const alternativeOptions = category.isCustom ? apiOptions : discoveredOptions;
            const names = new Set(primaryOptions.map((option) => option.name.toLowerCase()));
            return [category.key, [...primaryOptions, ...alternativeOptions.filter((option) => !names.has(option.name.toLowerCase()))]] as const;
          } catch {
            return [category.key, discoveredOptions] as const;
          }
        }));

        if (cancelled) return;
        const nextSuggestions: Record<string, SuggestionOption[]> = Object.fromEntries(
          resolved.map(([key, options]) => [key, [...options]]),
        );
        setSuggestions(nextSuggestions);
        for (const category of categories) {
          const top = nextSuggestions[category.key]?.[0];
          if (top && !state.stack[category.key]?.value && !state.stack[category.key]?.skipped) {
            updateStackValue(category.key, top.name, top.source ?? "suggested", top.confidence ?? "high");
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Stack recommendation failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    recommendStack();
    return () => { cancelled = true; };
    // categorySignature and the input signatures intentionally control refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categorySignature, state.description, featureSignature, state.budget, state.avoid]);

  const activeCategory = categories.find((category) => category.key === suggestCategory);
  const activeSuggestions = suggestCategory ? suggestions[suggestCategory] ?? [] : [];
  const selectionComplete = categories.length > 0 && categories.every((category) => {
    const entry = state.stack[category.key];
    return Boolean(entry?.value || entry?.skipped);
  });

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-16 text-white">
      <WizardBreadcrumb />
      <StepIndicator currentStep={3} />

      <main className="mx-auto max-w-[680px] px-4 py-10">
        <div className="text-center">
          <h1 className="text-[28px] font-bold text-white">Recommended Tech Stack</h1>
          <p className="mx-auto mt-3 max-w-[520px] text-sm text-[#888]">
            Based on your description and selected features. The first choice is recommended; use “Suggest for me” to compare alternatives.
          </p>
          {state.projectType && (
            <p className="mt-2 text-xs text-[#666]">
              Architecture: {state.projectType.replaceAll("_", " ")}
              {state.classificationReason ? ` — ${state.classificationReason}` : ""}
            </p>
          )}
        </div>

        {loading && categories.length === 0 && (
          <div className="mt-8 rounded-xl border border-white/[0.08] bg-[#111] p-10 text-center text-sm text-[#888]">
            Analyzing your project and building a relevant stack…
          </div>
        )}

        {error && (
          <div className="mt-8 rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-400">{error}</div>
        )}

        <div className="mt-8 space-y-3">
          {categories.map((category) => {
            const meta = CATEGORY_META[category.key];
            const options = suggestions[category.key] ?? [];
            const current = state.stack[category.key]?.value;
            const optionNames = Array.from(new Set([
              ...(current ? [current] : []),
              ...options.map((option) => option.name),
            ])).filter(Boolean);

            return (
              <StackCategoryRow
                key={category.key}
                title={category.label || meta?.title || humanizeCategory(category.key)}
                description={category.reason || meta?.description || "Required by this project"}
                icon={meta?.icon ?? Box}
                options={optionNames}
                value={current ?? ""}
                onValueChange={(value) => updateStackValue(category.key, value, "user", "high")}
                confirmed={Boolean(current) && state.stack[category.key]?.source !== "user"}
                skipped={state.stack[category.key]?.skipped ?? false}
                showActions={true}
                onSuggest={() => setSuggestCategory(category.key)}
                onNotNeeded={() => markStackSkipped(category.key)}
                isCustom={category.isCustom ?? !meta}
              />
            );
          })}
        </div>
      </main>

      <WizardBottomNav
        backHref="/new-project/features"
        continueHref="/new-project/continuous"
        continueDisabled={loading || !selectionComplete}
      />

      {suggestCategory && activeCategory && (
        <SuggestDialog
          open
          onOpenChange={(open) => { if (!open) setSuggestCategory(null); }}
          categoryTitle={activeCategory.label || humanizeCategory(activeCategory.key)}
          suggestions={activeSuggestions}
          onSelect={(suggestion) => updateStackValue(
            suggestCategory,
            suggestion.name,
            suggestion.source ?? "suggested",
            suggestion.confidence ?? "high",
          )}
        />
      )}
    </div>
  );
}
