import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { PricingDeactivateButton } from "@/components/admin/settings/PricingDeactivateButton";
import type { PricingRule } from "@/lib/queries/pricing";

export const metadata: Metadata = { title: "Pricing Rules" };

const AUTHORITY_LABELS: Record<string, string> = {
  county: "County",
  njdot: "NJDOT",
  municipal: "Municipal",
  other: "Other",
};

function fmt(n: number | null) {
  if (n === null) return null;
  return `$${Number(n).toFixed(2)}`;
}

function scopeLabel(rule: PricingRule): string {
  const parts = [rule.county ? `${rule.county} Co.` : null, rule.state].filter(Boolean);
  return parts.join(", ") || "Global";
}

type PageProps = {
  searchParams: Promise<{ state?: string; county?: string }>;
};

export default async function AdminPricingPage({ searchParams }: PageProps) {
  const { state: filterState, county: filterCounty } = await searchParams;
  const supabase = await createClient();

  const { data } = await supabase
    .from("pricing_rules")
    .select("*")
    .order("name");

  let items = (data ?? []) as PricingRule[];

  if (filterState) items = items.filter((r) => r.state === filterState.toUpperCase());
  if (filterCounty) items = items.filter((r) => r.county?.toLowerCase().includes(filterCounty.toLowerCase()));

  const active = items.filter((r) => r.is_active);
  const inactive = items.filter((r) => !r.is_active);
  const hasFilter = !!filterState || !!filterCounty;

  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted mb-2">
            <Link href="/admin/settings" className="hover:text-primary transition-colors">Settings</Link>
            <span>/</span>
            <span className="text-ink">Pricing Rules</span>
          </div>
          <h1 className="text-xl font-semibold text-ink">Pricing Rules</h1>
          <p className="mt-0.5 text-sm text-muted">
            {active.length} active{hasFilter ? " (filtered)" : ""}
          </p>
        </div>
        <Link
          href="/admin/settings/pricing/new"
          className="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
        >
          + Add Rule
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
          <Link href="/admin/settings/pricing" className="text-xs text-muted hover:text-dim transition-colors">
            Clear
          </Link>
        )}
      </form>

      {/* Active rules */}
      {active.length > 0 ? (
        <SectionCard noPad>
          <div className="divide-y divide-surface">
            {active.map((rule) => (
              <div key={rule.id} className="px-5 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-ink">{rule.name}</span>
                      {rule.authority_type && (
                        <span className="text-[10px] font-semibold bg-surface text-dim rounded px-1.5 py-0.5 border border-rule">
                          {AUTHORITY_LABELS[rule.authority_type] ?? rule.authority_type}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5">{scopeLabel(rule)}</p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <Link
                      href={`/admin/settings/pricing/${rule.id}/edit`}
                      className="text-xs text-primary hover:underline"
                    >
                      Edit
                    </Link>
                    <PricingDeactivateButton itemId={rule.id} name={rule.name} />
                  </div>
                </div>

                {/* Fee grid */}
                <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-x-4 gap-y-2">
                  {([
                    ["Base", fmt(rule.base_project_fee)],
                    ["Per Sheet", fmt(rule.per_sheet_fee)],
                    ["Admin Fee", fmt(rule.fiberpro_admin_fee)],
                    ["Rush", fmt(rule.rush_fee)],
                    ["Aerial ×", rule.aerial_multiplier !== 1 ? `${rule.aerial_multiplier}×` : null],
                    ["UG ×", rule.underground_multiplier !== 1 ? `${rule.underground_multiplier}×` : null],
                  ] as [string, string | null][]).map(([label, val]) =>
                    val !== null ? (
                      <div key={label}>
                        <p className="text-[10px] text-muted">{label}</p>
                        <p className="text-xs font-medium text-ink">{val}</p>
                      </div>
                    ) : null
                  )}
                </div>

                {/* Includes */}
                {(rule.include_application_fee || rule.include_jurisdiction_fee) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {rule.include_application_fee && (
                      <span className="text-[10px] font-medium bg-primary-soft text-primary rounded px-1.5 py-0.5">
                        + App Fee
                      </span>
                    )}
                    {rule.include_jurisdiction_fee && (
                      <span className="text-[10px] font-medium bg-primary-soft text-primary rounded px-1.5 py-0.5">
                        + Jur Fee
                      </span>
                    )}
                  </div>
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
          <p className="text-sm text-muted">
            {hasFilter ? "No rules match the current filter." : "No pricing rules yet."}
          </p>
          {!hasFilter && (
            <Link
              href="/admin/settings/pricing/new"
              className="mt-3 inline-block text-sm text-primary hover:underline"
            >
              Add the first one →
            </Link>
          )}
          {hasFilter && (
            <Link href="/admin/settings/pricing" className="mt-2 inline-block text-xs text-primary hover:underline">
              Clear filters
            </Link>
          )}
        </div>
      )}

      {/* Inactive */}
      {inactive.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-muted hover:text-dim transition-colors select-none">
            {inactive.length} deactivated rule{inactive.length !== 1 ? "s" : ""}
          </summary>
          <div className="mt-3 bg-card rounded-xl overflow-hidden" style={{ boxShadow: "0 1px 8px rgba(43,52,55,0.04)" }}>
            {inactive.map((rule) => (
              <div key={rule.id} className="flex items-center gap-4 px-5 py-3 border-b border-surface last:border-0 opacity-50">
                <span className="text-sm text-muted">{rule.name}</span>
                <span className="text-xs text-faint">{scopeLabel(rule)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
