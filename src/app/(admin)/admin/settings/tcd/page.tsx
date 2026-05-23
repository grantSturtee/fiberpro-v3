import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { SectionCard } from "@/components/ui/SectionCard";
import { SettingsBackButton } from "@/components/ui/SettingsBackButton";
import { TcdAddForm } from "@/components/admin/settings/TcdAddForm";
import { TcdDeleteButton } from "@/components/admin/settings/TcdDeleteButton";
import { TcdStateFilter } from "@/components/admin/settings/TcdStateFilter";

export const metadata: Metadata = { title: "TCD Library" };

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", DC: "Washington DC",
  FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana",
  ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada",
  NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia",
  WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};

// "TCD-2" < "TCD-10", not "TCD-10" < "TCD-2"
function naturalCode(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

type PageProps = {
  searchParams: Promise<{ state?: string }>;
};

export default async function AdminTcdLibraryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filterState = params?.state;
  const supabase = await createClient();

  let query = supabase
    .from("tcd_library")
    .select("id, code, description, state, storage_path, is_active")
    .order("code");

  if (filterState) query = query.eq("state", filterState);

  const { data } = await query;
  const items = data ?? [];
  const active = items.filter((i) => i.is_active);
  const inactive = items.filter((i) => !i.is_active);

  // Group by state; null state → "__all__" sentinel displayed as "All States"
  const byState: Record<string, typeof active> = {};
  for (const item of active) {
    const key = item.state ?? "__all__";
    if (!byState[key]) byState[key] = [];
    byState[key].push(item);
  }

  // State groups sorted alphabetically by full name; "All States" always last
  const stateKeys = Object.keys(byState).sort((a, b) => {
    if (a === "__all__") return 1;
    if (b === "__all__") return -1;
    return (STATE_NAMES[a] ?? a).localeCompare(STATE_NAMES[b] ?? b);
  });

  for (const key of stateKeys) {
    byState[key].sort((a, b) => naturalCode(a.code, b.code));
  }

  const hasFilter = !!filterState;

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <div>
        <SettingsBackButton href="/admin/settings" label="Settings" />
        <h1 className="text-xl font-semibold text-ink">TCD Sheet Library</h1>
        <p className="mt-0.5 text-sm text-muted">
          {active.length} active sheet{active.length !== 1 ? "s" : ""}
          {hasFilter && " (filtered)"}
        </p>
      </div>

      {/* State filter — auto-applies on selection */}
      <TcdStateFilter current={filterState ?? ""} />

      {/* Active items grouped by state */}
      {active.length > 0 && (
        <SectionCard noPad>
          {stateKeys.map((key, groupIdx) => (
            <div key={key}>
              <div className={`px-5 py-2.5 bg-canvas ${groupIdx > 0 ? "border-t border-surface" : ""}`}>
                <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                  {key === "__all__" ? "All States" : (STATE_NAMES[key] ?? key)}
                </p>
              </div>
              <div className="divide-y divide-surface">
                {byState[key].map((item) => (
                  <div key={item.id} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="min-w-0 flex-1">
                      <span className="text-sm font-semibold text-ink font-mono">{item.code}</span>
                      <p className="text-xs text-muted mt-0.5 leading-relaxed">{item.description}</p>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      {item.storage_path ? (
                        <span
                          className="w-2 h-2 rounded-full bg-green-500 mr-2 flex-shrink-0"
                          title="PDF on file"
                          aria-label="PDF on file"
                        />
                      ) : (
                        <span className="text-[11px] text-faint mr-2 select-none">No PDF</span>
                      )}
                      <Link
                        href={`/admin/settings/tcd/${item.id}/edit`}
                        className="p-1.5 rounded text-muted hover:text-ink hover:bg-surface transition-colors"
                        title={`Edit ${item.code}`}
                        aria-label={`Edit ${item.code}`}
                      >
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                          <path d="M11.5 2.5a1.5 1.5 0 012.12 2.12L5 13.25l-3 .75.75-3L11.5 2.5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </Link>
                      <TcdDeleteButton itemId={item.id} code={item.code} />
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
              Clear filter
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
