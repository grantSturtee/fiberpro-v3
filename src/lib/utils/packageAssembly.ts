// Package assembly model for permit packages.
//
// This module is the single source of truth for:
//   1. Assembly order:  Cover → TCP → TCD → SLD
//   2. Page numbering:  1-based global, 0-based within section
//   3. Generation inputs:  all fields required before generation can proceed
//
// Ordering rules:
//   Cover    — always page 1, always exactly 1 page
//   TCP      — manual order (sort_order ASC NULLS LAST, then created_at ASC,
//              enforced at query time). Phase A added the column; rows with
//              sort_order = NULL fall back to upload order.
//   TCD      — admin selection order (sort_order ASC, enforced at query time)
//   SLD      — upload order (created_at ASC, enforced at query time)
//
// This logic is intentionally pure (no DB calls, no side effects) so it can
// be called from both server-side page rendering and from the generation action.

// ── Types ─────────────────────────────────────────────────────────────────────

export type PackageSection = "cover" | "tcp" | "tcd" | "sld";

export type ManifestPage = {
  section: PackageSection;
  sectionIndex: number;   // 0-based index within the section
  globalPage: number;     // 1-based page number in the main package
  totalPages: number;     // total pages in the main package (same for every row)
  fileId: string | null;  // project_files.id (tcp/sld) or tcd_library_item_id; null for cover
  label: string;          // human-readable: "Cover Sheet", "TCP Sheet 1", "TCD TW-1", "SLD Sheet 2"
};

export type PageManifest = {
  pages: ManifestPage[];
  totalPages: number;
  sectionCounts: {
    cover: number;  // always 1
    tcp: number;
    tcd: number;
    sld: number;
  };
  // First / last global page number for each section, for display ranges.
  // Undefined when the section has zero pages.
  sectionRanges: {
    cover: { first: number; last: number } | null;
    tcp:   { first: number; last: number } | null;
    tcd:   { first: number; last: number } | null;
    sld:   { first: number; last: number } | null;
  };
};

// Minimal file descriptor — only fields needed for manifest construction.
export type ManifestFileRef = {
  id: string;
  file_name: string;
};

export type ManifestTcdRef = {
  tcdItemId: string;  // tcd_library.id — used as fileId in the page manifest
  code: string;       // e.g. "TW-1"
};

// ── Core builder ──────────────────────────────────────────────────────────────

/**
 * Build a deterministic page manifest from pre-sorted inputs.
 *
 * Callers are responsible for passing arrays already in the correct sort order:
 *   tcpFiles  — sorted by created_at ASC (upload order)
 *   tcdSelections — sorted by sort_order ASC (admin selection order)
 *   sldFiles  — sorted by created_at ASC (upload order)
 *
 * Returns a PageManifest with global page numbers and section ranges.
 */
