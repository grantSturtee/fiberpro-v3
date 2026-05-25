import type { UnifiedProjectStatus } from "@/types/domain";

// ── Project Status Badge ──────────────────────────────────────────────────────
// Single canonical badge over UnifiedProjectStatus. Each value has a fixed
// label + color pair; legacy ProjectStatus is no longer accepted — callers
// must switch to the unified status column.

type UnifiedStatusConfig = {
  label: string;
  bg: string;
  fg: string;
};

const unifiedStatusMap: Record<UnifiedProjectStatus, UnifiedStatusConfig> = {
  new_project:    { label: "New Project",     bg: "#C4A882", fg: "#ffffff" },
  in_production:  { label: "In Production",   bg: "#E8A87C", fg: "#ffffff" },
  pending_review: { label: "Pending Review",  bg: "#E8829A", fg: "#ffffff" },
  billing_ready:  { label: "Billing Ready",   bg: "#9B8EC4", fg: "#ffffff" },
  invoice_sent:   { label: "Invoice Sent",    bg: "#E8A0B4", fg: "#ffffff" },
  sub_bill_now:   { label: "Sub · Bill Now",  bg: "#E8D44D", fg: "#5a4e00" },
  permit_billed:  { label: "Permit Billed",   bg: "#82C4A0", fg: "#ffffff" },
  paid_complete:  { label: "Paid · Complete", bg: "#6B8CBA", fg: "#ffffff" },
  cancelled:      { label: "Cancelled",       bg: "#C4C4C4", fg: "#ffffff" },
};

const PILL_CLASS =
  "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap";

type ProjectStatusBadgeProps = {
  status: UnifiedProjectStatus;
};

export function ProjectStatusBadge({ status }: ProjectStatusBadgeProps) {
  const config = unifiedStatusMap[status];
  return (
    <span
      className={PILL_CLASS}
      style={{ backgroundColor: config.bg, color: config.fg }}
    >
      {config.label}
    </span>
  );
}

