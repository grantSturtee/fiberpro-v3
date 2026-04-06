import type { AuthorityType, PlanType, JobType, FileCategory } from "./domain";

// ── Intake ────────────────────────────────────────────────────────────────────
// Fields submitted via the company intake form.
// These map to the project record on creation; later also to a separate intake_submissions table.

export interface ProjectIntakeFields {
  rhinoPM?: string;
  clientManager?: string;       // e.g. Comcast manager name
  jobNumberClient?: string;     // Client's own reference number (JB-XXXX)
  submittedToFiberProAt: string; // ISO date
  requestedApprovalDate: string; // ISO date
  jobName: string;
  jobAddress: string;
  authorityType: AuthorityType;
  county: string;               // NJ county name
  city: string;
  township?: string;
  typeOfPlan: PlanType;
  jobType: JobType;
  notes?: string;
}

// ── Files ─────────────────────────────────────────────────────────────────────
// Represents a single uploaded file record on a project.
// Real shape maps to project_files table.

export interface ProjectFile {
  id: string;
  name: string;
  category: FileCategory;
  uploadedAt: string;       // Display date string
  uploadedBy: string;       // Display name
  // fileUrl added at query time from Supabase Storage signed URL
}

// ── TCD Selection ─────────────────────────────────────────────────────────────
// A TCD sheet selected from the library and attached to a specific project.

export interface ProjectTcdSelection {
  code: string;
  description: string;
}

// ── Comments / Messages ───────────────────────────────────────────────────────
// Project thread messages. Visible to both internal and external users
// depending on role. Maps to project_messages table.

export type MessageSenderRole = "admin" | "designer" | "company";

export interface ProjectMessage {
  id: string;
  from: string;             // Display name
  role: MessageSenderRole;
  message: string;
  at: string;               // Display date/time string
}

// ── Activity Log ──────────────────────────────────────────────────────────────
// Internal audit trail entries. Not shown to company-side users.
// Maps to project_activity_log table.

export interface ProjectActivity {
  id: string;
  actor: string;            // Display name
  action: string;           // Human-readable action description
  at: string;               // Display date/time string
}

// ── Submission / Permit Tracking ──────────────────────────────────────────────
// Fields written by admin when submitting and tracking the permit.
// Mapped to the project record; admin-editable only.

export interface ProjectPermitTracking {
  submissionDate?: string;          // Date package was submitted to authority
  authorityTrackingNumber?: string; // Authority-assigned permit/tracking number
  expectedResponseDate?: string;    // Estimated authority response date
  permitReceivedDate?: string;      // Actual permit receipt date
  permitNotes?: string;             // Admin notes from authority interactions
}
