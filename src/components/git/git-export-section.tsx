"use client";

import { useState, useEffect, useCallback } from "react";
import {
  RepositoryPicker,
  type PickedRepository,
} from "./repository-picker";

type Provider = "github" | "gitlab";
type Phase = "idle" | "picking" | "confirming" | "pushing" | "done" | "error";

interface ProviderState {
  connected: boolean | null; // null = still loading
  phase: Phase;
  selectedRepo: PickedRepository | null;
  prUrl: string | null;
  error: string | null;
}

const INITIAL_STATE: ProviderState = {
  connected: null,
  phase: "idle",
  selectedRepo: null,
  prUrl: null,
  error: null,
};

interface GitExportSectionProps {
  /** specId from the last generated spec — must be saved to the account first */
  specId: string | null;
}

const PROVIDER_LABELS: Record<Provider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
};

const PROVIDER_ICONS: Record<Provider, string> = {
  github: "🐙",
  gitlab: "🦊",
};

export function GitExportSection({ specId }: GitExportSectionProps) {
  const [providers, setProviders] = useState<Record<Provider, ProviderState>>({
    github: { ...INITIAL_STATE },
    gitlab: { ...INITIAL_STATE },
  });

  // Inline success/error message from OAuth redirect query params
  const [oauthMessage, setOauthMessage] = useState<{
    provider: string;
    status: "success" | "error";
    reason?: string;
  } | null>(null);

  // --- Check connection status on mount ---
  const checkStatus = useCallback(async (p: Provider) => {
    try {
      const res = await fetch(`/api/git/${p}/status`);
      if (!res.ok) {
        setProviders((prev) => ({
          ...prev,
          [p]: { ...prev[p], connected: false },
        }));
        return;
      }
      const data = (await res.json()) as { connected?: boolean };
      setProviders((prev) => ({
        ...prev,
        [p]: { ...prev[p], connected: !!data.connected },
      }));
    } catch {
      setProviders((prev) => ({
        ...prev,
        [p]: { ...prev[p], connected: false },
      }));
    }
  }, []);

  useEffect(() => {
    void checkStatus("github");
    void checkStatus("gitlab");

    // Read OAuth redirect query params (git_connect=success|error&provider=github|gitlab&reason=...)
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const gitConnect = params.get("git_connect");
    const provider = params.get("provider");
    if (gitConnect && provider) {
      setOauthMessage({
        provider,
        status: gitConnect as "success" | "error",
        reason: params.get("reason") ?? undefined,
      });
      // Clear the query params from the URL without reload
      const url = new URL(window.location.href);
      url.searchParams.delete("git_connect");
      url.searchParams.delete("provider");
      url.searchParams.delete("reason");
      window.history.replaceState({}, "", url.pathname + url.search);

      // Re-check the provider status since we just got back from OAuth
      if (provider === "github" || provider === "gitlab") {
        void checkStatus(provider);
      }
    }
  }, [checkStatus]);

  function updateProvider(p: Provider, patch: Partial<ProviderState>) {
    setProviders((prev) => ({
      ...prev,
      [p]: { ...prev[p], ...patch },
    }));
  }

  async function handlePush(p: Provider) {
    const state = providers[p];
    if (!state.selectedRepo || !specId) return;

    updateProvider(p, { phase: "pushing", error: null });
    try {
      const res = await fetch(`/api/git/${p}/push`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          repositoryId: state.selectedRepo.id,
          repositoryName: state.selectedRepo.fullName,
          defaultBranch: state.selectedRepo.defaultBranch,
          specId,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Push failed.");
      }
      const data = (await res.json()) as { prUrl: string };
      updateProvider(p, { phase: "done", prUrl: data.prUrl });
    } catch (err) {
      updateProvider(p, {
        phase: "error",
        error: err instanceof Error ? err.message : "Push failed.",
      });
    }
  }

  // Style tokens matching page.tsx conventions
  const card =
    "rounded-xl border border-slate-200 bg-white p-5";
  const btnSm =
    "rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50";
  const btnGhostSm =
    "rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100";

  function renderProvider(p: Provider) {
    const state = providers[p];
    const label = PROVIDER_LABELS[p];
    const icon = PROVIDER_ICONS[p];

    // Still loading status
    if (state.connected === null) {
      return (
        <div key={p} className="flex items-center gap-2 text-xs text-slate-400">
          {icon} Checking {label} connection...
        </div>
      );
    }

    // Not connected — show connect link
    if (!state.connected) {
      return (
        <div key={p} className="flex items-center gap-3">
          <span className="text-sm text-slate-500">{icon} {label}</span>
          <a
            href={`/api/git/${p}/connect`}
            className="text-xs font-medium text-indigo-600 hover:underline"
          >
            Connect {label}
          </a>
        </div>
      );
    }

    // Connected — render based on phase
    return (
      <div key={p} className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-slate-700">
            {icon} {label}
          </span>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
            Connected
          </span>
          {state.phase === "idle" && (
            <button
              type="button"
              className={btnSm}
              disabled={!specId}
              onClick={() => updateProvider(p, { phase: "picking" })}
              title={!specId ? "Save to account first to enable push" : undefined}
            >
              Push to {label}
            </button>
          )}
        </div>

        {!specId && state.phase === "idle" && (
          <p className="text-xs text-amber-600">
            Save the package to your account first to push to {label}.
          </p>
        )}

        {/* Repository picker */}
        {state.phase === "picking" && (
          <div className={card}>
            <p className="mb-2 text-xs font-medium text-slate-600">
              Select a repository to push to:
            </p>
            <RepositoryPicker
              provider={p}
              onSelect={(repo) =>
                updateProvider(p, { phase: "confirming", selectedRepo: repo })
              }
              onCancel={() =>
                updateProvider(p, { phase: "idle", selectedRepo: null })
              }
            />
          </div>
        )}

        {/* Confirm step */}
        {state.phase === "confirming" && state.selectedRepo && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm">
              Push to{" "}
              <span className="font-semibold">
                {state.selectedRepo.fullName}
              </span>
            </p>
            <p className="text-xs text-slate-500">
              Branch: <code className="rounded bg-slate-200 px-1">contextforge/update-*</code>{" "}
              → <code className="rounded bg-slate-200 px-1">{state.selectedRepo.defaultBranch}</code>
            </p>
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className={btnSm}
                onClick={() => void handlePush(p)}
              >
                Push
              </button>
              <button
                type="button"
                className={btnGhostSm}
                onClick={() =>
                  updateProvider(p, { phase: "idle", selectedRepo: null })
                }
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Pushing */}
        {state.phase === "pushing" && (
          <p className="text-xs text-slate-500">
            Pushing to {state.selectedRepo?.fullName}...
          </p>
        )}

        {/* Done */}
        {state.phase === "done" && state.prUrl && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
            Push successful!{" "}
            <a
              href={state.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline"
            >
              View Pull Request →
            </a>
            <button
              type="button"
              className="ml-3 text-xs text-emerald-600 hover:underline"
              onClick={() =>
                updateProvider(p, {
                  phase: "idle",
                  selectedRepo: null,
                  prUrl: null,
                })
              }
            >
              Push another
            </button>
          </div>
        )}

        {/* Error */}
        {state.phase === "error" && state.error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {state.error}
            <button
              type="button"
              className="ml-3 text-xs underline"
              onClick={() =>
                updateProvider(p, { phase: "idle", error: null })
              }
            >
              Dismiss
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-sm font-semibold text-slate-700">
        Push to Git Provider
      </h3>
      <p className="text-xs text-slate-500">
        Push your context package directly to a GitHub or GitLab repository as a
        pull/merge request.
      </p>

      {/* OAuth redirect message */}
      {oauthMessage && (
        <div
          className={`rounded-lg border p-2 text-xs ${
            oauthMessage.status === "success"
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-red-300 bg-red-50 text-red-700"
          }`}
        >
          {oauthMessage.status === "success"
            ? `${PROVIDER_LABELS[oauthMessage.provider as Provider] ?? oauthMessage.provider} connected successfully!`
            : `Failed to connect ${PROVIDER_LABELS[oauthMessage.provider as Provider] ?? oauthMessage.provider}${oauthMessage.reason ? `: ${oauthMessage.reason}` : ""}.`}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setOauthMessage(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="space-y-4">
        {renderProvider("github")}
        {renderProvider("gitlab")}
      </div>
    </div>
  );
}
