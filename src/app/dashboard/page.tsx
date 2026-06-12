"use client";

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
  const [packages, setPackages] = useState<SavedPackage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);

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
            </tr>
          </thead>
          <tbody>
            {packages.map((p) => (
              <tr key={p.id} className="border-b border-slate-100">
                <td className="py-2 font-medium">{p.project_name}</td>
                <td>v{p.package_version}</td>
                <td>v{p.project_spec_version}</td>
                <td>{new Date(p.generated_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
