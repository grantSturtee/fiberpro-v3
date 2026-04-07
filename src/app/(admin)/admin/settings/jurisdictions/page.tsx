import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { JurisdictionAddForm } from "@/components/admin/settings/JurisdictionAddForm";
import { JurisdictionDeactivateButton } from "@/components/admin/settings/JurisdictionDeactivateButton";

export const metadata: Metadata = { title: "Jurisdiction Requirements" };

const AUTHORITY_LABELS: Record<string, string> = {
  county: "County",
  njdot: "NJDOT",
  municipal: "Municipal",
  other: "Other",
};

const METHOD_LABELS: Record<string, string> = {
  online: "Online",
  email: "Email",
  mail: "Mail",
  in_person: "In Person",
};

const REQUIRES_FLAGS = [
  { key: "requires_application_form", label: "Application" },
  { key: "requires_cover_sheet", label: "Cover Sheet" },
  { key: "requires_tcp", label: "TCP" },
  { key: "requires_sld", label: "SLD" },
  { key: "requires_tcd", label: "TCD" },
  { key: "requires_coi", label: "COI" },
  { key: "requires_pe", label: "PE" },
  { key: "requires_payment_upfront", label: "Upfront Payment" },
] as const;

type JurisdictionRow = {
  id: string;
  state: string;
  county: string | null;
  municipality: string | null;
  authority_name: string | null;
  authority_type: string | null;
  submission_method: string | null;
  is_active: boolean;
  requires_application_form: boolean;
  requires_cover_sheet: boolean;
  requires_tcp: boolean;
  requires_sld: boolean;
  requires_tcd: boolean;
  requires_coi: boolean;
  requires_pe: boolean;
  requires_payment_upfront: boolean;
};

function displayName(item: JurisdictionRow): string {
  const parts = [item.municipality, item.county ? `${item.county} County` : null, item.state].filter(Boolean);
  return parts.join(", ") || item.state;
}

export default async function AdminJurisdictionsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("jurisdiction_requirements")
    .select("id, state, county, municipality, authority_name, authority_type, submission_method, is_active, requires_application_form, requires_cover_sheet, requires_tcp, requires_sld, requires_tcd, requires_coi, requires_pe, requires_payment_upfront")
    .order("state")
    .order("county")
    .order("municipality");

  const items = (data ?? []) as JurisdictionRow[];
  const active = items.filter((i) => i.is_active);
  const inactive = items.filter((i) => !i.is_active);

  return (
    <div className="p-8 space-y-6 max-w-5xl mx-auto">
      <div>
        <div className="flex items-center gap-2 text-xs text-muted mb-2">
          <Link href="/admin/settings" className="hover:text-primary transition-colors">Settings</Link>
          <span>/</span>
          <span className="text-ink">Jurisdiction Requirements</span>
        </div>
        <h1 className="text-xl font-semibold text-ink">Jurisdiction Requirements</h1>
        <p className="mt-0.5 text-sm text-muted">
          {active.length} active jurisdiction{active.length !== 1 ? "s" : ""}
        </p>
      </div>

      {active.length > 0 ? (
        <SectionCard noPad>
          <div className="divide-y divide-surface">
            {active.map((item) => {
              const activeFlags = REQUIRES_FLAGS.filter((f) => item[f.key]);
              return (
                <div key={item.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-ink">{displayName(item)}</span>
                        {item.authority_type && (
                          <span className="text-[10px] font-semibold bg-surface text-dim rounded px-1.5 py-0.5 border border-rule">
                            {AUTHORITY_LABELS[item.authority_type] ?? item.authority_type}
                          </span>
                        )}
                        {item.submission_method && (
                          <span className="text-[10px] font-semibold bg-surface text-dim rounded px-1.5 py-0.5 border border-rule">
                            {METHOD_LABELS[item.submission_method] ?? item.submission_method}
                          </span>
                        )}
                      </div>
                      {item.authority_name && (
                        <p className="text-xs text-muted mt-0.5">{item.authority_name}</p>
                      )}
                    </div>
                    <JurisdictionDeactivateButton itemId={item.id} name={displayName(item)} />
                  </div>

                  {activeFlags.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {activeFlags.map((f) => (
                        <span key={f.key} className="text-[10px] font-medium bg-primary-soft text-primary rounded px-1.5 py-0.5">
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
          <p className="text-sm text-muted">No jurisdictions yet. Add one below.</p>
        </div>
      )}

      <SectionCard title="Add Jurisdiction">
        <JurisdictionAddForm />
      </SectionCard>

      {inactive.length > 0 && (
        <details>
          <summary className="cursor-pointer text-xs text-muted hover:text-dim transition-colors select-none">
            {inactive.length} deactivated jurisdiction{inactive.length !== 1 ? "s" : ""}
          </summary>
          <div className="mt-3 bg-card rounded-xl overflow-hidden" style={{ boxShadow: "0 1px 8px rgba(43,52,55,0.04)" }}>
            {inactive.map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-5 py-3 border-b border-surface last:border-0 opacity-50">
                <span className="text-sm text-muted truncate">{displayName(item)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
