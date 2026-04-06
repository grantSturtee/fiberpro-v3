// ── Project Status ────────────────────────────────────────────────────────────
// The single canonical status dimension for a project's position in the workflow.
// All 16 states map to a clear operational phase.

export type ProjectStatus =
  | "intake_review"           // Admin reviewing submitted intake; no assignment yet
  | "waiting_on_client"       // Admin needs more info from company before proceeding
  | "ready_for_assignment"    // Intake complete; awaiting designer assignment
  | "assigned"                // Designer assigned; not yet started
  | "in_design"               // Designer actively working on TCP sheets
  | "waiting_for_admin_review"// Designer submitted; admin must review TCP sheets
  | "revisions_required"      // Admin rejected; designer must revise and resubmit
  | "approved"                // Admin approved design; package can now be generated
  | "package_generating"      // n8n workflow job running for package assembly
  | "ready_for_submission"    // Package ready; admin will submit to authority
  | "submitted"               // Package submitted to government authority
  | "waiting_on_authority"    // Submitted; authority processing (normal turnaround)
  | "authority_action_needed" // Authority returned with questions or corrections
  | "permit_received"         // Permit granted and received
  | "closed"                  // Project complete
  | "cancelled";              // Project cancelled

// ── Billing Status ────────────────────────────────────────────────────────────
// Tracks the invoice lifecycle for a project.
// Invoice becomes eligible only after package is generated (approved + packaged).

export type BillingStatus =
  | "not_ready"        // Design not yet approved/packaged; cannot invoice
  | "ready_to_invoice" // Package generated; billing can create invoice
  | "draft_invoice"    // Invoice created but not yet sent
  | "invoiced"         // Invoice sent to client
  | "partially_paid"   // Partial payment received
  | "paid"             // Paid in full
  | "hold";            // Billing on hold (dispute, credit, etc.)

// ── File Category ─────────────────────────────────────────────────────────────
// Classifies every file uploaded to a project.
// Drives download permissions, package assembly inclusion, and storage paths.

export type FileCategory =
  | "intake_attachment"  // Files submitted by company at intake
  | "source_map"         // Source reference maps (admin)
  | "client_reference"   // Client-provided reference documents
  | "tcp_pdf"            // TCP sheet PDFs uploaded by designer
  | "tcp_source"         // TCP source files (CAD/vector, designer)
  | "tcd_sheet"          // TCD sheet PDFs from the library
  | "sld_sheet"          // SLD reference sheets uploaded by admin
  | "application_form"   // Jurisdiction permit application form
  | "cover_sheet"        // Generated or template cover sheet
  | "permit_package"     // Final assembled permit package PDF
  | "permit_document"    // Received permit document from authority
  | "coi"                // Certificate of Insurance
  | "pe_stamp"           // PE stamp page
  | "invoice_attachment" // Invoice PDF or supporting billing document
  | "other";

// ── Authority Type ────────────────────────────────────────────────────────────
// The type of government body issuing the permit.
// Drives jurisdiction requirement lookups and submission workflow.

export type AuthorityType =
  | "county"     // NJ county road authority (e.g. Bergen County)
  | "njdot"      // NJ Department of Transportation (state highway)
  | "municipal"  // Municipal/township road authority
  | "other";     // Other government authority

// ── Plan Type / Job Type ──────────────────────────────────────────────────────
// Describes the nature of the work and the type of permit package needed.

export type PlanType =
  | "aerial"
  | "underground"
  | "mixed"
  | "other";

export type JobType =
  | "tcp"           // Traffic Control Plan only
  | "sld"           // Site Layout Diagram only
  | "full_package"  // Full permit package (TCP + SLD + application)
  | "revision"      // Revision to a previously submitted plan
  | "other";

// ── TCD Library ───────────────────────────────────────────────────────────────
// A reusable Traffic Control Device sheet stored in the system library.
// Admin selects one or more TCD sheets per project; they're included in the package.

export interface TcdLibraryItem {
  id: string;
  code: string;          // e.g. "TCD-2"
  description: string;   // e.g. "Divided highway shoulder closure, no flaggers"
  category?: string;     // Grouping: "shoulder", "lane", "ramp", "highway", etc.
  // fileUrl: string;    // Added at runtime from Supabase Storage signed URL
}

// ── Cover Sheet Template ──────────────────────────────────────────────────────
// A reusable cover sheet template for permit packages.
// Templates are authority-type-aware and auto-populated with project data at generation.

export interface CoverSheetTemplate {
  id: string;
  name: string;                // e.g. "Bergen County Standard — Comcast"
  authorityType: AuthorityType;
  clientHint?: string;         // Optional client affinity (display only, not a hard filter)
  // fieldMapping: Record<string, string>; // Added when package generation is implemented
}

// ── Project (core entity) ─────────────────────────────────────────────────────
// The project list/summary shape used in tables and cards.
// Full project detail (intake fields, files, activity) is in src/types/project.ts.

export interface Project {
  id: string;
  jobNumber: string;       // FiberPro job number: "FP-YYYY-NNNN"
  jobName: string;
  jobNumberClient?: string; // Client's reference number
  address: string;
  authority: string;       // Display string: "Bergen County", "NJDOT", etc.
  authorityType: AuthorityType;
  county: string;
  status: ProjectStatus;
  billingStatus: BillingStatus;
  assignedDesigner?: string;  // Display name (not user ID)
  createdAt: string;
}
