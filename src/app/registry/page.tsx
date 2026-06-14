"use client";

import { useEffect, useState } from "react";
import { TECHNOLOGIES } from "../../registry/technologies";
import type { Technology, Category } from "../../types";

const CATEGORIES: Category[] = [
  "framework", "authentication", "stateManagement", "database", "ai",
  "video", "storage", "email", "payments", "analytics", "monitoring",
  "hosting", "styling",
];

const REGISTRY_STORAGE_KEY = "contextforge_registry_admin";

export default function RegistryAdmin() {
  const [selectedCategory, setSelectedCategory] = useState<Category | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [registry, setRegistry] = useState<Technology[]>(TECHNOLOGIES);
  const [editing, setEditing] = useState<Technology | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(REGISTRY_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Technology[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        setRegistry(parsed);
      }
    } catch {
      // ignore invalid local storage contents
    }
  }, []);

  function persistRegistry(updated: Technology[]) {
    setRegistry(updated);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(REGISTRY_STORAGE_KEY, JSON.stringify(updated));
    }
  }

  function startEditing(tech: Technology) {
    setEditing(tech);
  }

  function updateEditingField(field: keyof Technology, value: unknown) {
    setEditing((current) => {
      if (!current) return current;
      return { ...current, [field]: value } as Technology;
    });
  }

  function saveEditing() {
    if (!editing) return;
    persistRegistry(registry.map((tech) => (tech.id === editing.id ? editing : tech)));
    setEditing(null);
  }

  const filtered = registry.filter((tech) => {
    const matchesCategory = selectedCategory === "all" || tech.category === selectedCategory;
    const matchesSearch =
      tech.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tech.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <main className="mx-auto max-w-6xl px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Technology Registry Admin</h1>
        <a href="/" className="text-sm font-medium text-indigo-600 hover:underline">
          Back to app
        </a>
      </div>

      <p className="mt-2 text-slate-600">
        View and manage the technology registry. Changes here affect suggestion resolution and skill generation.
      </p>

      {/* Filters */}
      <div className="mt-6 flex gap-4">
        <select
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value as Category | "all")}
        >
          <option value="all">All Categories</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search technologies..."
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Technology List */}
      <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((tech) => (
          <div key={tech.id} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-semibold">{tech.name}</h3>
                <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">{tech.category}</p>
              </div>
              <span className={`rounded px-2 py-1 text-xs font-medium ${tech.freeTier ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
                {tech.freeTier ? "Free Tier" : "Paid Only"}
              </span>
            </div>

            <p className="mt-3 text-sm text-slate-600">{tech.description}</p>

            <div className="mt-3 space-y-2 text-xs">
              <div><span className="font-medium">Pricing:</span> {tech.pricing}</div>
              <div><span className="font-medium">Priority:</span> {tech.priority}</div>
              <div><span className="font-medium">Platforms:</span> {tech.platforms.join(", ")}</div>
            </div>

            <div className="mt-4 flex gap-2">
              <a
                href={tech.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-indigo-300 px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
              >
                View Docs
              </a>
              <button
                onClick={() => startEditing(tech)}
                className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Edit
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {tech.pros.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-green-700">Pros:</p>
                  <ul className="mt-1 list-disc pl-4 text-xs text-slate-600">
                    {tech.pros.map((pro, i) => <li key={i}>{pro}</li>)}
                  </ul>
                </div>
              )}
              {tech.cons.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-700">Cons:</p>
                  <ul className="mt-1 list-disc pl-4 text-xs text-slate-600">
                    {tech.cons.map((con, i) => <li key={i}>{con}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="mt-12 text-center text-slate-500">
          No technologies match your filters.
        </div>
      )}

      {editing && (
        <dialog open className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Edit registry entry</h2>
                <p className="text-sm text-slate-500">Changes are persisted locally in browser storage for the admin demo.</p>
              </div>
              <button onClick={() => setEditing(null)} className="text-slate-500 hover:text-slate-900">Close</button>
            </div>
            <div className="mt-5 grid gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Name</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={editing.name}
                  onChange={(e) => updateEditingField("name", e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Category</label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={editing.category}
                  onChange={(e) => updateEditingField("category", e.target.value as Category)}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
                <textarea
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  value={editing.description}
                  onChange={(e) => updateEditingField("description", e.target.value)}
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Docs URL</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={editing.docsUrl}
                    onChange={(e) => updateEditingField("docsUrl", e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Pricing</label>
                  <input
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={editing.pricing}
                    onChange={(e) => updateEditingField("pricing", e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Pros</label>
                  <textarea
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={editing.pros.join("\n")}
                    onChange={(e) => updateEditingField("pros", e.target.value.split(/\n/).map((line) => line.trim()).filter(Boolean))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Cons</label>
                  <textarea
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    value={editing.cons.join("\n")}
                    onChange={(e) => updateEditingField("cons", e.target.value.split(/\n/).map((line) => line.trim()).filter(Boolean))}
                  />
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={editing.freeTier}
                    onChange={(e) => updateEditingField("freeTier", e.target.checked)}
                  />
                  Free tier supported
                </label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={saveEditing}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Save registry entry
              </button>
            </div>
          </div>
        </dialog>
      )}
    </main>
  );
}
