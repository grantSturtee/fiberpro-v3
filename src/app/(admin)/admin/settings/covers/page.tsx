import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { CoverAddForm } from "@/components/admin/settings/CoverAddForm";
import { CoverDeactivateButton } from "@/components/admin/settings/CoverDeactivateButton";

export const metadata: Metadata = { title: "Cover Sheet Templates" };

const AUTHORITY_LABELS: Record<string, string> = {
  county: "County",
  njdot: "NJDOT",
  municipal: "Municipal",
  other: "Other",
};

export default async function AdminCoverTemplatesPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("cover_sheet_templates")
    .select("id, name, authority_type, county, state, work_type, notes, storage_path, is_default, is_active, sort_order")
    .order("sort_order")
    .order("name");

  const items = data ?? [];
  const active = items.filter((i) => i.is_active);
  const inactive = items.filter((i) => !i.is_active);

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted mb-2">
          <Link href="/admin/settings" className="hover:text-primary transition-colors">Settings</Link>
          <span>/</span>
          <span className="text-ink">Cover Sheet Templates</span>
        </div>
        <h1 className="text-xl font-semibold text-ink">Cover Sheet Templates</h1>
        <p className="mt-0.5 text-sm text-muted">
          {active.length} active template{active.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Active list */}
      {active.length > 0 ? (
        <SectionCard noPad>
          <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 px-5 py-2 bg-canvas">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Name</span>
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Authority</span>
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">File</span>
            <span />
          </div>
          <div className="divide-y divide-surface">
            {active.map((item) => (
              <div key={item.id} className="grid grid-cols-[2fr_1fr_1fr_auto] gap-4 px-5 py-3.5 items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink truncate">{item.name}</span>
                    {item.is_default && (
                      <span className="text-[10px] font-semibold bg-primary-soft text-primary rounded px-1.5 py-0.5">
                        Default
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.county && <span className="text-xs text-muted">{item.county} County</span>}
                    {item.state && <span className="text-xs text-muted">{item.state}</span>}
                    {item.work_type && <span className="text-xs text-muted">{item.work_type}</span>}
                  </div>
                </div>
                <span className="text-sm text-dim">
                  {item.authority_type ? AUTHORITY_LABELS[item.authority_type] ?? item.authority_type : "—"}
                </span>
                <span className="text-xs">
                  {item.storage_path
                    ? <span className="text-green-600 font-medium">PDF ✓</span>
                    : <span className="text-faint">No file</span>
                  }
                </span>
                <div className="flex items-center gap-3">
                  <Link
                    href={`/admin/settings/covers/${item.id}/edit`}
                    className="text-xs text-primary hover:underline"
                  >
                    Edit
                  </Link>
                  <CoverDeactivateButton itemId={item.id} name={item.name} />
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : (
        <div
          className="bg-card rounded-xl px-6 py-12 text-center"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          <p className="text-sm text-muted">No templates yet. Add one below.</p>
        </div>
      )}

      {/* Add new */}
      <SectionCard title="Add Cover Sheet Template">
        <CoverAddForm />
      </SectionCard>

      {inactive.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-muted hover:text-dim transition-colors select-none">
            {inactive.length} deactivated template{inactive.length !== 1 ? "s" : ""}
          </summary>
          <div className="mt-3 bg-card rounded-xl overflow-hidden" style={{ boxShadow: "0 1px 8px rgba(43,52,55,0.04)" }}>
            {inactive.map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-5 py-3 border-b border-surface last:border-0 opacity-50">
                <span className="text-sm text-muted truncate">{item.name}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
