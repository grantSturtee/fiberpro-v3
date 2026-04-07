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

// ── Storage folder zones ──────────────────────────────────────────────────────
//
// Maps to project_files.file_type and the physical storage path prefix.
// Bucket: project-files
// Path:   /{project_id}/{file_type}/{filename}
//
// Generated files use fixed filenames so n8n can overwrite them in-place:
//   generated/permit_package.pdf
//   generated/cover_sheet.pdf
//   generated/application.pdf

export const FILE_TYPES = {
  INTAKE:    "intake",
  SLD:       "sld",
  TCP:       "tcp",
  GENERATED: "generated",
  OTHER:     "other",
} as const;

export type FileType = (typeof FILE_TYPES)[keyof typeof FILE_TYPES];

/** Fixed output filenames within the generated/ folder. n8n writes to these paths. */
export const GENERATED_FILE_NAMES = {
  PERMIT_PACKAGE: "permit_package.pdf",
  COVER_SHEET:    "cover_sheet.pdf",
  APPLICATION:    "application.pdf",
} as const;

/**
 * Canonical storage path for a project file.
 * For generated files, pass a GENERATED_FILE_NAMES value as fileName.
 * For all others, pass a unique timestamped filename to avoid collisions.
 */
export function getStoragePath(
  projectId: string,
  fileType: FileType,
  fileName: string
): string {
  return `${projectId}/${fileType}/${fileName}`;
}

/**
 * Derive the storage folder zone from a file_category value.
 * Used when inserting new rows to set file_type consistently.
 */
export function categoryToFileType(category: FileCategoryValue): FileType {
  switch (category) {
    case "intake_attachment":
    case "client_reference":
    case "source_map":
      return FILE_TYPES.INTAKE;

    case "sld_sheet":
    case "application_form":
    case "cover_sheet":
      return FILE_TYPES.SLD;

    case "tcp_pdf":
    case "tcp_source":
    case "tcd_sheet":
      return FILE_TYPES.TCP;

    case "permit_package":
    case "permit_document":
    case "coi":
    case "pe_stamp":
    case "invoice_attachment":
      return FILE_TYPES.GENERATED;

    default:
      return FILE_TYPES.OTHER;
  }
}

// ── File type display label ───────────────────────────────────────────────────
//
// Derives a compact uppercase label from the file's extension for use in
// file row badges. Prefer extension over mime_type so the label matches what
// the user sees in the filename (e.g. "JPG" not "IMAGE/JPEG").

export function getFileTypeLabel(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "pdf":  return "PDF";
    case "png":  return "PNG";
    case "jpg":  return "JPG";
    case "jpeg": return "JPEG";
    case "webp": return "WEBP";
    case "gif":  return "GIF";
    case "svg":  return "SVG";
    case "zip":  return "ZIP";
    case "dwg":  return "DWG";
    case "dxf":  return "DXF";
    default:     return "FILE";
  }
}

// ── Allowed intake upload types (company-side) ────────────────────────────────
//
// Validation uses MIME OR extension — pass if either matches.
// This is required because CAD file MIME types (dwg, dxf) are inconsistently
// reported across browsers/OS and cannot be reliably validated by MIME alone.
// application/octet-stream is intentionally excluded.
//
// To expand: add to both sets as appropriate, and add the extension to INTAKE_ACCEPT_ATTR.

export const INTAKE_ALLOWED_MIME_TYPES = new Set([
  // Standard browser-friendly formats
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  // ZIP — two variants seen across browsers
  "application/zip",
  "application/x-zip-compressed",
  // DWG — known variants; extension is the real gate (see INTAKE_ALLOWED_EXTENSIONS)
  "application/acad",
  "application/x-acad",
  "application/autocad_dwg",
  "application/dwg",
  "application/x-dwg",
  "image/x-dwg",
  // DXF — known variants; extension is the real gate (see INTAKE_ALLOWED_EXTENSIONS)
  "application/dxf",
  "image/vnd.dxf",
  "application/x-dxf",
]);

export const INTAKE_ALLOWED_EXTENSIONS = new Set([
  "pdf", "png", "jpg", "jpeg", "webp", "gif",
  "zip",
  "dwg", "dxf",
]);

/** Comma-separated value for <input accept="..."> */
export const INTAKE_ACCEPT_ATTR = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/zip",
  ".zip",
  ".dwg",
  ".dxf",
].join(",");

// ── Browser-viewable MIME types ───────────────────────────────────────────────
//
// Used to gate the View action on file rows.
// Types not in this set get a disabled View button and download-only behavior.

export const BROWSER_VIEWABLE_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "text/plain",
  "text/csv",
  "application/json",
]);

export function isBrowserViewable(mimeType: string | null | undefined): boolean {
  return !!mimeType && BROWSER_VIEWABLE_MIME_TYPES.has(mimeType);
}

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
