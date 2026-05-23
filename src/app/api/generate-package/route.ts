/**
 * POST /api/generate-package
 *
 * Assembles a permit package PDF and generates authority documents separately.
 * Called by n8n after the workflow trigger.
 *
 * Auth: x-workflow-secret header must match WORKFLOW_SECRET env var.
 * Input body: { job_id: string }
 *
 * ── TWO SEPARATE SYSTEMS ──────────────────────────────────────────────────────
 *
 *  1. PACKAGE layer (company / branding)
 *     - Cover sheet (resolved from cover_sheet_templates library; programmatic fallback)
 *     - TCP sheets → TCD sheet → SLD sheet
 *     - Output: permit_package.pdf
 *
 *  2. AUTHORITY layer (jurisdiction-specific forms)
 *     - Application form (if authority_profiles.requires_application)
 *     - Certification form (if authority_profiles.requires_certification)
 *     - Output: separate files, never merged into main package
 *
 * ── PACKAGE PAGE ORDER ────────────────────────────────────────────────────────
 *   1. Cover sheet (template overlay when matched; programmatic otherwise, page 1 of N)
 *   2. TCP sheets  (with JB-number overlay)
 *   3. TCD sheet   (with JB-number overlay)
 *   4. SLD sheet   (with JB-number overlay)
 */

import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, StandardFonts, LineCapStyle, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { createServiceClient } from "@/lib/supabase/admin";
import { getTemplateSetForProject } from "@/lib/templates/getTemplateSetForProject";
import { generateCoverSheet } from "@/lib/pdf/coverSheet";
import { resolveCoverTemplate } from "@/lib/covers/resolveCoverTemplate";
import type { PermitPackageMetadata } from "@/types/workflow";
import { PAGE_TEMPLATES_BUCKET } from "@/lib/constants/files";
import { parseAnnotations, hexToRgb01, getGRANTEDWorkPathStyle, type CoverMapAnnotations } from "@/types/coverMapAnnotations";
import { autoRecomputeAfterPackage } from "@/lib/compute/projectCompute";
import { resolveUnifiedStatus } from "@/lib/status/unifiedMapping";

// ── Auth ───────────────────────────────────────────────────────────────────────

function authorized(req: NextRequest): boolean {
  const secret = process.env.WORKFLOW_SECRET;
  if (!secret) {
    console.error("WORKFLOW_SECRET is not set — rejecting request");
    return false;
  }
  return req.headers.get("x-workflow-secret") === secret;
}

// ── Storage helpers ────────────────────────────────────────────────────────────

async function fetchFromBucket(
  supabase: ReturnType<typeof createServiceClient>,
  bucket: string,
  storagePath: string
): Promise<Uint8Array | null> {
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(storagePath, 120);
    if (error || !data?.signedUrl) return null;
    const res = await fetch(data.signedUrl);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function fetchProjectFile(
  supabase: ReturnType<typeof createServiceClient>,
  storagePath: string
): Promise<Uint8Array | null> {
  return fetchFromBucket(supabase, "project-files", storagePath);
}

/** Fetch bytes from an arbitrary HTTP(S) URL. */
async function fetchUrl(url: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const mime = res.headers.get("content-type") ?? "";
    return { bytes: new Uint8Array(await res.arrayBuffer()), mime };
  } catch {
    return null;
  }
}

// ── Font cache builder ─────────────────────────────────────────────────────────
//
// Collects all unique fontId references from a set of field_mappings objects,
// fetches the corresponding font bytes from page_template_fonts, and returns a
// Map<fontId, Uint8Array> that overlay functions can use.
// Unknown or missing fonts are silently skipped (overlays fall back to Helvetica).

async function buildFontCache(
  supabase: ReturnType<typeof createServiceClient>,
  mappingsList: (Record<string, unknown> | null)[]
): Promise<Map<string, Uint8Array>> {
  const fontIds = new Set<string>();
  for (const m of mappingsList) {
    if (!m) continue;
    const dfId = m["defaultFontId"];
    if (typeof dfId === "string" && dfId) fontIds.add(dfId);
    const fields = m["fields"] as Array<{ fontId?: string }> | undefined;
    if (!Array.isArray(fields)) continue;
    for (const f of fields) {
      if (typeof f.fontId === "string" && f.fontId) fontIds.add(f.fontId);
    }
  }
  if (fontIds.size === 0) return new Map();

  const { data: rows } = await supabase
    .from("page_template_fonts")
    .select("id, storage_path")
    .in("id", [...fontIds])
    .eq("is_active", true);

  const cache = new Map<string, Uint8Array>();
  await Promise.all(
    (rows ?? []).map(async (row: { id: string; storage_path: string }) => {
      const bytes = await fetchFromBucket(supabase, "page-templates", row.storage_path);
      if (bytes) cache.set(row.id, bytes);
      else console.warn(`generate-package: font ${row.id} not fetchable from storage — skipping`);
    })
  );
  return cache;
}

// ── Authority document fill ───────────────────────────────────────────────────
//
// NJ county forms come in two varieties:
//
//   "acroform"  — PDF has standard AcroForm Widget annotations.
//                 field_mappings: { "PdfFieldName": "project_data_key" }
//
//   "overlay"   — PDF is flat (scanned or Adobe Fill & Sign with no Widget
//                 annotations — confirmed for Burlington County, Ocean County,
//                 and all other NJ county forms inspected).
//                 field_mappings: {
//                   "mode": "overlay",
//                   "fontSize": 9,
//                   "fields": [{ "key": "project_data_key", "x": 0, "y": 0, "page": 0 }]
//                 }
//
// The dispatcher detects mode from field_mappings.mode and calls the right path.

/** AcroForm path — only used when the PDF actually has Widget annotations. */
async function fillAcroForm(
  templateBytes: Uint8Array,
  projectData: Record<string, string>,
  fieldMappings: Record<string, string>
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(templateBytes);
  const form   = pdfDoc.getForm();
  for (const [pdfField, dataKey] of Object.entries(fieldMappings)) {
    try { form.getTextField(pdfField).setText(projectData[dataKey] ?? ""); } catch { /* absent */ }
  }
  form.flatten();
  return pdfDoc.save();
}

// ── Phase C — text alignment / anchor / multiline ────────────────────────────
// Optional per-field properties that adjust where pdf-lib's drawText baseline
// is placed. Defaults preserve the prior behavior bit-for-bit:
//   align  = "left"      → x is the left edge of each line
//   anchor = "top-left"  → y is the baseline of the first line
type TextAlign  = "left" | "center" | "right";
type TextAnchor = "top-left" | "center";

/**
 * Draw text honoring optional align + anchor, with built-in multi-line support
 * (split on "\n"). lineHeight defaults to size * 1.2.
 *
 * align:   horizontal positioning of EACH line relative to x.
 * anchor:  vertical positioning of the entire text BLOCK relative to y.
 *          - "top-left" (default): y is the baseline of the first line
 *            (matches a bare drawText call exactly).
 *          - "center": y is the visual center of the block; the helper shifts
 *            line baselines so the block is vertically centered around y.
 *
 * Combined: anchor="center" + align="center" → text is centered both ways
 * around (x, y).
 */
function drawAlignedText(
  page: PDFPage,
  value: string,
  opts: {
    x: number;
    y: number;
    size: number;
    font: PDFFont;
    align?: TextAlign;
    anchor?: TextAnchor;
    /**
     * Per-call line-height override. Default `size * 1.2` matches normal
     * typography. Passed by overlay callers for multi-line composed blocks
     * (e.g. address_block) that need tighter vertical spacing.
     */
    lineHeight?: number;
  },
): void {
  const align  = opts.align  ?? "left";
  const anchor = opts.anchor ?? "top-left";
  const { x, y, size, font } = opts;
  const lines      = value.split("\n");
  const lineHeight = opts.lineHeight ?? size * 1.2;

  // Baseline of the first line. For "top-left" (default), y is exactly that —
  // identical to a bare drawText call. For "center", shift the block up so the
  // visual middle of the block sits at y; block height is approximated as
  // size + (n - 1) * lineHeight.
  const firstBaselineY =
    anchor === "center"
      ? y - size / 2 + ((lines.length - 1) * lineHeight) / 2
      : y;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const tw   = font.widthOfTextAtSize(line, size);
    const drawX =
      align === "center" ? x - tw / 2 :
      align === "right"  ? x - tw     :
      x;
    const drawY = firstBaselineY - i * lineHeight;
    page.drawText(line, { x: drawX, y: drawY, size, font });
  }
}

/** Overlay path — draws text at fixed coordinates over a flat PDF. */
async function overlayFlatForm(
  templateBytes: Uint8Array,
  projectData: Record<string, string>,
  overlayConfig: {
    fontSize?: number;
    defaultFontId?: string;
    fields: Array<{
      key: string; x: number; y: number;
      page?: number; pageMode?: "single" | "all" | "specific";
      fontId?: string; fontSize?: number;
      align?: TextAlign; anchor?: TextAnchor;
    }>;
    fontBytes?: Map<string, Uint8Array>;
  }
): Promise<Uint8Array> {
  const doc         = await PDFDocument.load(templateBytes);
  doc.registerFontkit(fontkit);
  const defaultFont = await doc.embedFont(StandardFonts.Helvetica);
  const fontCache   = new Map<string, PDFFont>();
  const pages       = doc.getPages();

  async function resolveFont(fontId: string | undefined): Promise<PDFFont> {
    if (!fontId) return defaultFont;
    if (fontCache.has(fontId)) return fontCache.get(fontId)!;
    const bytes = overlayConfig.fontBytes?.get(fontId);
    if (!bytes) { fontCache.set(fontId, defaultFont); return defaultFont; }
    try {
      const embedded = await doc.embedFont(bytes);
      fontCache.set(fontId, embedded);
      return embedded;
    } catch (err) {
      console.warn(`generate-package: failed to embed font ${fontId} — falling back to Helvetica:`, err);
      fontCache.set(fontId, defaultFont);
      return defaultFont;
    }
  }

  for (const field of overlayConfig.fields) {
    const value = projectData[field.key];
    if (!value) continue;
    const size     = field.fontSize ?? overlayConfig.fontSize ?? 9;
    const font     = await resolveFont(field.fontId ?? overlayConfig.defaultFontId);
    const pageMode = field.pageMode ?? "single";
    const lineHeight = lineHeightForKey(field.key, size);
    if (pageMode === "all") {
      for (const page of pages) {
        drawAlignedText(page, value, {
          x: field.x, y: field.y, size, font,
          align: field.align, anchor: field.anchor, lineHeight,
        });
      }
    } else {
      const pageIdx = field.page ?? 0;
      const page    = pages[pageIdx];
      if (!page) {
        console.warn(`generate-package: text field "${field.key}" page ${pageIdx} out of range — skipping`);
        continue;
      }
      drawAlignedText(page, value, {
        x: field.x, y: field.y, size, font,
        align: field.align, anchor: field.anchor, lineHeight,
      });
    }
  }
  return doc.save();
}

