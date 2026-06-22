"use client";

import { useState } from "react";
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
} from "@/types/projectspec";

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
  const router = useRouter();

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
          confidence: "high",
        };
      }
    }
    return stack;
  };

  const draftSpec = (): ProjectSpec => {
    const isMobile = state.stack["frontend-framework"]?.value?.includes("Expo");
    return {
      id: lastSpec?.id || crypto.randomUUID(),
      projectName: state.projectName,
      description: state.description,
      platform: isMobile ? "mobile-ios-android" : "web",
      features: state.features,
      requiredCategories: categories,
      stack: buildStack(),
      constraints: {
        budget: state.budget || undefined,
        avoid: split(state.avoid),
      },
      designReferences: split(state.designReferences),
      projectSpecVersion: "1.0.0",
    };
  };



  async function confirmAndGenerate() {
    setBusy(true);
    setError(null);
    setSaveMessage(null);
    try {
      const spec = draftSpec();
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
      if (spec.id) {
        sessionStorage.setItem("contextforge_generated_spec_id", spec.id);
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
    try {
      const res = await fetch("/api/contextforge/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spec: lastSpec, meta: generated.meta }),
      });
      const data = (await res.json()) as { saved?: boolean; error?: string };
      setSaveMessage(data.saved ? "Saved to your account." : data.error ?? "Save failed.");
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
            <div className="flex justify-center">
              <Button
                disabled={busy || !isConfigured}
                onClick={confirmAndGenerate}
                className="h-11 rounded-lg bg-white px-8 font-semibold text-[#0A0A0A] hover:bg-white/90 disabled:opacity-50"
              >
                {busy ? "Generating Context Package..." : "Confirm, Lock Spec & Generate"}
              </Button>
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
          continueHref="/"
          continueDisabled={!isConfigured || busy}
        />
      )}
    </div>
  );
}
