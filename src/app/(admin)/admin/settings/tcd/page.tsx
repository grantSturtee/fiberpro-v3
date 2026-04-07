import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { TcdAddForm } from "@/components/admin/settings/TcdAddForm";
import { TcdDeactivateButton } from "@/components/admin/settings/TcdDeactivateButton";

export const metadata: Metadata = { title: "TCD Library" };

export default async function AdminTcdLibraryPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("tcd_library")
    .select("id, code, title, description, category, state, storage_path, sort_order, is_active")
    .order("sort_order")
    .order("code");

  const items = data ?? [];
  const active = items.filter((i) => i.is_active);
  const inactive = items.filter((i) => !i.is_active);

  // Group active items by category
  const byCategory: Record<string, typeof active> = {};
  for (const item of active) {
    const cat = item.category ?? "Uncategorized";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(item);
  }
  const categories = Object.keys(byCategory).sort();

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
        </p>
      </div>

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
                        <span className="text-sm font-semibold text-ink">{item.code}</span>
                        {item.title && (
                          <span className="text-sm text-dim">{item.title}</span>
                        )}
                        {item.state && (
                          <span className="text-[11px] text-muted bg-surface rounded px-1.5 py-0.5">
                            {item.state}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted mt-0.5">{item.description}</p>
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
          <p className="text-sm text-muted">No active TCD sheets. Add the first one below.</p>
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
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
