"use client";

import JSZip from "jszip";
import { useState } from "react";
import type {
  DraftInput,
  PackageMeta,
  ProjectSpec,
  StackEntry,
  SuggestionCandidate,
} from "../types/projectspec";

const PLATFORMS = [
  { value: "web", label: "Web" },
  { value: "mobile-ios-android", label: "Mobile (iOS + Android)" },
  { value: "ios", label: "Mobile (iOS only)" },
  { value: "android", label: "Mobile (Android only)" },
  { value: "desktop", label: "Desktop" },
  { value: "browser-extension", label: "Browser Extension" },
  { value: "backend-only", label: "Backend-only" },
  { value: "cli", label: "CLI" },
];

const FEATURE_PRESETS = [
  "Authentication",
  "Onboarding",
  "Dashboard",
  "AI Chat",
  "Video Lessons",
  "Payments",
  "User Profiles",
  "Notifications",
];

type Mode = "own" | "suggest" | "none";

interface CategoryDecision {
  mode: Mode;
  ownValue: string;
  suggestions: SuggestionCandidate[] | null;
  suggestionsTier: "registry" | "community" | null;
  chosen: SuggestionCandidate | null;
  loading: boolean;
}

function split(value: string): string[] {
  return value.split(/[,\n]/).map((v) => v.trim()).filter(Boolean);
}

