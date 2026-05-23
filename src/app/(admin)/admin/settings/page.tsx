import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { getUpdateCadenceDays } from "@/lib/queries/appSettings";
import { CadenceForm } from "./CadenceForm";

export const metadata: Metadata = { title: "Settings" };

type NavCard = {
  href: string;
  title: string;
  description: string;
  stat: string | null;
};

export default async function AdminSettingsPage() {
  const supabase = await createClient();

  // Jurisdiction Requirements tile is intentionally hidden — Authority Profiles
  // is the rulebook now. The /admin/settings/jurisdictions route still exists
  // and is reachable via direct URL for any project-intelligence consumers.
  const [tcdRes, pricingRes, authoritiesRes, blueprintsRes, pageTemplatesRes, cadenceDays] = await Promise.all([
    supabase.from("tcd_library").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("pricing_rules").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("authority_profiles").select("id", { count: "exact", head: true }),
    supabase.from("package_blueprints").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("page_templates").select("id", { count: "exact", head: true }).eq("is_active", true),
    getUpdateCadenceDays(supabase),
  ]);

  const nav: NavCard[] = [
    {
      href: "/admin/settings/authorities",
      title: "Permitting Authorities",
      description: "Authority-specific requirements, contacts, submission methods, and ops notes.",
      stat: authoritiesRes.count !== null ? `${authoritiesRes.count} configured` : null,
    },
    {
      href: "/admin/settings/tcd",
      title: "TCD Sheet Library",
      description: "Reusable Traffic Control Device sheets included in permit packages.",
      stat: tcdRes.count !== null ? `${tcdRes.count} active` : null,
    },
    {
      href: "/admin/settings/pricing",
      title: "Pricing Rules",
      description: "Fee schedules used to calculate invoice amounts by job type and jurisdiction.",
      stat: pricingRes.count !== null ? `${pricingRes.count} active` : null,
    },
    {
      href: "/admin/settings/page-templates",
      title: "Page Templates",
      description: "Reusable wrapper templates for cover, TCP, TCD, SLD, and COI slots in permit packages.",
      stat: pageTemplatesRes.count !== null ? `${pageTemplatesRes.count} active` : null,
    },
    {
      href: "/admin/settings/package-templates",
      title: "Package Templates",
      description: "Configure permit package slots (cover, TCP, SLD, TCD, application form, certification form) per authority.",
      stat: blueprintsRes.count !== null ? `${blueprintsRes.count} active` : null,
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

      {/* Project Updates */}
      <SectionCard
        id="project-updates"
        title="Project Updates"
        description="Internal update cadence and accountability settings."
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Update cadence</p>
              <p className="mt-0.5 text-xs text-muted">
                How often designers and admins are expected to post a project status update.
                Projects with no update within this window are flagged as needing attention.
              </p>
            </div>
            <div className="flex-shrink-0">
              <CadenceForm currentDays={cadenceDays} />
            </div>
          </div>
        </div>
      </SectionCard>

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
