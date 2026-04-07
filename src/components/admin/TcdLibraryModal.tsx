"use client";

import { useState, useTransition } from "react";
import { addTCDsToProject, type AdminActionState } from "@/app/(admin)/admin/projects/[id]/actions";

export type TcdLibraryItem = {
  id: string;
  code: string;
  description: string;
  category: string | null;
  state: string | null;
};

type Props = {
  projectId: string;
  projectState: string | null;
  library: TcdLibraryItem[];
  selectedIds: Set<string>; // tcd_library item IDs already on this project
};

export function TcdLibraryModal({ projectId, projectState, library, selectedIds }: Props) {
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const categories = ["all", ...Array.from(new Set(library.map((t) => t.category).filter((c): c is string => Boolean(c))))];

  const visible = library.filter((t) => {
    if (selectedIds.has(t.id)) return false; // already added
    if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
    return true;
  });

  function toggle(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleOpen() {
    setChecked(new Set());
    setError(null);
    setCategoryFilter("all");
    setOpen(true);
  }

  function handleSave() {
    if (checked.size === 0) {
      setError("Select at least one TCD sheet.");
      return;
    }
    setError(null);

    const formData = new FormData();
    formData.set("project_id", projectId);
    formData.set("tcd_ids", JSON.stringify(Array.from(checked)));

    startTransition(async () => {
      const result: AdminActionState = await addTCDsToProject({ error: null }, formData);
      if (result.error) {
        setError(result.error);
      } else {
        setOpen(false);
        setChecked(new Set());
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="text-xs font-medium text-primary hover:underline"
      >
        + Select from Library
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.35)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            className="bg-card rounded-xl shadow-2xl w-full max-w-lg mx-4 flex flex-col"
            style={{ maxHeight: "80vh" }}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-surface">
              <div>
                <h2 className="text-sm font-semibold text-ink">TCD Library</h2>
                {projectState && (
                  <p className="text-xs text-muted mt-0.5">
                    Showing sheets for {projectState} + universal
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted hover:text-ink text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Category filter */}
            {categories.length > 2 && (
              <div className="flex gap-2 px-5 pt-3 flex-wrap">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`text-xs px-2.5 py-1 rounded-md border transition-colors capitalize ${
                      categoryFilter === cat
                        ? "bg-ink text-white border-ink"
                        : "border-surface text-dim hover:border-muted"
                    }`}
                  >
                    {cat === "all" ? "All" : cat}
                  </button>
                ))}
              </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
              {visible.length === 0 ? (
                <p className="text-sm text-muted py-4 text-center">
                  {library.filter((t) => !selectedIds.has(t.id)).length === 0
                    ? "All library items are already added to this project."
                    : "No TCD sheets match this filter."}
                </p>
              ) : (
                visible.map((tcd) => (
                  <label
                    key={tcd.id}
                    className={`flex items-start gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                      checked.has(tcd.id) ? "bg-primary/8 border border-primary/20" : "hover:bg-surface border border-transparent"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 flex-shrink-0 accent-primary"
                      checked={checked.has(tcd.id)}
                      onChange={() => toggle(tcd.id)}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-ink">{tcd.code}</span>
                        {tcd.category && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface text-muted capitalize">
                            {tcd.category}
                          </span>
                        )}
                        {tcd.state && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                            {tcd.state}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-dim mt-0.5">{tcd.description}</p>
                    </div>
                  </label>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-surface flex items-center justify-between gap-3">
              <div>
                {error && <p className="text-xs text-red-600">{error}</p>}
                {checked.size > 0 && !error && (
                  <p className="text-xs text-muted">{checked.size} selected</p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 text-sm text-dim rounded-lg border border-surface hover:border-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isPending || checked.size === 0}
                  className="px-4 py-1.5 text-sm font-medium text-white rounded-lg disabled:opacity-50 transition-opacity"
                  style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
                >
                  {isPending ? "Adding…" : `Add ${checked.size > 0 ? `${checked.size} ` : ""}Selected`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
