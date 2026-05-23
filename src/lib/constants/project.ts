import type { UnifiedProjectStatus } from "@/types/domain";

// ── Plan / Job type options ───────────────────────────────────────────────────
// Display strings used in intake forms and project display.
// Stored as lowercase in DB; display labels used in UI.

export const PLAN_TYPE_OPTIONS = [
  "Aerial",
  "Underground",
  "Mixed",
  "Other",
] as const;

export type PlanTypeDisplay = (typeof PLAN_TYPE_OPTIONS)[number];

export const JOB_TYPE_OPTIONS = [
  "TCP",
  "SLD",
  "Full Package",
  "Revision",
  "Other",
] as const;

export type JobTypeDisplay = (typeof JOB_TYPE_OPTIONS)[number];

// ── Unified status groupings ──────────────────────────────────────────────────
// Operational buckets used by dashboards, queues, and filters. All groups are
// flat arrays over UnifiedProjectStatus; the legacy StatusGroup shape (label +
// urgent/collapsible flags) has been removed — those concerns now live in the
// view layer rather than the constants layer.

export const ATTENTION_STATUSES: UnifiedProjectStatus[] = [
  "new_project",
  "pending_review",
  "sub_bill_now",
];

export const PRODUCTION_STATUSES: UnifiedProjectStatus[] = [
  "in_production",
  "pending_review",
];

export const BILLING_STATUSES: UnifiedProjectStatus[] = [
  "billing_ready",
  "invoice_sent",
  "sub_bill_now",
  "permit_billed",
];

export const COMPLETED_STATUSES: UnifiedProjectStatus[] = [
  "paid_complete",
  "cancelled",
];

// Everything except the terminal states. Used for "active project" counts.
export const ACTIVE_STATUSES: UnifiedProjectStatus[] = [
  "new_project",
  "in_production",
  "pending_review",
  "billing_ready",
  "invoice_sent",
  "sub_bill_now",
  "permit_billed",
];

// All unified statuses in workflow order. Source of truth for iteration and
// validation; keep in sync with the UnifiedProjectStatus type definition.
export const ALL_UNIFIED_STATUSES: UnifiedProjectStatus[] = [
  "new_project",
  "in_production",
  "pending_review",
  "billing_ready",
  "invoice_sent",
  "sub_bill_now",
  "permit_billed",
  "paid_complete",
  "cancelled",
];
