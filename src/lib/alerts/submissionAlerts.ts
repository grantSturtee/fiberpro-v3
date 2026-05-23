import type { ProjectStatus } from "@/types/domain";

// ── Alert types ───────────────────────────────────────────────────────────────

export type SubmissionAlertKind =
  | "authority_action_needed"       // status is authority_action_needed
  | "package_ready_not_submitted"   // ready_for_submission for READY_DAYS+ days
  | "submitted_aging"               // submitted/waiting_on_authority for AGING_DAYS+ days
  | "permit_received_not_closed";   // permit_received for PERMIT_DAYS+ days

export type SubmissionAlertSeverity = "high" | "medium" | "low";

export type SubmissionAlert = {
  kind: SubmissionAlertKind;
  label: string;
  detail: string;
  severity: SubmissionAlertSeverity;
};

// ── Thresholds (calendar days) ────────────────────────────────────────────────

export const ALERT_THRESHOLDS = {
  readyNotSubmittedDays: 5,   // package ready but admin hasn't submitted
  submittedAgingDays:   21,   // submitted/waiting — authority hasn't responded
  permitNotClosedDays:  14,   // permit received but project not closed
} as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / DAY_MS);
}

// ── Computation ───────────────────────────────────────────────────────────────

/**
 * Derives a single submission-pipeline alert for a project, or null if none.
 * Uses updated_at as the best available proxy for time-in-current-status.
 * Touching any field on the project resets the aging clock — acceptable for v1.
 */
export function computeSubmissionAlert(
  status: ProjectStatus,
  updatedAt: string | null,
): SubmissionAlert | null {
  const age = daysSince(updatedAt);

  if (status === "authority_action_needed") {
    return {
      kind:     "authority_action_needed",
      label:    "Authority Action Needed",
      detail:   "Authority returned with a question or correction — awaiting follow-up.",
      severity: "high",
    };
  }

  if (
    status === "ready_for_submission" &&
    age >= ALERT_THRESHOLDS.readyNotSubmittedDays
  ) {
    return {
      kind:     "package_ready_not_submitted",
      label:    "Ready — Not Submitted",
      detail:   `Package ready for ${age}d, not yet submitted to authority.`,
      severity: "medium",
    };
  }

  if (
    (status === "submitted" || status === "waiting_on_authority") &&
    age >= ALERT_THRESHOLDS.submittedAgingDays
  ) {
    return {
      kind:     "submitted_aging",
      label:    "Submission Aging",
      detail:   `Submitted ${age}d ago — no authority response recorded.`,
      severity: "medium",
    };
  }

  if (
    status === "permit_received" &&
    age >= ALERT_THRESHOLDS.permitNotClosedDays
  ) {
    return {
      kind:     "permit_received_not_closed",
      label:    "Permit Received — Not Closed",
      detail:   `Permit received ${age}d ago — project not yet closed.`,
      severity: "low",
    };
  }

  return null;
}

// ── Styling helpers (safe to import in server components) ─────────────────────

export const ALERT_SEVERITY_DOT: Record<SubmissionAlertSeverity, string> = {
  high:   "bg-red-500",
  medium: "bg-amber-400",
  low:    "bg-sky-400",
};

export const ALERT_SEVERITY_TEXT: Record<SubmissionAlertSeverity, string> = {
  high:   "text-red-700",
  medium: "text-amber-700",
  low:    "text-sky-700",
};

export const ALERT_SEVERITY_BG: Record<SubmissionAlertSeverity, string> = {
  high:   "bg-red-50 border-red-200 text-red-800",
  medium: "bg-amber-50 border-amber-200 text-amber-800",
  low:    "bg-sky-50 border-sky-200 text-sky-800",
};
