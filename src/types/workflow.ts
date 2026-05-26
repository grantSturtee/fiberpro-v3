import type { PageManifest } from "@/lib/utils/packageAssembly";

// ── Template slot ─────────────────────────────────────────────────────────────
// Resolved page_templates row included in generation metadata so n8n can
// download and apply templates without additional DB lookups.

export type TemplateSlot = {
  id: string;
  name: string;
  storage_path: string | null;
  placement_box: { x: number; y: number; width: number; height: number } | null;
  field_mappings: Record<string, unknown> | null;
};

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
  pending:   "text-[#D97706]",
  queued:    "text-[#D97706]",
  running:   "text-[#1565C0]",
  completed: "text-[#16A34A]",
  failed:    "text-[#DC2626]",
  cancelled: "text-[#6B7280]",
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
    cover_template_id: string | null;   // cover_sheet_templates.id (legacy; prefer blueprint_id)
  };
  // The active package_blueprints.id for this project's authority at enqueue time.
  // Populated by enqueuePackageGeneration; used by generate-package to resolve
  // blueprint-specific template overrides (cover, application, certification).
  blueprint_id: string | null;
  // Deterministic page manifest computed at enqueue time.
  // Records assembly order, global page numbers, and total page count.
  // Added in Phase 4B; optional for backward-compat with older jobs.
  page_manifest?: PageManifest;
  // Resolved blueprint slot templates — all fields needed by the generation engine
  // so n8n can apply wrappers without extra DB lookups. Each slot includes the
  // template PDF storage path, placement box, and field mappings.
  // Null slots = that document type not configured in this blueprint.
  blueprint_slots?: {
    cover:       TemplateSlot | null;
    tcp_wrapper: TemplateSlot | null;
    tcd_wrapper: TemplateSlot | null;
    sld_wrapper: TemplateSlot | null;
    app_form:    TemplateSlot | null;
    cert_form:   TemplateSlot | null;
  };
  // SLD and TCP files with storage paths — n8n uses these to download PDFs.
  // Parallel arrays to file_ids.sld / file_ids.tcp; same order.
  file_details?: {
    sld: Array<{ id: string; storage_path: string }>;
    tcp: Array<{ id: string; storage_path: string }>;
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
