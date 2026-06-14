"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface SavedPackage {
  id: string;
  spec_id: string;
  project_name: string;
  package_version: string;
  project_spec_version: string;
  generated_at: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [packages, setPackages] = useState<SavedPackage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [loadingPackage, setLoadingPackage] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/contextforge/packages");
      const data = (await res.json()) as { packages?: SavedPackage[]; error?: string };
      if (!res.ok) setError(data.error ?? "Could not load saved packages.");
      else setPackages(data.packages ?? []);
    })();
  }, []);

  async function upgrade() {
    setBillingMessage(null);
    const res = await fetch("/api/billing/checkout", { method: "POST" });
    const data = (await res.json()) as { url?: string; error?: string };
    if (res.ok && data.url) window.location.href = data.url;
    else setBillingMessage(data.error ?? "Checkout unavailable.");
  }

  async function loadPackage(packageId: string) {
    setLoadingPackage(packageId);
    setError(null);
    try {
      const res = await fetch(`/api/contextforge/packages/${packageId}`);
      const data = (await res.json()) as { package?: any; error?: string };
      if (!res.ok || !data.package) {
        setError(data.error ?? "Failed to load package.");
        return;
      }
      // Store package data in sessionStorage for the wizard to load
      sessionStorage.setItem("contextforge_load_package", JSON.stringify(data.package));
      router.push("/?mode=regenerate");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load package");
    } finally {
      setLoadingPackage(null);
    }
  }

  async function deletePackage(packageId: string) {
    if (!confirm("Are you sure you want to delete this package?")) return;
    setError(null);
    try {
      const res = await fetch(`/api/contextforge/packages/${packageId}`, { method: "DELETE" });
      const data = (await res.json()) as { deleted?: boolean; error?: string };
      if (!res.ok || !data.deleted) {
        setError(data.error ?? "Failed to delete package.");
        return;
      }
      setPackages((prev: SavedPackage[] | null) => (prev ? prev.filter((p: SavedPackage) => p.id !== packageId) : null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete package");
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Saved packages</h1>
        <a href="/" className="text-sm font-medium text-indigo-600 hover:underline">
          New package
        </a>
      </div>

      <div className="mt-4">
        <button
          onClick={upgrade}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          Upgrade to Pro (Stripe)
        </button>
        {billingMessage && <p className="mt-2 text-sm text-slate-500">{billingMessage}</p>}
      </div>

      {error && (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      {packages && packages.length === 0 && (
        <p className="mt-6 text-sm text-slate-500">No saved packages yet. Generate one and click \"Save to account\".</p>
      )}

      {packages && packages.length > 0 && (
        <table className="mt-6 w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className="py-2">Project</th>
              <th>Package</th>
              <th>Spec</th>
              <th>Generated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((p) => (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="py-2 font-medium">{p.project_name}</td>
                <td>v{p.package_version}</td>
                <td>v{p.project_spec_version}</td>
                <td>{new Date(p.generated_at).toLocaleString()}</td>
                <td className="py-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => loadPackage(p.id)}
                      disabled={loadingPackage === p.id}
                      className="rounded border border-indigo-300 px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                    >
                      {loadingPackage === p.id ? "Loading..." : "Load & Edit"}
                    </button>
                    <button
                      onClick={() => deletePackage(p.id)}
                      className="rounded border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
