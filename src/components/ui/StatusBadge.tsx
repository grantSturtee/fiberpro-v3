import type { ProjectStatus, BillingStatus } from "@/types/domain";

// ── Project Status ──────────────────────────────────────────────────────────

type ProjectStatusConfig = {
  label: string;
  className: string;
};

const projectStatusMap: Record<ProjectStatus, ProjectStatusConfig> = {
  intake_review:           { label: "Intake Review",        className: "bg-amber-50 text-amber-800" },
  waiting_on_client:       { label: "Waiting on Client",    className: "bg-amber-50 text-amber-700" },
  ready_for_assignment:    { label: "Ready to Assign",      className: "bg-blue-50 text-blue-800" },
  assigned:                { label: "Assigned",             className: "bg-blue-50 text-blue-800" },
  in_design:               { label: "In Design",            className: "bg-indigo-50 text-indigo-800" },
  waiting_for_admin_review:{ label: "Awaiting Review",      className: "bg-violet-50 text-violet-800" },
  revisions_required:      { label: "Revisions Required",   className: "bg-red-50 text-red-700" },
  approved:                { label: "Approved",             className: "bg-emerald-50 text-emerald-800" },
  package_generating:      { label: "Generating Package",   className: "bg-sky-50 text-sky-800" },
  ready_for_submission:    { label: "Ready to Submit",      className: "bg-emerald-50 text-emerald-700" },
  submitted:               { label: "Submitted",            className: "bg-slate-100 text-slate-700" },
  waiting_on_authority:    { label: "With Authority",       className: "bg-purple-50 text-purple-800" },
  authority_action_needed: { label: "Authority Action",     className: "bg-orange-50 text-orange-800" },
  permit_received:         { label: "Permit Received",      className: "bg-emerald-100 text-emerald-800" },
  closed:                  { label: "Closed",               className: "bg-slate-100 text-slate-500" },
  cancelled:               { label: "Cancelled",            className: "bg-slate-100 text-slate-400" },
};

// Human-readable labels for external (company-side) display.
// Collapses internal workflow states into simpler external language.
const projectStatusExternalMap: Partial<Record<ProjectStatus, string>> = {
  intake_review:            "Under Review",
  waiting_on_client:        "Information Needed",
  ready_for_assignment:     "In Progress",
  assigned:                 "In Progress",
  in_design:                "In Progress",
  waiting_for_admin_review: "In Progress",
  revisions_required:       "In Progress",
  approved:                 "Design Complete",
  package_generating:       "Preparing Package",
  ready_for_submission:     "Ready to Submit",
  submitted:                "Submitted",
  waiting_on_authority:     "With Authority",
  authority_action_needed:  "Authority Response Needed",
  permit_received:          "Permit Received",
  closed:                   "Closed",
  cancelled:                "Cancelled",
};

// ── Billing Status ──────────────────────────────────────────────────────────

type BillingStatusConfig = {
  label: string;
  className: string;
};

const billingStatusMap: Record<BillingStatus, BillingStatusConfig> = {
  not_ready:      { label: "Not Ready",       className: "bg-slate-100 text-slate-500" },
  ready_to_invoice:{ label: "Ready to Invoice",className: "bg-emerald-50 text-emerald-700" },
  draft_invoice:  { label: "Draft Invoice",   className: "bg-blue-50 text-blue-700" },
  invoiced:       { label: "Invoiced",        className: "bg-blue-50 text-blue-800" },
  partially_paid: { label: "Partial",         className: "bg-amber-50 text-amber-700" },
  paid:           { label: "Paid",            className: "bg-emerald-100 text-emerald-800" },
  hold:           { label: "On Hold",         className: "bg-red-50 text-red-700" },
};

// ── Components ──────────────────────────────────────────────────────────────

const baseClass =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium leading-none";

type ProjectStatusBadgeProps = {
  status: ProjectStatus;
  variant?: "internal" | "external";
};

export function ProjectStatusBadge({
  status,
  variant = "internal",
}: ProjectStatusBadgeProps) {
  const config = projectStatusMap[status] ?? {
    label: status,
    className: "bg-slate-100 text-slate-600",
  };

  const label =
    variant === "external"
      ? (projectStatusExternalMap[status] ?? config.label)
      : config.label;

  return (
    <span className={`${baseClass} ${config.className}`}>{label}</span>
  );
}

type BillingStatusBadgeProps = {
  status: BillingStatus;
};

export function BillingStatusBadge({ status }: BillingStatusBadgeProps) {
  const config = billingStatusMap[status] ?? {
    label: status,
    className: "bg-slate-100 text-slate-600",
  };

  return (
    <span className={`${baseClass} ${config.className}`}>{config.label}</span>
  );
}