export default function Home() {
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Step 1
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [platform, setPlatform] = useState("web");
  // Step 2
  const [features, setFeatures] = useState<string[]>([]);
  const [otherFeatures, setOtherFeatures] = useState("");
  // Step 3
  const [categories, setCategories] = useState<string[]>([]);
  const [engine, setEngine] = useState<"claude" | "heuristic" | null>(null);
  const [decisions, setDecisions] = useState<Record<string, CategoryDecision>>({});
  // Step 4
  const [budget, setBudget] = useState("");
  const [avoid, setAvoid] = useState("");
  // Step 5
  const [designRefs, setDesignRefs] = useState("");
  // Step 6
  const [generated, setGenerated] = useState<{ count: number; meta: PackageMeta } | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [lastSpec, setLastSpec] = useState<ProjectSpec | null>(null);
  const [lastFiles, setLastFiles] = useState<Record<string, string> | null>(null);
  const [regenInfo, setRegenInfo] = useState<{ changed: number; removed: number } | null>(null);
  const [uploadedRefs, setUploadedRefs] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const allFeatures = () => [...features, ...split(otherFeatures)];

  const draft = (): DraftInput => ({
    projectName: name,
    description,
    platform,
    features: allFeatures(),
    constraints: { budget: budget || undefined, avoid: split(avoid) },
    designReferences: [...split(designRefs), ...uploadedRefs],
  });

  async function uploadImage(file: File) {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/contextforge/upload", { method: "POST", body: form });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed.");
      setUploadedRefs((u) => [...u, data.url as string]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function runDiscovery() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/contextforge/discover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft()),
      });
      if (!res.ok) throw new Error("Category discovery failed.");
      const data = (await res.json()) as {
        requiredCategories: string[];
        engine: "claude" | "heuristic";
      };
      setCategories(data.requiredCategories);
      setEngine(data.engine);
      setDecisions(
        Object.fromEntries(
          data.requiredCategories.map((c) => [
            c,
            { mode: "own" as Mode, ownValue: "", suggestions: null, suggestionsTier: null, chosen: null, loading: false },
          ]),
        ),
      );
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function updateDecision(category: string, patch: Partial<CategoryDecision>) {
    setDecisions((d) => ({ ...d, [category]: { ...d[category], ...patch } }));
  }

  async function fetchSuggestions(category: string) {
    updateDecision(category, { loading: true });
    setError(null);
    try {
      const res = await fetch("/api/contextforge/suggest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ category, draft: draft() }),
      });
      if (!res.ok) throw new Error(`Suggestions failed for ${category}.`);
      const data = (await res.json()) as {
        tier: "registry" | "community";
        candidates: SuggestionCandidate[];
      };
      updateDecision(category, {
        suggestions: data.candidates,
        suggestionsTier: data.tier,
        loading: false,
      });
    } catch (err) {
      updateDecision(category, { loading: false });
      setError(err instanceof Error ? err.message : "Something went wrong");
    }
  }

  function stackResolved(): boolean {
    return categories.every((c) => {
      const d = decisions[c];
      if (!d) return false;
      if (d.mode === "none") return true;
      if (d.mode === "own") return d.ownValue.trim().length > 0;
      return d.chosen !== null;
    });
  }

  function buildStack(): Record<string, StackEntry> {
    const stack: Record<string, StackEntry> = {};
    for (const c of categories) {
      const d = decisions[c];
      if (d.mode === "none") stack[c] = { value: null, source: "user" };
      else if (d.mode === "own") stack[c] = { value: d.ownValue.trim(), source: "user" };
      else if (d.chosen)
        stack[c] = { value: d.chosen.name, source: d.chosen.source, confidence: d.chosen.confidence };
    }
    return stack;
  }

  async function downloadZip(files: Record<string, string>) {
    const zip = new JSZip();
    for (const [path, content] of Object.entries(files)) {
      zip.file(`project-package/${path}`, content);
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-context-package.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function confirmAndGenerate() {
    setBusy(true);
    setError(null);
    setSaveMessage(null);
    setRegenInfo(null);
    try {
      if (lastSpec && lastFiles) {
        // Regeneration: only generators affected by the edit re-run.
        const editedSpec: ProjectSpec = {
          id: lastSpec.id,
          ...draft(),
          requiredCategories: categories,
          stack: buildStack(),
          projectSpecVersion: lastSpec.projectSpecVersion,
        };
        const res = await fetch("/api/contextforge/regenerate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ oldSpec: lastSpec, editedSpec, oldFiles: lastFiles }),
        });
        if (!res.ok) throw new Error("Regeneration failed.");
        const data = (await res.json()) as {
          spec: ProjectSpec;
          files: Record<string, string>;
          meta: PackageMeta;
          changed: string[];
          removed: string[];
        };
        await downloadZip(data.files);
        setGenerated({ count: Object.keys(data.files).length, meta: data.meta });
        setRegenInfo({ changed: data.changed.length, removed: data.removed.length });
        setLastSpec(data.spec);
        setLastFiles(data.files);
      } else {
        const spec: ProjectSpec = {
          id: crypto.randomUUID(),
          ...draft(),
          requiredCategories: categories,
          stack: buildStack(),
          projectSpecVersion: "1.0.0",
        };
        const res = await fetch("/api/contextforge/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(spec),
        });
        if (!res.ok) throw new Error("Package generation failed.");
        const data = (await res.json()) as { files: Record<string, string>; meta: PackageMeta };
        await downloadZip(data.files);
        setGenerated({ count: Object.keys(data.files).length, meta: data.meta });
        setLastSpec(spec);
        setLastFiles(data.files);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function saveToAccount() {
    if (!lastSpec || !generated) return;
    setSaveMessage(null);
    const res = await fetch("/api/contextforge/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ spec: lastSpec, meta: generated.meta }),
    });
    const data = (await res.json()) as { saved?: boolean; error?: string };
    setSaveMessage(data.saved ? "Saved to your account." : data.error ?? "Save failed.");
  }

  const input =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";
  const label = "mb-1 block text-sm font-medium text-slate-700";
  const btn =
    "rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50";
  const btnGhost =
    "rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100";
  const card = "rounded-xl border border-slate-200 bg-white p-5";

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">ContextForge</h1>
        <a href="/dashboard" className="text-sm font-medium text-indigo-600 hover:underline">
          Saved packages
        </a>
      </div>
      <p className="mt-2 text-slate-600">
        Generate a versioned AI context package - the persistent memory layer your AI
        coding assistants read so they stay architecturally consistent.
      </p>
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-400">
        Step {step} of 6
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {step === 1 && (
        <div className="mt-6 space-y-4">
          <div>
            <label className={label}>Project name *</label>
            <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="LingoQuest" />
          </div>
          <div>
            <label className={label}>Description *</label>
            <textarea rows={4} className={input} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A Duolingo-inspired language learning app with an AI chat tutor, video lessons and XP progression..." />
          </div>
          <div>
            <label className={label}>Platform</label>
            <select className={input} value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
          <button className={btn} disabled={!name.trim() || description.trim().length < 10} onClick={() => setStep(2)}>
            Next: Features
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="mt-6 space-y-4">
          <div className={card}>
            <p className="text-sm font-medium text-slate-700">Select features</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {FEATURE_PRESETS.map((f) => (
                <label key={f} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={features.includes(f)}
                    onChange={(e) =>
                      setFeatures(e.target.checked ? [...features, f] : features.filter((x) => x !== f))
                    }
                  />
                  {f}
                </label>
              ))}
            </div>
            <div className="mt-4">
              <label className={label}>Other features (comma separated)</label>
              <input className={input} value={otherFeatures} onChange={(e) => setOtherFeatures(e.target.value)} placeholder="XP progression, streak tracking" />
            </div>
          </div>
          <div className="flex gap-3">
            <button className={btnGhost} onClick={() => setStep(1)}>Back</button>
            <button className={btn} disabled={busy || allFeatures().length === 0} onClick={runDiscovery}>
              {busy ? "Discovering categories..." : "Next: Stack Decisions"}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-slate-500">
            Categories discovered {engine === "claude" ? "by Claude" : "heuristically (AI engine not configured)"}. Your choices are final and binding for everything generated.
          </p>
          {categories.map((category) => {
            const d = decisions[category];
            return (
              <div key={category} className={card}>
                <p className="font-semibold">{category}</p>
                <div className="mt-2 flex gap-4 text-sm">
                  {(["own", "suggest", "none"] as Mode[]).map((m) => (
                    <label key={m} className="flex items-center gap-1">
                      <input type="radio" name={`mode-${category}`} checked={d.mode === m} onChange={() => updateDecision(category, { mode: m, chosen: null })} />
                      {m === "own" ? "Type my own" : m === "suggest" ? "Suggest for me" : "Not needed"}
                    </label>
                  ))}
                </div>
                {d.mode === "own" && (
                  <input className={`${input} mt-3`} value={d.ownValue} onChange={(e) => updateDecision(category, { ownValue: e.target.value })} placeholder="Tool name (any tool, any version - it will be locked exactly as typed)" />
                )}
                {d.mode === "suggest" && (
                  <div className="mt-3 space-y-2">
                    {!d.suggestions && (
                      <button className={btnGhost} disabled={d.loading} onClick={() => fetchSuggestions(category)}>
                        {d.loading ? "Asking..." : "Get suggestions"}
                      </button>
                    )}
                    {d.suggestions?.map((c) => (
                      <label key={c.name} className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                        <input type="radio" name={`cand-${category}`} checked={d.chosen?.name === c.name} onChange={() => updateDecision(category, { chosen: c })} />
                        <span>
                          <span className="font-medium">{c.name}</span>
                          {c.source === "community" && (
                            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">Community Suggested{c.confidence === "low" ? " - low confidence" : ""}</span>
                          )}
                          <span className="block text-slate-600">{c.rationale}</span>
                          {c.pricing && <span className="block text-xs text-slate-400">{c.pricing}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          <div className="flex gap-3">
            <button className={btnGhost} onClick={() => setStep(2)}>Back</button>
            <button className={btn} disabled={!stackResolved()} onClick={() => setStep(4)}>Next: Constraints</button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="mt-6 space-y-4">
          <div>
            <label className={label}>Budget</label>
            <input className={input} value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Free tiers only / up to $50 per month / flexible" />
          </div>
          <div>
            <label className={label}>Avoid (comma separated)</label>
            <input className={input} value={avoid} onChange={(e) => setAvoid(e.target.value)} placeholder="Firebase, Redux" />
          </div>
          <div className="flex gap-3">
            <button className={btnGhost} onClick={() => setStep(3)}>Back</button>
            <button className={btn} onClick={() => setStep(5)}>Next: Design References</button>
          </div>
        </div>
      )}

      {step === 5 && (
        <div className="mt-6 space-y-4">
          <div>
            <label className={label}>Design references (URLs or a text description, comma/newline separated)</label>
            <textarea rows={4} className={input} value={designRefs} onChange={(e) => setDesignRefs(e.target.value)} placeholder="https://duolingo.com, playful rounded UI with bold colors" />
            <div className="mt-3">
              <label className={label}>Or upload reference images (requires Supabase)</label>
              <input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadImage(f);
                  e.target.value = "";
                }}
              />
              {uploading && <p className="mt-1 text-xs text-slate-400">Uploading...</p>}
              {uploadedRefs.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-xs text-slate-500">
                  {uploadedRefs.map((u) => (
                    <li key={u}>{u}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <button className={btnGhost} onClick={() => setStep(4)}>Back</button>
            <button className={btn} onClick={() => setStep(6)}>Next: Review &amp; Confirm</button>
          </div>
        </div>
      )}

      {step === 6 && (
        <div className="mt-6 space-y-4">
          <div className={card}>
            <h2 className="text-lg font-semibold">Draft ProjectSpec</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div><dt className="font-medium">Project</dt><dd>{name} ({platform})</dd></div>
              <div><dt className="font-medium">Description</dt><dd>{description}</dd></div>
              <div><dt className="font-medium">Features</dt><dd>{allFeatures().join(", ")}</dd></div>
              <div>
                <dt className="font-medium">Stack (will be LOCKED at v1.0.0)</dt>
                <dd>
                  <ul className="mt-1 list-disc pl-5">
                    {categories.map((c) => {
                      const d = decisions[c];
                      const text = d.mode === "none" ? "not needed" : d.mode === "own" ? `${d.ownValue} (user)` : `${d.chosen?.name} (${d.chosen?.source}${d.chosen?.confidence === "low" ? ", low confidence" : ""})`;
                      return <li key={c}><span className="font-medium">{c}:</span> {text}</li>;
                    })}
                  </ul>
                </dd>
              </div>
              {budget && <div><dt className="font-medium">Budget</dt><dd>{budget}</dd></div>}
              {split(avoid).length > 0 && <div><dt className="font-medium">Avoid</dt><dd>{split(avoid).join(", ")}</dd></div>}
              {split(designRefs).length > 0 && <div><dt className="font-medium">Design references</dt><dd>{split(designRefs).join(", ")}</dd></div>}
            </dl>
          </div>
          {generated && (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
              {regenInfo
                ? `Regenerated selectively: ${regenInfo.changed} files updated, ${regenInfo.removed} removed; unrelated files carried over unchanged.`
                : `Generated ${generated.count} files.`}{" "}
              (packageVersion {generated.meta.packageVersion}, projectSpecVersion {generated.meta.projectSpecVersion}). ZIP downloaded.
              <button className="ml-3 underline" onClick={saveToAccount}>Save to account</button>
              {saveMessage && <span className="ml-2">{saveMessage}</span>}
            </div>
          )}
          {lastSpec && (
            <p className="text-xs text-slate-500">
              Editing and confirming again runs <span className="font-medium">selective regeneration</span> - only generators affected by your change re-run, and versions bump automatically.
            </p>
          )}
          <div className="flex gap-3">
            <button className={btnGhost} onClick={() => setStep(5)}>Back</button>
            <button className={btn} disabled={busy} onClick={confirmAndGenerate}>
              {busy ? "Finalizing spec and generating..." : "Confirm, lock spec & generate package"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