// Per-key line-height override. Composed multi-line blocks like the address
// block visually read tighter than ordinary body text — use a smaller multiple
// so the two lines sit closer. Returns undefined for normal fields, which
// makes drawAlignedText fall back to its size * 1.2 default.
const TIGHT_LH_KEYS = new Set<string>(["address_block", "sub_location_title_block"]);
function lineHeightForKey(key: string, size: number): number | undefined {
  if (TIGHT_LH_KEYS.has(key)) return size * 1.05;
  return undefined;
}

/** Dispatcher: inspects field_mappings.mode to choose fill strategy. */
async function fillAuthorityDocument(
  templateBytes: Uint8Array,
  projectData: Record<string, string>,
  rawMappings: Record<string, unknown> | null,
  fontBytes?: Map<string, Uint8Array>
): Promise<Uint8Array> {
  if (!rawMappings) {
    // No mappings — return as-is (blank template)
    return templateBytes;
  }

  const mode = rawMappings["mode"] as string | undefined;

  if (mode === "overlay") {
    // Coordinate-based text overlay (flat PDF / Adobe Fill & Sign forms)
    const fields = rawMappings["fields"] as Array<{
      key: string; x: number; y: number; page?: number;
      pageMode?: "single" | "all" | "specific";
      fontId?: string; fontSize?: number;
      align?: TextAlign; anchor?: TextAnchor;
    }> | undefined;
    if (!fields?.length) return templateBytes;
    return overlayFlatForm(templateBytes, projectData, {
      fontSize:      (rawMappings["fontSize"]    as number | undefined) ?? 9,
      defaultFontId: (rawMappings["defaultFontId"] as string | undefined),
      fields,
      fontBytes,
    });
  }

  // Default: AcroForm path (mode === "acroform" or not specified)
  const fieldMap = (mode === "acroform"
    ? rawMappings["fields"]
    : rawMappings) as Record<string, string> | undefined;

  if (!fieldMap || typeof fieldMap !== "object" || Array.isArray(fieldMap)) {
    return templateBytes;
  }
  return fillAcroForm(templateBytes, projectData, fieldMap as Record<string, string>);
}

// ── PDF merge ─────────────────────────────────────────────────────────────────

async function mergePdfs(allBytes: Uint8Array[]): Promise<Uint8Array> {
  const merged = await PDFDocument.create();
  for (const sourceBytes of allBytes) {
    try {
      const doc         = await PDFDocument.load(sourceBytes);
      const copiedPages = await merged.copyPages(doc, doc.getPageIndices());
      copiedPages.forEach((p: PDFPage) => merged.addPage(p));
    } catch (err) {
      console.error("generate-package: failed to merge a PDF chunk:", err);
    }
  }
  return merged.save();
}

/** Count the total pages across a list of PDFs without merging. */
async function countPages(allBytes: Uint8Array[]): Promise<number> {
  let total = 0;
  for (const bytes of allBytes) {
    try {
      const doc = await PDFDocument.load(bytes);
      total += doc.getPageCount();
    } catch { /* skip corrupt */ }
  }
  return total;
}

// ── Computed package numbering ────────────────────────────────────────────────
//
// These field keys are resolved from per-page metadata, not from projectData.
// In the first overlay pass the keys are absent from projectData, so
// overlayFlatForm's `if (!value) continue` guard silently skips them.
// Step 13a applies them in a dedicated per-page pass after total count is known.

const COMPUTED_KEYS = new Set([
  "sheet_number_current",
  "sheet_number_total",
  "sheet_number_display",
  "package_section_name",
  "package_section_page_current",
  "package_section_page_total",
  "package_section_display",
]);

type SectionSlice = {
  name:          "TCP" | "TCD" | "SLD";
  startIndex:    number;   // inclusive index into contentChunks
  endIndex:      number;   // exclusive
  fieldMappings: Record<string, unknown> | null;
};

function hasComputedFieldRefs(mappings: Record<string, unknown> | null): boolean {
  if (!mappings) return false;
  const fields = mappings["fields"] as Array<{ key: string }> | undefined;
  if (!Array.isArray(fields)) return false;
  return fields.some((f) => COMPUTED_KEYS.has(f.key));
}

/** Apply per-page computed numbering overlays to a composed content chunk. */
async function applyComputedFieldOverlays(
  pdfBytes:           Uint8Array,
  mappings:           Record<string, unknown>,
  sectionName:        string,
  chunkGlobalStart:   number,   // 1-indexed global page of first page in this chunk
  chunkSectionStart:  number,   // 1-indexed section page of first page in this chunk
  sectionTotal:       number,
  globalTotal:        number,
  fontBytes?:         Map<string, Uint8Array>
): Promise<Uint8Array> {
  const fields = (mappings["fields"] as Array<{
    key: string; x: number; y: number; page?: number; pageMode?: string;
    fontId?: string; fontSize?: number;
    align?: TextAlign; anchor?: TextAnchor;
  }> | undefined) ?? [];
  const computedFields = fields.filter((f) => COMPUTED_KEYS.has(f.key));
  if (computedFields.length === 0) return pdfBytes;

  try {
    const doc         = await PDFDocument.load(pdfBytes);
    doc.registerFontkit(fontkit);
    const defaultFont = await doc.embedFont(StandardFonts.Helvetica);
    const fontCache   = new Map<string, PDFFont>();
    const globalSize    = (mappings["fontSize"]    as number | undefined) ?? 9;
    const defaultFontId = (mappings["defaultFontId"] as string | undefined);
    const pages         = doc.getPages();

    async function resolveComputedFont(fontId: string | undefined): Promise<PDFFont> {
      if (!fontId) return defaultFont;
      if (fontCache.has(fontId)) return fontCache.get(fontId)!;
      const bytes = fontBytes?.get(fontId);
      if (!bytes) { fontCache.set(fontId, defaultFont); return defaultFont; }
      try {
        const embedded = await doc.embedFont(bytes);
        fontCache.set(fontId, embedded);
        return embedded;
      } catch {
        fontCache.set(fontId, defaultFont);
        return defaultFont;
      }
    }

    const metaFor = (pageIdx: number): Record<string, string> => {
      const g = chunkGlobalStart  + pageIdx;
      const s = chunkSectionStart + pageIdx;
      return {
        sheet_number_current:          String(g),
        sheet_number_total:            String(globalTotal),
        sheet_number_display:          `${g} OF ${globalTotal}`,
        package_section_name:          sectionName,
        package_section_page_current:  String(s),
        package_section_page_total:    String(sectionTotal),
        package_section_display:       `${s} of ${sectionTotal}`,
      };
    };

    for (const field of computedFields) {
      const size     = field.fontSize ?? globalSize;
      const font     = await resolveComputedFont(field.fontId ?? defaultFontId);
      const pageMode = field.pageMode ?? "single";
      if (pageMode === "all") {
        for (let i = 0; i < pages.length; i++) {
          const value = metaFor(i)[field.key];
          if (value) drawAlignedText(pages[i], value, {
            x: field.x, y: field.y, size, font,
            align: field.align, anchor: field.anchor,
          });
        }
      } else {
        const pageIdx = field.page ?? 0;
        if (pageIdx < pages.length) {
          const value = metaFor(pageIdx)[field.key];
          if (value) drawAlignedText(pages[pageIdx], value, {
            x: field.x, y: field.y, size, font,
            align: field.align, anchor: field.anchor,
          });
        } else {
          console.warn(
            `generate-package: computed field "${field.key}" targets page ${pageIdx} ` +
            `but ${sectionName} chunk has only ${pages.length} page(s) — skipping`
          );
        }
      }
    }

    return doc.save();
  } catch (err) {
    console.error("generate-package: applyComputedFieldOverlays failed:", err);
    return pdfBytes;
  }
}

// ── Page overlay (JB number) ─────────────────────────────────────────────────
// Applied to TCP, TCD, and SLD sheets — NEVER to the cover sheet.

async function applyPageOverlay(pdfBytes: Uint8Array, jobNumber: string): Promise<Uint8Array> {
  try {
    const doc  = await PDFDocument.load(pdfBytes);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const SIZE = 8;
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      const tw = font.widthOfTextAtSize(jobNumber, SIZE);
      page.drawText(jobNumber, { x: width - tw - 10, y: height - 14, size: SIZE, font });
    }
    return doc.save();
  } catch (err) {
    console.error("generate-package: page overlay failed:", err);
    return pdfBytes;
  }
}

// ── PE stamp overlay ──────────────────────────────────────────────────────────

async function applyPeStamp(
  supabase: ReturnType<typeof createServiceClient>,
  mergedBytes: Uint8Array,
  projectId: string
): Promise<Uint8Array> {
  const stampBytes =
    (await fetchProjectFile(supabase, `pe-stamps/${projectId}.png`)) ??
    (await fetchProjectFile(supabase, "pe-stamps/default.png"));

  if (!stampBytes) {
    console.warn("generate-package: no PE stamp found — skipping");
    return mergedBytes;
  }

  try {
    const doc        = await PDFDocument.load(mergedBytes);
    const stampImage = await doc.embedPng(stampBytes);
    for (const page of doc.getPages()) {
      const { width } = page.getSize();
      page.drawImage(stampImage, { x: width - 160, y: 10, width: 150, height: 75, opacity: 0.85 });
    }
    return doc.save();
  } catch (err) {
    console.error("generate-package: PE stamp failed:", err);
    return mergedBytes;
  }
}

// ── Wrapper composition ───────────────────────────────────────────────────────
//
// Used for TCP, TCD, and SLD wrappers. A wrapper template is a pre-formatted
// PDF page (border, title block, branding). The source drawing is scaled to fit
// within the wrapper's placement_box, centered, aspect ratio preserved.
//
// Each source page becomes one output page (wrapper background + drawing on top).
// Call applyOverlayMappings on the result if the wrapper carries field_mappings
// (e.g. to inject job number from a title-block field).

function parsePlacementBox(
  raw: unknown
): { x: number; y: number; width: number; height: number } | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const b = raw as Record<string, unknown>;
  const x = typeof b.x      === "number" ? b.x      : null;
  const y = typeof b.y      === "number" ? b.y      : null;
  const w = typeof b.width  === "number" ? b.width  : null;
  const h = typeof b.height === "number" ? b.height : null;
  if (x === null || y === null || w === null || h === null) return null;
  if (w <= 0 || h <= 0) return null;
  return { x, y, width: w, height: h };
}

