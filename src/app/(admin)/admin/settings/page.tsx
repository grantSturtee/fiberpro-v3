import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Settings" };

type NavCard = {
  href: string;
  title: string;
  description: string;
  stat: string | null;
};

export default async function AdminSettingsPage() {
  const supabase = await createClient();

  const [tcdRes, coversRes, pricingRes, jurisdictionsRes] = await Promise.all([
    supabase.from("tcd_library").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("cover_sheet_templates").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("pricing_rules").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("jurisdiction_requirements").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  const nav: NavCard[] = [
    {
      href: "/admin/settings/tcd",
      title: "TCD Sheet Library",
      description: "Reusable Traffic Control Device sheets included in permit packages.",
      stat: tcdRes.count !== null ? `${tcdRes.count} active` : null,
    },
    {
      href: "/admin/settings/covers",
      title: "Cover Sheet Templates",
      description: "Templates for permit package cover sheets, scoped by county and authority.",
      stat: coversRes.count !== null ? `${coversRes.count} active` : null,
    },
    {
      href: "/admin/settings/pricing",
      title: "Pricing Rules",
      description: "Fee schedules used to calculate invoice amounts by job type and jurisdiction.",
      stat: pricingRes.count !== null ? `${pricingRes.count} active` : null,
    },
    {
      href: "/admin/settings/jurisdictions",
      title: "Jurisdiction Requirements",
      description: "Per-county submission workflows: forms required, fees, and submission channels.",
      stat: jurisdictionsRes.count !== null ? `${jurisdictionsRes.count} active` : null,
    },
  ];

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      <PageHeader
        title="Settings"
        subtitle="System configuration and library management"
      />

      {/* Navigation cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {nav.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group block bg-card rounded-xl px-6 py-5 transition-shadow hover:shadow-md"
            style={{ boxShadow: "0 1px 8px rgba(43,52,55,0.06)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink group-hover:text-primary transition-colors">
                  {card.title}
                </p>
                <p className="mt-1 text-xs text-muted leading-relaxed">{card.description}</p>
              </div>
              <span className="text-dim group-hover:text-primary transition-colors flex-shrink-0 mt-0.5">→</span>
            </div>
            {card.stat && (
              <p className="mt-3 text-[11px] font-medium text-muted">{card.stat}</p>
            )}
          </Link>
        ))}
      </div>

      {/* Workflow Jobs — future */}
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

      <div className="pt-2">
        <p className="text-xs text-muted">
          To manage company users, visit{" "}
          <Link href="/admin/companies" className="text-primary hover:underline">Companies</Link>.
        </p>
      </div>
    </div>
  );
}
