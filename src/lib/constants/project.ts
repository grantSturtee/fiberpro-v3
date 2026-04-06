import type { ProjectStatus } from "@/types/domain";

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

// ── Status groupings ──────────────────────────────────────────────────────────
// Used by admin and designer dashboard pages to segment the project queue.

export type StatusGroup = {
  label: string;
  statuses: ProjectStatus[];
  urgent?: boolean;
};

// Admin operations queue groupings.
export const ADMIN_STATUS_GROUPS: StatusGroup[] = [
  {
    label: "Needs Attention",
    statuses: [
      "intake_review",
      "waiting_on_client",
      "waiting_for_admin_review",
      "revisions_required",
      "authority_action_needed",
    ],
    urgent: true,
  },
  {
    label: "Active Work",
    statuses: [
      "ready_for_assignment",
      "assigned",
      "in_design",
      "approved",
      "package_generating",
      "ready_for_submission",
      "submitted",
      "waiting_on_authority",
    ],
  },
  {
    label: "Complete",
    statuses: ["permit_received", "closed"],
  },
];

// Designer dashboard groupings.
export const DESIGNER_STATUS_GROUPS: StatusGroup[] = [
  {
    label: "Revisions Required",
    statuses: ["revisions_required"],
    urgent: true,
  },
  {
    label: "In Design",
    statuses: ["in_design", "assigned"],
  },
  {
    label: "Submitted for Review",
    statuses: ["waiting_for_admin_review"],
  },
];

// Statuses that indicate a project is "active" for dashboard counts.
// Used by company portal to display active project count.
export const ACTIVE_STATUSES: ProjectStatus[] = [
  "intake_review",
  "waiting_on_client",
  "ready_for_assignment",
  "assigned",
  "in_design",
  "waiting_for_admin_review",
  "revisions_required",
  "approved",
  "package_generating",
  "ready_for_submission",
  "submitted",
  "waiting_on_authority",
  "authority_action_needed",
];