async function applyWrapperComposition(
  wrapperBytes: Uint8Array,
  sourceBytes:  Uint8Array,
  box: { x: number; y: number; width: number; height: number }
): Promise<Uint8Array> {
  const wrapperDoc = await PDFDocument.load(wrapperBytes);
  const sourceDoc  = await PDFDocument.load(sourceBytes);
  const outputDoc  = await PDFDocument.create();

  const pageCount = sourceDoc.getPageCount();
  const indices   = Array.from({ length: pageCount }, (_, i) => i);

  // Embed all source pages at once to avoid repeated XObject re-embedding.
  const embeddedPages = await outputDoc.embedPdf(sourceDoc, indices);

  for (let i = 0; i < pageCount; i++) {
    // Fresh copy of wrapper page 0 as the background for each output page.
    const [wrapperPage] = await outputDoc.copyPages(wrapperDoc, [0]);
    outputDoc.addPage(wrapperPage);

    const embedded = embeddedPages[i];
    const scale    = Math.min(box.width / embedded.width, box.height / embedded.height);
    const w        = embedded.width  * scale;
    const h        = embedded.height * scale;

    wrapperPage.drawPage(embedded, {
      x:      box.x + (box.width  - w) / 2,
      y:      box.y + (box.height - h) / 2,
      width:  w,
      height: h,
    });
  }

  return outputDoc.save();
}

// ── Date formatting ────────────────────────────────────────────────────────────

