import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { PricingAddForm } from "@/components/admin/settings/PricingAddForm";
import { PricingDeactivateButton } from "@/components/admin/settings/PricingDeactivateButton";

export const metadata: Metadata = { title: "Pricing Rules" };

function formatCents(cents: number | null): string {
  if (cents === null) return "—";
  return `$${(cents / 100).toFixed(2)}`;
}

const JOB_TYPE_LABELS: Record<string, string> = {
  tcp: "TCP",
  sld: "SLD",
  full_package: "Full Pkg",
  revision: "Rev",
  other: "Other",
};

const AUTHORITY_LABELS: Record<string, string> = {
  county: "County",
  njdot: "NJDOT",
  municipal: "Municipal",
  other: "Other",
};

export default async function AdminPricingPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("pricing_rules")
    .select("id, label, state, county, municipality, job_type, authority_type, base_amount_cents, per_sheet_cents, application_fee_cents, jurisdiction_fee_cents, pe_fee_cents, coi_fee_cents, rush_fee_cents, notes, is_active")
    .order("label");

  const items = data ?? [];
  const active = items.filter((i) => i.is_active);
  const inactive = items.filter((i) => !i.is_active);

  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted mb-2">
          <Link href="/admin/settings" className="hover:text-primary transition-colors">Settings</Link>
          <span>/</span>
          <span className="text-ink">Pricing Rules</span>
        </div>
        <h1 className="text-xl font-semibold text-ink">Pricing Rules</h1>
        <p className="mt-0.5 text-sm text-muted">
          {active.length} active rule{active.length !== 1 ? "s" : ""}
        </p>
      </div>

      {active.length > 0 ? (
        <SectionCard noPad>
          <div className="divide-y divide-surface">
            {active.map((item) => (
              <div key={item.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-ink">{item.label}</span>
                      {item.job_type && (
                        <span className="text-[10px] font-semibold bg-surface text-dim rounded px-1.5 py-0.5 border border-rule">
                          {JOB_TYPE_LABELS[item.job_type] ?? item.job_type}
                        </span>
                      )}
                      {item.authority_type && (
                        <span className="text-[10px] font-semibold bg-surface text-dim rounded px-1.5 py-0.5 border border-rule">
                          {AUTHORITY_LABELS[item.authority_type] ?? item.authority_type}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {item.county && <span className="text-xs text-muted">{item.county} County</span>}
                      {item.municipality && <span className="text-xs text-muted">{item.municipality}</span>}
                      {item.state && <span className="text-xs text-muted">{item.state}</span>}
                    </div>
                  </div>
                  <PricingDeactivateButton itemId={item.id} label={item.label} />
                </div>

                {/* Fee grid */}
                <div className="mt-3 grid grid-cols-3 sm:grid-cols-7 gap-x-4 gap-y-1.5">
                  {[
                    ["Base", item.base_amount_cents],
                    ["Per Sheet", item.per_sheet_cents],
                    ["Application", item.application_fee_cents],
                    ["Jurisdiction", item.jurisdiction_fee_cents],
                    ["PE", item.pe_fee_cents],
                    ["COI", item.coi_fee_cents],
                    ["Rush", item.rush_fee_cents],
                  ].map(([lbl, val]) => (
                    <div key={lbl as string}>
                      <p className="text-[10px] text-muted">{lbl as string}</p>
                      <p className="text-xs font-medium text-ink">{formatCents(val as number | null)}</p>
                    </div>
                  ))}
                </div>

                {item.notes && (
                  <p className="mt-2 text-xs text-muted">{item.notes}</p>
                )}
              </div>
            ))}
          </div>
        </SectionCard>
      ) : (
        <div
          className="bg-card rounded-xl px-6 py-12 text-center"
          style={{ boxShadow: "0 1px 16px rgba(43,52,55,0.06)" }}
        >
          <p className="text-sm text-muted">No pricing rules yet. Add one below.</p>
        </div>
      )}

      <SectionCard title="Add Pricing Rule">
        <PricingAddForm />
      </SectionCard>

      {inactive.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-muted hover:text-dim transition-colors select-none">
            {inactive.length} deactivated rule{inactive.length !== 1 ? "s" : ""}
          </summary>
          <div className="mt-3 bg-card rounded-xl overflow-hidden" style={{ boxShadow: "0 1px 8px rgba(43,52,55,0.04)" }}>
            {inactive.map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-5 py-3 border-b border-surface last:border-0 opacity-50">
                <span className="text-sm text-muted truncate">{item.label}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
