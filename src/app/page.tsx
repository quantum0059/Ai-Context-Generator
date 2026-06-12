"use client";

import { useState } from "react";
import type { Analysis, Budget, Category, Platform, Recommendation } from "../types";

const PLATFORMS: Array<{ value: Platform; label: string }> = [
  { value: "web", label: "Web app" },
  { value: "mobile", label: "Mobile app" },
  { value: "backend", label: "Backend / API" },
  { value: "saas", label: "SaaS" },
  { value: "chrome-extension", label: "Chrome extension" },
  { value: "agentic", label: "AI / agentic system" },
];

const BUDGETS: Array<{ value: Budget; label: string }> = [
  { value: "free-only", label: "Free tools only" },
  { value: "low", label: "Low budget" },
  { value: "flexible", label: "Flexible" },
];

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function Home() {
  const [step, setStep] = useState<"intake" | "review">("intake");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    platform: "web" as Platform,
    targetUsers: "",
    budget: "free-only" as Budget,
    preferredTechnologies: "",
    features: "",
    designInspirations: "",
  });
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [selections, setSelections] = useState<Partial<Record<Category, string>>>({});

  const buildInput = () => ({
    name: form.name,
    description: form.description,
    platform: form.platform,
    targetUsers: form.targetUsers,
    budget: form.budget,
    preferredTechnologies: splitList(form.preferredTechnologies),
    features: splitList(form.features),
    designInspirations: splitList(form.designInspirations),
  });

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildInput()),
      });
      if (!res.ok) throw new Error("Analysis failed. Check your inputs and try again.");
      const data = (await res.json()) as {
        analysis: Analysis;
        recommendations: Recommendation[];
      };
      setAnalysis(data.analysis);
      setRecommendations(data.recommendations);
      setSelections(
        Object.fromEntries(data.recommendations.map((r) => [r.category, r.primary.id])),
      );
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    if (!analysis) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: buildInput(), analysis, selections }),
      });
      if (!res.ok) throw new Error("Package generation failed. Please try again.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-ai-context-package.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";
  const labelClass = "mb-1 block text-sm font-medium text-slate-700";

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-3xl font-bold">AI Project Context Generator</h1>
      <p className="mt-2 text-slate-600">
        Describe your application and download a complete AI context package:
        agents.md, prompts, skills, templates, ADRs, roadmap and setup scripts.
      </p>

      {error && (
        <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {step === "intake" && (
        <form onSubmit={handleAnalyze} className="mt-8 space-y-4">
          <div>
            <label className={labelClass}>Project name *</label>
            <input
              required
              className={inputClass}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="LingoQuest"
            />
          </div>
          <div>
            <label className={labelClass}>Description *</label>
            <textarea
              required
              minLength={10}
              rows={4}
              className={inputClass}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="A Duolingo-inspired language learning app with an AI chat tutor, video lessons and XP progression..."
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Platform</label>
              <select
                className={inputClass}
                value={form.platform}
                onChange={(e) => setForm({ ...form, platform: e.target.value as Platform })}
              >
                {PLATFORMS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Budget</label>
              <select
                className={inputClass}
                value={form.budget}
                onChange={(e) => setForm({ ...form, budget: e.target.value as Budget })}
              >
                {BUDGETS.map((b) => (
                  <option key={b.value} value={b.value}>
                    {b.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Target users</label>
            <input
              className={inputClass}
              value={form.targetUsers}
              onChange={(e) => setForm({ ...form, targetUsers: e.target.value })}
              placeholder="Language learners aged 16-35"
            />
          </div>
          <div>
            <label className={labelClass}>Preferred technologies (comma separated)</label>
            <input
              className={inputClass}
              value={form.preferredTechnologies}
              onChange={(e) => setForm({ ...form, preferredTechnologies: e.target.value })}
              placeholder="expo, clerk, zustand"
            />
          </div>
          <div>
            <label className={labelClass}>Desired features (comma separated)</label>
            <input
              className={inputClass}
              value={form.features}
              onChange={(e) => setForm({ ...form, features: e.target.value })}
              placeholder="AI chat tutor, video lessons, XP progression"
            />
          </div>
          <div>
            <label className={labelClass}>Design inspirations (comma separated URLs)</label>
            <input
              className={inputClass}
              value={form.designInspirations}
              onChange={(e) => setForm({ ...form, designInspirations: e.target.value })}
              placeholder="https://duolingo.com"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Analyzing..." : "Analyze project"}
          </button>
        </form>
      )}

      {step === "review" && analysis && (
        <div className="mt-8 space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Analysis</h2>
            <p className="mt-2 text-sm text-slate-600">{analysis.purpose}</p>
            <p className="mt-2 text-sm">
              <span className="font-medium">Complexity:</span> {analysis.complexity}
            </p>
            <p className="mt-1 text-sm">
              <span className="font-medium">Architecture:</span> {analysis.architecture}
            </p>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Recommended stack</h2>
            <p className="mt-1 text-sm text-slate-500">
              Adjust any selection before generating the package.
            </p>
            <div className="mt-4 space-y-3">
              {recommendations.map((rec) => (
                <div key={rec.category} className="flex items-center gap-3">
                  <span className="w-40 text-sm font-medium text-slate-700">
                    {rec.category}
                  </span>
                  <select
                    className={inputClass}
                    value={selections[rec.category] ?? rec.primary.id}
                    onChange={(e) =>
                      setSelections({ ...selections, [rec.category]: e.target.value })
                    }
                  >
                    {[rec.primary, ...rec.alternatives].map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} {t.freeTier ? "(free tier)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>

          <div className="flex gap-3">
            <button
              onClick={() => setStep("intake")}
              className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
            >
              Back
            </button>
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {loading ? "Generating..." : "Generate package (.zip)"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
