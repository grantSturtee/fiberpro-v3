import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { JurisdictionDeactivateBtn } from "@/components/admin/settings/JurisdictionDeactivateBtn";

export const metadata: Metadata = { title: "Jurisdictions" };

const METHOD_LABELS: Record<string, string> = {
  online: "Online",
  email: "Email",
  mail: "Mail",
  portal: "Portal",
};

const REQUIRES_FLAGS = [
  { key: "requires_coi", label: "COI" },
  { key: "requires_pe_stamp", label: "PE Stamp" },
  { key: "requires_traffic_control_plan", label: "TCP" },
  { key: "requires_cover_sheet", label: "Cover Sheet" },
  { key: "requires_application_form", label: "App Form" },
] as const;

type JurRow = {
  id: string;
  state: string;
  county: string | null;
  township: string | null;
  authority_name: string;
  submission_method: string | null;
  application_fee: number | null;
  jurisdiction_fee: number | null;
  avg_approval_days: number | null;
  is_active: boolean;
  requires_coi: boolean;
  requires_pe_stamp: boolean;
  requires_traffic_control_plan: boolean;
  requires_cover_sheet: boolean;
  requires_application_form: boolean;
};

function scopeLabel(j: JurRow): string {
  const parts = [j.township, j.county ? `${j.county} Co.` : null, j.state].filter(Boolean);
  return parts.join(", ");
}

function fmt(dollars: number | null) {
  if (dollars === null) return null;
  return `$${Number(dollars).toFixed(2)}`;
}

type PageProps = {
  searchParams: Promise<{ state?: string; county?: string }>;
};

export default async function AdminJurisdictionsPage({ searchParams }: PageProps) {
  const { state: filterState, county: filterCounty } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("jurisdictions")
    .select(
      "id, state, county, township, authority_name, submission_method, " +
      "application_fee, jurisdiction_fee, avg_approval_days, is_active, " +
      "requires_coi, requires_pe_stamp, requires_traffic_control_plan, " +
      "requires_cover_sheet, requires_application_form"
    )
    .order("state")
    .order("county", { nullsFirst: true })
    .order("township", { nullsFirst: true });

  if (filterState) query = query.eq("state", filterState);
  if (filterCounty) query = query.ilike("county", `%${filterCounty}%`);

  const { data } = await query;
  const items = (data ?? []) as JurRow[];
  const active = items.filter((i) => i.is_active);
  const inactive = items.filter((i) => !i.is_active);
  const hasFilter = !!filterState || !!filterCounty;

  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted mb-2">
            <Link href="/admin/settings" className="hover:text-primary transition-colors">Settings</Link>
            <span>/</span>
            <span className="text-ink">Jurisdictions</span>
          </div>
          <h1 className="text-xl font-semibold text-ink">Jurisdictions</h1>
          <p className="mt-0.5 text-sm text-muted">
            {active.length} active{hasFilter ? " (filtered)" : ""}
          </p>
        </div>
        <Link
          href="/admin/settings/jurisdictions/new"
          className="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
        >
          + Add Jurisdiction
        </Link>
      </div>

      {/* Filters */}
      <form method="GET" className="flex items-center gap-3 flex-wrap">
        <input
          name="state"
          type="text"
          defaultValue={filterState ?? ""}
          maxLength={2}
          placeholder="State (e.g. NJ)"
          className="bg-surface rounded-lg px-3 py-2 text-sm text-ink outline-none w-28 transition-shadow focus:ring-2 focus:ring-primary/20"
          style={{ border: "1px solid #d4dde4" }}
        />
        <input
          name="county"
          type="text"
          defaultValue={filterCounty ?? ""}
          placeholder="County"
          className="bg-surface rounded-lg px-3 py-2 text-sm text-ink outline-none transition-shadow focus:ring-2 focus:ring-primary/20"
          style={{ border: "1px solid #d4dde4" }}
        />
        <button
          type="submit"
          className="px-3 py-2 rounded-lg text-sm font-medium bg-surface text-dim hover:text-ink transition-colors"
          style={{ border: "1px solid #d4dde4" }}
        >
          Filter
        </button>
        {hasFilter && (
          <Link href="/admin/settings/jurisdictions" className="text-xs text-muted hover:text-dim transition-colors">
            Clear
          </Link>
        )}
      </form>

      {/* Active list */}
      {active.length > 0 ? (
        <SectionCard noPad>
          <div className="divide-y divide-surface">
            {active.map((j) => {
              const activeFlags = REQUIRES_FLAGS.filter((f) => j[f.key]);
              const fees = [fmt(j.application_fee), fmt(j.jurisdiction_fee)].filter(Boolean);
              return (
                <div key={j.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-ink">{j.authority_name}</span>
                        {j.submission_method && (
                          <span className="text-[10px] font-semibold bg-surface text-dim rounded px-1.5 py-0.5 border border-rule">
                            {METHOD_LABELS[j.submission_method] ?? j.submission_method}
                          </span>
                        )}
                        {j.avg_approval_days && (
                          <span className="text-[10px] text-muted">~{j.avg_approval_days}d</span>
                        )}
                      </div>
                      <p className="text-xs text-muted mt-0.5">{scopeLabel(j)}</p>
                      {fees.length > 0 && (
                        <p className="text-xs text-muted mt-0.5">Fees: {fees.join(" + ")}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <Link
                        href={`/admin/settings/jurisdictions/${j.id}/edit`}
                        className="text-xs text-primary hover:underline"
                      >
                        Edit
                      </Link>
                      <JurisdictionDeactivateBtn itemId={j.id} name={j.authority_name} />
                    </div>
                  </div>

                  {activeFlags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {activeFlags.map((f) => (
                        <span
                          key={f.key}
                          className="text-[10px] font-medium bg-primary-soft text-primary rounded px-1.5 py-0.5"
                        >
                          {f.label}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
      ) : (
        <div
          className="bg-card rounded-xl px-6 py-12 text-center"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          <p className="text-sm text-muted">
            {hasFilter ? "No jurisdictions match the current filter." : "No jurisdictions yet."}
          </p>
          {!hasFilter && (
            <Link
              href="/admin/settings/jurisdictions/new"
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              Add the first one →
            </Link>
          )}
          {hasFilter && (
            <Link href="/admin/settings/jurisdictions" className="mt-2 inline-block text-xs text-primary hover:underline">
              Clear filters
            </Link>
          )}
        </div>
      )}

      {/* Inactive (collapsed) */}
      {inactive.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-muted hover:text-dim transition-colors select-none">
            {inactive.length} deactivated jurisdiction{inactive.length !== 1 ? "s" : ""}
          </summary>
          <div className="mt-3 bg-card rounded-xl overflow-hidden" style={{ boxShadow: "0 1px 8px rgba(43,52,55,0.04)" }}>
            {inactive.map((j) => (
              <div key={j.id} className="flex items-center gap-4 px-5 py-3 border-b border-surface last:border-0 opacity-50">
                <span className="text-sm text-muted">{j.authority_name}</span>
                <span className="text-xs text-faint">{scopeLabel(j)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
