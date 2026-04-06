import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { TCD_LIBRARY_PLACEHOLDER } from "@/lib/constants/tcd";

export const metadata: Metadata = { title: "Settings" };

// System configuration for FiberPro operations.
// Sections follow operational dependency order:
//   TCD Library → Cover Sheet Templates → Pricing Rules → Jurisdiction Requirements → Workflow Jobs
// TODO: All sections backed by Supabase queries in a later phase.

export default function AdminSettingsPage() {
  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <PageHeader
        title="Settings"
        subtitle="System configuration and library management"
      />

      {/* ── TCD Sheet Library ── anchor: #tcd-library ── */}
      <SectionCard
        id="tcd-library"
        title="TCD Sheet Library"
        description="Reusable Traffic Control Device sheets. Admin selects one or more per project during setup — selected sheets are included in the permit package."
        action={
          <button
            className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
            style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
          >
            + Add TCD Sheet
          </button>
        }
      >
        {/* TODO: Replace with Supabase query — tcd_library table */}
        <div className="space-y-2">
          {TCD_LIBRARY_PLACEHOLDER.map((tcd) => (
            <div key={tcd.id} className="flex items-center justify-between gap-4 bg-surface rounded-lg px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{tcd.code}</p>
                <p className="text-xs text-muted">{tcd.description}</p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {/* TODO: Open PDF from Supabase Storage */}
                <button className="text-xs text-primary hover:underline">View PDF</button>
                <button className="text-xs text-muted hover:text-danger transition-colors">Remove</button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* ── Cover Sheet Templates ── anchor: #cover-templates ── */}
      <SectionCard
        id="cover-templates"
        title="Cover Sheet Templates"
        description="Templates for permit package cover sheets. Each template is authority-type-aware and auto-populated with project data at package generation time."
        action={
          <button className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-canvas text-dim hover:bg-wash hover:text-ink transition-colors">
            + New Template
          </button>
        }
      >
        {/* TODO: Load from Supabase — cover_sheet_templates table */}
        <EmptyState
          title="No cover sheet templates configured"
          description="Templates control the layout and auto-populated fields for each permit package. Create templates per authority type or client combination."
        />
      </SectionCard>

      {/* ── Pricing Rules ── anchor: #pricing ── */}
      <SectionCard
        id="pricing"
        title="Pricing Rules"
        description="Fee schedules used to calculate invoice amounts. Rules can be scoped by client, authority type, or job type. Applied when creating invoices from the billing page."
        action={
          <button className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-canvas text-dim hover:bg-wash hover:text-ink transition-colors">
            + Add Rule
          </button>
        }
      >
        {/* TODO: Load from Supabase — pricing_rules table */}
        <EmptyState
          title="No pricing rules configured"
          description="Define fee schedules per client, authority type, or job type. Rules are applied automatically when generating invoices."
        />
      </SectionCard>

      {/* ── Jurisdiction Requirements ── anchor: #jurisdictions ── */}
      <SectionCard
        id="jurisdictions"
        title="Jurisdiction Requirements"
        description="Per-county and NJDOT permit workflow configuration: required forms, COI and PE stamp rules, application fees, submission channels, and authority contacts."
        action={
          <button className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-canvas text-dim hover:bg-wash hover:text-ink transition-colors">
            + Add Jurisdiction
          </button>
        }
      >
        {/* TODO: Load from Supabase — jurisdiction_requirement_profiles table */}
        <EmptyState
          title="No jurisdictions configured"
          description="NJ county profiles and NJDOT requirements will be configured here. Jurisdiction rules drive package checklist items and submission workflow steps."
        />
      </SectionCard>

      {/* ── Workflow Jobs ── anchor: #jobs ── */}
      <SectionCard
        id="jobs"
        title="Workflow Jobs"
        description="Recent and running automation jobs. Package generation, PDF assembly, and future submission automation run as async n8n jobs. Status is updated via webhook callbacks."
      >
        {/* TODO: Query workflow_jobs table — show recent jobs with status, type, project link, timestamps */}
        <EmptyState
          title="No recent workflow jobs"
          description="Jobs appear here when package generation is triggered. Each job shows its type, current status, and any error messages."
        />
        <div className="mt-4 pt-4 flex items-center justify-between gap-4" style={{ borderTop: "1px solid #e3e9ec" }}>
          <p className="text-xs text-muted">
            n8n integration configured via environment variables.
          </p>
          {/* TODO: Show live n8n connection health check */}
          <span className="inline-flex items-center gap-1.5 text-xs text-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-rule flex-shrink-0" />
            Not connected
          </span>
        </div>
      </SectionCard>
    </div>
  );
}