function formatDateMDY(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 1. Parse body ────────────────────────────────────────────────────────────
  let body: { job_id?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const jobId = typeof body.job_id === "string" ? body.job_id.replace(/^=/, "") : null;
  if (!jobId) return NextResponse.json({ error: "job_id is required" }, { status: 400 });

  const supabase = createServiceClient();

  // ── 2. Fetch workflow job ────────────────────────────────────────────────────
  const { data: job, error: jobError } = await supabase
    .from("workflow_jobs")
    .select("id, project_id, status, metadata")
    .eq("id", jobId)
    .single();

  if (jobError || !job) return NextResponse.json({ error: "Job not found" }, { status: 404 });

  const projectId = job.project_id as string;
  const metadata  = job.metadata as PermitPackageMetadata | null;

  // ── 3. Mark running ──────────────────────────────────────────────────────────
  await supabase
    .from("workflow_jobs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  // ── 4. Fetch project ─────────────────────────────────────────────────────────
  type ProjectRow = {
    id: string;
    job_number: string;
    job_name: string;
    job_address: string | null;
    // Phase A — structured address columns. Both nullable; renderer falls
    // back to job_address / job_name when these are not yet populated.
    street_address: string | null;
    city: string | null;
    zip_code: string | null;
    county: string | null;
    township: string | null;
    state: string | null;
    roadway: string | null;
    milepost_start: string | null;
    milepost_end: string | null;
    client_logo_url: string | null;
    authority_id: string | null;
    authority_type: string | null;
    job_type: string | null;
    pe_required: boolean | null;
    jurisdiction_id: string | null;
    assigned_designer_id: string | null;
    company_id: string | null;
    job_number_client: string | null;
    blueprint_id: string | null;
  };

  const { data: projectRaw } = await supabase
    .from("projects")
    .select(
      "id, job_number, job_name, job_address, street_address, city, zip_code, " +
      "county, township, state, " +
      "roadway, milepost_start, milepost_end, client_logo_url, " +
      "authority_id, authority_type, job_type, pe_required, " +
      "jurisdiction_id, assigned_designer_id, company_id, job_number_client, " +
      "blueprint_id"
    )
    .eq("id", projectId)
    .single();

  const project = projectRaw as unknown as ProjectRow | null;
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // ── 4a. Resolve effective authority ID ───────────────────────────────────────
  // Prefer manual projects.authority_id; fall back to jurisdictions.authority_profile_id.
  let effectiveAuthorityId = project.authority_id as string | null;
  if (!effectiveAuthorityId && project.jurisdiction_id) {
    const { data: jurAuth } = await supabase
      .from("jurisdictions")
      .select("authority_profile_id")
      .eq("id", project.jurisdiction_id)
      .single();
    effectiveAuthorityId = jurAuth?.authority_profile_id ?? null;
  }

  // ── 4b. Load active blueprint ────────────────────────────────────────────────
  //
  // Blueprint is identified via the blueprint_id stored in job metadata at
  // enqueue time. Cover resolution priority (step 14):
  //
  //   P1  cover_page_template_id → page_templates(type='cover')
  //       Primary source. Written by the blueprint editor UI. Uses storage_path
  //       from "page-templates" bucket + field_mappings for text overlay.
  //
  //   P2  cover_sheet_template_id → cover_template_versions (legacy bridge)
  //       Fallback for blueprints that had the old FK set before the UI migration.
  //       Reads from "cover-templates" bucket via cover_template_versions.
  //
  //   P3  resolveCoverTemplate() attribute-based matching (legacy fallback)
  //       Used when neither blueprint cover field is set.
  //
  //   P4  generateCoverSheet() programmatic (last resort, always succeeds)
  //
  // app_page_template_id / cert_page_template_id are the P1 source for authority
  // docs (step 17). application_template_id / certification_template_id remain as
  // the P2 fallback via the authority-doc override bridge (step 6).
  // tcp_wrapper_id / tcd_wrapper_id / sld_wrapper_id are used in step 12 for
  // wrapper composition; pre-fetched as page_template rows in step 4c.
  type BlueprintRow = {
    id: string;
    cover_page_template_id:    string | null;  // cover P1
    cover_sheet_template_id:   string | null;  // cover P2 (legacy)
    app_page_template_id:      string | null;  // auth-doc P1: application form
    cert_page_template_id:     string | null;  // auth-doc P1: certification form
    application_template_id:   string | null;  // auth-doc P2 (legacy)
    certification_template_id: string | null;  // auth-doc P2 (legacy)
    tcp_wrapper_id:            string | null;  // content P1: TCP wrapper template
    tcd_wrapper_id:            string | null;  // content P1: TCD wrapper template
    sld_wrapper_id:            string | null;  // content P1: SLD wrapper template
  };

  let blueprint: BlueprintRow | null = null;

  // Blueprint resolution — three-tier priority:
  //   P1  job metadata blueprint_id  (captured at enqueue time)
  //   P2  project.blueprint_id       (live override; handles jobs enqueued before blueprint existed)
  //   P3  authority's active blueprint (live lookup; same fallback logic as enqueue action)
  const metaBlueprintId = (metadata as { blueprint_id?: string | null })?.blueprint_id ?? null;
  let resolvedBlueprintId: string | null = metaBlueprintId;

  if (!resolvedBlueprintId && project.blueprint_id) {
    resolvedBlueprintId = project.blueprint_id;
    console.log(
      `generate-package: blueprint_id absent from job metadata — ` +
      `using project.blueprint_id=${resolvedBlueprintId}`
    );
  } else if (!resolvedBlueprintId && effectiveAuthorityId) {
    const { data: authBp } = await supabase
      .from("package_blueprints")
      .select("id")
      .eq("authority_profile_id", effectiveAuthorityId)
      .eq("status", "active")
      .maybeSingle();
    if (authBp?.id) {
      resolvedBlueprintId = authBp.id;
      console.log(
        `generate-package: blueprint_id absent from job metadata — ` +
        `resolved from authority ${effectiveAuthorityId}: ${resolvedBlueprintId}`
      );
    }
  }

  if (resolvedBlueprintId) {
    const { data: bpRow } = await supabase
      .from("package_blueprints")
      .select(
        "id, cover_page_template_id, cover_sheet_template_id, " +
        "app_page_template_id, cert_page_template_id, " +
        "application_template_id, certification_template_id, " +
        "tcp_wrapper_id, tcd_wrapper_id, sld_wrapper_id, status"
      )
      .eq("id", resolvedBlueprintId)
      .maybeSingle();
    const candidate = (bpRow as (BlueprintRow & { status: string | null }) | null) ?? null;

    if (candidate && candidate.status === "active") {
      blueprint = candidate;
    } else {
      // Defensive: a captured override may have been demoted to draft/inactive
      // between enqueue and generation. Ignore it and re-resolve from the
      // authority's currently active blueprint.
      if (candidate) {
        console.warn(
          `generate-package: blueprint ${resolvedBlueprintId} status=${candidate.status} ` +
          `(not active) — falling back to authority default`
        );
      } else {
        console.warn(
          `generate-package: blueprint_id ${resolvedBlueprintId} not found in package_blueprints — ` +
          `falling back to authority default`
        );
      }
      resolvedBlueprintId = null;
      if (effectiveAuthorityId) {
        const { data: authBp } = await supabase
          .from("package_blueprints")
          .select(
            "id, cover_page_template_id, cover_sheet_template_id, " +
            "app_page_template_id, cert_page_template_id, " +
            "application_template_id, certification_template_id, " +
            "tcp_wrapper_id, tcd_wrapper_id, sld_wrapper_id"
          )
          .eq("authority_profile_id", effectiveAuthorityId)
          .eq("status", "active")
          .maybeSingle();
        const authBpRow = (authBp as unknown as BlueprintRow | null) ?? null;
        if (authBpRow) {
          blueprint = authBpRow;
          resolvedBlueprintId = blueprint.id;
          console.log(
            `generate-package: fell back to authority active blueprint ${resolvedBlueprintId}`
          );
        }
      }
    }

    if (blueprint) {
      console.log(
        `generate-package: blueprint ${resolvedBlueprintId} loaded — ` +
        `cover_page_template_id=${blueprint.cover_page_template_id ?? "null"}, ` +
        `tcp_wrapper_id=${blueprint.tcp_wrapper_id ?? "null"}, ` +
        `tcd_wrapper_id=${blueprint.tcd_wrapper_id ?? "null"}, ` +
        `sld_wrapper_id=${blueprint.sld_wrapper_id ?? "null"}`
      );
    }
  } else {
    console.warn(
      "generate-package: no active package template configured for this authority " +
      "(absent from metadata, no project override, no active authority blueprint) — " +
      "all content sections will use raw path"
    );
  }

  // ── 4c. Pre-fetch wrapper templates (TCP / TCD / SLD) ───────────────────────
  //
  // Single query for all three wrapper IDs. Stored in a map keyed by template ID
  // so step 12 can look them up without additional round-trips.
  // Only active rows are returned — inactive wrappers fall through to raw.

  type WrapperTemplate = {
    id: string;
    storage_path:   string | null;
    placement_box:  Record<string, unknown> | null;
    field_mappings: Record<string, unknown> | null;
  };

  const wrapperIdsNeeded = [
    blueprint?.tcp_wrapper_id,
    blueprint?.tcd_wrapper_id,
    blueprint?.sld_wrapper_id,
  ].filter((id): id is string => id != null);

  const wrapperByTemplateId = new Map<string, WrapperTemplate>();

  if (wrapperIdsNeeded.length > 0) {
    const { data: wrapperRows } = await supabase
      .from("page_templates")
      .select("id, storage_path, placement_box, field_mappings")
      .in("id", wrapperIdsNeeded)
      .eq("is_active", true);

    for (const row of (wrapperRows ?? []) as WrapperTemplate[]) {
      wrapperByTemplateId.set(row.id, row);
    }
  }

  // ── 5. Fetch authority profile (authority layer) ──────────────────────────────
  let authorityName             = metadata?.jurisdiction?.authority_name ?? null;
  // Phase B — authority_profiles.type ('state' | 'county' | 'municipality')
  // when available, else null; the formatter below falls back to
  // projects.authority_type.
  let authorityProfileType: string | null = null;
  let requiresApplication       = false;
  let requiresCertification     = false;
  let requiresPeStamp           = false;

  if (effectiveAuthorityId) {
    const { data: auth } = await supabase
      .from("authority_profiles")
      .select("name, type, requires_application, requires_certification, requires_pe")
      .eq("id", effectiveAuthorityId)
      .single();

    if (auth) {
      authorityName         = auth.name ?? authorityName;
      authorityProfileType  = (auth as { type?: string | null }).type ?? null;
      requiresApplication   = auth.requires_application   ?? false;
      requiresCertification = auth.requires_certification ?? false;
      requiresPeStamp       = auth.requires_pe            ?? false;
    }
  }

  // Defensive warning: Application Form is the only authority-required add-on
  // that gates blueprint activation. If a legacy/stale active blueprint is
  // missing its application template, surface a clear warning. Certification
  // Form and COI templates are intentionally optional on the blueprint —
  // projects may upload/provide them directly — so missing templates for
  // those documents are not warned about here.
  if (requiresApplication
      && !(blueprint?.app_page_template_id || blueprint?.application_template_id)) {
    console.warn(
      "generate-package: Authority requires Application Form, but active " +
      "blueprint has no Application Form template."
    );
  }

  // Also check jurisdiction for PE stamp (legacy path)
  const jurisdictionId = (metadata?.jurisdiction?.id ?? project.jurisdiction_id) as string | null;
  if (!requiresPeStamp && jurisdictionId) {
    const { data: jur } = await supabase
      .from("jurisdictions")
      .select("requires_pe_stamp")
      .eq("id", jurisdictionId)
      .single();
    requiresPeStamp = jur?.requires_pe_stamp ?? false;
  }

  // ── 6. Fetch authority document templates (authority layer) ───────────────────
  //
  // Blueprint override: if the blueprint specifies an explicit application or
  // certification template, fetch those records directly by ID rather than
  // relying on the authority-wide type=application/certification lookup.
  // This allows per-blueprint form customization independent of authority defaults.
  type AuthDocTemplate = {
    id: string;
    type: string;
    file_url: string;
    field_mappings: Record<string, string> | null;
  };

  let authDocTemplates: AuthDocTemplate[] = [];
  if (effectiveAuthorityId) {
    const { data: tmplRows } = await supabase
      .from("authority_document_templates")
      .select("id, type, file_url, field_mappings")
      .eq("authority_id", effectiveAuthorityId);
    authDocTemplates = (tmplRows ?? []) as AuthDocTemplate[];
  }

  // Apply blueprint overrides: replace authority-wide templates with blueprint-specific ones.
  if (blueprint) {
    const overrideIds = [
      blueprint.application_template_id,
      blueprint.certification_template_id,
    ].filter((id): id is string => id !== null);

    if (overrideIds.length > 0) {
      const { data: overrideRows } = await supabase
        .from("authority_document_templates")
        .select("id, type, file_url, field_mappings")
        .in("id", overrideIds);

      if (overrideRows?.length) {
        const overrideMap = new Map(
          (overrideRows as AuthDocTemplate[]).map((r) => [r.type, r])
        );
        // Replace authority-wide entries with blueprint-specific ones for matching types.
        authDocTemplates = authDocTemplates.map((t) => overrideMap.get(t.type) ?? t);
        // Add any blueprint types not already in the authority list.
        for (const override of overrideRows as AuthDocTemplate[]) {
          if (!authDocTemplates.some((t) => t.type === override.type)) {
            authDocTemplates.push(override);
          }
        }
        console.log(
          `generate-package: blueprint overrides applied for authority doc types: ` +
          (overrideRows as AuthDocTemplate[]).map((r) => r.type).join(", ")
        );
      }
    }
  }

  // ── 7. Fetch company + designer names ─────────────────────────────────────────
  let companyName  = "";
  let designerName = "";
  // Phase D — per-company logo path; bytes are loaded in section 11 alongside
  // the legacy per-project client logo.
  let companyLogoPath: string | null = null;

  if (project.company_id) {
    const { data: co } = await supabase
      .from("companies")
      .select("name, logo_path")
      .eq("id", project.company_id)
      .single();
    companyName     = (co as { name?: string | null } | null)?.name ?? "";
    companyLogoPath = (co as { logo_path?: string | null } | null)?.logo_path ?? null;
  }

  if (project.assigned_designer_id) {
    const { data: ds } = await supabase.from("user_profiles").select("display_name").eq("id", project.assigned_designer_id).single();
    designerName = ds?.display_name ?? "";
  }

  // ── 8. Verify template set exists (gate check) ────────────────────────────────
  await getTemplateSetForProject(supabase, {
    company_id:  project.company_id ?? "",
    job_type:    project.job_type,
    authority_id: effectiveAuthorityId,
    pe_required: project.pe_required,
  });
  // Note: we don't block on null here — the enqueue action already blocked.
  // But we still call it so logs capture a match or miss.

  // ── 9. Build project data map (used for AcroForm filling) ────────────────────
  // Field key meanings — must stay in sync with src/lib/templates/fieldCatalog.ts:
  //   job_number  = client-facing JB / project number (projects.job_number_client),
  //                 with safe fallback to the GRANTED internal number when blank.
  //   internal_id = GRANTED internal tracking number (projects.job_number).
  //
  // Older field mappings using `job_number` will now render the client-facing number.
  // `client_job_number` is kept as a backward-compat alias for legacy authority forms.
  const today = new Date();
  const dateStr = formatDateMDY(today);

  const clientJobNumber = project.job_number_client ?? "";
  const internalId      = project.job_number        ?? "";
  const jobNumberValue  = clientJobNumber || internalId;  // safe transition fallback

  // ── Phase B address / submission-type formatters ──────────────────────────
  // Local because they're only used in the projectData builder. Kept simple
  // on purpose — every piece is treated as optional and trimmed; missing
  // pieces drop out without leaving stray commas or doubled spaces.
  const tidy = (s: string | null | undefined): string => (s ?? "").trim();

  const formatCityStateZip = (
    city: string | null,
    state: string | null,
    zip:  string | null,
  ): string => {
    const c  = tidy(city);
    const s  = tidy(state);
    const z  = tidy(zip);
    const right = [s, z].filter(Boolean).join(" ");
    if (c && right) return `${c}, ${right}`;
    return c || right;
  };

  const formatAddressBlock = (
    street: string | null,
    city:   string | null,
    state:  string | null,
    zip:    string | null,
    fallback: string,
  ): string => {
    const s = tidy(street);
    const lower = formatCityStateZip(city, state, zip);
    if (s && lower) return `${s}\n${lower}`;
    if (s)          return s;
    if (lower)      return lower;
    return fallback;
  };

  // Renders bare uppercase authority labels — no trailing "Submission" word.
  // Strips a trailing "submission" off any pre-labeled stored value so older
  // values like "State Submission" still produce a clean "STATE" output.
  const formatSubmissionType = (raw: string | null | undefined): string => {
    const cleaned = tidy(raw).replace(/\s+submission\s*$/i, "").trim();
    const t = cleaned.toLowerCase();
    if (!t) return "";
    if (t === "county")                            return "COUNTY";
    if (t === "njdot" || t === "state")            return "STATE";
    if (t === "township")                          return "TOWNSHIP";
    if (t === "municipal" || t === "municipality") return "MUNICIPAL";
    if (t === "other")                             return "OTHER";
    return cleaned.toUpperCase();
  };

  // {MUNICIPALITY} TOWNSHIP, {COUNTY} COUNTY, {STATE} — uppercase, drop blanks.
  // Each part is suppressed when its source piece is empty, so we never emit
  // a bare "TOWNSHIP" or "COUNTY" with no name in front.
  const formatSubLocationTitleBlock = (
    municipality: string | null,
    county:       string | null,
    state:        string | null,
  ): string => {
    const m = tidy(municipality).toUpperCase();
    const c = tidy(county).toUpperCase();
    const s = tidy(state).toUpperCase();
    const parts: string[] = [];
    if (m) parts.push(`${m} TOWNSHIP`);
    if (c) parts.push(`${c} COUNTY`);
    if (s) parts.push(s);
    return parts.join(", ");
  };

  // FROM MILEPOST {start} TO MILEPOST {end} — blank when either is missing
  // so the rendered phrase never reads as a broken half-statement.
  const formatMilepostBlock = (
    start: string | null,
    end:   string | null,
  ): string => {
    const s = tidy(start);
    const e = tidy(end);
    if (s && e) return `FROM MILEPOST ${s} TO MILEPOST ${e}`;
    return "";
  };

  // Address fallback chain — when no street_address has been entered yet we
  // surface the legacy job_address so old templates keep producing readable
  // output. job_name is the last resort.
  const addressBlockFallback =
    tidy(project.job_address) || tidy(project.job_name);

  const projectData: Record<string, string> = {
    job_number:        jobNumberValue,                    // client-facing JB number
    internal_id:       internalId,                        // GRANTED internal ID
    client_job_number: jobNumberValue,                    // legacy alias — same value
    job_name:          project.job_name          ?? "",
    job_address:       project.job_address       ?? "",
    roadway:           project.roadway           ?? "",
    // route_number: parsed from roadway or set on project (future field)
    // Format used on county forms: "NEW HAMPSHIRE ROAD" with "No. 623" separate
    milepost_from:     project.milepost_start     ?? "",
    milepost_to:       project.milepost_end       ?? "",
    start_milepost:    project.milepost_start     ?? "",
    end_milepost:      project.milepost_end       ?? "",
    milepost_block:    formatMilepostBlock(project.milepost_start, project.milepost_end),
    municipality:      project.township          ?? "",  // township = municipality in NJ
    county:            project.county            ?? "",
    state:             project.state             ?? "NJ",
    // Intake writes the municipality into `city` (the legacy `township` column
    // was retired from the form). Prefer city; fall back to township so any
    // older project rows that still have township populated keep working.
    sub_location_title_block: formatSubLocationTitleBlock(
                         project.city || project.township,
                         project.county,
                         project.state ?? "NJ",
                       ),
    // Phase B — structured address pieces + composed lines.
    street_address:    project.street_address    ?? "",
    city:              project.city              ?? "",
    zip_code:          project.zip_code          ?? "",
    city_state_zip:    formatCityStateZip(project.city, project.state, project.zip_code),
    address_block:     formatAddressBlock(
                         project.street_address,
                         project.city,
                         project.state,
                         project.zip_code,
                         addressBlockFallback,
                       ),
    authority_name:    authorityName             ?? "",
    submission_type:   formatSubmissionType(authorityProfileType ?? project.authority_type),
    date:              dateStr,
    prepared_by:       designerName,
    company_name:      companyName,
    // Phase D — exposed for any downstream consumer; image_region binding
    // happens via sourceKey, not via a text field placement.
    company_logo_path: companyLogoPath ?? "",
    // Burlington County / county form fields
    applicant_name:    companyName,               // legal applicant on county permit forms
    start_date:        "As soon as Permitted",    // standard phrase for all county submissions
    work_description:  "Aerial Span Work on Existing Pole Line",
    project_title:     [internalId, project.job_name].filter(Boolean).join(" "),
  };

  // ── 10. Helper: resolve project_files.id → storage_path ─────────────────────
  async function getFilePath(fileId: string): Promise<string | null> {
    const { data } = await supabase.from("project_files").select("storage_path").eq("id", fileId).single();
    return data?.storage_path ?? null;
  }

  // ── 11. Fetch client logo bytes (package layer) ───────────────────────────────
  let clientLogoBytes: Uint8Array | null = null;
  let clientLogoMime: "image/png" | "image/jpeg" | null = null;

  if (project.client_logo_url) {
    const url = project.client_logo_url;
    if (url.startsWith("http://") || url.startsWith("https://")) {
      const result = await fetchUrl(url);
      if (result) {
        clientLogoBytes = result.bytes;
        clientLogoMime = result.mime.includes("png") ? "image/png" : "image/jpeg";
      }
    } else {
      // Assume storage path in project-files bucket
      const ext = url.split(".").pop()?.toLowerCase();
      clientLogoBytes = await fetchProjectFile(supabase, url);
      clientLogoMime  = ext === "png" ? "image/png" : "image/jpeg";
    }
  }

  // ── 11b. Fetch per-company logo bytes (Phase D) ──────────────────────────────
  // Stored in the private `company-assets` bucket. Preferred over the legacy
  // per-project client_logo_url when an image_region binds to "company_logo".
  // pdf-lib only supports PNG and JPEG embeds — WebP is accepted at upload but
  // skipped here with a warning so the renderer doesn't throw.
  let companyLogoBytes: Uint8Array | null = null;
  let companyLogoMime:  "image/png" | "image/jpeg" | null = null;

  if (companyLogoPath) {
    const ext = companyLogoPath.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "webp") {
      console.warn(
        `generate-package: company logo at ${companyLogoPath} is WebP; ` +
        `pdf-lib only supports PNG / JPEG embeds — skipping. Re-upload as PNG or JPEG to render.`
      );
    } else {
      const bytes = await fetchFromBucket(supabase, "company-assets", companyLogoPath);
      if (bytes) {
        companyLogoBytes = bytes;
        companyLogoMime  = ext === "png" ? "image/png" : "image/jpeg";
      }
    }
  }

  // ── 11c. Fetch per-project cover map bytes (Phase E + F) ─────────────────────
  // One row per project in `project_cover_maps`; file lives in the existing
  // `project-files` bucket.
  //
  // Phase F — when cropped_storage_path is present, prefer it (always PNG).
  // Falls back to storage_path for legacy rows uploaded before Phase F or for
  // uploads where sharp couldn't crop. Same WebP caveat as the company logo
  // applies to the original-only fallback path — pdf-lib embeds PNG / JPEG.
  let coverMapBytes: Uint8Array | null = null;
  let coverMapMime:  "image/png" | "image/jpeg" | null = null;
  // Phase G — saved work-path polylines, parsed defensively. May be null if
  // the column doesn't exist yet, the row has no annotations, or the JSON is
  // malformed. We never throw here.
  let coverMapAnnotations: CoverMapAnnotations | null = null;

  try {
    const { data: coverRow, error: coverErr } = await supabase
      .from("project_cover_maps")
      .select("storage_path, cropped_storage_path, mime_type, annotations")
      .eq("project_id", projectId)
      .maybeSingle();

    if (coverErr) {
      console.warn(`generate-package: cover map lookup failed for project ${projectId}:`, coverErr.message);
    } else if (coverRow) {
      const croppedPath  = (coverRow as { cropped_storage_path: string | null }).cropped_storage_path ?? null;
      const originalPath = (coverRow as { storage_path: string }).storage_path;
      const originalMime = ((coverRow as { mime_type: string | null }).mime_type ?? "").toLowerCase();
      const rawAnnotations = (coverRow as { annotations?: unknown }).annotations ?? null;
      if (rawAnnotations) {
        try {
          coverMapAnnotations = parseAnnotations(rawAnnotations);
        } catch (e) {
          console.warn(`generate-package: cover map annotations parse threw:`, e);
        }
      }

      if (croppedPath) {
        // Cropped is always PNG — no MIME branching, no WebP edge case.
        const bytes = await fetchProjectFile(supabase, croppedPath);
        if (bytes) {
          coverMapBytes = bytes;
          coverMapMime  = "image/png";
        } else {
          console.warn(
            `generate-package: cover map cropped path ${croppedPath} returned no bytes; ` +
            `falling back to original.`
          );
        }
      }

      // Fallback to the original when there's no cropped path (legacy rows
      // pre-Phase-F) or when the cropped fetch returned null.
      if (!coverMapBytes) {
        const ext = originalPath.split(".").pop()?.toLowerCase() ?? "";
        if (originalMime === "image/webp" || ext === "webp") {
          console.warn(
            `generate-package: cover map at ${originalPath} is WebP and no cropped ` +
            `version exists; pdf-lib only supports PNG / JPEG — skipping. ` +
            `Re-upload to trigger an auto-crop to PNG.`
          );
        } else {
          const bytes = await fetchProjectFile(supabase, originalPath);
          if (bytes) {
            coverMapBytes = bytes;
            coverMapMime  =
              originalMime === "image/png" || ext === "png" ? "image/png" : "image/jpeg";
          }
        }
      }
    }
  } catch (e) {
    console.warn(`generate-package: cover map lookup threw for project ${projectId}:`, e);
  }

  // ── 12. Build content PDF chunks: TCP → TCD → SLD ────────────────────────────
  //
  // ORDER IS STRICT: TCP sheets, then TCD sheet, then SLD sheet.
  // The cover sheet is generated AFTER we know the total page count.
  //
  // Wrapper composition priority (per section):
  //
  //   P1  blueprint wrapper_id → page_templates (is_active=true, placement_box set)
  //       Source drawing embedded into wrapper placement_box (aspect-ratio preserved,
  //       centered). wrapper.field_mappings overlay applied post-composition.
  //       applyPageOverlay (legacy top-right JB number) is SKIPPED.
  //
  //   P2  raw source file + applyPageOverlay (existing legacy behavior)
  //       Used when: no blueprint, wrapper not found/inactive, placement_box missing,
  //       wrapper PDF not in storage, or composition throws.

  // Font cache — must be initialized before applyOverlayMappings is called for
  // wrapper templates (step 12). Declared here so the const binding is live for
  // all ensureFontBytes / applyOverlayMappings calls throughout the handler.
  const handlerFontCache = new Map<string, Uint8Array>();

  const contentChunks: Uint8Array[] = [];

  // Section slice boundaries inside contentChunks — used by step 13a computed overlay pass.
  const sectionSlices: SectionSlice[] = [];

  // First raw source bytes per content type — used by pdf_region bindings at runtime.
  // Captured during content chunk assembly so region embeds can access the originals.
  let firstTcpRawBytes: Uint8Array | null = null;
  let firstTcdRawBytes: Uint8Array | null = null;
  let firstSldRawBytes: Uint8Array | null = null;

  // Resolve a wrapper template ID → usable { bytes, box, fieldMappings } or null.
  const resolveWrapper = async (
    wrapperId: string | null | undefined
  ): Promise<{
    bytes:         Uint8Array;
    box:           { x: number; y: number; width: number; height: number };
    fieldMappings: Record<string, unknown> | null;
  } | null> => {
    if (!wrapperId) return null;

    const wt = wrapperByTemplateId.get(wrapperId);
    if (!wt) {
      console.warn(`generate-package: wrapper ${wrapperId} not found or inactive`);
      return null;
    }
    if (!wt.storage_path) {
      console.warn(`generate-package: wrapper ${wrapperId} has no storage_path — falling to raw`);
      return null;
    }
    const box = parsePlacementBox(wt.placement_box);
    if (!box) {
      console.warn(`generate-package: wrapper ${wrapperId} has no valid placement_box — falling to raw`);
      return null;
    }
    const bytes = await fetchFromBucket(supabase, PAGE_TEMPLATES_BUCKET, wt.storage_path);
    if (!bytes) {
      console.warn(`generate-package: wrapper ${wrapperId} PDF not fetchable from page-templates/${wt.storage_path} — falling to raw`);
      return null;
    }
    return { bytes, box, fieldMappings: wt.field_mappings };
  };

  // A. TCP sheets
  const tcpIds    = metadata?.file_ids?.tcp ?? [];
  const tcpWrapper = await resolveWrapper(blueprint?.tcp_wrapper_id);
  if (tcpWrapper) {
    console.log(`generate-package: TCP using wrapper ${blueprint!.tcp_wrapper_id}`);
  }

  const tcpSliceStart = contentChunks.length;
  for (const tcpId of tcpIds) {
    const storagePath = await getFilePath(tcpId);
    if (!storagePath) continue;
    const rawBytes = await fetchProjectFile(supabase, storagePath);
    if (!rawBytes) continue;

    if (!firstTcpRawBytes) firstTcpRawBytes = rawBytes;

    let bytes: Uint8Array;
    if (tcpWrapper) {
      try {
        bytes = await applyWrapperComposition(tcpWrapper.bytes, rawBytes, tcpWrapper.box);
        bytes = await applyOverlayMappings(bytes, tcpWrapper.fieldMappings);
      } catch (err) {
        console.error("generate-package: TCP wrapper composition failed — using raw:", err);
        bytes = await applyPageOverlay(rawBytes, project.job_number ?? "");
      }
    } else {
      bytes = await applyPageOverlay(rawBytes, project.job_number ?? "");
    }
    contentChunks.push(bytes);
  }
  if (contentChunks.length > tcpSliceStart) {
    sectionSlices.push({
      name: "TCP", startIndex: tcpSliceStart, endIndex: contentChunks.length,
      fieldMappings: tcpWrapper?.fieldMappings ?? null,
    });
  }

  // B. TCD sheets (all selected)
  const selectedTcds = metadata?.selected_tcds ?? [];
  const tcdWrapper   = await resolveWrapper(blueprint?.tcd_wrapper_id);
  if (tcdWrapper) {
    console.log(`generate-package: TCD using wrapper ${blueprint!.tcd_wrapper_id}`);
  }

  const tcdSliceStart = contentChunks.length;
  for (const tcd of selectedTcds) {
    if (tcd.storage_path) {
      const rawBytes = await fetchFromBucket(supabase, "tcd-pdfs", tcd.storage_path);
      if (rawBytes) {
        if (!firstTcdRawBytes) firstTcdRawBytes = rawBytes;

        let bytes: Uint8Array;
        if (tcdWrapper) {
          try {
            bytes = await applyWrapperComposition(tcdWrapper.bytes, rawBytes, tcdWrapper.box);
            bytes = await applyOverlayMappings(bytes, tcdWrapper.fieldMappings);
          } catch (err) {
            console.error("generate-package: TCD wrapper composition failed — using raw:", err);
            bytes = await applyPageOverlay(rawBytes, project.job_number ?? "");
          }
        } else {
          bytes = await applyPageOverlay(rawBytes, project.job_number ?? "");
        }
        contentChunks.push(bytes);
      }
    }
  }
  if (contentChunks.length > tcdSliceStart) {
    sectionSlices.push({
      name: "TCD", startIndex: tcdSliceStart, endIndex: contentChunks.length,
      fieldMappings: tcdWrapper?.fieldMappings ?? null,
    });
  }

  // C. SLD sheets (all uploaded)
  const sldIds    = metadata?.file_ids?.sld ?? [];
  const sldWrapper = await resolveWrapper(blueprint?.sld_wrapper_id);
  if (sldWrapper) {
    console.log(`generate-package: SLD using wrapper ${blueprint!.sld_wrapper_id}`);
  }

  const sldSliceStart = contentChunks.length;
  for (const sldId of sldIds) {
    const storagePath = await getFilePath(sldId);
    if (storagePath) {
      const rawBytes = await fetchProjectFile(supabase, storagePath);
      if (rawBytes) {
        if (!firstSldRawBytes) firstSldRawBytes = rawBytes;

        let bytes: Uint8Array;
        if (sldWrapper) {
          try {
            bytes = await applyWrapperComposition(sldWrapper.bytes, rawBytes, sldWrapper.box);
            bytes = await applyOverlayMappings(bytes, sldWrapper.fieldMappings);
          } catch (err) {
            console.error("generate-package: SLD wrapper composition failed — using raw:", err);
            bytes = await applyPageOverlay(rawBytes, project.job_number ?? "");
          }
        } else {
          bytes = await applyPageOverlay(rawBytes, project.job_number ?? "");
        }
        contentChunks.push(bytes);
      }
    }
  }
  if (contentChunks.length > sldSliceStart) {
    sectionSlices.push({
      name: "SLD", startIndex: sldSliceStart, endIndex: contentChunks.length,
      fieldMappings: sldWrapper?.fieldMappings ?? null,
    });
  }

  if (contentChunks.length === 0) {
    return NextResponse.json(
      { error: "No PDF source files found (TCP/TCD/SLD) — nothing to merge" },
      { status: 500 }
    );
  }

  // ── 13. Count total pages (per-chunk and total) ──────────────────────────────
  // Count each chunk individually so step 13a can compute per-page metadata
  // without re-loading PDFs. Replaces the single countPages(contentChunks) call.

  const chunkPageCounts: number[] = new Array(contentChunks.length).fill(0);
  let contentPageCount = 0;
  for (let _i = 0; _i < contentChunks.length; _i++) {
    try {
      const _doc = await PDFDocument.load(contentChunks[_i]);
      chunkPageCounts[_i] = _doc.getPageCount();
      contentPageCount   += chunkPageCounts[_i];
    } catch { /* skip corrupt chunk */ }
  }
  const totalPages = 1 + contentPageCount; // 1 = the cover sheet itself

  // Inject legacy sheet_of for backward compat with older templates.
  projectData.sheet_of = `1 OF ${totalPages}`;

  // ── Font cache helpers (shared across this generation run) ───────────────────
  // Lazily fetches font bytes by fontId; deduplicates across all overlay calls.
  // handlerFontCache is declared above (before step 12) to avoid TDZ access.

  async function ensureFontBytes(fontIds: string[]): Promise<void> {
    const missing = fontIds.filter((id) => !handlerFontCache.has(id));
    if (missing.length === 0) return;
    const extra = await buildFontCache(supabase, [{ fields: missing.map((id) => ({ fontId: id })) }]);
    for (const [id, bytes] of extra) handlerFontCache.set(id, bytes);
  }

  function collectFontIds(mappings: Record<string, unknown> | null): string[] {
    if (!mappings) return [];
    const ids: string[] = [];
    const dfId = mappings["defaultFontId"];
    if (typeof dfId === "string" && dfId) ids.push(dfId);
    const fields = mappings["fields"] as Array<{ fontId?: string }> | undefined;
    if (Array.isArray(fields)) {
      for (const f of fields) {
        if (typeof f.fontId === "string" && f.fontId) ids.push(f.fontId);
      }
    }
    return ids;
  }

  // ── 13a. Computed field overlay pass ─────────────────────────────────────────
  // Now that section page counts are known, compute per-page numbering metadata
  // and apply it to any content chunks whose wrapper templates reference computed
  // field keys. Chunks without computed fields are untouched.

  // Per-section totals
  const sectionTotals: Record<string, number> = {};
  for (const slice of sectionSlices) {
    let total = 0;
    for (let _i = slice.startIndex; _i < slice.endIndex; _i++) {
      total += chunkPageCounts[_i];
    }
    sectionTotals[slice.name] = (sectionTotals[slice.name] ?? 0) + total;
  }

  // Global 1-indexed start page for each section (cover is always page 1)
  const sectionGlobalStarts: Record<string, number> = {
    TCP: 2,
    TCD: 2 + (sectionTotals.TCP ?? 0),
    SLD: 2 + (sectionTotals.TCP ?? 0) + (sectionTotals.TCD ?? 0),
  };

  // Apply computed overlays to chunks that reference computed field keys
  for (const slice of sectionSlices) {
    if (!hasComputedFieldRefs(slice.fieldMappings)) continue;

    const sectionTotal   = sectionTotals[slice.name]      ?? 1;
    const globalStart    = sectionGlobalStarts[slice.name] ?? 2;
    let   sectionProgress = 0;

    for (let _i = slice.startIndex; _i < slice.endIndex; _i++) {
      const chunkPages = chunkPageCounts[_i];
      if (chunkPages === 0) continue;

      await ensureFontBytes(collectFontIds(slice.fieldMappings));
      contentChunks[_i] = await applyComputedFieldOverlays(
        contentChunks[_i],
        slice.fieldMappings!,
        slice.name,
        globalStart  + sectionProgress,
        1            + sectionProgress,
        sectionTotal,
        totalPages,
        handlerFontCache
      );

      sectionProgress += chunkPages;
    }
  }

  // Inject cover page computed fields into projectData for use by cover template overlays.
  // Cover is always global page 1, section "Cover" with section 1/1.
  projectData.sheet_number_current         = "1";
  projectData.sheet_number_total           = String(totalPages);
  projectData.sheet_number_display         = `1 OF ${totalPages}`;
  projectData.package_section_name         = "Cover";
  projectData.package_section_page_current = "1";
  projectData.package_section_page_total   = "1";
  projectData.package_section_display      = "1 of 1";

  // ── 14. Generate cover sheet (package layer) ──────────────────────────────────
  //
  // Priority order:
  //
  //   P1  blueprint.cover_page_template_id → page_templates(type='cover')
  //       Primary path — what the blueprint editor UI writes.
  //       Fetches PDF from "page-templates" bucket; applies field_mappings overlay
  //       when present. If field_mappings is null, uses PDF as-is (static cover).
  //
  //   P2  blueprint.cover_sheet_template_id → cover_template_versions (legacy)
  //       Kept for any blueprints that had the old FK configured before the UI
  //       migration. Fetches live version from "cover-templates" bucket.
  //
  //   P3  resolveCoverTemplate() attribute-based (legacy fallback)
  //       Used when no blueprint is present or neither blueprint cover field is set.
  //
  //   P4  generateCoverSheet() programmatic — always succeeds, never blocks.

  const programmaticCoverArgs = {
    jobNumber:       project.job_number    ?? "",
    roadway:         project.roadway,
    routeNumber:     null,
    mileposts_from:  project.milepost_start,
    mileposts_to:    project.milepost_end,
    municipality:    project.township,
    county:          project.county,
    state:           project.state,
    designerName,
    companyName,
    clientLogoBytes,
    clientLogoMime,
    date:            dateStr,
    totalPages,
  };

  type PageMode = "single" | "all" | "specific";
  type OverlayField = { key: string; x: number; y: number; page?: number; pageMode?: PageMode };

  type RegionRuntimeObject = {
    id: string;
    type: "pdf_region" | "image_region";
    x: number;
    y: number;
    width: number;
    height: number;
    page?: number;
    pageMode?: PageMode;
    sourceKey?: string;
    assetId?: string;
  };

  // Fetch a custom image asset's bytes from the page-templates bucket.
  async function fetchAssetBytes(
    assetId: string
  ): Promise<{ bytes: Uint8Array; mime: string } | null> {
    const { data: asset } = await supabase
      .from("page_template_assets")
      .select("storage_path, mime_type")
      .eq("id", assetId)
      .maybeSingle();
    if (!asset?.storage_path) return null;
    const bytes = await fetchFromBucket(supabase, PAGE_TEMPLATES_BUCKET, asset.storage_path);
    if (!bytes) return null;
    return { bytes, mime: asset.mime_type };
  }

  // Embed a PDF page from a source document into a region on the target page.
  // Scales the source to fit within the region bounds (aspect ratio preserved, centered).
  async function applyPdfRegion(
    doc: Awaited<ReturnType<typeof PDFDocument.load>>,
    page: PDFPage,
    region: RegionRuntimeObject
  ): Promise<boolean> {
    let sourceBytes: Uint8Array | null = null;

    switch (region.sourceKey) {
      case "tcp_sheets": sourceBytes = firstTcpRawBytes; break;
      case "tcd_sheets": sourceBytes = firstTcdRawBytes; break;
      case "sld_sheets": sourceBytes = firstSldRawBytes; break;
      default:
        console.warn(`generate-package: pdf_region ${region.id} has no sourceKey — skipping`);
        return false;
    }

    if (!sourceBytes) {
      console.warn(
        `generate-package: pdf_region ${region.id} sourceKey=${region.sourceKey} ` +
        `— no source bytes available (content type not present in this job) — skipping`
      );
      return false;
    }

    try {
      const sourceDoc = await PDFDocument.load(sourceBytes);
      const [embeddedPage] = await doc.embedPdf(sourceDoc, [0]);

      const scale = Math.min(region.width / embeddedPage.width, region.height / embeddedPage.height);
      const w     = embeddedPage.width  * scale;
      const h     = embeddedPage.height * scale;

      page.drawPage(embeddedPage, {
        x:      region.x + (region.width  - w) / 2,
        y:      region.y + (region.height - h) / 2,
        width:  w,
        height: h,
      });
      return true;
    } catch (err) {
      console.error(`generate-package: pdf_region ${region.id} embed failed:`, err);
      return false;
    }
  }

  // Embed an image into a region on the target page.
  // Scales to fit within the region bounds (aspect ratio preserved, centered).
  async function applyImageRegion(
    doc: Awaited<ReturnType<typeof PDFDocument.load>>,
    page: PDFPage,
    region: RegionRuntimeObject
  ): Promise<boolean> {
    let imageBytes: Uint8Array | null = null;
    let imageMime:  string | null     = null;

    switch (region.sourceKey) {
      case "company_logo":
        // Phase D — prefer the per-company logo (companies.logo_path).
        // Falls back to the legacy per-project client_logo_url so existing
        // templates that relied on the old semantics keep producing output.
        if (companyLogoBytes) {
          imageBytes = companyLogoBytes;
          imageMime  = companyLogoMime;
        } else {
          imageBytes = clientLogoBytes;
          imageMime  = clientLogoMime;
        }
        break;
      case "project_cover_map":
        // Phase E — per-project cover map; falls through to skip when none uploaded.
        imageBytes = coverMapBytes;
        imageMime  = coverMapMime;
        break;
      case "custom_image":
        if (region.assetId) {
          const result = await fetchAssetBytes(region.assetId);
          imageBytes = result?.bytes ?? null;
          imageMime  = result?.mime  ?? null;
        } else {
          console.warn(`generate-package: image_region ${region.id} sourceKey=custom_image but no assetId — skipping`);
          return false;
        }
        break;
      default:
        console.warn(`generate-package: image_region ${region.id} has no sourceKey — skipping`);
        return false;
    }

    if (!imageBytes) {
      console.warn(
        `generate-package: image_region ${region.id} sourceKey=${region.sourceKey} ` +
        `— no image bytes available — skipping`
      );
      return false;
    }

    try {
      const isPng = imageMime?.includes("png") || imageMime?.includes("webp");
      const embeddedImage = isPng
        ? await doc.embedPng(imageBytes)
        : await doc.embedJpg(imageBytes);

      const scale = Math.min(region.width / embeddedImage.width, region.height / embeddedImage.height);
      const w     = embeddedImage.width  * scale;
      const h     = embeddedImage.height * scale;
      const drawX = region.x + (region.width  - w) / 2;
      const drawY = region.y + (region.height - h) / 2;

      page.drawImage(embeddedImage, {
        x:      drawX,
        y:      drawY,
        width:  w,
        height: h,
      });

      // Phase G/I/K — overlay the saved work-path linework on top of the
      // cropped cover map. Annotation points are normalized 0..1 to the
      // image's drawn box, not the full region — so a path stays visually
      // anchored to the map even if the region is letterboxed inside its slot.
      //
      // Coordinate flip: SVG / editor y grows downward (0 = top, 1 = bottom).
      // pdf-lib y grows upward (drawY = bottom, drawY + h = top). We invert y
      // so a point with editor y=0 lands on the top edge of the drawn image.
      //
      // Phase K — every path renders as a single dashed black stroke, with
      // thickness and dash pattern resolved from workPathPreset/workPathThickness
      // via getGRANTEDWorkPathStyle. Legacy fields (color, lineStyle,
      // renderMode, outline*) are ignored here so existing rows display the
      // standard GRANTED style automatically. pdf-lib has no built-in dashed
      // drawLine, so we walk each polyline segment and emit individual line
      // calls for each visible dash, carrying remainder across vertices.
      if (region.sourceKey === "project_cover_map" && coverMapAnnotations) {
        try {
          const topY = drawY + h;
          // Project a normalized point into PDF coordinates inside the drawn box.
          const project = (p: { x: number; y: number }) => ({
            x: drawX + p.x * w,
            y: topY  - p.y * h,
          });

          // Walk a polyline emitting either a solid run of segments or a
          // dashed pattern with state carried across vertices (so the dash
          // stride doesn't reset at every joint, which looks ugly).
          const drawPolyline = (
            pts: Array<{ x: number; y: number }>,
            thickness: number,
            colorHex: string,
            style: "solid" | "dashed",
            dashLen: number,
            gapLen:  number,
          ): void => {
            if (pts.length < 2) return;
            const { r, g, b } = hexToRgb01(colorHex);
            const color = rgb(r, g, b);

            const projected = pts.map(project);

            if (style !== "dashed") {
              for (let i = 1; i < projected.length; i++) {
                page.drawLine({
                  start:     projected[i - 1],
                  end:       projected[i],
                  thickness,
                  color,
                  lineCap:   LineCapStyle.Round,
                });
              }
              return;
            }

            // Dashed walk — carry state across segment boundaries.
            let drawing       = true;
            let stateRemaining = Math.max(1, dashLen);
            for (let i = 1; i < projected.length; i++) {
              const a = projected[i - 1];
              const b = projected[i];
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const segLen = Math.hypot(dx, dy);
              if (segLen === 0) continue;
              const ux = dx / segLen;
              const uy = dy / segLen;
              let pos = 0;
              while (pos < segLen) {
                const advance = Math.min(stateRemaining, segLen - pos);
                if (drawing) {
                  page.drawLine({
                    start:     { x: a.x + ux * pos,            y: a.y + uy * pos            },
                    end:       { x: a.x + ux * (pos + advance), y: a.y + uy * (pos + advance) },
                    thickness,
                    color,
                    lineCap:   LineCapStyle.Round,
                  });
                }
                pos             += advance;
                stateRemaining  -= advance;
                if (stateRemaining <= 0) {
                  drawing        = !drawing;
                  stateRemaining = Math.max(1, drawing ? dashLen : gapLen);
                }
              }
            }
          };

          for (const path of coverMapAnnotations.paths) {
            if (path.points.length < 2) continue;
            const style = getGRANTEDWorkPathStyle(path);
            drawPolyline(
              path.points,
              style.strokeWidth,
              style.stroke,
              style.lineStyle,
              style.dashLength,
              style.gapLength,
            );
          }
        } catch (annErr) {
          console.warn(`generate-package: image_region ${region.id} annotation draw failed:`, annErr);
        }
      }

      return true;
    } catch (err) {
      console.error(`generate-package: image_region ${region.id} embed failed:`, err);
      return false;
    }
  }

  // Apply all region embeds (PDF and image) to the template PDF.
  // Regions are processed in order: pdf_region first, then image_region.
  // Text overlays are applied separately after this call (so text is always on top).
  async function applyRegionEmbeds(
    pdfBytes: Uint8Array,
    regions: RegionRuntimeObject[]
  ): Promise<Uint8Array> {
    const doc   = await PDFDocument.load(pdfBytes);
    const pages = doc.getPages();
    let modified = false;

    // pdf_region first so image regions render on top
    for (const region of regions) {
      if (region.type !== "pdf_region") continue;
      const pageMode = region.pageMode ?? "single";
      if (pageMode === "all") {
        for (const page of pages) {
          const ok = await applyPdfRegion(doc, page, region);
          if (ok) modified = true;
        }
      } else {
        const pageIdx = region.page ?? 0;
        const page    = pages[pageIdx];
        if (!page) {
          console.warn(`generate-package: pdf_region ${region.id} page ${pageIdx} out of range — skipping`);
          continue;
        }
        const ok = await applyPdfRegion(doc, page, region);
        if (ok) modified = true;
      }
    }

    for (const region of regions) {
      if (region.type !== "image_region") continue;
      const pageMode = region.pageMode ?? "single";
      if (pageMode === "all") {
        for (const page of pages) {
          const ok = await applyImageRegion(doc, page, region);
          if (ok) modified = true;
        }
      } else {
        const pageIdx = region.page ?? 0;
        const page    = pages[pageIdx];
        if (!page) {
          console.warn(`generate-package: image_region ${region.id} page ${pageIdx} out of range — skipping`);
          continue;
        }
        const ok = await applyImageRegion(doc, page, region);
        if (ok) modified = true;
      }
    }

    if (!modified) return pdfBytes;
    return doc.save();
  }

  // Composition order: regions first (PDF embeds, then images), text overlays last.
  async function applyOverlayMappings(
    pdfBytes: Uint8Array,
    mappings: Record<string, unknown> | null
  ): Promise<Uint8Array> {
    if (!mappings) return pdfBytes;

    const fields  = (mappings["fields"]  as OverlayField[]        | undefined) ?? [];
    const regions = (mappings["regions"] as RegionRuntimeObject[]  | undefined) ?? [];

    const hasFields  = fields.length  > 0;
    const hasRegions = regions.length > 0;

    if (!hasFields && !hasRegions) return pdfBytes;

    let result = pdfBytes;

    // 1. Embed PDF and image regions (behind text)
    if (hasRegions) {
      result = await applyRegionEmbeds(result, regions);
    }

    // 2. Apply text overlays on top
    if (hasFields) {
      await ensureFontBytes(collectFontIds(mappings));
      result = await overlayFlatForm(result, projectData, {
        fontSize:      (mappings["fontSize"]    as number | undefined) ?? 9,
        defaultFontId: (mappings["defaultFontId"] as string | undefined),
        fields,
        fontBytes: handlerFontCache,
      });
    }

    return result;
  }

  let coverBytes: Uint8Array | undefined;

  // ── P1: blueprint page_template cover ────────────────────────────────────────
  if (blueprint?.cover_page_template_id) {
    const { data: pt } = await supabase
      .from("page_templates")
      .select("storage_path, field_mappings")
      .eq("id", blueprint.cover_page_template_id)
      .eq("template_type", "cover")
      .eq("is_active", true)
      .maybeSingle();

    if (pt?.storage_path) {
      const pdfBytes = await fetchFromBucket(supabase, PAGE_TEMPLATES_BUCKET, pt.storage_path);
      if (pdfBytes) {
        const mappings = (pt.field_mappings ?? null) as Record<string, unknown> | null;
        coverBytes = await applyOverlayMappings(pdfBytes, mappings);
        console.log(
          `generate-package [P1]: cover from page_template ${blueprint.cover_page_template_id}` +
          (mappings ? " (with overlay)" : " (static — no field_mappings)")
        );
      } else {
        console.warn(
          `generate-package [P1]: page_template ${blueprint.cover_page_template_id} ` +
          `PDF not fetchable from page-templates/${pt.storage_path} — falling to P2`
        );
      }
    } else {
      console.warn(
        `generate-package [P1]: page_template ${blueprint.cover_page_template_id} ` +
        `not found, inactive, or has no storage_path — falling to P2`
      );
    }
  }

  // ── P2: blueprint legacy cover_sheet_template ─────────────────────────────────
  if (!coverBytes && blueprint?.cover_sheet_template_id) {
    const { data: bpVersion } = await supabase
      .from("cover_template_versions")
      .select("storage_path, field_mappings")
      .eq("cover_template_id", blueprint.cover_sheet_template_id)
      .eq("is_live", true)
      .maybeSingle();

    if (bpVersion?.storage_path) {
      const pdfBytes = await fetchFromBucket(supabase, "cover-templates", bpVersion.storage_path);
      if (pdfBytes) {
        const mappings = (bpVersion.field_mappings ?? null) as Record<string, unknown> | null;
        coverBytes = await applyOverlayMappings(pdfBytes, mappings);
        console.log(
          `generate-package [P2]: cover from legacy cover_sheet_template_id=${blueprint.cover_sheet_template_id}`
        );
      } else {
        console.warn(
          `generate-package [P2]: legacy cover version PDF not fetchable ` +
          `(${bpVersion.storage_path}) — falling to P3`
        );
      }
    } else {
      console.warn(
        `generate-package [P2]: no live version for cover_sheet_template_id=${blueprint.cover_sheet_template_id} — falling to P3`
      );
    }
  }

  // ── P3: attribute-based resolveCoverTemplate() ────────────────────────────────
  if (!coverBytes) {
    const resolvedCover = await resolveCoverTemplate(supabase, {
      authority_type: project.authority_type,
      state:          project.state,
      county:         project.county,
      job_type:       project.job_type,
      pe_required:    project.pe_required,
    });

    if (resolvedCover) {
      console.log(
        `generate-package [P3]: cover resolved → "${resolvedCover.templateName}" ` +
        `(template ${resolvedCover.templateId}, version ${resolvedCover.versionId})`
      );
      const pdfBytes = await fetchFromBucket(supabase, "cover-templates", resolvedCover.storagePath);
      if (pdfBytes) {
        const mappings = resolvedCover.fieldMappings as Record<string, unknown> | null;
        coverBytes = await applyOverlayMappings(pdfBytes, mappings);
      } else {
        console.warn(
          `generate-package [P3]: cover PDF not in storage (${resolvedCover.storagePath}) — falling to P4`
        );
      }
    } else {
      console.log("generate-package [P3]: no attribute-matched cover template — falling to P4");
    }
  }

  // ── P4: programmatic fallback ─────────────────────────────────────────────────
  if (!coverBytes) {
    console.log("generate-package [P4]: using programmatic cover sheet");
    coverBytes = await generateCoverSheet(programmaticCoverArgs);
  }

  // ── 15. Assemble final package: cover → TCP → TCD → SLD ──────────────────────
  // coverBytes is guaranteed to be set by the tri-priority cover logic above.
  const allChunks = [coverBytes as Uint8Array, ...contentChunks];
  let mergedBytes  = await mergePdfs(allChunks);

  if (requiresPeStamp) {
    mergedBytes = await applyPeStamp(supabase, mergedBytes, projectId);
  }

  // ── 16. Upload permit package (package layer output) ─────────────────────────
  const packageFileName    = `${project.job_number}_permit_package.pdf`;
  const packageStoragePath = `${projectId}/packages/${jobId}_permit_package.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("project-files")
    .upload(packageStoragePath, Buffer.from(mergedBytes), { contentType: "application/pdf", upsert: true });

  if (uploadError) {
    console.error("generate-package: package upload failed:", uploadError);
    return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
  }

  // Register in project_files
  await supabase.from("project_files").insert({
    project_id:    projectId,
    file_category: "permit_package",
    file_type:     "generated",
    file_name:     packageFileName,
    storage_path:  packageStoragePath,
    mime_type:     "application/pdf",
    uploader_label: "System",
    source:        "system_generated",
  }).select().maybeSingle(); // maybeSingle — ignore duplicate if row already exists

  // Advance billing_status to ready_to_invoice when the package is first generated.
  // Only transitions from not_ready to avoid overwriting a manually-advanced status.
  const { data: currentRow } = await supabase
    .from("projects")
    .select("status")
    .eq("id", projectId)
    .single();
  const currentStatus = (currentRow?.status as string) ?? "";

  await supabase
    .from("projects")
    .update({
      billing_status: "ready_to_invoice",
      unified_status: resolveUnifiedStatus(currentStatus, "ready_to_invoice"),
    })
    .eq("id", projectId)
    .eq("billing_status", "not_ready");

  // Phase H2: auto-recompute pricing now that the package exists. This is
  // best-effort and never throws — a pricing failure must not roll back the
  // package generation that already succeeded. The helper is idempotent
  // across the parallel /api/workflows/complete callback path.
  await autoRecomputeAfterPackage(supabase, projectId, "generate-package");

  // ── 17. Authority documents (authority layer) — SEPARATE files ────────────────
  //
  // These are NEVER merged into the main package.
  // They are generated and stored as independent files.
  //
  // Priority per document type:
  //
  //   P1  blueprint.app_page_template_id / cert_page_template_id
  //       → page_templates (type='application_form'/'certification_form', is_active=true)
  //       → "page-templates" bucket + field_mappings overlay
  //
  //   P2  authority_document_templates (already has blueprint FK override from step 6)
  //       → "authority-documents" bucket
  //
  // Generated when blueprint explicitly includes the form (P1 set) OR the authority
  // requires it (requiresApplication / requiresCertification). Failure to find a
  // source logs a warning and skips — it never kills the main package (already saved).

  type AuthDocSpec = {
    flag:             boolean;
    pageTemplateId:   string | null;
    pageTemplateType: string;
    type:             string;
    fileSuffix:       string;
    category:         string;
  };

  const authDocSpecs: AuthDocSpec[] = [
    {
      flag:             requiresApplication,
      pageTemplateId:   blueprint?.app_page_template_id  ?? null,
      pageTemplateType: "application_form",
      type:             "application",
      fileSuffix:       "application",
      category:         "application_form",
    },
    {
      flag:             requiresCertification,
      pageTemplateId:   blueprint?.cert_page_template_id ?? null,
      pageTemplateType: "certification_form",
      type:             "certification",
      fileSuffix:       "certification",
      category:         "certification_form",
    },
  ];

  for (const { flag, pageTemplateId, pageTemplateType, type, fileSuffix, category } of authDocSpecs) {
    if (!pageTemplateId && !flag) continue;

    try {
      let docBytes: Uint8Array | null = null;

      // P1: blueprint page_template → "page-templates" bucket
      if (pageTemplateId) {
        const { data: pt } = await supabase
          .from("page_templates")
          .select("storage_path, field_mappings")
          .eq("id", pageTemplateId)
          .eq("template_type", pageTemplateType)
          .eq("is_active", true)
          .maybeSingle();

        if (pt?.storage_path) {
          const pdfBytes = await fetchFromBucket(supabase, PAGE_TEMPLATES_BUCKET, pt.storage_path);
          if (pdfBytes) {
            const ptMappings = (pt.field_mappings ?? null) as Record<string, unknown> | null;
            await ensureFontBytes(collectFontIds(ptMappings));
            docBytes = await fillAuthorityDocument(
              pdfBytes,
              projectData,
              ptMappings,
              handlerFontCache
            );
            console.log(`generate-package [${type} P1]: page_template ${pageTemplateId}`);
          } else {
            console.warn(
              `generate-package [${type} P1]: PDF not fetchable from ` +
              `page-templates/${pt.storage_path} — falling to P2`
            );
          }
        } else {
          console.warn(
            `generate-package [${type} P1]: page_template ${pageTemplateId} ` +
            `not found, inactive, or no storage_path — falling to P2`
          );
        }
      }

      // P2: authority_document_templates (legacy; already has blueprint FK override from step 6)
      if (!docBytes) {
        const template = authDocTemplates.find((t) => t.type === type);
        if (template) {
          const templateBytes = await fetchFromBucket(supabase, "authority-documents", template.file_url);
          if (templateBytes) {
            const legacyMappings = template.field_mappings as Record<string, unknown> | null;
            await ensureFontBytes(collectFontIds(legacyMappings));
            docBytes = await fillAuthorityDocument(
              templateBytes,
              projectData,
              legacyMappings,
              handlerFontCache
            );
            console.log(`generate-package [${type} P2]: authority_document_templates id=${template.id}`);
          } else {
            console.warn(
              `generate-package [${type} P2]: PDF not fetchable from ` +
              `authority-documents/${template.file_url}`
            );
          }
        } else {
          console.warn(
            `generate-package [${type}]: no P1 page_template and no P2 authority doc template — skipping`
          );
        }
      }

      if (!docBytes) continue;

      const authFileName    = `${project.job_number}_${fileSuffix}.pdf`;
      const authStoragePath = `${projectId}/packages/${jobId}_${fileSuffix}.pdf`;

      const { error: authUploadErr } = await supabase.storage
        .from("project-files")
        .upload(authStoragePath, Buffer.from(docBytes), { contentType: "application/pdf", upsert: true });

      if (!authUploadErr) {
        await supabase.from("project_files").insert({
          project_id:    projectId,
          file_category: category,
          file_type:     "generated",
          file_name:     authFileName,
          storage_path:  authStoragePath,
          mime_type:     "application/pdf",
          uploader_label: "System",
          source:        "system_generated",
        });
      } else {
        console.error(`generate-package: ${type} upload failed:`, authUploadErr);
      }
    } catch (err) {
      // Authority doc failure must NOT kill the main package — it's already saved.
      console.error(`generate-package: ${type} generation failed:`, err);
    }
  }

  // ── 18. Return ────────────────────────────────────────────────────────────────
  return NextResponse.json({
    ok:         true,
    file_path:  packageStoragePath,
    file_name:  packageFileName,
    total_pages: totalPages,
  });
}
