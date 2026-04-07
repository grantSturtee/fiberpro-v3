/**
 * File category constants for project_files table.
 * These match the file_category enum in the DB and the FileCategory type in domain.ts.
 *
 * Zones:
 *   CLIENT  — files submitted by the company at intake; read-only reference
 *   ADMIN   — files uploaded or managed by internal admin staff
 *   DESIGNER — files produced by the assigned designer
 *   GENERATED — outputs produced by automated package generation
 *   TRACKING — permit/billing/legal documents received externally
 */

export const FILE_CATEGORIES = {
  // ── Zone: CLIENT (intake) ─────────────────────────────────────────────────
  INTAKE_ATTACHMENT: "intake_attachment",
  CLIENT_REFERENCE: "client_reference",
  SOURCE_MAP: "source_map",

  // ── Zone: ADMIN workflow ──────────────────────────────────────────────────
  SLD_SHEET: "sld_sheet",
  APPLICATION_FORM: "application_form",
  COVER_SHEET: "cover_sheet",

  // ── Zone: DESIGNER output ─────────────────────────────────────────────────
  TCP_PDF: "tcp_pdf",
  TCP_SOURCE: "tcp_source",
  TCD_SHEET: "tcd_sheet",

  // ── Zone: GENERATED (n8n / package pipeline) ──────────────────────────────
  PERMIT_PACKAGE: "permit_package",

  // ── Zone: TRACKING (post-submission) ─────────────────────────────────────
  PERMIT_DOCUMENT: "permit_document",
  COI: "coi",
  PE_STAMP: "pe_stamp",
  INVOICE_ATTACHMENT: "invoice_attachment",

  OTHER: "other",
} as const;

export type FileCategoryValue = (typeof FILE_CATEGORIES)[keyof typeof FILE_CATEGORIES];

// ── Zone arrays — used for filtering and display separation ───────────────────

/** Files submitted by the client at intake. Admin reads only. */
export const CLIENT_FILE_CATEGORIES: FileCategoryValue[] = [
  FILE_CATEGORIES.INTAKE_ATTACHMENT,
  FILE_CATEGORIES.CLIENT_REFERENCE,
  FILE_CATEGORIES.SOURCE_MAP,
];

/** Admin-uploaded reference and workflow files. */
export const ADMIN_FILE_CATEGORIES: FileCategoryValue[] = [
  FILE_CATEGORIES.SLD_SHEET,
  FILE_CATEGORIES.APPLICATION_FORM,
  FILE_CATEGORIES.COVER_SHEET,
];

/** Designer-produced TCP sheets and source files. */
export const DESIGNER_FILE_CATEGORIES: FileCategoryValue[] = [
  FILE_CATEGORIES.TCP_PDF,
  FILE_CATEGORIES.TCP_SOURCE,
  FILE_CATEGORIES.TCD_SHEET,
];

/**
 * Generated package outputs.
 * Used by n8n after package generation completes.
 * Files in this zone should be treated as authoritative final outputs.
 */
export const GENERATED_FILE_CATEGORIES: FileCategoryValue[] = [
  FILE_CATEGORIES.PERMIT_PACKAGE,
];

/** Human-readable labels for each category. */
export const FILE_CATEGORY_LABELS: Record<FileCategoryValue, string> = {
  intake_attachment: "Intake Attachment",
  client_reference: "Client Reference",
  source_map: "Source Map",
  sld_sheet: "SLD Sheet",
  application_form: "Application Form",
  cover_sheet: "Cover Sheet",
  tcp_pdf: "TCP Sheet",
  tcp_source: "TCP Source File",
  tcd_sheet: "TCD Sheet",
  permit_package: "Permit Package",
  permit_document: "Permit Document",
  coi: "Certificate of Insurance",
  pe_stamp: "PE Stamp",
  invoice_attachment: "Invoice",
  other: "Other",
};
