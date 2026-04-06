// Workflow and automation types.
// These map to the workflow_jobs table and associated automation concepts.
// n8n owns execution; the app creates job records and reads status updates via webhook callbacks.

// ── Workflow Job ──────────────────────────────────────────────────────────────

export type WorkflowJobStatus =
  | "queued"      // Created, not yet picked up by n8n
  | "running"     // n8n execution in progress
  | "completed"   // n8n reported success
  | "failed"      // n8n reported failure or timeout
  | "cancelled";  // Cancelled before or during execution

export type WorkflowJobType =
  | "package_generation"   // Assemble permit package PDF
  | "pdf_assembly"         // Sub-job: merge/stamp individual PDFs
  | "permit_submission"    // Future: submit to authority portal
  | "invoice_generation";  // Future: generate invoice document

export interface WorkflowJob {
  id: string;
  projectId: string;
  type: WorkflowJobType;
  status: WorkflowJobStatus;
  triggeredBy: string;       // Display name of user who triggered
  createdAt: string;         // ISO timestamp
  completedAt?: string;      // ISO timestamp, set on completion or failure
  errorMessage?: string;     // Set when status = "failed"
  n8nExecutionId?: string;   // n8n execution ID for correlation and debugging
}

// ── Package Generation ────────────────────────────────────────────────────────

// The items that get assembled into a permit package.
// Order matters — cover sheet is always first.
export type PackageItemType =
  | "cover_sheet"       // Authority/client-specific cover sheet template
  | "tcp_sheets"        // Designer-uploaded TCP PDFs
  | "sld_sheets"        // Admin-uploaded SLD reference sheets
  | "tcd_sheets"        // Selected TCD sheet PDFs from library
  | "application_form"  // Jurisdiction-specific permit application
  | "pe_stamp"          // PE stamp page (some jurisdictions require)
  | "coi";              // Certificate of Insurance (some jurisdictions require)

// Readiness signal computed from project state.
// Not stored — derived at query/render time from project fields and file counts.
export type PackageReadinessStatus =
  | "not_ready"     // Missing required items or design not approved
  | "ready"         // All required items present and design approved
  | "queued"        // Workflow job created, waiting for n8n pickup
  | "generating"    // n8n job is running
  | "generated"     // Package file exists in storage
  | "failed";       // Generation failed — error available on WorkflowJob

// Required items checklist for package generation.
// Each item tracks whether it's satisfied for a given project.
export interface PackageReadinessItem {
  type: PackageItemType;
  label: string;
  satisfied: boolean;
  notes?: string;   // e.g. "Required by Bergen County" or "Optional for NJDOT"
}
