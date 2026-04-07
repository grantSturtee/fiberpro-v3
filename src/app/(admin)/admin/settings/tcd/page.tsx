import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { TcdAddForm } from "@/components/admin/settings/TcdAddForm";
import { TcdDeactivateButton } from "@/components/admin/settings/TcdDeactivateButton";

export const metadata: Metadata = { title: "TCD Library" };

const TCD_CATEGORIES = ["shoulder", "lane", "highway", "ramp", "intersection", "other"] as const;

type PageProps = {
  searchParams: Promise<{ state?: string; category?: string }>;
};

export default async function AdminTcdLibraryPage({ searchParams }: PageProps) {
  const { state: filterState, category: filterCategory } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("tcd_library")
    .select("id, code, description, category, state, storage_path, is_active")
    .order("code");

  if (filterState) query = query.eq("state", filterState);
  if (filterCategory) query = query.eq("category", filterCategory);

  const { data } = await query;
  const items = data ?? [];
  const active = items.filter((i) => i.is_active);
  const inactive = items.filter((i) => !i.is_active);

  // Group active items by category for display
  const byCategory: Record<string, typeof active> = {};
  for (const item of active) {
    const cat = item.category ?? "Uncategorized";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }
  const categories = Object.keys(byCategory).sort();

  const hasFilter = !!filterState || !!filterCategory;

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <div>
        <div className="flex items-center gap-2 text-xs text-muted mb-2">
          <Link href="/admin/settings" className="hover:text-primary transition-colors">Settings</Link>
          <span>/</span>
          <span className="text-ink">TCD Library</span>
        </div>
        <h1 className="text-xl font-semibold text-ink">TCD Sheet Library</h1>
        <p className="mt-0.5 text-sm text-muted">
          {active.length} active sheet{active.length !== 1 ? "s" : ""}
          {hasFilter && " (filtered)"}
        </p>
      </div>

      {/* Filters */}
      <form method="GET" className="flex items-center gap-3 flex-wrap">
        <select
          name="state"
          defaultValue={filterState ?? ""}
          className="bg-surface rounded-lg px-3 py-2 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20 cursor-pointer"
          style={{ border: "1px solid #d4dde4" }}
        >
          <option value="">All States</option>
          {/* Common states for NJ-focused operation + catch-all */}
          {["NJ", "NY", "PA", "CT", "DE", "MD", "MA"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          name="category"
          defaultValue={filterCategory ?? ""}
          className="bg-surface rounded-lg px-3 py-2 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20 cursor-pointer"
          style={{ border: "1px solid #d4dde4" }}
        >
          <option value="">All Categories</option>
          {TCD_CATEGORIES.map((c) => (
            <option key={c} value={c} className="capitalize">{c}</option>
          ))}
        </select>
        <button
          type="submit"
          className="px-3 py-2 rounded-lg text-sm font-medium bg-surface text-dim hover:text-ink transition-colors"
          style={{ border: "1px solid #d4dde4" }}
        >
          Filter
        </button>
        {hasFilter && (
          <Link
            href="/admin/settings/tcd"
            className="text-xs text-muted hover:text-dim transition-colors"
          >
            Clear
          </Link>
        )}
      </form>

      {/* Active items */}
      {active.length > 0 && (
        <SectionCard noPad>
          {categories.map((cat, catIdx) => (
            <div key={cat}>
              <div className={`px-5 py-2 bg-canvas ${catIdx > 0 ? "mt-1" : ""}`}>
                <p className="text-[11px] font-semibold text-muted uppercase tracking-wider capitalize">
                  {cat}
                </p>
              </div>
              <div className="divide-y divide-surface">
                {byCategory[cat].map((item) => (
                  <div key={item.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-ink font-mono">{item.code}</span>
                        {item.state && (
                          <span className="text-[10px] font-medium text-muted bg-surface rounded px-1.5 py-0.5 border border-rule">
                            {item.state}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted mt-0.5 leading-relaxed">{item.description}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {item.storage_path ? (
                        <span className="text-xs text-green-600 font-medium">PDF ✓</span>
                      ) : (
                        <span className="text-xs text-faint">No PDF</span>
                      )}
                      <Link
                        href={`/admin/settings/tcd/${item.id}/edit`}
                        className="text-xs text-primary hover:underline"
                      >
                        Edit
                      </Link>
                      <TcdDeactivateButton itemId={item.id} code={item.code} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </SectionCard>
      )}

      {active.length === 0 && (
        <div
          className="bg-card rounded-xl px-6 py-12 text-center"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          <p className="text-sm text-muted">
            {hasFilter ? "No sheets match the current filter." : "No active TCD sheets. Add the first one below."}
          </p>
          {hasFilter && (
            <Link href="/admin/settings/tcd" className="mt-2 inline-block text-xs text-primary hover:underline">
              Clear filters
            </Link>
          )}
        </div>
      )}

      {/* Add new */}
      <SectionCard title="Add TCD Sheet">
        <TcdAddForm />
      </SectionCard>

      {/* Inactive (collapsed) */}
      {inactive.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs text-muted hover:text-dim transition-colors select-none">
            {inactive.length} deactivated sheet{inactive.length !== 1 ? "s" : ""} (hidden from production)
          </summary>
          <div
            className="mt-3 bg-card rounded-xl overflow-hidden"
            style={{ boxShadow: "0 1px 8px rgba(43,52,55,0.04)" }}
          >
            {inactive.map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-5 py-3 border-b border-surface last:border-0 opacity-50">
                <span className="text-sm font-mono text-muted">{item.code}</span>
                <span className="text-xs text-muted flex-1 truncate">{item.description}</span>
                {item.state && <span className="text-xs text-faint">{item.state}</span>}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
