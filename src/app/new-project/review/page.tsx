"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import JSZip from "jszip";

import { useWizard } from "../wizard-context";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { WizardBreadcrumb } from "@/components/wizard/breadcrumb";
import { StepIndicator } from "@/components/wizard/step-indicator";
import { WizardBottomNav } from "@/components/wizard/wizard-bottom-nav";
import { GitExportSection } from "@/components/git/git-export-section";
import type {
  PackageMeta,
  ProjectSpec,
  StackEntry,
  ConflictItem,
} from "@/types/projectspec";
import { detectStackConflicts } from "@/contextforge/conflict-detector";
import { inferPlatform } from "@/lib/inferPlatform";

function split(value: string): string[] {
  return value.split(/[,\n]/).map((v) => v.trim()).filter(Boolean);
}

export default function ReviewPage() {
  const { state, resetWizard } = useWizard();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<{ count: number; meta: PackageMeta } | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [lastSpec, setLastSpec] = useState<ProjectSpec | null>(null);
  const [lastFiles, setLastFiles] = useState<Record<string, string> | null>(null);
  const [blockingConflicts, setBlockingConflicts] = useState<ConflictItem[]>([]);
  const [warnings, setWarnings] = useState<ConflictItem[]>([]);
  const [bypassedConflicts, setBypassedConflicts] = useState(false);
  const [dismissedWarnings, setDismissedWarnings] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const savedFilesStr = sessionStorage.getItem("contextforge_generated_files");
    const savedSpecStr = sessionStorage.getItem("contextforge_generated_spec");
    const savedMetaStr = sessionStorage.getItem("contextforge_generated_meta");
    if (savedFilesStr && savedSpecStr && savedMetaStr) {
      try {
        const files = JSON.parse(savedFilesStr);
        const spec = JSON.parse(savedSpecStr);
        const meta = JSON.parse(savedMetaStr);
        setGenerated({ count: Object.keys(files).length, meta });
        setLastFiles(files);
        setLastSpec(spec);
      } catch (e) {
        console.error("Failed to restore generated files from session", e);
      }
    }
  }, []);

  const categories = Object.keys(state.stack);

  const buildStack = (): Record<string, StackEntry> => {
    const stack: Record<string, StackEntry> = {};
    for (const c of categories) {
      const d = state.stack[c];
      if (!d || d.skipped) {
        stack[c] = { value: null, source: "user" };
      } else {
        stack[c] = {
          value: d.value,
          source: d.source || "user",
          confidence: d.confidence ?? "high",
        };
      }
    }
    return stack;
  };

  const draftSpec = (): ProjectSpec => {
    const inferredPlatform = inferPlatform(state.description);
    const platform = state.stack.frontendFramework?.value?.includes("Expo")
      ? "mobile-ios-android"
      : inferredPlatform;
    return {
      id: lastSpec?.id || crypto.randomUUID(),
      projectName: state.projectName,
      description: state.description,
      platform,
      features: state.features,
      requiredCategories: categories,
      stack: buildStack(),
      constraints: {
        budget: state.budget || undefined,
        avoid: split(state.avoid),
      },
      designReferences: Array.from(new Set([
        ...split(state.designReferences),
        ...state.designReferenceImages,
      ])),
      projectSpecVersion: "1.0.0",
      projectType: state.projectType,
      classificationReason: state.classificationReason,
    };
  };



  async function confirmAndGenerate(override = false) {
    if (override) setBypassedConflicts(true);
    setBusy(true);
    setError(null);
    setSaveMessage(null);
    try {
      const spec = draftSpec();

      if (!bypassedConflicts && !override) {
        setBlockingConflicts([]);
        setWarnings([]);
        const report = await detectStackConflicts(spec);
        
        if (report.hasWarnings) {
          setWarnings(report.warnings);
        }
        
        if (report.hasBlockingConflicts) {
          setBlockingConflicts(report.conflicts);
          setBusy(false);
          return;
        }
      }

      const res = await fetch("/api/contextforge/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(spec),
      });
      if (!res.ok) throw new Error("Package generation failed.");
      const data = (await res.json()) as { files: Record<string, string>; meta: PackageMeta };
      const zip = new JSZip();
      for (const [path, content] of Object.entries(data.files)) {
        zip.file(`project-package/${path}`, content);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${state.projectName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-context-package.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setGenerated({ count: Object.keys(data.files).length, meta: data.meta });
      setLastSpec(spec);
      setLastFiles(data.files);
      sessionStorage.setItem("contextforge_generated_files", JSON.stringify(data.files));
      sessionStorage.setItem("contextforge_generated_spec", JSON.stringify(spec));
      sessionStorage.setItem("contextforge_generated_meta", JSON.stringify(data.meta));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function saveToAccount() {
    if (!lastSpec || !generated) return;
    setSaveMessage(null);
    try {
      const res = await fetch("/api/contextforge/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec: lastSpec, meta: generated.meta }),
      });
      const data = (await res.json()) as { saved?: boolean; error?: any };
      let errMsg = "Save failed.";
      if (typeof data.error === "string") errMsg = data.error;
      else if (data.error && typeof data.error === "object") errMsg = JSON.stringify(data.error);
      setSaveMessage(data.saved ? "Saved to your account." : errMsg);
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : "Save failed.");
    }
  }

  const isConfigured = state.projectName.trim().length > 0;

  return (
    <div className="min-h-screen bg-[#0A0A0A] pb-32 text-white">
      <WizardBreadcrumb />
      <StepIndicator currentStep={6} />

      <main className="mx-auto max-w-[680px] px-4 py-10">
        <div className="text-center">
          <h1 className="text-[28px] font-bold text-white">Review &amp; Confirm</h1>
          <p className="mx-auto mt-3 max-w-[480px] text-sm text-[#888]">
            Review your project configuration before generating the context package.
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-red-900 bg-red-950/50 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div className="mt-8 space-y-6">
          {/* Summary Card */}
          <div className="rounded-xl border border-white/[0.08] bg-[#111111] p-6 text-sm">
            <h2 className="text-base font-semibold text-white mb-4">Project Summary</h2>
            <dl className="space-y-4">
              <div>
                <dt className="text-[#666] font-medium">Project Name</dt>
                <dd className="mt-1 text-white font-medium text-base">
                  {state.projectName || <span className="text-[#444] italic">Not set</span>}
                </dd>
              </div>

              <div>
                <dt className="text-[#666] font-medium">Description</dt>
                <dd className="mt-1 text-[#aaa] leading-relaxed">
                  {state.description || <span className="text-[#444] italic">Not set</span>}
                </dd>
              </div>

              <div>
                <dt className="text-[#666] font-medium">Features</dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {state.features.length > 0 ? (
                    state.features.map((f) => (
                      <span key={f} className="rounded bg-white/5 px-2 py-0.5 text-xs text-[#ccc] border border-white/[0.04]">
                        {f}
                      </span>
                    ))
                  ) : (
                    <span className="text-[#444] italic">None selected</span>
                  )}
                </dd>
              </div>

              <div>
                <dt className="text-[#666] font-medium">Tech Stack</dt>
                <dd className="mt-1.5 space-y-1.5">
                  {Object.entries(state.stack).map(([key, value]) => {
                    const label = key.replace("-", " ").replace(/\b\w/g, (c) => c.toUpperCase());
                    return (
                      <div key={key} className="flex justify-between text-xs py-1 border-b border-white/[0.04]">
                        <span className="text-[#888]">{label}</span>
                        <span className={value.skipped ? "text-[#555] italic" : "text-white font-medium"}>
                          {value.skipped ? "Skipped" : value.value}
                        </span>
                      </div>
                    );
                  })}
                </dd>
              </div>

              {(state.budget || state.avoid) && (
                <div>
                  <dt className="text-[#666] font-medium">Constraints</dt>
                  <dd className="mt-1 space-y-1 text-xs">
                    {state.budget && (
                      <div>
                        <span className="text-[#888]">Budget: </span>
                        <span className="text-[#ccc]">{state.budget}</span>
                      </div>
                    )}
                    {state.avoid && (
                      <div>
                        <span className="text-[#888]">Avoid: </span>
                        <span className="text-[#ccc]">{state.avoid}</span>
                      </div>
                    )}
                  </dd>
                </div>
              )}

              {state.designReferences && (
                <div>
                  <dt className="text-[#666] font-medium">Design References</dt>
                  <dd className="mt-1 text-xs text-[#ccc] whitespace-pre-wrap leading-relaxed">
                    {state.designReferences}
                  </dd>
                </div>
              )}
              {state.designReferenceImages.length > 0 && (
                <div>
                  <dt className="text-[#666] font-medium">Reference Images</dt>
                  <dd className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                    {state.designReferenceImages.map((url, index) => (
                      <img
                        key={url}
                        src={url}
                        alt={`Design reference ${index + 1}`}
                        className="aspect-square w-full rounded-md border border-white/[0.08] object-cover"
                      />
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Success Box */}
          {generated && (
            <div className="rounded-xl border border-emerald-900 bg-emerald-950/20 p-5 text-sm">
              <p className="text-emerald-400 font-semibold mb-1">
                🎉 Generation Successful!
              </p>
              <p className="text-[#aaa] text-xs">
                Generated {generated.count} files (packageVersion {generated.meta.packageVersion}). 
                Your ZIP file has been compiled and downloaded automatically.
              </p>
              <div className="mt-4 flex items-center gap-3">
                <Button
                  onClick={saveToAccount}
                  className="h-8 rounded bg-emerald-600 px-4 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Save to Account
                </Button>
                {saveMessage && (
                  <span className="text-emerald-500 text-xs font-medium">
                    {saveMessage}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Action Trigger */}
          {!generated && (
            <div className="space-y-4">
              {warnings.length > 0 && !dismissedWarnings && (
                <div className="rounded-lg border border-yellow-900 bg-yellow-950/30 p-4 text-sm">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-yellow-500 font-semibold">⚠️ Stack Warnings</p>
                    <button onClick={() => setDismissedWarnings(true)} className="text-[#888] hover:text-white text-xs">Dismiss</button>
                  </div>
                  <ul className="space-y-2">
                    {warnings.map((w, i) => (
                      <li key={i} className="text-[#ccc] text-xs">
                        <strong className="text-white">{w.offendingTool}:</strong> {w.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {blockingConflicts.length > 0 ? (
                <div className="rounded-lg border border-red-900 bg-red-950/30 p-4 text-sm">
                  <p className="text-red-500 font-bold mb-3">⛔ Generation Blocked: Stack Conflicts Detected</p>
                  <ul className="space-y-4 mb-4">
                    {blockingConflicts.map((c, i) => (
                      <li key={i} className="text-[#ccc] text-xs bg-red-950/50 p-3 rounded">
                        <div className="font-semibold text-white mb-1">⛔ {c.offendingTool}: {c.description}</div>
                        <div className="mb-1 text-[#aaa]">Required by: <span className="italic text-[#888]">'{c.conflictingRequirement}'</span></div>
                        <div className="text-red-400">Fix: Replace with {c.suggestion}</div>
                      </li>
                    ))}
                  </ul>
                  <div className="flex flex-col gap-3">
                    <Button
                      onClick={() => router.push("/new-project/stack")}
                      className="w-full h-10 rounded bg-red-600 font-semibold text-white hover:bg-red-700"
                    >
                      Fix Stack
                    </Button>
                    <Button
                      onClick={() => confirmAndGenerate(true)}
                      className="w-full h-10 rounded border border-red-900/50 bg-transparent font-semibold text-[#888] hover:text-white hover:bg-white/5"
                    >
                      Generate Anyway
                    </Button>
                    <p className="text-center text-[10px] text-[#666]">
                      You are generating despite conflicts. The output may not match your requirements.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex justify-center">
                  <Button
                    disabled={busy || !isConfigured}
                    onClick={() => confirmAndGenerate(false)}
                    className="h-11 rounded-lg bg-white px-8 font-semibold text-[#0A0A0A] hover:bg-white/90 disabled:opacity-50"
                  >
                    {busy ? "Generating Context Package..." : "Confirm, Lock Spec & Generate"}
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Git Export Block */}
          {generated && (
            <div className="mt-6 text-slate-800">
              <GitExportSection specId={lastSpec?.id ?? null} />
            </div>
          )}
        </div>
      </main>

      {!generated && (
        <WizardBottomNav
          backHref="/new-project/design"
          onContinue={() => confirmAndGenerate(false)}
          continueLabel={busy ? "Generating..." : "Generate Package"}
          continueDisabled={!isConfigured || busy || blockingConflicts.length > 0}
        />
      )}
    </div>
  );
}
