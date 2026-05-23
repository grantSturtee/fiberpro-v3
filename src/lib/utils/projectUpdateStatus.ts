/**
 * Shared logic for project update staleness and structured status values.
 */

// ── Active statuses ───────────────────────────────────────────────────────────
// A project is considered "active" if it is in any non-terminal workflow state.
// Closed, cancelled, and permit_received are excluded.

export const ACTIVE_STATUSES = [
  // Needs-attention states
  "intake_review",
  "waiting_on_client",
  "waiting_for_admin_review",
  "revisions_required",
  "authority_action_needed",
  // In-production states
  "ready_for_assignment",
  "assigned",
  "in_design",
  "approved",
  "package_generating",
  // Submission states
  "ready_for_submission",
  "submitted",
  "waiting_on_authority",
] as const;

// ── Threshold ─────────────────────────────────────────────────────────────────

/** Number of days without an update before a project is considered stale. */
export const STALE_DAYS = 3;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns how many whole days have passed since the given ISO timestamp,
 * or null if no timestamp is provided (meaning no updates exist at all).
 */
export function daysSinceUpdate(lastUpdateAt: string | null): number | null {
  if (!lastUpdateAt) return null;
  return Math.floor(
    (Date.now() - new Date(lastUpdateAt).getTime()) / 86_400_000
  );
}

/**
 * Returns true if a project needs a status update:
 * - no updates at all, OR
 * - most recent update is staleDays or more days old.
 */
export function isUpdateStale(lastUpdateAt: string | null, staleDays: number = STALE_DAYS): boolean {
  const days = daysSinceUpdate(lastUpdateAt);
  return days === null || days >= staleDays;
}

/**
 * Returns the first meaningful segment of a job name.
 * Splits on em dash and returns only what comes before it.
 */
export function firstJobNameSegment(name: string): string {
  return name.split(" — ")[0].trim();
}

// ── Structured update status ──────────────────────────────────────────────────
// Each update now carries an explicit status rather than being classified
// by free-text matching.

export type UpdateStatus =
  | "not_started"
  | "in_design"
  | "submitted_for_review"
  | "revisions_required"
  | "approved"
  | "submitted";

// Options shown in the manual post-update form (admin + designer can post these)
export const MANUAL_UPDATE_STATUS_OPTIONS: { value: UpdateStatus; label: string }[] = [
  { value: "not_started", label: "Not Started" },
  { value: "in_design",   label: "In Design" },
];

// All valid status values — includes workflow-driven statuses used by auto-inserts
export const UPDATE_STATUS_META: Record<
  UpdateStatus,
  { label: string; color: string; barColor: string }
> = {
  not_started:          { label: "Not Started",          color: "#6b7280", barColor: "#d1d5db" },
  in_design:            { label: "In Design",            color: "#2563eb", barColor: "#93c5fd" },
  submitted_for_review: { label: "Submitted for Review", color: "#7c3aed", barColor: "#c4b5fd" },
  revisions_required:   { label: "Revisions Required",   color: "#ea580c", barColor: "#fdba74" },
  approved:             { label: "Approved",             color: "#16a34a", barColor: "#86efac" },
  submitted:            { label: "Submitted",            color: "#15803d", barColor: "#4ade80" },
};

export const VALID_UPDATE_STATUSES = new Set<string>([
  "not_started", "in_design", "submitted_for_review",
  "revisions_required", "approved", "submitted",
]);