export function buildPageManifest(
  tcpFiles: ManifestFileRef[],
  tcdSelections: ManifestTcdRef[],
  sldFiles: ManifestFileRef[],
): PageManifest {
  const coverCount = 1;
  const totalPages = coverCount + tcpFiles.length + tcdSelections.length + sldFiles.length;

  const pages: ManifestPage[] = [];
  let globalPage = 1;

  const sectionRanges: PageManifest["sectionRanges"] = {
    cover: null,
    tcp: null,
    tcd: null,
    sld: null,
  };

  // Cover — always page 1
  const coverFirst = globalPage;
  pages.push({
    section: "cover",
    sectionIndex: 0,
    globalPage: globalPage++,
    totalPages,
    fileId: null,
    label: "Cover Sheet",
  });
  sectionRanges.cover = { first: coverFirst, last: coverFirst };

  // TCP sheets — upload order
  if (tcpFiles.length > 0) {
    const tcpFirst = globalPage;
    for (let i = 0; i < tcpFiles.length; i++) {
      pages.push({
        section: "tcp",
        sectionIndex: i,
        globalPage: globalPage++,
        totalPages,
        fileId: tcpFiles[i].id,
        label: `TCP Sheet ${i + 1}`,
      });
    }
    sectionRanges.tcp = { first: tcpFirst, last: globalPage - 1 };
  }

  // TCD sheets — admin selection order (sort_order)
  if (tcdSelections.length > 0) {
    const tcdFirst = globalPage;
    for (let i = 0; i < tcdSelections.length; i++) {
      pages.push({
        section: "tcd",
        sectionIndex: i,
        globalPage: globalPage++,
        totalPages,
        fileId: tcdSelections[i].tcdItemId,
        label: `TCD ${tcdSelections[i].code}`,
      });
    }
    sectionRanges.tcd = { first: tcdFirst, last: globalPage - 1 };
  }

  // SLD sheets — upload order
  if (sldFiles.length > 0) {
    const sldFirst = globalPage;
    for (let i = 0; i < sldFiles.length; i++) {
      pages.push({
        section: "sld",
        sectionIndex: i,
        globalPage: globalPage++,
        totalPages,
        fileId: sldFiles[i].id,
        label: `SLD Sheet ${i + 1}`,
      });
    }
    sectionRanges.sld = { first: sldFirst, last: globalPage - 1 };
  }

  return {
    pages,
    totalPages,
    sectionCounts: {
      cover: coverCount,
      tcp: tcpFiles.length,
      tcd: tcdSelections.length,
      sld: sldFiles.length,
    },
    sectionRanges,
  };
}

// ── Display helper ────────────────────────────────────────────────────────────

/**
 * Returns a human-readable page range string for a section.
 * Examples: "page 1 of 9", "pages 2–4 of 9", "" (when section has no pages).
 */
export function formatPageRange(
  range: { first: number; last: number } | null,
  totalPages: number,
): string {
  if (!range) return "";
  if (range.first === range.last) return `page ${range.first} of ${totalPages}`;
  return `pages ${range.first}–${range.last} of ${totalPages}`;
}

// ── Generation input contract ─────────────────────────────────────────────────
//
// All fields that must be resolved before package generation can proceed.
// buildPackageAssembly() validates these and returns the manifest alongside.

export type PackageGenerationInputs = {
  projectId: string;
  // TCP file IDs in upload order (created_at ASC)
  tcpFileIds: string[];
  // TCD selections in admin selection order (sort_order ASC)
  tcdSelections: ManifestTcdRef[];
  // SLD file IDs in upload order (created_at ASC)
  sldFileIds: string[];
  // Cover template selected at generation time (nullable)
  coverTemplateId: string | null;
  // Resolved blueprint ID for this project + authority
  blueprintId: string | null;
  // Required separate outputs (e.g. ["application_form", "certification_form"])
  requiredDocuments: string[];
  // Jurisdiction metadata (informational; used by n8n for display fields)
  jurisdiction: {
    id: string | null;
    authority_name: string | null;
    submission_method: string | null;
  };
  // Full TCD storage info needed by the generation engine
  tcdStorageItems: Array<{
    id: string;         // tcd_library.id
    code: string;
    storage_path: string | null;
  }>;
};

export type PackageAssembly = {
  inputs: PackageGenerationInputs;
  manifest: PageManifest;
};

/**
 * Build the full package assembly from resolved inputs.
 * Returns both the inputs (for logging / metadata) and the page manifest
 * (for ordering and page numbering).
 *
 * This is the canonical pre-generation step. The generation action should
 * call this and pass assembly.manifest into the workflow metadata.
 */
export function buildPackageAssembly(inputs: PackageGenerationInputs): PackageAssembly {
  const tcpFileRefs: ManifestFileRef[] = inputs.tcpFileIds.map((id, i) => ({
    id,
    file_name: `TCP Sheet ${i + 1}`,
  }));

  const sldFileRefs: ManifestFileRef[] = inputs.sldFileIds.map((id, i) => ({
    id,
    file_name: `SLD Sheet ${i + 1}`,
  }));

  const manifest = buildPageManifest(tcpFileRefs, inputs.tcdSelections, sldFileRefs);

  return { inputs, manifest };
}
