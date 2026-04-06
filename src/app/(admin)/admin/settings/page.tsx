import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Settings" };

export default async function AdminSettingsPage() {
  const supabase = await createClient();

  const { data: tcdData } = await supabase
    .from("tcd_library")
    .select("id, code, description, category, storage_path, is_active")
    .eq("is_active", true)
    .order("sort_order")
    .order("code");

  const tcdItems = tcdData ?? [];

  // Group by category
  const tcdByCategory: Record<string, typeof tcdItems> = {};
  for (const item of tcdItems) {
    const cat = item.category ?? "Uncategorized";
    if (!tcdByCategory[cat]) tcdByCategory[cat] = [];
    tcdByCategory[cat].push(item);
  }
  const categories = Object.keys(tcdByCategory).sort();

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Settings"
        subtitle="System configuration and library management"
      />

      {/* ── TCD Sheet Library ── anchor: #tcd-library ── */}
      <SectionCard
        id="tcd-library"
        title="TCD Sheet Library"
        description="Reusable Traffic Control Device sheets included in permit packages. Manage sheets in Supabase to add or remove entries."
      >
        {tcdItems.length === 0 ? (
          <EmptyState
            title="No TCD sheets in library"
            description="Add TCD sheet records via Supabase, or seed the tcd_library table."
          />
        ) : (
          <div className="space-y-5">
            {categories.map((cat) => (
              <div key={cat}>
                <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2 capitalize">
                  {cat}
                </p>
                <div className="space-y-1.5">
                  {tcdByCategory[cat].map((tcd) => (
                    <div
                      key={tcd.id}
                      className="flex items-center justify-between gap-4 bg-surface rounded-lg px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{tcd.code}</p>
                        <p className="text-xs text-muted">{tcd.description}</p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {tcd.storage_path ? (
                          <span
                            className="text-xs text-primary opacity-40 cursor-not-allowed"
                            title="PDF viewer not yet implemented"
                          >
                            View PDF
                          </span>
                        ) : (
                          <span className="text-xs text-faint">No PDF</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── Cover Sheet Templates ── anchor: #cover-templates ── */}
      <SectionCard
        id="cover-templates"
        title="Cover Sheet Templates"
        description="Templates for permit package cover sheets. Auto-populated with project data at package generation time."
      >
        <EmptyState
          title="No cover sheet templates configured"
          description="Cover sheet template management will be available in a future update."
        />
      </SectionCard>

      {/* ── Pricing Rules ── anchor: #pricing ── */}
      <SectionCard
        id="pricing"
        title="Pricing Rules"
        description="Fee schedules used to calculate invoice amounts. Scoped by client, authority type, or job type."
      >
        <EmptyState
          title="No pricing rules configured"
          description="Pricing rule management will be available in a future update."
        />
      </SectionCard>

      {/* ── Jurisdiction Requirements ── anchor: #jurisdictions ── */}
      <SectionCard
        id="jurisdictions"
        title="Jurisdiction Requirements"
        description="Per-county and NJDOT permit workflow configuration: required forms, COI rules, application fees, and submission channels."
      >
        <EmptyState
          title="No jurisdictions configured"
          description="Jurisdiction configuration will be available in a future update."
        />
      </SectionCard>

      {/* ── Workflow Jobs ── anchor: #jobs ── */}
      <SectionCard
        id="jobs"
        title="Workflow Jobs"
        description="Recent automation jobs for package generation and PDF assembly."
      >
        <EmptyState
          title="No recent workflow jobs"
          description="Jobs appear here when package generation is triggered."
        />
        <div className="mt-4 pt-4 flex items-center justify-between gap-4" style={{ borderTop: "1px solid #e3e9ec" }}>
          <p className="text-xs text-muted">
            Workflow automation is not yet connected.
          </p>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-rule flex-shrink-0" />
            Not connected
          </span>
        </div>
      </SectionCard>

      {/* Quick link to companies for user management */}
      <div className="pt-2">
        <p className="text-xs text-muted">
          To manage company users, visit{" "}
          <Link href="/admin/companies" className="text-primary hover:underline">Companies</Link>.
        </p>
      </div>
    </div>
  );
}
