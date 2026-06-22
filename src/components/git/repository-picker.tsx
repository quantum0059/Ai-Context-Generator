"use client";

import { useState, useEffect, useCallback } from "react";

export interface PickedRepository {
  id: string;
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
  visibility: "public" | "private";
}

interface RepositoryPickerProps {
  provider: "github" | "gitlab";
  onSelect: (repo: PickedRepository) => void;
  onCancel: () => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
};

export function RepositoryPicker({
  provider,
  onSelect,
  onCancel,
}: RepositoryPickerProps) {
  const [repos, setRepos] = useState<PickedRepository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // Create-new state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newVisibility, setNewVisibility] = useState<"public" | "private">(
    "private",
  );
  const [creating, setCreating] = useState(false);

  const fetchRepos = useCallback(
    async (p: number, s: string) => {
      setLoading(true);
      setError(null);
      setNeedsReconnect(false);
      try {
        const params = new URLSearchParams({ page: String(p) });
        if (s.trim()) params.set("search", s.trim());
        const res = await fetch(
          `/api/git/${provider}/repositories?${params.toString()}`,
        );
        if (!res.ok) {
          const data = (await res.json()) as { error?: string; code?: string };
          if (res.status === 401 || data.code === "RECONNECT_REQUIRED") {
            setNeedsReconnect(true);
            setError(data.error ?? "Your connection has expired. Please reconnect.");
            return;
          }
          throw new Error(data.error ?? "Failed to load repositories.");
        }
        const data = (await res.json()) as {
          repositories: PickedRepository[];
        };
        setRepos(data.repositories);
        // GitHub/GitLab both return up to 30 per page; if we get exactly 30 there's likely more
        setHasMore(data.repositories.length >= 30);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load repositories.",
        );
      } finally {
        setLoading(false);
      }
    },
    [provider],
  );

  useEffect(() => {
    void fetchRepos(page, search);
  }, [fetchRepos, page, search]);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    setNeedsReconnect(false);
    try {
      const res = await fetch(`/api/git/${provider}/repositories`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          visibility: newVisibility,
          initializeReadme: true,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string; code?: string };
        if (res.status === 401 || data.code === "RECONNECT_REQUIRED") {
          setNeedsReconnect(true);
          setError(data.error ?? "Your connection has expired. Please reconnect.");
          return;
        }
        throw new Error(data.error ?? "Failed to create repository.");
      }
      const data = (await res.json()) as { repository: PickedRepository };
      onSelect(data.repository);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create repository.",
      );
    } finally {
      setCreating(false);
    }
  }

  const input =
    "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none";
  const btnSm =
    "rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50";
  const btnGhostSm =
    "rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100";

  return (
    <div className="space-y-3">
      {/* Search */}
      <input
        className={input}
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(1);
        }}
        placeholder="Search repositories..."
      />

      {/* Error / Reconnect */}
      {error && (
        <div className={`rounded-lg border p-2 text-xs ${
          needsReconnect
            ? "border-amber-300 bg-amber-50 text-amber-800"
            : "border-red-200 bg-red-50 text-red-600"
        }`}>
          <p>{error}</p>
          {needsReconnect && (
            <a
              href={`/api/git/${provider}/connect`}
              className="mt-1 inline-block font-semibold text-indigo-600 hover:underline"
            >
              Reconnect {PROVIDER_LABELS[provider] ?? provider} →
            </a>
          )}
        </div>
      )}

      {/* Repo list */}
      {loading ? (
        <p className="text-xs text-slate-400">Loading repositories...</p>
      ) : !needsReconnect ? (
        <>
          <ul className="max-h-48 space-y-1 overflow-y-auto">
            {repos.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => onSelect(r)}
                >
                  <span className="font-medium">{r.fullName}</span>
                  <span className="ml-2 text-xs text-slate-400">
                    {r.visibility} · {r.defaultBranch}
                  </span>
                </button>
              </li>
            ))}
            {repos.length === 0 && !error && (
              <li className="px-3 py-2 text-xs text-slate-400">
                No repositories found.
              </li>
            )}
          </ul>

          {/* Pagination */}
          <div className="flex items-center gap-2">
            {page > 1 && (
              <button
                type="button"
                className={btnGhostSm}
                onClick={() => setPage((p) => p - 1)}
              >
                ← Prev
              </button>
            )}
            {hasMore && (
              <button
                type="button"
                className={btnGhostSm}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </button>
            )}
          </div>
        </>
      ) : null}

      {/* Create new */}
      {!needsReconnect && (
        <div className="border-t border-slate-200 pt-3">
          {!showCreate ? (
            <button
              type="button"
              className="text-xs font-medium text-indigo-600 hover:underline"
              onClick={() => setShowCreate(true)}
            >
              + Create new repository
            </button>
          ) : (
            <div className="space-y-2">
              <input
                className={input}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Repository name"
              />
              <div className="flex items-center gap-3 text-xs">
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name={`vis-${provider}`}
                    checked={newVisibility === "private"}
                    onChange={() => setNewVisibility("private")}
                  />
                  Private
                </label>
                <label className="flex items-center gap-1">
                  <input
                    type="radio"
                    name={`vis-${provider}`}
                    checked={newVisibility === "public"}
                    onChange={() => setNewVisibility("public")}
                  />
                  Public
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className={btnSm}
                  disabled={creating || !newName.trim()}
                  onClick={handleCreate}
                >
                  {creating ? "Creating..." : "Create & Select"}
                </button>
                <button
                  type="button"
                  className={btnGhostSm}
                  onClick={() => setShowCreate(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bottom cancel */}
      <div className="flex justify-end">
        <button type="button" className={btnGhostSm} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

