// Workflow and automation types.
// These map to the workflow_jobs table and n8n automation concepts.
// The app enqueues jobs (status = "pending"); n8n executes them and writes
// back status + result via webhook. The app never executes generation logic.

// ── Enums ─────────────────────────────────────────────────────────────────────

export type WorkflowJobStatus =
  | "pending"       // Created, waiting for n8n pickup (canonical term)
  | "queued"        // Legacy alias for pending — kept for backward compat
  | "running"       // n8n execution in progress
  | "completed"     // n8n reported success; result is populated
  | "failed"        // n8n reported failure; error / error_message populated
  | "cancelled";    // Cancelled before or during execution

export type WorkflowJobType =
  // ── Compute (synchronous, app-side) ──────────────────────────────────────
  | "project_computed"           // Jurisdiction match + price calculation

  // ── Document generation (async, n8n) ─────────────────────────────────────
  | "generate_permit_package"    // Assemble full permit package PDF
  | "generate_cover_sheet"       // Render cover sheet from template
  | "generate_application_form"  // Fill permit application form
  | "generate_tcp_package"       // Compile TCP sheets into single PDF

  // ── Submission (async, n8n) ───────────────────────────────────────────────
  | "submit_permit"              // Submit package to authority portal

  // ── Billing (async, n8n) ──────────────────────────────────────────────────
  | "generate_invoice"           // Generate invoice document

  // ── Legacy values (kept for backward compat with existing rows) ───────────
  | "package_generation"
  | "pdf_assembly"
  | "permit_submission"
  | "invoice_generation";

// ── Table row (matches workflow_jobs physical schema) ─────────────────────────

export interface WorkflowJob {
  id: string;
  project_id: string;
  job_type: WorkflowJobType;          // physical column is "job_type" (type is SQL-reserved)
  status: WorkflowJobStatus;
  triggered_by: string | null;        // auth.users.id
  n8n_execution_id: string | null;
  metadata: Record<string, unknown> | null;  // inputs passed to n8n
  result: Record<string, unknown> | null;    // outputs written back by n8n
  error: string | null;                      // short error code from n8n
  error_message: string | null;              // long-form error (legacy column)
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

// ── Status display ────────────────────────────────────────────────────────────

export const JOB_STATUS_LABEL: Record<WorkflowJobStatus, string> = {
  pending:   "Queued",
  queued:    "Queued",
  running:   "Generating...",
  completed: "Ready",
  failed:    "Error",
  cancelled: "Cancelled",
};

export const JOB_STATUS_COLOR: Record<WorkflowJobStatus, string> = {
  pending:   "text-amber-600",
  queued:    "text-amber-600",
  running:   "text-blue-600",
  completed: "text-emerald-700",
  failed:    "text-red-600",
  cancelled: "text-muted",
};

// ── Metadata shapes ───────────────────────────────────────────────────────────
// Typed inputs for each job type stored in workflow_jobs.metadata.
// n8n reads these fields to know what files to fetch and how to assemble them.

export interface PermitPackageMetadata {
  project_id: string;
  required_documents: string[];         // e.g. ["coi", "pe_stamp", "cover_sheet"]
  jurisdiction: {
    id: string | null;
    authority_name: string | null;
    submission_method: string | null;
  };
  selected_tcds: Array<{
    id: string;
    code: string;
    storage_path: string | null;
  }>;
  file_ids: {
    sld: string[];                      // project_files.id for SLD sheets
    tcp: string[];                      // project_files.id for TCP sheets
    cover_template_id: string | null;   // cover_sheet_templates.id
  };
}

// ── Package readiness ─────────────────────────────────────────────────────────

export type PackageReadinessStatus =
  | "not_ready"   // Missing required items or design not approved
  | "ready"       // All items present, design approved — can enqueue
  | "pending"     // Job enqueued, waiting for n8n pickup
  | "running"     // n8n generating
  | "completed"   // Package generated, file available
  | "failed";     // Generation failed

export interface PackageReadinessItem {
  key: string;
  label: string;
  satisfied: boolean;
  notes?: string;
}
