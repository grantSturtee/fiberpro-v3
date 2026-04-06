export type ProjectStatus =
  | "intake_review"
  | "waiting_on_client"
  | "ready_for_assignment"
  | "assigned"
  | "in_design"
  | "waiting_for_admin_review"
  | "revisions_required"
  | "approved"
  | "package_generating"
  | "ready_for_submission"
  | "submitted"
  | "waiting_on_authority"
  | "authority_action_needed"
  | "permit_received"
  | "closed"
  | "cancelled";

export type BillingStatus =
  | "not_ready"
  | "ready_to_invoice"
  | "draft_invoice"
  | "invoiced"
  | "partially_paid"
  | "paid"
  | "hold";

export type FileCategory =
  | "intake_attachment"
  | "source_map"
  | "client_reference"
  | "tcp_pdf"
  | "tcp_source"
  | "tcd_sheet"
  | "sld_sheet"
  | "application_form"
  | "cover_sheet"
  | "permit_package"
  | "permit_document"
  | "coi"
  | "pe_stamp"
  | "invoice_attachment"
  | "other";

export interface Project {
  id: string;
  jobNumber: string;
  jobName: string;
  address: string;
  authority: string;
  status: ProjectStatus;
  billingStatus: BillingStatus;
  createdAt: string;
}