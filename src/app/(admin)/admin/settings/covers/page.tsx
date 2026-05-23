import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { SettingsBackButton } from "@/components/ui/SettingsBackButton";
import { CoverAddForm } from "@/components/admin/settings/CoverAddForm";
import { CoverDeactivateButton, CoverActivateButton } from "@/components/admin/settings/CoverDeactivateButton";

export const metadata: Metadata = { title: "Cover Sheet Templates" };

const AUTHORITY_LABELS: Record<string, string> = {
  state:    "State",
  county:   "County",
  township: "Township",
};

const WORK_TYPE_LABELS: Record<string, string> = {
  aerial:      "Aerial",
  underground: "Underground",
  both:        "Aerial & UG",
};

type CoverItem = {
  id: string;
  name: string;
  authority_type: string | null;
  county: string | null;
  state: string | null;
  work_type: string | null;
  notes: string | null;
  storage_path: string | null;
  pe_required: boolean;
  is_active: boolean;
};

function CriteriaBadges({ item }: { item: CoverItem }) {
  const hasAny = item.authority_type || item.state || item.county || item.work_type || item.pe_required;
  if (!hasAny) {
    return <span className="text-xs text-faint italic">Matches all projects</span>;
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {item.authority_type && (
        <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-blue-50 text-blue-700">
          {AUTHORITY_LABELS[item.authority_type] ?? item.authority_type}
        </span>
      )}
      {item.state && (
        <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-surface text-dim border border-rule">
          {item.state}
        </span>
      )}
      {item.county && (
        <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-surface text-dim border border-rule">
          {item.county}
        </span>
      )}
      {item.work_type && (
        <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-surface text-dim border border-rule">
          {WORK_TYPE_LABELS[item.work_type] ?? item.work_type}
        </span>
      )}
      {item.pe_required && (
        <span className="text-[10px] font-semibold rounded px-1.5 py-0.5 bg-amber-50 text-amber-700">
          PE
        </span>
      )}
    </div>
  );
}

export default async function AdminCoverTemplatesPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("cover_sheet_templates")
    .select("id, name, authority_type, county, state, work_type, notes, storage_path, pe_required, is_active, sort_order")
    .order("sort_order")
    .order("name");

  const items = (data ?? []) as CoverItem[];
  const active   = items.filter((i) => i.is_active);
  const inactive = items.filter((i) => !i.is_active);

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <div>
        <SettingsBackButton href="/admin/settings" label="Settings" />
        <h1 className="text-xl font-semibold text-ink">Cover Sheet Templates</h1>
        <p className="mt-0.5 text-sm text-muted">
          {active.length} active template{active.length !== 1 ? "s" : ""} —
          matched to projects by authority type, state, county, work type, and PE requirement
        </p>
      </div>

      {/* Active list */}
      {active.length > 0 ? (
        <SectionCard noPad>
          <div className="grid grid-cols-[2fr_2fr_auto] gap-4 px-5 py-2 bg-canvas">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Template</span>
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wider">Match Criteria</span>
            <span />
          </div>
          <div className="divide-y divide-surface">
            {active.map((item) => (
              <div key={item.id} className="grid grid-cols-[2fr_2fr_auto] gap-4 px-5 py-3.5 items-center">
                <div className="min-w-0">
                  <span className="text-sm font-medium text-ink truncate block">{item.name}</span>
                  <span className="text-xs text-muted mt-0.5 block">
                    {item.storage_path
                      ? <span className="text-green-600">PDF ✓</span>
                      : <span className="text-faint">No PDF</span>
                    }
                  </span>
                </div>
                <div className="min-w-0">
                  <CriteriaBadges item={item} />
                </div>
                <div className="flex items-center gap-1">
                  <Link
                    href={`/admin/settings/covers/${item.id}/edit`}
                    title={`Edit "${item.name}"`}
                    aria-label={`Edit ${item.name}`}
                    className="p-1.5 rounded-md text-muted hover:text-primary hover:bg-blue-50 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M11.5 2.5a1.414 1.414 0 012 2L5 13H2v-3L11.5 2.5z" />
                    </svg>
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
          <p className="text-sm text-muted mb-1">No active cover templates yet.</p>
          <p className="text-xs text-faint">Add one below — then upload a PDF and map its fields.</p>
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
              <div key={item.id} className="flex items-center gap-2 px-5 py-3 border-b border-surface last:border-0 opacity-60">
                <span className="text-sm text-muted truncate flex-1">{item.name}</span>
                <Link
                  href={`/admin/settings/covers/${item.id}/edit`}
                  title={`Edit "${item.name}"`}
                  aria-label={`Edit ${item.name}`}
                  className="p-1.5 rounded-md text-muted hover:text-primary hover:bg-blue-50 transition-colors"
                >
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M11.5 2.5a1.414 1.414 0 012 2L5 13H2v-3L11.5 2.5z" />
                  </svg>
                </Link>
                <CoverActivateButton itemId={item.id} name={item.name} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
