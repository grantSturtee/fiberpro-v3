"use client";

/**
 * FieldMappingEditor
 *
 * Visual overlay editor for page templates.
 * Manages two distinct object types:
 *   - text fields  → { key, x, y, page? }  — origin bottom-left, units pt
 *   - region objects → { id, type, label, x, y, width, height, page?, sourceKey?, assetId? }
 *
 * Runtime JSON shape (field_mappings column):
 *   {
 *     mode: "overlay",
 *     fontSize: 9,
 *     fields: [{ key, x, y, page? }],
 *     regions?: [{ id, type, label, x, y, width, height, page?, sourceKey?, assetId? }]
 *   }
 *
 * Coordinate system:
 *   PDF space    — origin bottom-left, units = pt
 *   Screen space — origin top-left,   units = px
 *   screenX = pdfX  * SCALE
 *   screenY = (pageHeightPt − pdfY) * SCALE
 *   For a region rect: screenTop = (pageH − pdfY − pdfHeight) * SCALE
 */

import { useState, useEffect, useRef, useCallback, useMemo, useTransition } from "react";
import type { TemplateAsset, TemplateAssetActionState } from "@/lib/actions/templateAssets";
import { createTemplateAsset, deleteTemplateAsset } from "@/lib/actions/templateAssets";
import type { TemplateFont } from "@/lib/actions/templateFonts";
import {
  PROJECT_FIELDS,
  COMPUTED_FIELDS,
  FULL_PACKAGE_FIELDS,
  SECTION_FIELDS,
  isComputedKey,
  labelForKey,
  sampleForKey,
  hintForKey,
  type ProjectFieldKey,
  type ComputedFieldKey,
} from "@/lib/templates/fieldCatalog";

// ── Field catalog ─────────────────────────────────────────────────────────────
// Catalog entries (keys, labels, sample values, hints) live in
// src/lib/templates/fieldCatalog.ts so the renderer and editor stay in sync.
//
// Job Number = client-facing JB / project number (projects.job_number_client).
// Internal ID = GRANTED internal tracking number (projects.job_number).

const FIELD_KEYS              = PROJECT_FIELDS;
const COMPUTED_FIELD_KEYS     = COMPUTED_FIELDS;
const FULL_PACKAGE_FIELD_KEYS = FULL_PACKAGE_FIELDS;
const SECTION_FIELD_KEYS      = SECTION_FIELDS;

type FieldKey    = ProjectFieldKey;
type AnyFieldKey = ProjectFieldKey | ComputedFieldKey;

const sampleFor = sampleForKey;
const hintFor   = hintForKey;

type PreviewRow = {
  label:        string;
  global:       number;   // 1-indexed global page in the full package
  section:      string;   // "Cover" | "TCP" | "TCD" | "SLD"
  sSection:     number;   // 1-indexed page within the section
  totalSection: number;   // total pages in that section
};

const PREVIEW_TOTAL = 10;
const PREVIEW_ROWS: PreviewRow[] = [
  { label: "Cover",  global: 1, section: "Cover", sSection: 1, totalSection: 1 },
  { label: "TCP 1",  global: 2, section: "TCP",   sSection: 1, totalSection: 3 },
  { label: "TCP 2",  global: 3, section: "TCP",   sSection: 2, totalSection: 3 },
  { label: "TCD 1",  global: 5, section: "TCD",   sSection: 1, totalSection: 2 },
  { label: "SLD 1",  global: 7, section: "SLD",   sSection: 1, totalSection: 4 },
];

function previewValue(key: string, row: PreviewRow): string {
  switch (key) {
    case "sheet_number_current":         return String(row.global);
    case "sheet_number_total":           return String(PREVIEW_TOTAL);
    case "sheet_number_display":         return `${row.global} OF ${PREVIEW_TOTAL}`;
    case "package_section_name":         return row.section;
    case "package_section_page_current": return String(row.sSection);
    case "package_section_page_total":   return String(row.totalSection);
    case "package_section_display":      return `${row.sSection} of ${row.totalSection}`;
    default:                             return "—";
  }
}

// ── Per-field colors ──────────────────────────────────────────────────────────

const KEY_COLORS: Record<string, string> = {
  job_number:   "#2563eb",
  internal_id:  "#475569",
  job_name:     "#7c3aed",
  date:         "#16a34a",
  roadway:      "#d97706",
  county:       "#0891b2",
  municipality: "#db2777",
  prepared_by:  "#ea580c",
  sub_location_title_block: "#be185d",
  start_milepost: "#b45309",
  end_milepost:   "#b45309",
  milepost_block: "#b45309",
  // Computed — teal for global, violet for section
  sheet_number_current:         "#0f766e",
  sheet_number_total:           "#0f766e",
  sheet_number_display:         "#0f766e",
  package_section_name:         "#6d28d9",
  package_section_page_current: "#6d28d9",
  package_section_page_total:   "#6d28d9",
  package_section_display:      "#6d28d9",
};

function colorForKey(key: string): string {
  return KEY_COLORS[key] ?? "#6b7280";
}

// ── Region source binding ─────────────────────────────────────────────────────

type PdfSourceKey   = "tcp_sheets" | "tcd_sheets" | "sld_sheets";
// Phase E — `project_cover_map` resolves at render time to the per-project
// cover map (uploaded on the admin project page); requires no assetId.
type ImageSourceKey = "company_logo" | "project_cover_map" | "custom_image";
type RegionSourceKey = PdfSourceKey | ImageSourceKey;

const PDF_SOURCE_OPTIONS: { key: PdfSourceKey; label: string }[] = [
  { key: "tcp_sheets", label: "TCP Sheets" },
  { key: "tcd_sheets", label: "TCD Sheets" },
  { key: "sld_sheets", label: "SLD Sheets" },
];

const IMAGE_SOURCE_OPTIONS: { key: ImageSourceKey; label: string }[] = [
  { key: "company_logo",      label: "Company Logo" },
  { key: "project_cover_map", label: "Project Cover Map" },
  { key: "custom_image",      label: "Custom Image" },
];

function pdfSourceLabel(key: PdfSourceKey | undefined): string {
  return PDF_SOURCE_OPTIONS.find((o) => o.key === key)?.label ?? "—";
}

function imageSourceLabel(key: ImageSourceKey | undefined): string {
  return IMAGE_SOURCE_OPTIONS.find((o) => o.key === key)?.label ?? "—";
}

// ── Region object tools ───────────────────────────────────────────────────────

type RegionKind = "pdf_region" | "image_region";

const REGION_TOOLS: { id: RegionKind; label: string; desc: string }[] = [
  { id: "pdf_region",   label: "PDF Insert Region", desc: "Embed a PDF document" },
  { id: "image_region", label: "Image / Logo",       desc: "Place an image or logo" },
];

const REGION_COLORS: Record<RegionKind, string> = {
  pdf_region:   "#2563eb",
  image_region: "#7c3aed",
};

function regionColor(type: RegionKind): string {
  return REGION_COLORS[type];
}

function regionTypeLabel(type: RegionKind): string {
  return type === "pdf_region" ? "PDF Insert Region" : "Image / Logo Region";
}

function regionDefaultLabel(type: RegionKind): string {
  return type === "pdf_region" ? "PDF Insert" : "Image / Logo";
}

/** Human-readable display label for a region, incorporating binding info. */
function regionDisplayLabel(r: RegionObject): string {
  if (r.label && r.label !== regionDefaultLabel(r.type)) return r.label;
  if (r.type === "pdf_region" && r.sourceKey) {
    return pdfSourceLabel(r.sourceKey as PdfSourceKey);
  }
  if (r.type === "image_region" && r.sourceKey) {
    return imageSourceLabel(r.sourceKey as ImageSourceKey);
  }
  return r.label || regionDefaultLabel(r.type);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type PageMode = "single" | "all" | "specific";
// Phase C — text alignment and anchor. Both optional; undefined defaults to
// "left" / "top-left" so existing saved mappings render exactly as before.
type TextAlign  = "left" | "center" | "right";
type TextAnchor = "top-left" | "center";
type OverlayField = {
  id: string;            // editor-local stable identity — not serialized to JSON
  key: string;
  x: number;
  y: number;
  page?: number;
  pageMode?: PageMode;
  locked?: boolean;      // Phase 3 — persisted; runtime ignores
  fontId?: string;       // UUID from page_template_fonts; undefined = default Helvetica
  fontSize?: number;     // per-field size override; undefined = use template-level fontSize
  align?: TextAlign;     // Phase C — undefined = "left"
  anchor?: TextAnchor;   // Phase C — undefined = "top-left"
};

type RegionObject = {
  id: string;
  type: RegionKind;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  page?: number;
  pageMode?: PageMode;
  sourceKey?: RegionSourceKey;
  assetId?: string;
  locked?: boolean;      // Phase 3 — persisted; runtime ignores
};

type Props = {
  pdfSignedUrl: string | null;
  initialMappings: Record<string, unknown> | null;
  onJsonChange?: (json: string) => void;
  isDirty?: boolean;
  pending?: boolean;
  saveError?: string | null;
  saveSuccess?: boolean;
  templateId: string;
  initialAssets: TemplateAsset[];
  fonts: TemplateFont[];
};

// 1 PDF point = SCALE screen pixels. At 0.85×, Letter (612 pt) → 520 px wide.
const SCALE = 0.85;

const SNAP_THRESHOLD_PX  = 8;
const DUPLICATE_OFFSET   = 15; // PDF points — offset applied on Cmd/Ctrl+D duplicate

// ── Validation warning types ──────────────────────────────────────────────────

type FieldWarn  = "off_page" | "duplicate_key";
type RegionWarn = "no_source" | "no_asset" | "off_page_partial" | "off_page_full" | "tiny";

const FIELD_WARN_MSG: Record<FieldWarn, { msg: string; sev: "warn" | "error" }> = {
  off_page:      { msg: "Field is outside the page boundary and will not render.", sev: "warn" },
  duplicate_key: { msg: "This key is placed more than once — only one instance will render.", sev: "warn" },
};

const REGION_WARN_MSG: Record<RegionWarn, { msg: string; sev: "warn" | "error" }> = {
  no_source:        { msg: "No source bound — this region will be skipped at generation.", sev: "error" },
  no_asset:         { msg: "Custom image has no asset selected — region will be skipped at generation.", sev: "error" },
  off_page_partial: { msg: "Region extends outside the page boundary and will be clipped.", sev: "warn" },
  off_page_full:    { msg: "Region is fully outside the page and will not render.", sev: "error" },
  tiny:             { msg: "Region is very small (< 20 pt) and may not render correctly.", sev: "warn" },
};

/**
 * Compute snapped coordinates from raw drag position.
 * Operates in PDF point space. threshold is already in PDF points.
 * Returns guideX/guideY as PDF point values for the snapped axis (null = no snap).
 */
function computeSnap(
  rawX: number,
  rawY: number,
  xTargets: number[],
  yTargets: number[],
  thresholdPt: number
): { x: number; y: number; guideX: number | null; guideY: number | null } {
  let x = rawX, guideX: number | null = null, minDX = thresholdPt;
  for (const t of xTargets) {
    const d = Math.abs(rawX - t);
    if (d < minDX) { minDX = d; x = t; guideX = t; }
  }
  let y = rawY, guideY: number | null = null, minDY = thresholdPt;
  for (const t of yTargets) {
    const d = Math.abs(rawY - t);
    if (d < minDY) { minDY = d; y = t; guideY = t; }
  }
  return { x, y, guideX, guideY };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isOverlayMappings(m: Record<string, unknown> | null): boolean {
  return !m || m.mode === "overlay";
}

function parseFields(m: Record<string, unknown> | null): OverlayField[] {
  if (!m || m.mode !== "overlay") return [];
  const fields = m.fields as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(fields)) return [];
  return fields
    .filter((f) => f.key && typeof f.x === "number" && typeof f.y === "number")
    .map((f) => {
      const out: OverlayField = {
        id:  typeof f.id === "string" && f.id ? f.id : crypto.randomUUID(),
        key: String(f.key),
        x:   f.x as number,
        y:   f.y as number,
      };
      if (typeof f.page === "number") out.page = f.page;
      if (f.pageMode === "all" || f.pageMode === "specific") out.pageMode = f.pageMode as PageMode;
      if (f.locked === true) out.locked = true;
      if (typeof f.fontId === "string" && f.fontId) out.fontId = f.fontId;
      if (typeof f.fontSize === "number") out.fontSize = f.fontSize;
      if (f.align === "center" || f.align === "right" || f.align === "left") {
        // Only retain non-default values; "left" is the implicit default.
        if (f.align !== "left") out.align = f.align;
      }
      if (f.anchor === "center" || f.anchor === "top-left") {
        if (f.anchor !== "top-left") out.anchor = f.anchor;
      }
      return out;
    });
}

function parseRegions(m: Record<string, unknown> | null): RegionObject[] {
  if (!m || m.mode !== "overlay") return [];
  const raw = m.regions as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (r) =>
        r.id &&
        r.type &&
        typeof r.x === "number" &&
        typeof r.y === "number" &&
        typeof r.width === "number" &&
        typeof r.height === "number"
    )
    .map((r) => {
      const out: RegionObject = {
        id:     String(r.id),
        type:   r.type as RegionKind,
        label:  typeof r.label === "string" ? r.label : "",
        x:      r.x as number,
        y:      r.y as number,
        width:  r.width as number,
        height: r.height as number,
      };
      if (typeof r.page === "number") out.page = r.page;
      if (r.pageMode === "all" || r.pageMode === "specific") out.pageMode = r.pageMode as PageMode;
      if (typeof r.sourceKey === "string") out.sourceKey = r.sourceKey as RegionSourceKey;
      if (typeof r.assetId === "string") out.assetId = r.assetId;
      if (r.locked === true) out.locked = true;
      return out;
    });
}

function parseFontSize(m: Record<string, unknown> | null): number {
  if (!m) return 9;
  return typeof m.fontSize === "number" ? m.fontSize : 9;
}

function parseDefaultFontId(m: Record<string, unknown> | null): string | undefined {
  if (!m) return undefined;
  const v = m.defaultFontId;
  return typeof v === "string" && v ? v : undefined;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FieldMappingEditor({
  pdfSignedUrl,
  initialMappings,
  onJsonChange,
  isDirty = false,
  pending = false,
  saveError,
  saveSuccess,
  templateId,
  initialAssets,
  fonts,
}: Props) {
  const overlayMode = isOverlayMappings(initialMappings);

  const preservedRawJson = useMemo(
    () => (!overlayMode && initialMappings ? JSON.stringify(initialMappings) : ""),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // ── Text field state ──────────────────────────────────────────────────────
  const [fields,        setFields]        = useState<OverlayField[]>(() => parseFields(initialMappings));
  const [fontSize,      setFontSize]      = useState<number>(() => parseFontSize(initialMappings));
  const [defaultFontId, setDefaultFontId] = useState<string | undefined>(() => parseDefaultFontId(initialMappings));
  const [placing,       setPlacing]       = useState(false);
  const [pendingKey, setPendingKey] = useState<AnyFieldKey>(FIELD_KEYS[0].key);

  // Phase 1: stable id-based field selection
  const [selectedFieldId,  setSelectedFieldId]  = useState<string | null>(null);

  // Phase 4: visibility (editor-local, not persisted)
  const [hiddenFieldIds,   setHiddenFieldIds]   = useState<Set<string>>(new Set());
  const [hiddenRegionIds,  setHiddenRegionIds]  = useState<Set<string>>(new Set());

  // Phase 5: multi-select overlay (separate from single selection)
  const [multiFieldIds,    setMultiFieldIds]    = useState<Set<string>>(new Set());
  const [multiRegionIds,   setMultiRegionIds]   = useState<Set<string>>(new Set());

  const [inspX, setInspX] = useState("");
  const [inspY, setInspY] = useState("");

  // Phase 10: undo/redo stacks (session-local)
  type HistorySnapshot = { fields: OverlayField[]; regions: RegionObject[] };
  const undoStackRef = useRef<HistorySnapshot[]>([]);
  const redoStackRef = useRef<HistorySnapshot[]>([]);

  const selectedField = selectedFieldId !== null
    ? (fields.find((f) => f.id === selectedFieldId) ?? null)
    : null;

  useEffect(() => {
    if (!selectedFieldId || !selectedField) { setInspX(""); setInspY(""); return; }
    setInspX(String(selectedField.x));
    setInspY(String(selectedField.y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFieldId, selectedField?.x, selectedField?.y]);

  // ── Region state ──────────────────────────────────────────────────────────
  const [regions,          setRegions]          = useState<RegionObject[]>(() => parseRegions(initialMappings));
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);
  const [hoveredRegionId,  setHoveredRegionId]  = useState<string | null>(null);
  const [activeTool,       setActiveTool]       = useState<RegionKind | null>(null);

  // ── Image asset state ─────────────────────────────────────────────────────
  const [assets, setAssets] = useState<TemplateAsset[]>(initialAssets);

  // Draw in-progress tracking (pointer capture approach)
  const drawStartRef = useRef<{ sx: number; sy: number } | null>(null);
  const [drawRect,   setDrawRect] = useState<{ left: number; top: number; w: number; h: number } | null>(null);

  // Prevent click-handler from deselecting immediately after a draw commit
  const justDrewRef = useRef(false);

  // ── Drag-to-reposition state ──────────────────────────────────────────────
  type DragState =
    | { type: "field";  id: string; origX: number; origY: number; startCX: number; startCY: number }
    | { type: "region"; id: string; origX: number; origY: number; startCX: number; startCY: number };
  const dragRef      = useRef<DragState | null>(null);
  const dragMovedRef = useRef(false);

  // ── Resize state ──────────────────────────────────────────────────────────
  const resizeRef = useRef<{
    id: string;
    corner: "tl" | "tr" | "bl" | "br";
    origX: number; origY: number; origW: number; origH: number;
    startCX: number; startCY: number;
  } | null>(null);

  // ── PDF state ─────────────────────────────────────────────────────────────
  const [pdfLoading, setPdfLoading] = useState(!!pdfSignedUrl);
  const [pdfError,   setPdfError]   = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pdfDoc,     setPdfDoc]     = useState<any>(null);
  const [pageDims,   setPageDims]   = useState({ width: 612, height: 792 });

  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const overlayRef   = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // ── Phase C.5 — sample text width measurement ─────────────────────────────
  // Shared offscreen canvas context used to measure preview text width in
  // screen pixels. Matches the FONT FAMILY only approximately; the goal is a
  // visual approximation, not a pixel-perfect match against pdf-lib.
  const previewMeasureRef = useRef<CanvasRenderingContext2D | null>(null);
  const measurePreviewWidthPx = useCallback((text: string, sizePx: number): number => {
    if (typeof document === "undefined") return text.length * sizePx * 0.55;
    if (!previewMeasureRef.current) {
      const canvas = document.createElement("canvas");
      previewMeasureRef.current = canvas.getContext("2d");
    }
    const ctx = previewMeasureRef.current;
    if (!ctx) return text.length * sizePx * 0.55;
    ctx.font = `${sizePx}px Helvetica, Arial, sans-serif`;
    return ctx.measureText(text).width;
  }, []);

  // Phase C.5 hydration fix — measurePreviewWidthPx returns DIFFERENT widths
  // during SSR (length-based fallback) vs the client (canvas measureText), so
  // rendering the preview layer on the first pass produces mismatched inline
  // styles and a hydration error. Gating the preview behind a post-mount flag
  // keeps server output and client-first-paint identical (both empty); the
  // preview appears after mount on the next render.
  const [isClientReady, setIsClientReady] = useState(false);
  useEffect(() => { setIsClientReady(true); }, []);

  // ── Zoom state ────────────────────────────────────────────────────────────
  const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
  const [zoom,    setZoom]    = useState(1);
  const [fitMode, setFitMode] = useState(false);
  const zoomIn  = () => { setFitMode(false); setZoom((z) => ZOOM_STEPS[Math.min(ZOOM_STEPS.indexOf(z as typeof ZOOM_STEPS[number]) + 1, ZOOM_STEPS.length - 1)] ?? z); };
  const zoomOut = () => { setFitMode(false); setZoom((z) => ZOOM_STEPS[Math.max(ZOOM_STEPS.indexOf(z as typeof ZOOM_STEPS[number]) - 1, 0)] ?? z); };

  // ── Snap state ────────────────────────────────────────────────────────────
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [snapGuides, setSnapGuides] = useState<{ screenX: number | null; screenY: number | null }>({ screenX: null, screenY: null });

  // ── Computed JSON ─────────────────────────────────────────────────────────
  // Key order: { mode, fontSize, fields, regions? }
  // Each field: { key, x, y, page? }
  // Each region: { id, type, label, x, y, width, height, page?, sourceKey?, assetId? }
  // Key order must match toComparableJson in FieldMappingsForm exactly:
  //   field:  { key, x, y, page?, pageMode?, }
  //   region: { id, type, label, x, y, width, height, page?, pageMode?, sourceKey?, assetId? }
  // pageMode is omitted when "single" (backward compat default).
  const computedJson = useMemo(() => {
    const hasText    = fields.length > 0;
    const hasRegions = regions.length > 0;
    if (hasText || hasRegions) {
      const serializedFields = fields.map((f) => {
        // id is editor-local — not persisted to JSON
        const obj: Record<string, unknown> = { key: f.key, x: f.x, y: f.y };
        if (typeof f.page === "number") obj.page = f.page;
        if (f.pageMode && f.pageMode !== "single") obj.pageMode = f.pageMode;
        if (f.locked) obj.locked = true;
        if (f.fontId) obj.fontId = f.fontId;
        if (typeof f.fontSize === "number") obj.fontSize = f.fontSize;
        // Phase C — only persist when non-default to keep existing JSON
        // byte-identical for fields that haven't changed.
        if (f.align && f.align !== "left") obj.align = f.align;
        if (f.anchor && f.anchor !== "top-left") obj.anchor = f.anchor;
        return obj;
      });
      const serializedRegions = regions.map((r) => {
        const obj: Record<string, unknown> = {
          id: r.id, type: r.type, label: r.label,
          x: r.x, y: r.y, width: r.width, height: r.height,
        };
        if (typeof r.page === "number") obj.page = r.page;
        if (r.pageMode && r.pageMode !== "single") obj.pageMode = r.pageMode;
        if (r.sourceKey) obj.sourceKey = r.sourceKey;
        if (r.assetId)   obj.assetId   = r.assetId;
        if (r.locked)    obj.locked    = true;
        return obj;
      });
      const obj: Record<string, unknown> = { mode: "overlay", fontSize, fields: serializedFields };
      if (defaultFontId) obj.defaultFontId = defaultFontId;
      if (hasRegions) obj.regions = serializedRegions;
      return JSON.stringify(obj);
    }
    if (!overlayMode && preservedRawJson) return preservedRawJson;
    return "";
  }, [fields, fontSize, defaultFontId, regions, overlayMode, preservedRawJson]);

  const displayJson = useMemo(() => {
    if (!computedJson) return "";
    try { return JSON.stringify(JSON.parse(computedJson), null, 2); }
    catch { return computedJson; }
  }, [computedJson]);

  useEffect(() => {
    onJsonChange?.(computedJson);
  }, [computedJson, onJsonChange]);

  // ── Load PDF ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!pdfSignedUrl) {
      setPdfLoading(false);
      setPdfError("no-pdf");
      return;
    }
    let cancelled = false;
    setPdfLoading(true);
    setPdfError(null);
    setPdfDoc(null);

    import("pdfjs-dist").then(async (pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
      try {
        const doc  = await pdfjsLib.getDocument({ url: pdfSignedUrl }).promise;
        if (cancelled) return;
        const page = await doc.getPage(1);
        const vp   = page.getViewport({ scale: 1 });
        setPageDims({ width: vp.width, height: vp.height });
        setPdfDoc(doc);
        setPdfLoading(false);
      } catch (err) {
        if (cancelled) return;
        setPdfError(err instanceof Error ? err.message : "Failed to load PDF");
        setPdfLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [pdfSignedUrl]);

  // ── Render page to canvas ─────────────────────────────────────────────────
  // Re-render the PDF whenever the active zoom changes so it stays crisp at
  // higher zoom levels instead of being a low-res bitmap stretched by the
  // overlay's CSS transform.
  //
  // Backing pixels = logical page * SCALE * zoom * devicePixelRatio
  //   - SCALE keeps the editor's screen-px-per-point factor (drag/click math
  //     depends on it; do not change).
  //   - zoom matches the CSS transform applied to the overlay so the canvas
  //     has enough pixels per CSS pixel after the visual scale.
  //   - devicePixelRatio (DPR) covers retina/high-DPI screens.
  //
  // CSS size stays at canvasW × canvasH so layout math (overlay coordinates,
  // field/region positions, pointer handlers, snap targets) is unchanged.
  // The overlay's `transform: scale(zoom)` still does the visual enlargement.
  //
  // Render scale is capped so memory stays sane for the high-zoom × high-DPR
  // worst case (e.g. 200% on a 3× display would otherwise allocate ~5× a Letter
  // page = >40 MB of canvas backing store).
  const RENDER_SCALE_CAP = 4;
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;
    let cancelled = false;
    let renderTask: { cancel: () => void } | null = null;

    const dpr        = typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1;
    const cssW       = Math.round(pageDims.width  * SCALE);
    const cssH       = Math.round(pageDims.height * SCALE);
    const renderScale = Math.min(SCALE * zoom * dpr, RENDER_SCALE_CAP);

    (async () => {
      try {
        const page     = await pdfDoc.getPage(1);
        if (cancelled) return;
        const viewport = page.getViewport({ scale: renderScale });
        const canvas   = canvasRef.current!;
        canvas.width        = Math.round(viewport.width);   // backing pixels
        canvas.height       = Math.round(viewport.height);
        canvas.style.width  = `${cssW}px`;                  // CSS layout size — overlay's transform handles visual zoom
        canvas.style.height = `${cssH}px`;
        const ctx      = canvas.getContext("2d")!;
        ctx.fillStyle  = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const task = page.render({ canvasContext: ctx, viewport });
        renderTask = task;
        await task.promise;
      } catch (err) {
        // pdfjs throws a RenderingCancelledException when .cancel() runs — that's expected.
        const isCancel = err && typeof err === "object" && "name" in err && (err as { name?: string }).name === "RenderingCancelledException";
        if (!cancelled && !isCancel) console.error("PDF page render:", err);
      }
    })();
    return () => {
      cancelled = true;
      if (renderTask) {
        try { renderTask.cancel(); } catch { /* already settled */ }
      }
    };
  }, [pdfDoc, pageDims.width, pageDims.height, zoom]);

  // ── Phase 10: undo/redo ───────────────────────────────────────────────────

  // refs that always reflect the latest render's values (no stale closure)
  const fieldsRef  = useRef(fields);  fieldsRef.current  = fields;
  const regionsRef = useRef(regions); regionsRef.current = regions;

  const pushHistory = useCallback(() => {
    undoStackRef.current = [
      ...undoStackRef.current.slice(-49),
      { fields: fieldsRef.current, regions: regionsRef.current },
    ];
    redoStackRef.current = [];
  }, []);

  const undo = useCallback(() => {
    const stack = undoStackRef.current;
    if (!stack.length) return;
    const snap = stack[stack.length - 1];
    redoStackRef.current = [
      { fields: fieldsRef.current, regions: regionsRef.current },
      ...redoStackRef.current.slice(0, 49),
    ];
    undoStackRef.current = stack.slice(0, -1);
    setFields(snap.fields);
    setRegions(snap.regions);
    setSelectedFieldId(null);
    setSelectedRegionId(null);
    setMultiFieldIds(new Set());
    setMultiRegionIds(new Set());
  }, []);

  const redo = useCallback(() => {
    const stack = redoStackRef.current;
    if (!stack.length) return;
    const snap = stack[0];
    undoStackRef.current = [
      ...undoStackRef.current.slice(-49),
      { fields: fieldsRef.current, regions: regionsRef.current },
    ];
    redoStackRef.current = stack.slice(1);
    setFields(snap.fields);
    setRegions(snap.regions);
    setSelectedFieldId(null);
    setSelectedRegionId(null);
    setMultiFieldIds(new Set());
    setMultiRegionIds(new Set());
  }, []);

  // stable refs so keyboard handler ([] deps) can call latest undo/redo
  const undoRef = useRef(undo); undoRef.current = undo;
  const redoRef = useRef(redo); redoRef.current = redo;

  // ── Text field helpers ────────────────────────────────────────────────────

  const updateField = useCallback(
    (id: string, patch: Partial<OverlayField>) => {
      setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
    },
    []
  );

  const deleteField = useCallback((id: string) => {
    pushHistory();
    setFields((prev) => prev.filter((f) => f.id !== id));
    setSelectedFieldId((prev) => (prev === id ? null : prev));
    setMultiFieldIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
  }, [pushHistory]);

  // Phase 3: lock toggles
  const toggleLockField = useCallback((id: string) => {
    pushHistory();
    setFields((prev) => prev.map((f) => f.id === id ? { ...f, locked: !f.locked } : f));
  }, [pushHistory]);

  const toggleLockRegion = useCallback((id: string) => {
    pushHistory();
    setRegions((prev) => prev.map((r) => r.id === id ? { ...r, locked: !r.locked } : r));
  }, [pushHistory]);

  // Phase 4: visibility toggles (editor-local)
  const toggleHideField = useCallback((id: string) => {
    setHiddenFieldIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }, []);

  const toggleHideRegion = useCallback((id: string) => {
    setHiddenRegionIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }, []);

  const commitInspectorXY = useCallback(() => {
    if (!selectedFieldId) return;
    const nx = parseInt(inspX, 10);
    const ny = parseInt(inspY, 10);
    pushHistory();
    if (!isNaN(nx)) updateField(selectedFieldId, { x: nx });
    if (!isNaN(ny)) updateField(selectedFieldId, { y: ny });
  }, [selectedFieldId, inspX, inspY, updateField, pushHistory]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (!selectedFieldId) return;
      setFields((prev) =>
        prev.map((f) => f.id === selectedFieldId ? { ...f, x: f.x + dx, y: f.y + dy } : f)
      );
      setInspX((prev) => String(parseInt(prev, 10) + dx));
      setInspY((prev) => String(parseInt(prev, 10) + dy));
    },
    [selectedFieldId]
  );

  // ── Region helpers ────────────────────────────────────────────────────────

  const updateRegion = useCallback((id: string, patch: Partial<Omit<RegionObject, "id" | "type">>) => {
    setRegions((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r));
  }, []);

  const deleteRegion = useCallback((id: string) => {
    pushHistory();
    setRegions((prev) => prev.filter((r) => r.id !== id));
    setSelectedRegionId((prev) => (prev === id ? null : prev));
    setMultiRegionIds((prev) => { const s = new Set(prev); s.delete(id); return s; });
  }, [pushHistory]);

  // ── Asset helpers ─────────────────────────────────────────────────────────

  const handleAssetCreated = useCallback((asset: TemplateAsset) => {
    setAssets((prev) => [...prev, asset]);
  }, []);

  const handleAssetDeleted = useCallback((assetId: string) => {
    setAssets((prev) => prev.filter((a) => a.id !== assetId));
    // Clear assetId from any region that referenced this asset
    setRegions((prev) =>
      prev.map((r) => r.assetId === assetId ? { ...r, assetId: undefined } : r)
    );
  }, []);

  // ── Duplicate helpers (used by row actions + keyboard handler) ────────────

  const handleDuplicateField = useCallback((id: string) => {
    const f = fields.find((f) => f.id === id);
    if (!f) return;
    pushHistory();
    const newField: OverlayField = { ...f, id: crypto.randomUUID(), x: f.x + DUPLICATE_OFFSET, y: f.y - DUPLICATE_OFFSET };
    setFields((prev) => [...prev, newField]);
    setSelectedFieldId(newField.id);
    setSelectedRegionId(null);
  }, [fields, pushHistory]);

  const handleDuplicateRegion = useCallback((id: string) => {
    const r = regions.find((r) => r.id === id);
    if (!r) return;
    pushHistory();
    const newRegion: RegionObject = { ...r, id: crypto.randomUUID(), x: r.x + DUPLICATE_OFFSET, y: r.y - DUPLICATE_OFFSET };
    setRegions((prev) => [...prev, newRegion]);
    setSelectedRegionId(newRegion.id);
    setSelectedFieldId(null);
  }, [regions, pushHistory]);

  // ── Scroll-to helpers (pan canvas viewport to selected object) ────────────

  const scrollToField = useCallback((id: string) => {
    const f = fields.find((f) => f.id === id);
    if (!f || !scrollAreaRef.current) return;
    const target = (pageDims.height - f.y) * SCALE * zoom;
    scrollAreaRef.current.scrollTo({ top: Math.max(0, target - 150), behavior: "smooth" });
  }, [fields, pageDims.height, zoom]);

  const scrollToRegion = useCallback((id: string) => {
    const r = regions.find((r) => r.id === id);
    if (!r || !scrollAreaRef.current) return;
    const target = (pageDims.height - r.y - r.height / 2) * SCALE * zoom;
    scrollAreaRef.current.scrollTo({ top: Math.max(0, target - 150), behavior: "smooth" });
  }, [regions, pageDims.height, zoom]);

  // Phase 7: internal clipboard
  const clipboardRef = useRef<{ fields: OverlayField[]; regions: RegionObject[] }>({ fields: [], regions: [] });

  // ── Keyboard precision controls ───────────────────────────────────────────
  // kbRef holds the latest render-time values so the stable [] effect never
  // captures stale state, and the listener isn't re-registered on drag frames.
  const kbRef = useRef({ activeTool, placing, selectedFieldId, selectedRegionId, multiFieldIds, multiRegionIds, fields, regions });
  kbRef.current = { activeTool, placing, selectedFieldId, selectedRegionId, multiFieldIds, multiRegionIds, fields, regions };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) return;

      const { key, shiftKey, altKey, metaKey, ctrlKey } = e;
      const { activeTool, placing, selectedFieldId, selectedRegionId, fields, regions } = kbRef.current;

      // Phase 10: Undo / Redo
      if (key === "z" && (metaKey || ctrlKey) && !shiftKey) {
        e.preventDefault(); undoRef.current(); return;
      }
      if ((key === "z" && (metaKey || ctrlKey) && shiftKey) || (key === "y" && (metaKey || ctrlKey))) {
        e.preventDefault(); redoRef.current(); return;
      }

      // Phase 7: Copy / Paste
      if (key === "c" && (metaKey || ctrlKey)) {
        const selFields  = fields.filter((f) => kbRef.current.multiFieldIds.has(f.id));
        const selRegions = regions.filter((r) => kbRef.current.multiRegionIds.has(r.id));
        if (selFields.length || selRegions.length) {
          clipboardRef.current = { fields: selFields, regions: selRegions };
        } else if (selectedFieldId) {
          const f = fields.find((f) => f.id === selectedFieldId);
          if (f) clipboardRef.current = { fields: [f], regions: [] };
        } else if (selectedRegionId) {
          const r = regions.find((r) => r.id === selectedRegionId);
          if (r) clipboardRef.current = { fields: [], regions: [r] };
        }
        e.preventDefault(); return;
      }
      if (key === "v" && (metaKey || ctrlKey)) {
        const cb = clipboardRef.current;
        if (!cb.fields.length && !cb.regions.length) return;
        e.preventDefault();
        undoRef.current === undoRef.current; // no-op; push happens below
        const newFields  = cb.fields.map((f)  => ({ ...f,  id: crypto.randomUUID(), x: f.x  + DUPLICATE_OFFSET, y: f.y  - DUPLICATE_OFFSET }));
        const newRegions = cb.regions.map((r) => ({ ...r,  id: crypto.randomUUID(), x: r.x  + DUPLICATE_OFFSET, y: r.y  - DUPLICATE_OFFSET }));
        // push history before mutating
        undoStackRef.current = [...undoStackRef.current.slice(-49), { fields: fieldsRef.current, regions: regionsRef.current }];
        redoStackRef.current = [];
        if (newFields.length)  { setFields((prev)  => [...prev,  ...newFields]);  setSelectedFieldId(newFields[newFields.length - 1].id); setSelectedRegionId(null); }
        if (newRegions.length) { setRegions((prev) => [...prev, ...newRegions]); setSelectedRegionId(newRegions[newRegions.length - 1].id); setSelectedFieldId(null); }
        return;
      }

      // Escape: cancel draw → cancel place → clear multi → clear single
      if (key === "Escape") {
        if (activeTool) {
          e.preventDefault();
          setActiveTool(null);
          drawStartRef.current = null;
          setDrawRect(null);
          return;
        }
        if (placing) { e.preventDefault(); setPlacing(false); return; }
        if (kbRef.current.multiFieldIds.size || kbRef.current.multiRegionIds.size) {
          setMultiFieldIds(new Set()); setMultiRegionIds(new Set()); return;
        }
        setSelectedFieldId(null);
        setSelectedRegionId(null);
        return;
      }

      const hasField  = selectedFieldId !== null;
      const hasRegion = selectedRegionId !== null;

      // Arrow keys: move selected object (locked objects blocked)
      if (key === "ArrowLeft" || key === "ArrowRight" || key === "ArrowUp" || key === "ArrowDown") {
        if (!hasField && !hasRegion) return;
        e.preventDefault();
        const step = shiftKey ? 10 : altKey ? 0.5 : 1;
        const dx = key === "ArrowLeft" ? -step : key === "ArrowRight" ? step : 0;
        const dy = key === "ArrowUp"   ?  step : key === "ArrowDown"  ? -step : 0;
        if (hasField && selectedFieldId) {
          const f = fields.find((f) => f.id === selectedFieldId);
          if (!f || f.locked) return;
          const nx = f.x + dx; const ny = f.y + dy;
          updateField(selectedFieldId, { x: nx, y: ny });
          setInspX(String(nx)); setInspY(String(ny));
        } else if (hasRegion && selectedRegionId) {
          const r = regions.find((r) => r.id === selectedRegionId);
          if (r && !r.locked) updateRegion(r.id, { x: r.x + dx, y: r.y + dy });
        }
        return;
      }

      // Delete / Backspace
      if (key === "Delete" || key === "Backspace") {
        if (!hasField && !hasRegion) return;
        e.preventDefault();
        if (hasField && selectedFieldId) {
          const f = fields.find((f) => f.id === selectedFieldId);
          if (f && !f.locked) deleteField(selectedFieldId);
        } else if (hasRegion && selectedRegionId) {
          const r = regions.find((r) => r.id === selectedRegionId);
          if (r && !r.locked) deleteRegion(selectedRegionId);
        }
        return;
      }

      // Cmd/Ctrl+D: duplicate
      if (key === "d" && (metaKey || ctrlKey)) {
        if (!hasField && !hasRegion) return;
        e.preventDefault();
        if (hasField && selectedFieldId) {
          const f = fields.find((f) => f.id === selectedFieldId);
          if (!f || f.locked) return;
          const newField: OverlayField = { ...f, id: crypto.randomUUID(), x: f.x + DUPLICATE_OFFSET, y: f.y - DUPLICATE_OFFSET };
          undoStackRef.current = [...undoStackRef.current.slice(-49), { fields: fieldsRef.current, regions: regionsRef.current }];
          redoStackRef.current = [];
          setFields((prev) => [...prev, newField]);
          setSelectedFieldId(newField.id);
          setSelectedRegionId(null);
        } else if (hasRegion && selectedRegionId) {
          const r = regions.find((r) => r.id === selectedRegionId);
          if (!r || r.locked) return;
          const newRegion: RegionObject = { ...r, id: crypto.randomUUID(), x: r.x + DUPLICATE_OFFSET, y: r.y - DUPLICATE_OFFSET };
          undoStackRef.current = [...undoStackRef.current.slice(-49), { fields: fieldsRef.current, regions: regionsRef.current }];
          redoStackRef.current = [];
          setRegions((prev) => [...prev, newRegion]);
          setSelectedRegionId(newRegion.id);
          setSelectedFieldId(null);
        }
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Canvas — text field click-place ──────────────────────────────────────

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (justDrewRef.current) { justDrewRef.current = false; return; }
      if (activeTool) return;

      if (!placing) {
        setSelectedFieldId(null);
        setSelectedRegionId(null);
        setMultiFieldIds(new Set());
        setMultiRegionIds(new Set());
        return;
      }

      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect) return;
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const pdfX    = Math.round(screenX / (SCALE * zoom));
      const pdfY    = Math.round(pageDims.height - screenY / (SCALE * zoom));
      const newField: OverlayField = { id: crypto.randomUUID(), key: pendingKey, x: pdfX, y: pdfY, page: 0 };
      pushHistory();
      setFields((prev) => [...prev, newField]);
      setSelectedFieldId(newField.id);
      setSelectedRegionId(null);
      setPlacing(false);
    },
    [activeTool, placing, pageDims.height, pendingKey, fields.length, zoom]
  );

  // ── Canvas — region rect drawing (pointer capture) ────────────────────────

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!activeTool) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect) return;
      drawStartRef.current = {
        sx: (e.clientX - rect.left) / zoom,
        sy: (e.clientY - rect.top)  / zoom,
      };
      setDrawRect(null);
    },
    [activeTool]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!activeTool || !drawStartRef.current) return;
      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = (e.clientX - rect.left) / zoom;
      const cy = (e.clientY - rect.top)  / zoom;
      const { sx, sy } = drawStartRef.current;
      setDrawRect({
        left: Math.min(sx, cx),
        top:  Math.min(sy, cy),
        w:    Math.abs(cx - sx),
        h:    Math.abs(cy - sy),
      });
    },
    [activeTool, zoom]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!activeTool || !drawStartRef.current) return;
      e.currentTarget.releasePointerCapture(e.pointerId);

      const rect = overlayRef.current?.getBoundingClientRect();
      if (!rect) {
        drawStartRef.current = null;
        setDrawRect(null);
        return;
      }

      const cx   = (e.clientX - rect.left) / zoom;
      const cy   = (e.clientY - rect.top)  / zoom;
      const { sx, sy } = drawStartRef.current;
      const left = Math.min(sx, cx);
      const top  = Math.min(sy, cy);
      const sw   = Math.abs(cx - sx);
      const sh   = Math.abs(cy - sy);

      drawStartRef.current = null;
      setDrawRect(null);

      const MIN_SCREEN_PX = 15;
      if (sw < MIN_SCREEN_PX || sh < MIN_SCREEN_PX) return;

      const pdfX = Math.round(left / SCALE);
      const pdfY = Math.round(pageDims.height - (top + sh) / SCALE);
      const pdfW = Math.round(sw / SCALE);
      const pdfH = Math.round(sh / SCALE);

      const newRegion: RegionObject = {
        id:     crypto.randomUUID(),
        type:   activeTool,
        label:  regionDefaultLabel(activeTool),
        x:      pdfX,
        y:      pdfY,
        width:  pdfW,
        height: pdfH,
        page:   0,
      };

      pushHistory();
      setRegions((prev) => [...prev, newRegion]);
      setSelectedRegionId(newRegion.id);
      setSelectedFieldId(null);
      setActiveTool(null);
      justDrewRef.current = true;
    },
    [activeTool, pageDims.height, zoom]
  );

  // ── Derived ───────────────────────────────────────────────────────────────
  const mappedKeySet    = new Set(fields.map((f) => f.key));
  const canvasW         = Math.round(pageDims.width  * SCALE);
  const canvasH         = Math.round(pageDims.height * SCALE);
  // selectedField already derived above (near state declarations)
  const selectedRegion  = selectedRegionId !== null
    ? regions.find((r) => r.id === selectedRegionId) ?? null
    : null;
  const multiCount      = multiFieldIds.size + multiRegionIds.size;
  const canUndo         = undoStackRef.current.length > 0;
  const canRedo         = redoStackRef.current.length > 0;

  const isDrawing = !!activeTool;
  const cursorStyle = (placing || isDrawing) ? "crosshair" : "default";

  // ── Validation warnings (Phase 8: duplicate_key, no_source added) ────────
  const fieldWarnings = useMemo(() => {
    const m = new Map<string, FieldWarn[]>();
    const keyCounts = new Map<string, number>();
    fields.forEach((f) => keyCounts.set(f.key, (keyCounts.get(f.key) ?? 0) + 1));
    fields.forEach((f) => {
      const ws: FieldWarn[] = [];
      if (f.x < 0 || f.x > pageDims.width || f.y < 0 || f.y > pageDims.height) ws.push("off_page");
      if ((keyCounts.get(f.key) ?? 0) > 1) ws.push("duplicate_key");
      if (ws.length) m.set(f.id, ws);
    });
    return m;
  }, [fields, pageDims]);

  const regionWarnings = useMemo(() => {
    const m = new Map<string, RegionWarn[]>();
    regions.forEach((r) => {
      const ws: RegionWarn[] = [];
      if (!r.sourceKey) ws.push("no_source");
      if (r.type === "image_region" && r.sourceKey === "custom_image" && !r.assetId) ws.push("no_asset");
      const right = r.x + r.width;
      const top   = r.y + r.height;
      const fullyOff = r.x >= pageDims.width || right <= 0 || r.y >= pageDims.height || top <= 0;
      if (fullyOff) ws.push("off_page_full");
      else if (r.x < 0 || right > pageDims.width || r.y < 0 || top > pageDims.height) ws.push("off_page_partial");
      if (r.width < 20 || r.height < 20) ws.push("tiny");
      if (ws.length) m.set(r.id, ws);
    });
    return m;
  }, [regions, pageDims]);

  const issueCount = fieldWarnings.size + regionWarnings.size;

  // Phase 6: alignment — acts on multi-select sets
  const alignSelected = useCallback((dir: "left" | "right" | "top" | "bottom" | "hcenter" | "vcenter") => {
    const fIds = kbRef.current.multiFieldIds;
    const rIds = kbRef.current.multiRegionIds;
    if (fIds.size + rIds.size < 2) return;
    const selFields  = kbRef.current.fields.filter((f) => fIds.has(f.id));
    const selRegions = kbRef.current.regions.filter((r) => rIds.has(r.id));
    // fields are treated as zero-size points; regions have width/height
    const allLeft   = [...selFields.map((f) => f.x),                      ...selRegions.map((r) => r.x)];
    const allRight  = [...selFields.map((f) => f.x),                      ...selRegions.map((r) => r.x + r.width)];
    const allBottom = [...selFields.map((f) => f.y),                      ...selRegions.map((r) => r.y)];
    const allTop    = [...selFields.map((f) => f.y),                      ...selRegions.map((r) => r.y + r.height)];
    const minL = Math.min(...allLeft);
    const maxR = Math.max(...allRight);
    const minB = Math.min(...allBottom);
    const maxT = Math.max(...allTop);
    const cx   = (minL + maxR) / 2;
    const cy   = (minB + maxT) / 2;
    pushHistory();
    setFields((prev) => prev.map((f) => {
      if (!fIds.has(f.id) || f.locked) return f;
      switch (dir) {
        case "left":    return { ...f, x: minL };
        case "right":   return { ...f, x: maxR };
        case "top":     return { ...f, y: maxT };
        case "bottom":  return { ...f, y: minB };
        case "hcenter": return { ...f, x: Math.round(cx) };
        case "vcenter": return { ...f, y: Math.round(cy) };
      }
    }));
    setRegions((prev) => prev.map((r) => {
      if (!rIds.has(r.id) || r.locked) return r;
      switch (dir) {
        case "left":    return { ...r, x: minL };
        case "right":   return { ...r, x: Math.round(maxR - r.width) };
        case "top":     return { ...r, y: Math.round(maxT - r.height) };
        case "bottom":  return { ...r, y: minB };
        case "hcenter": return { ...r, x: Math.round(cx - r.width  / 2) };
        case "vcenter": return { ...r, y: Math.round(cy - r.height / 2) };
      }
    }));
  }, [pushHistory]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Hidden input — single source of truth for form submission */}
      <input type="hidden" name="field_mappings_json" value={computedJson} />

      {/* Non-overlay mode notice */}
      {!overlayMode && (
        <div
          className="mx-4 mb-3 rounded-lg px-3 py-2.5 text-xs text-amber-800 leading-relaxed"
          style={{ background: "#fffbeb", border: "1px solid #fcd34d" }}
        >
          This template has existing non-overlay mappings (AcroForm). Visual placement creates
          overlay fields. Existing mappings are preserved unless you place visual fields.
        </div>
      )}

      {/* Text-placing mode banner */}
      {placing && (
        <div
          className="mx-4 mb-3 rounded-lg px-3 py-2.5 flex items-center justify-between"
          style={{ background: "#eff6ff", border: "1px solid #bfdbfe" }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-1.5 h-1.5 rounded-full animate-pulse flex-shrink-0"
              style={{ background: colorForKey(pendingKey) }}
            />
            <span className="text-xs font-semibold text-primary">
              Click the PDF to place &ldquo;{labelForKey(pendingKey)}&rdquo;
            </span>
          </div>
          <button
            type="button"
            onClick={() => setPlacing(false)}
            className="text-xs font-medium text-dim hover:text-ink transition-colors ml-3 flex-shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Draw-region mode banner */}
      {activeTool && (
        <div
          className="mx-4 mb-3 rounded-lg px-3 py-2.5 flex items-center justify-between"
          style={{
            background: activeTool === "pdf_region" ? "#eff6ff" : "#f5f3ff",
            border: `1px solid ${activeTool === "pdf_region" ? "#bfdbfe" : "#ddd6fe"}`,
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-sm animate-pulse flex-shrink-0"
              style={{ border: `1.5px dashed ${regionColor(activeTool)}` }}
            />
            <span className="text-xs font-semibold" style={{ color: regionColor(activeTool) }}>
              Click and drag on the PDF to draw a{" "}
              {activeTool === "pdf_region" ? "PDF Insert Region" : "Image / Logo Region"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => { setActiveTool(null); drawStartRef.current = null; setDrawRect(null); }}
            className="text-xs font-medium text-dim hover:text-ink transition-colors ml-3 flex-shrink-0"
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Main workspace ──────────────────────────────────────────────────
          3-column grid: left palette · center canvas · right inspector/list/JSON.
          Workspace shell uses available viewport height so the canvas stays
          contained on tall PDFs and the rails scroll independently.
      */}
      <div
        className="px-3 pb-3 grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_340px] gap-3"
        style={{
          minHeight: "min(640px, calc(100vh - 240px))",
          // Cap the workspace so the entire editor stays visible without
          // pushing the page below the fold on standard laptop screens.
          maxHeight: "calc(100vh - 200px)",
        }}
      >

        {/* ── Left rail: field palette ──────────────────────────────────── */}
        <aside className="flex flex-col gap-3 min-h-0 overflow-y-auto pr-0.5 lg:pr-1">
          {/* Fields + objects palette */}
          <FieldsPalette
            mappedKeySet={mappedKeySet}
            placing={placing}
            pendingKey={pendingKey}
            activeTool={activeTool}
            onPlace={(key: AnyFieldKey) => { setPendingKey(key); setPlacing(true); setSelectedFieldId(null); setSelectedRegionId(null); setActiveTool(null); }}
            onDrawRegion={(kind) => {
              setActiveTool((prev) => (prev === kind ? null : kind));
              setPlacing(false);
              setSelectedFieldId(null);
              setSelectedRegionId(null);
              drawStartRef.current = null;
              setDrawRect(null);
            }}
          />
        </aside>

        {/* ── Center column: canvas viewport ────────────────────────────── */}
        <main
          className="flex flex-col rounded-xl overflow-hidden min-w-0 min-h-0"
          style={{
            boxShadow: "0 2px 20px rgba(43,52,55,0.13)",
            border:    "1px solid #d4dde4",
            background: "#efefef",
          }}
        >
          {/* Zoom + undo/redo controls */}
          {!pdfLoading && !pdfError && (
            <div
              className="flex items-center gap-1 px-3 py-1.5 border-b border-surface flex-shrink-0"
              style={{ background: "#f6f8fa" }}
            >
              {/* Edit group: Undo / Redo */}
              <button
                type="button"
                onClick={() => undoRef.current()}
                disabled={!canUndo}
                className="w-6 h-6 rounded flex items-center justify-center text-dim hover:text-ink hover:bg-surface transition-colors disabled:opacity-30"
                title="Undo (Cmd+Z)"
                aria-label="Undo"
              >
                <UndoIcon />
              </button>
              <button
                type="button"
                onClick={() => redoRef.current()}
                disabled={!canRedo}
                className="w-6 h-6 rounded flex items-center justify-center text-dim hover:text-ink hover:bg-surface transition-colors disabled:opacity-30"
                title="Redo (Cmd+Shift+Z)"
                aria-label="Redo"
              >
                <RedoIcon />
              </button>

              <span style={{ width: 1, background: "#e5e7eb", alignSelf: "stretch", margin: "3px 6px" }} />

              {/* View group: Zoom out / level / Zoom in */}
              <button
                type="button"
                onClick={zoomOut}
                disabled={zoom === ZOOM_STEPS[0]}
                className="w-6 h-6 rounded flex items-center justify-center text-dim hover:text-ink hover:bg-surface transition-colors disabled:opacity-30 text-sm font-medium"
                title="Zoom out"
                aria-label="Zoom out"
              >
                −
              </button>
              <span className="text-[10px] font-semibold text-dim w-10 text-center select-none" aria-live="polite">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={zoomIn}
                disabled={zoom === ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                className="w-6 h-6 rounded flex items-center justify-center text-dim hover:text-ink hover:bg-surface transition-colors disabled:opacity-30 text-sm font-medium"
                title="Zoom in"
                aria-label="Zoom in"
              >
                +
              </button>

              {/* Fit ↔ Actual size toggle — replaces the magic 580 with the
                  scroll area's actual height so Fit responds to window resize. */}
              {fitMode ? (
                <button
                  type="button"
                  onClick={() => { setFitMode(false); setZoom(1); }}
                  className="ml-2 text-[10px] font-semibold rounded px-2 py-0.5 transition-colors"
                  style={{ background: "#dbeafe", color: "#1d4ed8" }}
                  title="Switch to actual size (100%)"
                >
                  Actual size
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    const visible = scrollAreaRef.current?.clientHeight ?? 580;
                    setFitMode(true);
                    setZoom(Math.max(0.25, Math.min(2, Math.round((visible / canvasH) * 20) / 20)));
                  }}
                  className="ml-2 text-[10px] font-semibold rounded px-2 py-0.5 transition-colors"
                  style={{ background: "#e5e7eb", color: "#374151" }}
                  title="Fit page to viewport"
                >
                  Fit
                </button>
              )}

              <span style={{ width: 1, background: "#e5e7eb", alignSelf: "stretch", margin: "3px 6px" }} />

              {/* Snap toggle — surfaced as a button-style toggle for clarity */}
              <button
                type="button"
                onClick={() => setSnapEnabled((s) => !s)}
                className="text-[10px] font-semibold rounded px-2 py-0.5 transition-colors"
                style={{
                  background: snapEnabled ? "#dcfce7" : "#f3f4f6",
                  color:      snapEnabled ? "#166534" : "#6b7280",
                }}
                title="Toggle snap alignment guides (hold Alt to suspend)"
                aria-pressed={snapEnabled}
              >
                Snap {snapEnabled ? "on" : "off"}
              </button>

              {/* Right-side save status pill — clarifies the canvas-level save state.
                  The actual save is the form's "Save field mappings" button below. */}
              <div className="ml-auto flex items-center gap-2">
                {pending ? (
                  <span className="text-[10px] font-semibold text-dim">Saving…</span>
                ) : isDirty ? (
                  <span className="text-[10px] font-semibold rounded px-2 py-0.5" style={{ background: "#fef3c7", color: "#92400e" }}>
                    Unsaved changes
                  </span>
                ) : saveSuccess ? (
                  <span className="text-[10px] font-semibold rounded px-2 py-0.5" style={{ background: "#dcfce7", color: "#166534" }}>
                    Saved ✓
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-dim">All changes saved</span>
                )}
                <button
                  type="submit"
                  disabled={pending || !isDirty}
                  className="text-[10px] font-semibold rounded px-2.5 py-0.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: !pending && isDirty ? "#2563eb" : "#e5e7eb",
                    color:      !pending && isDirty ? "#ffffff" : "#6b7280",
                  }}
                  title="Save field mappings to the server"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {/* Loading skeleton — fills viewport */}
          {pdfLoading && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 bg-surface min-h-[480px]">
              <div className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <p className="text-xs text-muted">Loading PDF…</p>
            </div>
          )}

          {/* Error / no-PDF state — fills viewport */}
          {pdfError && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8 bg-surface min-h-[480px]">
              <div
                className="w-10 h-10 rounded-full bg-canvas flex items-center justify-center flex-shrink-0"
                style={{ border: "1.5px solid #d4dde4" }}
              >
                <DocIcon />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-ink">
                  {pdfError === "no-pdf" ? "No PDF uploaded" : "PDF preview unavailable"}
                </p>
                <p className="text-xs text-muted leading-relaxed max-w-[320px]">
                  {pdfError === "no-pdf"
                    ? "Upload a PDF in the Template settings section above to enable visual field placement."
                    : "Field placements are stored in PDF point space and will render correctly once the file loads."}
                </p>
              </div>
              <p className="text-[10px] text-dim italic">
                Standard Letter: 612 × 792 pt · origin bottom-left
              </p>
            </div>
          )}

          {/* Canvas + overlay — viewport that takes remaining vertical space */}
          <div
            className="flex-1 min-h-0"
            style={{
              display:  pdfLoading || pdfError ? "none" : "block",
              overflow: "hidden",
            }}
          >
            {/* Scroll area — overflow only. Centering happens in the inner
                wrapper which grows to at least the scroll area size; this
                avoids the flex-center-overflow bug where large content gets
                pinned to the top-left and becomes unreachable. Coordinate
                math is independent of layout (uses clientX deltas divided by
                SCALE * zoom), so it remains correct regardless of size. */}
            <div
              ref={scrollAreaRef}
              style={{ width: "100%", height: "100%", overflow: "auto" }}
            >
              {/* Centering wrapper — grows to fill the scroll area or the
                  stage, whichever is larger. */}
              <div
                style={{
                  minWidth:       "100%",
                  minHeight:      "100%",
                  width:          "max-content",
                  height:         "max-content",
                  display:        "flex",
                  alignItems:     "center",
                  justifyContent: "center",
                  padding:        12,
                  boxSizing:      "border-box",
                }}
              >
                {/* Stage wrapper — exact zoomed canvas footprint */}
                <div
                  style={{
                    width:      canvasW * zoom,
                    height:     canvasH * zoom,
                    position:   "relative",
                    flexShrink: 0,
                  }}
                >
              <div
                ref={overlayRef}
                className="relative select-none"
                style={{
                  position:        "absolute",
                  top:             0,
                  left:            0,
                  width:           canvasW,
                  height:          canvasH,
                  transform:       `scale(${zoom})`,
                  transformOrigin: "top left",
                  cursor:          cursorStyle,
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
            <canvas ref={canvasRef} style={{ display: "block" }} />

            {/* Click-capture layer — text placing + deselect */}
            <div
              onClick={handleCanvasClick}
              style={{ position: "absolute", inset: 0, pointerEvents: "all", zIndex: 5 }}
            />

            {/* Snap alignment guides — visible only while actively snapping */}
            {(snapGuides.screenX !== null || snapGuides.screenY !== null) && (
              <svg
                style={{
                  position:      "absolute",
                  inset:         0,
                  width:         canvasW,
                  height:        canvasH,
                  pointerEvents: "none",
                  zIndex:        50,
                  overflow:      "visible",
                }}
              >
                {snapGuides.screenX !== null && (
                  <line
                    x1={snapGuides.screenX} y1={0}
                    x2={snapGuides.screenX} y2={canvasH}
                    stroke="#2563eb" strokeWidth={1} strokeDasharray="4 2" strokeOpacity={0.7}
                  />
                )}
                {snapGuides.screenY !== null && (
                  <line
                    x1={0} y1={snapGuides.screenY}
                    x2={canvasW} y2={snapGuides.screenY}
                    stroke="#2563eb" strokeWidth={1} strokeDasharray="4 2" strokeOpacity={0.7}
                  />
                )}
              </svg>
            )}

            {/* Region rectangles */}
            {regions.map((r) => {
              if (hiddenRegionIds.has(r.id)) return null;   // Phase 4: skip hidden
              const sl         = r.x * SCALE;
              const st         = (pageDims.height - r.y - r.height) * SCALE;
              const sw         = r.width  * SCALE;
              const sh         = r.height * SCALE;
              const color      = regionColor(r.type);
              const isSelected = r.id === selectedRegionId;
              const isHovered  = r.id === hoveredRegionId && !isSelected;
              const isMulti    = multiRegionIds.has(r.id);  // Phase 5

              return (
                <div
                  key={r.id}
                  onMouseEnter={() => setHoveredRegionId(r.id)}
                  onMouseLeave={() => setHoveredRegionId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (justDrewRef.current) return;
                    if (dragMovedRef.current) { dragMovedRef.current = false; return; }
                    if (e.metaKey || e.ctrlKey) {
                      // Phase 5: cmd+click toggles multi-select
                      setMultiRegionIds((prev) => { const s = new Set(prev); s.has(r.id) ? s.delete(r.id) : s.add(r.id); return s; });
                      return;
                    }
                    setSelectedRegionId(r.id);
                    setSelectedFieldId(null);
                    setMultiFieldIds(new Set()); setMultiRegionIds(new Set());
                    setPlacing(false);
                    setActiveTool(null);
                  }}
                  onPointerDown={(e) => {
                    if (placing || activeTool || r.locked) return;   // Phase 3: locked blocks drag
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    dragRef.current = { type: "region", id: r.id, origX: r.x, origY: r.y, startCX: e.clientX, startCY: e.clientY };
                    dragMovedRef.current = false;
                    setSelectedRegionId(r.id);
                    setSelectedFieldId(null);
                  }}
                  onPointerMove={(e) => {
                    const d = dragRef.current;
                    if (!d || d.type !== "region" || d.id !== r.id) return;
                    const dx = e.clientX - d.startCX;
                    const dy = e.clientY - d.startCY;
                    if (!dragMovedRef.current && Math.abs(dx) + Math.abs(dy) > 4) dragMovedRef.current = true;
                    if (!dragMovedRef.current) return;
                    const rawX = d.origX + dx / (SCALE * zoom);
                    const rawY = d.origY - dy / (SCALE * zoom);
                    const thr  = SNAP_THRESHOLD_PX / (SCALE * zoom);
                    const xTgt = [0, pageDims.width / 2, pageDims.width,
                      ...fields.map((f) => f.x),
                      ...regions.filter((or) => or.id !== d.id).flatMap((or) => [or.x, or.x + or.width / 2, or.x + or.width])];
                    const yTgt = [0, pageDims.height / 2, pageDims.height,
                      ...fields.map((f) => f.y),
                      ...regions.filter((or) => or.id !== d.id).flatMap((or) => [or.y, or.y + or.height / 2, or.y + or.height])];
                    const { x, y, guideX, guideY } = (snapEnabled && !e.altKey)
                      ? computeSnap(rawX, rawY, xTgt, yTgt, thr)
                      : { x: rawX, y: rawY, guideX: null, guideY: null };
                    setSnapGuides({
                      screenX: guideX !== null ? guideX * SCALE : null,
                      screenY: guideY !== null ? (pageDims.height - guideY) * SCALE : null,
                    });
                    updateRegion(r.id, { x: Math.round(x), y: Math.round(y) });
                  }}
                  onPointerUp={(e) => {
                    const d = dragRef.current;
                    if (!d || d.type !== "region" || d.id !== r.id) return;
                    e.currentTarget.releasePointerCapture(e.pointerId);
                    if (dragMovedRef.current) pushHistory();   // Phase 10: commit drag
                    dragRef.current = null;
                    setSnapGuides({ screenX: null, screenY: null });
                  }}
                  style={{
                    position:    "absolute",
                    left:        sl,
                    top:         st,
                    width:       sw,
                    height:      sh,
                    border:      isSelected ? `2px solid ${color}` : isHovered ? `1.5px dashed ${color}cc` : `1.5px dashed ${color}88`,
                    background:  isSelected ? `${color}1a` : isHovered ? `${color}12` : `${color}07`,
                    boxShadow:   isSelected
                      ? `0 0 0 2px ${color}44, inset 0 0 0 1px ${color}22`
                      : isMulti ? `0 0 0 2px #3b82f680`  // Phase 5: multi-select ring
                      : undefined,
                    zIndex:      isSelected ? 20 : isHovered ? 15 : 10,
                    cursor:      placing || activeTool ? "crosshair" : r.locked ? "default" : "move",   // Phase 3
                    pointerEvents: "all",
                    boxSizing:   "border-box",
                    userSelect:  "none",
                  }}
                >
                  {/* Type + binding label — counter-scaled so text stays restrained at high zoom */}
                  <div
                    style={{
                      position:        "absolute",
                      top:             3,
                      left:            4,
                      fontSize:        8,
                      fontWeight:      700,
                      color,
                      background:      `${color}18`,
                      padding:         "1px 5px",
                      borderRadius:    2,
                      whiteSpace:      "nowrap",
                      maxWidth:        Math.max(sw - 16, 20),
                      overflow:        "hidden",
                      textOverflow:    "ellipsis",
                      lineHeight:      1.4,
                      transform:       `scale(${1 / zoom})`,
                      transformOrigin: "top left",
                      pointerEvents:   "none",
                    }}
                  >
                    {regionDisplayLabel(r)}
                  </div>

                  {/* Warning badge — shown when region has validation issues */}
                  {regionWarnings.has(r.id) && (
                    <div
                      style={{
                        position:        "absolute",
                        top:             3,
                        right:           4,
                        fontSize:        8,
                        fontWeight:      700,
                        color:           regionWarnings.get(r.id)?.some((w) => REGION_WARN_MSG[w].sev === "error") ? "#dc2626" : "#d97706",
                        transform:       `scale(${1 / zoom})`,
                        transformOrigin: "top right",
                        pointerEvents:   "none",
                        lineHeight:      1,
                      }}
                    >
                      ⚠
                    </div>
                  )}

                  {/* Phase 3: lock badge */}
                  {r.locked && (
                    <div style={{ position: "absolute", bottom: 3, right: 4, transform: `scale(${1/zoom})`, transformOrigin: "bottom right", pointerEvents: "none", lineHeight: 1 }}>
                      <LockIcon size={8} color={color} />
                    </div>
                  )}

                  {/* Resize handles — blocked when locked */}
                  {isSelected && !r.locked && (
                    <>
                      {(["tl", "tr", "bl", "br"] as const).map((corner) => {
                        const hitStyle: React.CSSProperties = {
                          position: "absolute",
                          width:    18,
                          height:   18,
                          zIndex:   40,
                          cursor:
                            corner === "tl" || corner === "br"
                              ? "nwse-resize"
                              : "nesw-resize",
                          ...(corner === "tl" ? { top: -9, left: -9 }
                            : corner === "tr" ? { top: -9, right: -9 }
                            : corner === "bl" ? { bottom: -9, left: -9 }
                            :                   { bottom: -9, right: -9 }),
                        };
                        const dotStyle: React.CSSProperties = {
                          position:        "absolute",
                          top:             "50%",
                          left:            "50%",
                          transform:       `translate(-50%, -50%) scale(${1 / zoom})`,
                          transformOrigin: "center",
                          width:           7,
                          height:          7,
                          background:      "#fff",
                          border:          `2px solid ${color}`,
                          borderRadius:    1,
                          pointerEvents:   "none",
                        };
                        return (
                          <div
                            key={corner}
                            style={hitStyle}
                            onPointerDown={(e) => {
                              e.stopPropagation();
                              e.currentTarget.setPointerCapture(e.pointerId);
                              resizeRef.current = {
                                id:      r.id,
                                corner,
                                origX:   r.x,
                                origY:   r.y,
                                origW:   r.width,
                                origH:   r.height,
                                startCX: e.clientX,
                                startCY: e.clientY,
                              };
                            }}
                            onPointerMove={(e) => {
                              const rs = resizeRef.current;
                              if (!rs || rs.id !== r.id || rs.corner !== corner) return;
                              const eff  = SCALE * zoom;
                              const pdx  = (e.clientX - rs.startCX) / eff;
                              const pdy  = (e.clientY - rs.startCY) / eff;
                              const MIN  = 8;
                              let nx = rs.origX, ny = rs.origY,
                                  nw = rs.origW, nh = rs.origH;
                              if (corner === "tl") {
                                nw = Math.max(MIN, rs.origW - pdx);
                                nh = Math.max(MIN, rs.origH - pdy);
                                nx = rs.origX + (rs.origW - nw);
                                ny = rs.origY;
                              } else if (corner === "tr") {
                                nw = Math.max(MIN, rs.origW + pdx);
                                nh = Math.max(MIN, rs.origH - pdy);
                                nx = rs.origX;
                                ny = rs.origY;
                              } else if (corner === "bl") {
                                nw = Math.max(MIN, rs.origW - pdx);
                                nh = Math.max(MIN, rs.origH + pdy);
                                nx = rs.origX + (rs.origW - nw);
                                ny = rs.origY - (nh - rs.origH);
                              } else {
                                nw = Math.max(MIN, rs.origW + pdx);
                                nh = Math.max(MIN, rs.origH + pdy);
                                nx = rs.origX;
                                ny = rs.origY - (nh - rs.origH);
                              }
                              updateRegion(r.id, {
                                x:      Math.round(nx),
                                y:      Math.round(ny),
                                width:  Math.round(nw),
                                height: Math.round(nh),
                              });
                            }}
                            onPointerUp={() => { if (resizeRef.current) pushHistory(); resizeRef.current = null; }}
                          >
                            <div style={dotStyle} />
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>
              );
            })}

            {/* In-progress draw rect preview */}
            {drawRect && activeTool && (
              <div
                style={{
                  position:     "absolute",
                  left:         drawRect.left,
                  top:          drawRect.top,
                  width:        drawRect.w,
                  height:       drawRect.h,
                  border:       `1.5px dashed ${regionColor(activeTool)}`,
                  background:   `${regionColor(activeTool)}0f`,
                  pointerEvents: "none",
                  zIndex:        30,
                  boxSizing:    "border-box",
                }}
              />
            )}

            {/* Placed field markers (text) */}
            {/* ── Phase C.5 — sample text preview layer ────────────────────
                Renders each field's sample value (from fieldCatalog) at the
                exact position the renderer would draw it, honoring the same
                align/anchor/multiline math as drawAlignedText() in
                generate-package/route.ts. Visual approximation only — no
                attempt at pdf-lib font metric matching. Pointer events are
                disabled so this layer never interferes with placement,
                selection, drag, or marker clicks.

                Rendered BEFORE the marker layer so markers sit on top.
                Gated on isClientReady because canvas measureText is only
                available client-side; rendering during SSR would produce
                different widths and trigger a hydration mismatch.
            */}
            {isClientReady && fields.map((f) => {
              if (hiddenFieldIds.has(f.id)) return null;
              const sample = sampleFor(f.key);
              if (!sample) return null;
              const sizePt       = f.fontSize ?? fontSize;
              const sizePx       = sizePt * SCALE;
              const lineHeightPt = sizePt * 1.2;
              const lines        = sample.split("\n");
              const align        = f.align  ?? "left";
              const anchor       = f.anchor ?? "top-left";
              const color        = colorForKey(f.key);

              // Mirrors drawAlignedText: when anchor === "center", the visual
              // center of the BLOCK sits at field.y; otherwise field.y is the
              // first line's baseline (PDF coords).
              const firstBaselineYPt =
                anchor === "center"
                  ? f.y - sizePt / 2 + ((lines.length - 1) * lineHeightPt) / 2
                  : f.y;

              return (
                <div
                  key={`preview-${f.id}`}
                  style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 8 }}
                >
                  {lines.map((line, i) => {
                    const widthPx       = measurePreviewWidthPx(line, sizePx);
                    const widthPt       = widthPx / SCALE;
                    const lineLeftXPt   =
                      align === "center" ? f.x - widthPt / 2 :
                      align === "right"  ? f.x - widthPt     :
                      f.x;
                    const lineBaselineYPt = firstBaselineYPt - i * lineHeightPt;
                    const screenLeftPx    = lineLeftXPt * SCALE;
                    // Position the line so its visual baseline lands at
                    // screenBaselinePx. ~0.8 of font-size approximates where
                    // the baseline sits inside a CSS line-box for Helvetica/
                    // Arial — close enough for a placement preview.
                    const screenBaselinePx = (pageDims.height - lineBaselineYPt) * SCALE;
                    const topPx            = screenBaselinePx - sizePx * 0.8;
                    return (
                      <div
                        key={i}
                        style={{
                          position:    "absolute",
                          left:        screenLeftPx,
                          top:         topPx,
                          fontFamily:  "Helvetica, Arial, sans-serif",
                          fontSize:    sizePx,
                          lineHeight:  1,
                          color,
                          opacity:     0.55,
                          whiteSpace:  "pre",
                          userSelect:  "none",
                        }}
                      >
                        {line}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {fields.map((f) => {
              if (hiddenFieldIds.has(f.id)) return null;   // Phase 4: skip hidden
              const screenX    = f.x * SCALE;
              const screenY    = (pageDims.height - f.y) * SCALE;
              const color      = colorForKey(f.key);
              const isSelected = f.id === selectedFieldId;
              const isMulti    = multiFieldIds.has(f.id);  // Phase 5

              return (
                <div
                  key={f.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (dragMovedRef.current) { dragMovedRef.current = false; return; }
                    if (e.metaKey || e.ctrlKey) {
                      // Phase 5: cmd+click toggles multi-select
                      setMultiFieldIds((prev) => { const s = new Set(prev); s.has(f.id) ? s.delete(f.id) : s.add(f.id); return s; });
                      return;
                    }
                    setSelectedFieldId(f.id);
                    setSelectedRegionId(null);
                    setMultiFieldIds(new Set()); setMultiRegionIds(new Set());
                    setPlacing(false);
                  }}
                  onPointerDown={(e) => {
                    if (placing || activeTool || f.locked) return;   // Phase 3: locked blocks drag
                    e.stopPropagation();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    dragRef.current = { type: "field", id: f.id, origX: f.x, origY: f.y, startCX: e.clientX, startCY: e.clientY };
                    dragMovedRef.current = false;
                    setSelectedFieldId(f.id);
                    setSelectedRegionId(null);
                  }}
                  onPointerMove={(e) => {
                    const d = dragRef.current;
                    if (!d || d.type !== "field" || d.id !== f.id) return;
                    const dx = e.clientX - d.startCX;
                    const dy = e.clientY - d.startCY;
                    if (!dragMovedRef.current && Math.abs(dx) + Math.abs(dy) > 4) dragMovedRef.current = true;
                    if (!dragMovedRef.current) return;
                    const rawX = d.origX + dx / (SCALE * zoom);
                    const rawY = d.origY - dy / (SCALE * zoom);
                    const thr  = SNAP_THRESHOLD_PX / (SCALE * zoom);
                    const xTgt = [0, pageDims.width / 2, pageDims.width,
                      ...fields.filter((fi) => fi.id !== f.id).map((fi) => fi.x),
                      ...regions.flatMap((r) => [r.x, r.x + r.width / 2, r.x + r.width])];
                    const yTgt = [0, pageDims.height / 2, pageDims.height,
                      ...fields.filter((fi) => fi.id !== f.id).map((fi) => fi.y),
                      ...regions.flatMap((r) => [r.y, r.y + r.height / 2, r.y + r.height])];
                    const { x, y, guideX, guideY } = (snapEnabled && !e.altKey)
                      ? computeSnap(rawX, rawY, xTgt, yTgt, thr)
                      : { x: rawX, y: rawY, guideX: null, guideY: null };
                    setSnapGuides({
                      screenX: guideX !== null ? guideX * SCALE : null,
                      screenY: guideY !== null ? (pageDims.height - guideY) * SCALE : null,
                    });
                    updateField(f.id, { x: Math.round(x), y: Math.round(y) });
                  }}
                  onPointerUp={(e) => {
                    const d = dragRef.current;
                    if (!d || d.type !== "field" || d.id !== f.id) return;
                    e.currentTarget.releasePointerCapture(e.pointerId);
                    if (dragMovedRef.current) pushHistory();   // Phase 10: commit drag
                    dragRef.current = null;
                    setSnapGuides({ screenX: null, screenY: null });
                  }}
                  style={{
                    position:        "absolute",
                    left:            screenX,
                    top:             screenY,
                    transform:       `translate(0, -100%) scale(${1 / zoom})`,
                    transformOrigin: "bottom left",
                    pointerEvents:   "all",
                    cursor:          placing || activeTool ? "crosshair" : f.locked ? "default" : "move",
                    zIndex:          isSelected ? 20 : 10,
                    userSelect:      "none",
                  }}
                >
                  <div
                    style={{
                      display:      "inline-flex",
                      alignItems:   "center",
                      gap:          4,
                      padding:      "2px 6px 2px 3px",
                      borderRadius: 3,
                      background:   isSelected ? color : "rgba(255,255,255,0.93)",
                      border:       `1px solid ${isSelected ? color : color + "55"}`,
                      boxShadow:    isSelected
                        ? `0 1px 8px ${color}44`
                        : isMulti
                          ? `0 0 0 2px #3b82f680, 0 1px 3px rgba(0,0,0,0.10)`
                          : "0 1px 3px rgba(0,0,0,0.10)",
                    }}
                  >
                    <div
                      style={{
                        width:        2,
                        height:       10,
                        borderRadius: 1,
                        background:   isSelected ? "rgba(255,255,255,0.82)" : color,
                        flexShrink:   0,
                      }}
                    />
                    <span
                      style={{
                        fontSize:      9,
                        fontWeight:    600,
                        color:         isSelected ? "rgba(255,255,255,0.95)" : color,
                        whiteSpace:    "nowrap",
                        lineHeight:    1.3,
                        letterSpacing: 0.1,
                      }}
                    >
                      {labelForKey(f.key)}
                    </span>
                  </div>
                </div>
              );
            })}
              </div>   {/* overlayRef */}
                </div>   {/* stage wrapper */}
              </div>     {/* centering wrapper */}
            </div>       {/* scroll area */}
          </div>         {/* confined viewport */}

          {/* Page info bar */}
          {!pdfLoading && !pdfError && (
            <p
              className="text-[9px] text-dim text-center py-1 select-none flex-shrink-0"
              style={{ background: "#e8e8e8" }}
            >
              {Math.round(pageDims.width)} × {Math.round(pageDims.height)} pt
              {" · "}click to select · Esc to cancel mode
            </p>
          )}
        </main>

        {/* ── Right rail: inspector, helpers, placed list, JSON ───────── */}
        <aside className="flex flex-col gap-3 min-h-0 overflow-y-auto pr-0.5 lg:pr-1">

          {/* Inspector — adapts to selection type */}
          {selectedField !== null && selectedFieldId !== null ? (
            <FieldInspector
              key={selectedFieldId}
              field={selectedField}
              inspX={inspX}
              inspY={inspY}
              globalFontSize={fontSize}
              templateDefaultFontId={defaultFontId}
              onXChange={setInspX}
              onYChange={setInspY}
              onXYBlur={commitInspectorXY}
              onFontSizeChange={(v) => { pushHistory(); updateField(selectedFieldId, { fontSize: v }); }}
              onClearFontSize={() => { pushHistory(); updateField(selectedFieldId, { fontSize: undefined }); }}
              onFontIdChange={(id) => { pushHistory(); updateField(selectedFieldId, { fontId: id }); }}
              onAlignChange={(align) => {
                pushHistory();
                // Phase C — store undefined for the default to keep saved JSON minimal.
                updateField(selectedFieldId, { align: align === "left" ? undefined : align });
              }}
              onAnchorChange={(anchor) => {
                pushHistory();
                updateField(selectedFieldId, { anchor: anchor === "top-left" ? undefined : anchor });
              }}
              onNudge={nudge}
              onPageModeChange={(mode) => { pushHistory(); updateField(selectedFieldId, { pageMode: mode }); }}
              onPageChange={(page) => { pushHistory(); updateField(selectedFieldId, { page }); }}
              onDelete={() => deleteField(selectedFieldId)}
              onToggleLock={() => toggleLockField(selectedFieldId)}
              onDeselect={() => setSelectedFieldId(null)}
              isDirty={isDirty}
              pending={pending}
              saveSuccess={saveSuccess}
              saveError={saveError}
              warnings={fieldWarnings.get(selectedFieldId) ?? []}
              fonts={fonts}
            />
          ) : selectedRegion !== null ? (
            <RegionInspector
              key={selectedRegion.id}
              region={selectedRegion}
              onUpdate={(patch) => { pushHistory(); updateRegion(selectedRegion.id, patch); }}
              onDelete={() => deleteRegion(selectedRegion.id)}
              onToggleLock={() => toggleLockRegion(selectedRegion.id)}
              onDeselect={() => setSelectedRegionId(null)}
              isDirty={isDirty}
              pending={pending}
              saveSuccess={saveSuccess}
              saveError={saveError}
              templateId={templateId}
              assets={assets}
              onAssetCreated={handleAssetCreated}
              onAssetDeleted={handleAssetDeleted}
              warnings={regionWarnings.get(selectedRegion.id) ?? []}
            />
          ) : (
            <NoSelectionPanel
              isDirty={isDirty}
              pending={pending}
              saveSuccess={saveSuccess}
              saveError={saveError}
              fontSize={fontSize}
              onFontSizeChange={setFontSize}
              defaultFontId={defaultFontId}
              onDefaultFontIdChange={setDefaultFontId}
              fonts={fonts}
            />
          )}

          {/* Numbering preview — shown while placing a computed field */}
          {placing && isComputedKey(pendingKey) && (
            <NumberingPreview fieldKey={pendingKey} />
          )}

          {/* Phase 6: Alignment toolbar — shown when 2+ objects multi-selected */}
          {multiCount >= 2 && (
            <AlignmentToolbar onAlign={alignSelected} />
          )}

          {/* Placed items list */}
          <PlacedList
            fields={fields}
            regions={regions}
            selectedFieldId={selectedFieldId}
            selectedRegionId={selectedRegionId}
            multiFieldIds={multiFieldIds}
            multiRegionIds={multiRegionIds}
            hiddenFieldIds={hiddenFieldIds}
            hiddenRegionIds={hiddenRegionIds}
            fieldWarnings={fieldWarnings}
            regionWarnings={regionWarnings}
            issueCount={issueCount}
            onSelectField={(id) => {
              const deselecting = selectedFieldId === id;
              setSelectedFieldId(deselecting ? null : id);
              setSelectedRegionId(null);
              setMultiFieldIds(new Set()); setMultiRegionIds(new Set());
              if (!deselecting) scrollToField(id);
            }}
            onSelectRegion={(id) => {
              const deselecting = selectedRegionId === id;
              setSelectedRegionId(deselecting ? null : id);
              setSelectedFieldId(null);
              setMultiFieldIds(new Set()); setMultiRegionIds(new Set());
              if (!deselecting) scrollToRegion(id);
            }}
            onMultiToggleField={(id) => setMultiFieldIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; })}
            onMultiToggleRegion={(id) => setMultiRegionIds((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; })}
            onDeleteField={deleteField}
            onDeleteRegion={deleteRegion}
            onDuplicateField={handleDuplicateField}
            onDuplicateRegion={handleDuplicateRegion}
            onToggleLockField={toggleLockField}
            onToggleLockRegion={toggleLockRegion}
            onToggleHideField={toggleHideField}
            onToggleHideRegion={toggleHideRegion}
          />

          {/* Advanced JSON (read-only) */}
          <details className="px-0.5">
            <summary className="text-xs text-muted cursor-pointer select-none hover:text-dim transition-colors">
              Advanced JSON
            </summary>
            <pre
              className="mt-2 text-[10px] bg-surface rounded-lg p-3 overflow-auto"
              style={{ maxHeight: 180, border: "1px solid #d4dde4" }}
            >
              {displayJson || "(empty — no field mappings)"}
            </pre>
          </details>

        </aside>
      </div>
    </div>
  );
}

// ── No-selection panel ────────────────────────────────────────────────────────

type NoSelectionProps = {
  isDirty: boolean;
  pending: boolean;
  saveSuccess?: boolean;
  saveError?: string | null;
  fontSize: number;
  onFontSizeChange: (v: number) => void;
  defaultFontId: string | undefined;
  onDefaultFontIdChange: (id: string | undefined) => void;
  fonts: TemplateFont[];
};

function NoSelectionPanel({
  isDirty, pending, saveSuccess, saveError,
  fontSize, onFontSizeChange, defaultFontId, onDefaultFontIdChange, fonts,
}: NoSelectionProps) {
  return (
    <div className="space-y-3">

      {/* Template defaults */}
      <div className="rounded-xl bg-card overflow-hidden" style={{ border: "1.5px solid #e2e8f0" }}>
        <div className="px-3 py-2.5 border-b" style={{ background: "#f8f9fb", borderColor: "#e9ecef" }}>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-dim">Template defaults</p>
          <p className="text-[10px] text-muted mt-0.5">Applied when adding new text fields.</p>
        </div>
        <div className="px-3 py-3 space-y-3">
          <div>
            <label className="block text-[10px] text-muted mb-0.5">Default font</label>
            <FontPicker value={defaultFontId} fonts={fonts} onChange={onDefaultFontIdChange} />
          </div>
          <div>
            <label className="block text-[10px] text-muted mb-0.5">Default size</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={6}
                max={72}
                value={fontSize}
                onChange={(e) => onFontSizeChange(Math.max(6, Math.min(72, Number(e.target.value))))}
                className="w-14 rounded border bg-canvas px-2 py-1 text-xs text-ink font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                style={{ borderColor: "#d4dde4" }}
              />
              <span className="text-[10px] text-muted">pt</span>
            </div>
          </div>
        </div>
        <div className="px-3 pb-3 pt-2.5 border-t space-y-2" style={{ borderColor: "#e9ecef" }}>
          {saveError && (
            <p className="text-[10px] text-red-600 leading-snug">{saveError}</p>
          )}
          {isDirty ? (
            <button
              type="submit"
              disabled={pending}
              className="w-full px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60 transition-opacity"
              style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
            >
              {pending ? "Saving…" : "Save field mappings"}
            </button>
          ) : saveSuccess ? (
            <p className="text-[10px] font-medium text-emerald-600">Saved ✓</p>
          ) : null}
        </div>
      </div>

      {/* No-selection hint */}
      <div
        className="rounded-xl bg-surface flex flex-col items-center justify-center gap-2 py-4 px-4 text-center"
        style={{ border: "1.5px dashed #d4dde4" }}
      >
        <SelectCursorIcon />
        <p className="text-[11px] text-muted leading-snug">
          Click a field or region to inspect it.
        </p>
      </div>

    </div>
  );
}

// ── Package numbering preview panel ──────────────────────────────────────────

type NumberingPreviewProps = {
  fieldKey: string;
  pageMode?: PageMode | null;   // null = placing mode (not yet set)
  page?: number;
};

function NumberingPreview({ fieldKey, pageMode = null, page = 0 }: NumberingPreviewProps) {
  if (!isComputedKey(fieldKey)) return null;
  const color = colorForKey(fieldKey);

  return (
    <div
      className="rounded-xl overflow-hidden bg-card"
      style={{ border: `1.5px solid ${color}28`, boxShadow: `0 1px 8px ${color}10` }}
    >
      {/* Header */}
      <div
        className="px-3 py-2 border-b"
        style={{ background: `${color}08`, borderColor: `${color}1c` }}
      >
        <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color }}>
          Live Preview
        </p>
        <p className="text-[9px] mt-0.5" style={{ color: "#6b7280" }}>
          Sample: Cover(1) · TCP(3) · TCD(2) · SLD(4) = 10 pages
        </p>
      </div>

      {/* Preview table */}
      <table className="w-full">
        <thead>
          <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
            <th className="px-3 py-1 text-left text-[9px] font-semibold uppercase tracking-wide text-dim">
              Page
            </th>
            <th
              className="px-3 py-1 text-right text-[9px] font-semibold uppercase tracking-wide"
              style={{ color }}
            >
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {PREVIEW_ROWS.map((row, i) => (
            <tr
              key={row.label}
              style={{ borderTop: i === 0 ? undefined : "1px solid #f3f4f6" }}
            >
              <td className="px-3 py-1.5 text-[10px] text-muted">{row.label}</td>
              <td
                className="px-3 py-1.5 text-[10px] text-right font-mono font-semibold"
                style={{ color }}
              >
                {previewValue(fieldKey, row)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Page targeting summary */}
      {pageMode != null && (
        <div
          className="px-3 py-2 border-t"
          style={{ borderColor: "#e5e7eb", background: "#f9fafb" }}
        >
          <p className="text-[9px] font-semibold uppercase tracking-wider text-dim mb-0.5">
            Page targeting
          </p>
          {pageMode === "all" ? (
            <p className="text-[9px] leading-relaxed" style={{ color: "#374151" }}>
              Stamped on <span className="font-semibold">every page</span> — value recalculates per page.
            </p>
          ) : pageMode === "specific" ? (
            <p className="text-[9px] leading-relaxed" style={{ color: "#374151" }}>
              Stamped on page {page + 1} only.{" "}
              For wrapper templates, page numbers are relative to the composed output pages of that wrapper.
            </p>
          ) : (
            <p className="text-[9px] leading-relaxed" style={{ color: "#374151" }}>
              Stamped on page {page + 1} of the template.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Font picker ───────────────────────────────────────────────────────────────

type FontPickerProps = {
  value: string | undefined;
  fonts: TemplateFont[];
  onChange: (id: string | undefined) => void;
  inheritedId?: string;
};

function FontPicker({ value, fonts, onChange, inheritedId }: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const inheritedFont = inheritedId ? fonts.find((f) => f.id === inheritedId) : undefined;
  const selectedLabel = value
    ? (fonts.find((f) => f.id === value)?.display_name ?? "Unknown font")
    : inheritedFont
      ? `Inherited — ${inheritedFont.display_name}`
      : "Default — Helvetica";

  const isDefault = !value;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-1.5 rounded border bg-canvas px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary/30 transition-colors hover:bg-surface"
        style={{ borderColor: "#d4dde4" }}
      >
        <span className={isDefault ? "text-muted" : "text-ink font-medium"}>
          {selectedLabel}
        </span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div
          className="absolute z-50 mt-1 w-full rounded-lg overflow-hidden"
          style={{
            background: "var(--card, #fff)",
            border: "1px solid #d4dde4",
            boxShadow: "0 4px 16px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06)",
          }}
        >
          <p className="px-2.5 pt-2 pb-1 text-[9px] font-semibold text-dim uppercase tracking-wider">
            System
          </p>
          <button
            type="button"
            onClick={() => { onChange(undefined); setOpen(false); }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-surface transition-colors"
          >
            <span className={`flex-1 ${isDefault ? "text-ink font-medium" : "text-muted"}`}>
              {inheritedFont ? `Inherited — ${inheritedFont.display_name}` : "Default — Helvetica"}
            </span>
            {isDefault && <CheckIcon />}
          </button>

          {fonts.length > 0 && (
            <>
              <div className="mx-2.5 my-1" style={{ borderTop: "1px solid #e9ecef" }} />
              <p className="px-2.5 pb-1 text-[9px] font-semibold text-dim uppercase tracking-wider">
                Uploaded
              </p>
              {fonts.map((f) => {
                const active = value === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => { onChange(f.id); setOpen(false); }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left hover:bg-surface transition-colors"
                  >
                    <span className={`flex-1 truncate ${active ? "text-ink font-medium" : "text-muted"}`}>
                      {f.display_name}
                    </span>
                    {active && <CheckIcon />}
                  </button>
                );
              })}
            </>
          )}

          {fonts.length === 0 && (
            <>
              <div className="mx-2.5 my-1" style={{ borderTop: "1px solid #e9ecef" }} />
              <p className="px-2.5 pb-2 text-[10px] text-dim italic">
                No custom fonts — upload in Font Library
              </p>
            </>
          )}
          <div className="pb-1" />
        </div>
      )}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 10 10" fill="none"
      className="flex-shrink-0 text-dim transition-transform"
      style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
    >
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="flex-shrink-0 text-primary">
      <path d="M2 5L4.2 7.2L8 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Field inspector (text fields) ─────────────────────────────────────────────

type InspectorProps = {
  field: OverlayField;
  inspX: string;
  inspY: string;
  globalFontSize: number;
  templateDefaultFontId?: string;
  onXChange: (v: string) => void;
  onYChange: (v: string) => void;
  onXYBlur: () => void;
  onFontSizeChange: (v: number) => void;
  onClearFontSize: () => void;
  onFontIdChange: (id: string | undefined) => void;
  onAlignChange: (align: TextAlign) => void;
  onAnchorChange: (anchor: TextAnchor) => void;
  onNudge: (dx: number, dy: number) => void;
  onPageModeChange: (mode: PageMode) => void;
  onPageChange: (page: number) => void;
  onDelete: () => void;
  onToggleLock: () => void;
  onDeselect: () => void;
  isDirty?: boolean;
  pending?: boolean;
  saveSuccess?: boolean;
  saveError?: string | null;
  warnings?: FieldWarn[];
  fonts: TemplateFont[];
};

function FieldInspector({
  field, inspX, inspY, globalFontSize, templateDefaultFontId,
  onXChange, onYChange, onXYBlur, onFontSizeChange, onClearFontSize, onFontIdChange,
  onAlignChange, onAnchorChange,
  onNudge, onPageModeChange, onPageChange, onDelete, onToggleLock, onDeselect,
  isDirty = false, pending = false,
  saveSuccess, saveError, warnings = [],
  fonts,
}: InspectorProps) {
  const effectiveFontSize = field.fontSize ?? globalFontSize;
  const [inspPage, setInspPage] = useState(String((field.page ?? 0) + 1));
  const color = colorForKey(field.key);
  const label = labelForKey(field.key);

  return (
    <div
      className="rounded-xl overflow-hidden bg-card"
      style={{
        boxShadow: `0 2px 16px ${color}1e, 0 1px 4px rgba(0,0,0,0.05)`,
        border: `1.5px solid ${color}33`,
      }}
    >
      <div
        className="px-3 py-2.5 flex items-start justify-between gap-2"
        style={{ background: `${color}0b`, borderBottom: `1px solid ${color}20` }}
      >
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <span className="mt-1 flex-shrink-0 w-2 h-2 rounded-full" style={{ background: color }} />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink leading-tight truncate">{label}</p>
            <p className="text-[10px] font-mono mt-0.5 truncate" style={{ color: `${color}88` }}>
              {field.key}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDeselect}
          className="flex-shrink-0 text-muted hover:text-ink transition-colors mt-0.5"
          title="Deselect"
          aria-label="Deselect field"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="px-3 py-3 space-y-3.5">

        {warnings.length > 0 && (
          <div className="rounded-lg px-2.5 py-2 space-y-1" style={{ background: "#fffbeb", border: "1px solid #fcd34d" }}>
            {warnings.map((w) => {
              const { msg, sev } = FIELD_WARN_MSG[w];
              return (
                <p key={w} className="text-[9px] leading-snug" style={{ color: sev === "error" ? "#b91c1c" : "#92400e" }}>
                  {sev === "error" ? "✕ " : "⚠ "}{msg}
                </p>
              );
            })}
          </div>
        )}

        <div>
          <p className="text-[9px] font-semibold text-dim uppercase tracking-wider mb-1">
            Sample value
          </p>
          <p
            className="text-xs rounded px-2 py-1.5 font-mono truncate"
            style={{ background: `${color}0a`, border: `1px solid ${color}1c`, color }}
          >
            {sampleFor(field.key)}
          </p>
        </div>

        {isComputedKey(field.key) && (
          <NumberingPreview
            fieldKey={field.key}
            pageMode={field.pageMode ?? "single"}
            page={field.page ?? 0}
          />
        )}

        <div>
          <p className="text-[9px] font-semibold text-dim uppercase tracking-wider mb-1.5">
            Coordinates (pt)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-muted mb-0.5">X — left edge</label>
              <input
                type="number"
                value={inspX}
                onChange={(e) => onXChange(e.target.value)}
                onBlur={onXYBlur}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onXYBlur(); } }}
                className="w-full rounded border bg-canvas px-2 py-1 text-xs font-mono text-ink text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                style={{ borderColor: "#d4dde4" }}
              />
            </div>
            <div>
              <label className="block text-[10px] text-muted mb-0.5">Y — baseline</label>
              <input
                type="number"
                value={inspY}
                onChange={(e) => onYChange(e.target.value)}
                onBlur={onXYBlur}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onXYBlur(); } }}
                className="w-full rounded border bg-canvas px-2 py-1 text-xs font-mono text-ink text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                style={{ borderColor: "#d4dde4" }}
              />
            </div>
          </div>
        </div>

        <div>
          <p className="text-[9px] font-semibold text-dim uppercase tracking-wider mb-1.5">
            Nudge 1 pt
          </p>
          <div className="flex items-center justify-center gap-1">
            <button
              type="button"
              onClick={() => onNudge(-1, 0)}
              className="w-7 h-7 rounded flex items-center justify-center text-dim hover:bg-surface hover:text-ink transition-colors"
              style={{ border: "1px solid #d4dde4" }}
              title="Left 1 pt"
            >
              <ArrowIcon dir="left" />
            </button>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => onNudge(0, 1)}
                className="w-7 h-7 rounded flex items-center justify-center text-dim hover:bg-surface hover:text-ink transition-colors"
                style={{ border: "1px solid #d4dde4" }}
                title="Up 1 pt"
              >
                <ArrowIcon dir="up" />
              </button>
              <button
                type="button"
                onClick={() => onNudge(0, -1)}
                className="w-7 h-7 rounded flex items-center justify-center text-dim hover:bg-surface hover:text-ink transition-colors"
                style={{ border: "1px solid #d4dde4" }}
                title="Down 1 pt"
              >
                <ArrowIcon dir="down" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => onNudge(1, 0)}
              className="w-7 h-7 rounded flex items-center justify-center text-dim hover:bg-surface hover:text-ink transition-colors"
              style={{ border: "1px solid #d4dde4" }}
              title="Right 1 pt"
            >
              <ArrowIcon dir="right" />
            </button>
          </div>
        </div>

        <div>
          <p className="text-[9px] font-semibold text-dim uppercase tracking-wider mb-1.5">
            Font
          </p>
          <div className="space-y-2">
            <div>
              <label className="block text-[10px] text-muted mb-0.5">Family</label>
              <FontPicker
                value={field.fontId}
                fonts={fonts}
                onChange={onFontIdChange}
                inheritedId={templateDefaultFontId}
              />
            </div>
            <div>
              <label className="block text-[10px] text-muted mb-0.5">
                Size{field.fontSize === undefined && <span className="text-[9px] text-dim ml-1">(template default: {globalFontSize}pt)</span>}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={6}
                  max={72}
                  value={effectiveFontSize}
                  onChange={(e) => onFontSizeChange(Math.max(6, Math.min(72, Number(e.target.value))))}
                  className="w-14 rounded border bg-canvas px-2 py-1 text-xs text-ink font-mono text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                  style={{ borderColor: "#d4dde4" }}
                />
                <span className="text-[10px] text-muted">pt</span>
                {field.fontSize !== undefined && (
                  <button
                    type="button"
                    onClick={onClearFontSize}
                    className="text-[9px] text-dim hover:text-ink transition-colors"
                    title="Reset to template default"
                  >
                    reset
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Phase C — alignment + anchor.
            Defaults: align "left", anchor "top-left" (i.e. current behavior).
            Persisted only when non-default; existing fields stay byte-identical. */}
        <div>
          <p className="text-[9px] font-semibold text-dim uppercase tracking-wider mb-1.5">
            Alignment &amp; Anchor
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-muted mb-0.5">Align</label>
              <select
                value={field.align ?? "left"}
                onChange={(e) => onAlignChange(e.target.value as TextAlign)}
                className="w-full rounded border bg-canvas px-2 py-1 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
                style={{ borderColor: "#d4dde4" }}
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] text-muted mb-0.5">Anchor</label>
              <select
                value={field.anchor ?? "top-left"}
                onChange={(e) => onAnchorChange(e.target.value as TextAnchor)}
                className="w-full rounded border bg-canvas px-2 py-1 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
                style={{ borderColor: "#d4dde4" }}
              >
                <option value="top-left">Top Left</option>
                <option value="center">Center</option>
              </select>
            </div>
          </div>
        </div>

        <PageTargetingControl
          pageMode={field.pageMode ?? "single"}
          page={field.page ?? 0}
          inspPage={inspPage}
          onPageModeChange={onPageModeChange}
          onInspPageChange={setInspPage}
          onPageCommit={() => {
            const n = parseInt(inspPage, 10);
            if (!isNaN(n) && n >= 1) onPageChange(n - 1);
          }}
        />

        <div className="pt-2.5 border-t border-surface space-y-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
            >
              <TrashIcon />
              Remove field
            </button>
            <button
              type="button"
              onClick={onToggleLock}
              className="flex items-center gap-1 text-xs font-medium transition-colors"
              style={{ color: field.locked ? "#005bc1" : "#6b7280" }}
              title={field.locked ? "Unlock field" : "Lock field (prevents accidental moves)"}
            >
              <LockIcon size={11} color={field.locked ? "#005bc1" : "#9ca3af"} />
              {field.locked ? "Locked" : "Lock"}
            </button>
          </div>
          {saveError && (
            <p className="text-[10px] text-red-600 leading-snug">{saveError}</p>
          )}
          {isDirty ? (
            <button
              type="submit"
              disabled={pending}
              className="w-full px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60 transition-opacity"
              style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
            >
              {pending ? "Saving…" : "Save field mappings"}
            </button>
          ) : saveSuccess ? (
            <p className="text-[10px] font-medium text-emerald-600">Saved ✓</p>
          ) : null}
        </div>

      </div>
    </div>
  );
}

// ── Region inspector ──────────────────────────────────────────────────────────

type RegionInspectorProps = {
  region: RegionObject;
  onUpdate: (patch: Partial<Omit<RegionObject, "id" | "type">>) => void;
  onDelete: () => void;
  onToggleLock: () => void;
  onDeselect: () => void;
  isDirty?: boolean;
  pending?: boolean;
  saveSuccess?: boolean;
  saveError?: string | null;
  templateId: string;
  assets: TemplateAsset[];
  onAssetCreated: (asset: TemplateAsset) => void;
  onAssetDeleted: (assetId: string) => void;
  warnings?: RegionWarn[];
};

function RegionInspector({
  region, onUpdate, onDelete, onToggleLock, onDeselect,
  isDirty = false, pending = false,
  saveSuccess, saveError,
  templateId, assets, onAssetCreated, onAssetDeleted,
  warnings = [],
}: RegionInspectorProps) {
  const [label, setLabel] = useState(region.label);
  const [inspX, setInspX] = useState(String(region.x));
  const [inspY, setInspY] = useState(String(region.y));
  const [inspW, setInspW] = useState(String(region.width));
  const [inspH, setInspH] = useState(String(region.height));
  const [inspPage, setInspPage] = useState(String((region.page ?? 0) + 1));

  // Sync x/y/w/h from parent when region is moved or resized via drag
  useEffect(() => { setInspX(String(region.x)); }, [region.x]);
  useEffect(() => { setInspY(String(region.y)); }, [region.y]);
  useEffect(() => { setInspW(String(region.width)); }, [region.width]);
  useEffect(() => { setInspH(String(region.height)); }, [region.height]);

  const commit = useCallback(() => {
    const nx = parseInt(inspX, 10);
    const ny = parseInt(inspY, 10);
    const nw = parseInt(inspW, 10);
    const nh = parseInt(inspH, 10);
    onUpdate({
      label,
      x:      isNaN(nx) ? region.x      : nx,
      y:      isNaN(ny) ? region.y      : ny,
      width:  isNaN(nw) || nw <= 0 ? region.width  : nw,
      height: isNaN(nh) || nh <= 0 ? region.height : nh,
    });
  }, [label, inspX, inspY, inspW, inspH, onUpdate, region]);

  const handleLabelBlur = useCallback(() => {
    onUpdate({ label });
  }, [label, onUpdate]);

  const color     = regionColor(region.type);
  const typeLabel = regionTypeLabel(region.type);

  return (
    <div
      className="rounded-xl overflow-hidden bg-card"
      style={{
        boxShadow: `0 2px 16px ${color}1e, 0 1px 4px rgba(0,0,0,0.05)`,
        border: `1.5px solid ${color}33`,
      }}
    >
      {/* Header */}
      <div
        className="px-3 py-2.5 flex items-start justify-between gap-2"
        style={{ background: `${color}0b`, borderBottom: `1px solid ${color}20` }}
      >
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <span
            className="mt-1 flex-shrink-0 w-2 h-2 rounded-sm"
            style={{ border: `1.5px solid ${color}` }}
          />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink leading-tight truncate">{typeLabel}</p>
            <p className="text-[10px] font-mono mt-0.5 truncate" style={{ color: `${color}88` }}>
              {region.type}
              {region.sourceKey ? ` · ${region.sourceKey}` : ""}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onDeselect}
          className="flex-shrink-0 text-muted hover:text-ink transition-colors mt-0.5"
          title="Deselect"
          aria-label="Deselect region"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="px-3 py-3 space-y-3.5">

        {warnings.length > 0 && (
          <div className="rounded-lg px-2.5 py-2 space-y-1" style={{ background: "#fffbeb", border: "1px solid #fcd34d" }}>
            {warnings.map((w) => {
              const { msg, sev } = REGION_WARN_MSG[w];
              return (
                <p key={w} className="text-[9px] leading-snug" style={{ color: sev === "error" ? "#b91c1c" : "#92400e" }}>
                  {sev === "error" ? "✕ " : "⚠ "}{msg}
                </p>
              );
            })}
          </div>
        )}

        {/* ── Source binding ─────────────────────────────────── */}
        {region.type === "pdf_region" && (
          <div>
            <p className="text-[9px] font-semibold text-dim uppercase tracking-wider mb-1">
              PDF source
            </p>
            <select
              value={region.sourceKey ?? ""}
              onChange={(e) => {
                const v = e.target.value as PdfSourceKey | "";
                onUpdate({ sourceKey: v || undefined });
              }}
              className="w-full rounded border bg-canvas px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
              style={{ borderColor: "#d4dde4" }}
            >
              <option value="">— no source bound —</option>
              {PDF_SOURCE_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            {!region.sourceKey && (
              <p className="text-[9px] text-amber-600 mt-1 leading-snug">
                No source bound — this region will be skipped at generation time.
              </p>
            )}
          </div>
        )}

        {region.type === "image_region" && (
          <div className="space-y-2.5">
            <div>
              <p className="text-[9px] font-semibold text-dim uppercase tracking-wider mb-1">
                Image source
              </p>
              <select
                value={region.sourceKey ?? ""}
                onChange={(e) => {
                  const v = e.target.value as ImageSourceKey | "";
                  onUpdate({ sourceKey: v || undefined, assetId: undefined });
                }}
                className="w-full rounded border bg-canvas px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
                style={{ borderColor: "#d4dde4" }}
              >
                <option value="">— no source bound —</option>
                {IMAGE_SOURCE_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
              {!region.sourceKey && (
                <p className="text-[9px] text-amber-600 mt-1 leading-snug">
                  No source bound — this region will be skipped at generation time.
                </p>
              )}
            </div>

            {region.sourceKey === "custom_image" && (
              <AssetPicker
                templateId={templateId}
                assets={assets}
                selectedAssetId={region.assetId}
                onSelect={(assetId) => onUpdate({ assetId: assetId ?? undefined })}
                onAssetCreated={onAssetCreated}
                onAssetDeleted={(id) => {
                  onAssetDeleted(id);
                  if (region.assetId === id) onUpdate({ assetId: undefined });
                }}
              />
            )}
          </div>
        )}

        {/* ── Label ───────────────────────────────────────────── */}
        <div>
          <label className="block text-[9px] font-semibold text-dim uppercase tracking-wider mb-1">
            Label / name
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleLabelBlur}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleLabelBlur(); } }}
            placeholder={regionDefaultLabel(region.type)}
            className="w-full rounded border bg-canvas px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
            style={{ borderColor: "#d4dde4" }}
          />
        </div>

        {/* ── Position ─────────────────────────────────────────── */}
        <div>
          <p className="text-[9px] font-semibold text-dim uppercase tracking-wider mb-1.5">
            Position (pt)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-muted mb-0.5">X — left</label>
              <input
                type="number"
                value={inspX}
                onChange={(e) => setInspX(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
                className="w-full rounded border bg-canvas px-2 py-1 text-xs font-mono text-ink text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                style={{ borderColor: "#d4dde4" }}
              />
            </div>
            <div>
              <label className="block text-[10px] text-muted mb-0.5">Y — bottom</label>
              <input
                type="number"
                value={inspY}
                onChange={(e) => setInspY(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
                className="w-full rounded border bg-canvas px-2 py-1 text-xs font-mono text-ink text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                style={{ borderColor: "#d4dde4" }}
              />
            </div>
          </div>
        </div>

        {/* ── Size ─────────────────────────────────────────────── */}
        <div>
          <p className="text-[9px] font-semibold text-dim uppercase tracking-wider mb-1.5">
            Size (pt)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-muted mb-0.5">Width</label>
              <input
                type="number"
                min={1}
                value={inspW}
                onChange={(e) => setInspW(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
                className="w-full rounded border bg-canvas px-2 py-1 text-xs font-mono text-ink text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                style={{ borderColor: "#d4dde4" }}
              />
            </div>
            <div>
              <label className="block text-[10px] text-muted mb-0.5">Height</label>
              <input
                type="number"
                min={1}
                value={inspH}
                onChange={(e) => setInspH(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }}
                className="w-full rounded border bg-canvas px-2 py-1 text-xs font-mono text-ink text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
                style={{ borderColor: "#d4dde4" }}
              />
            </div>
          </div>
        </div>

        <PageTargetingControl
          pageMode={region.pageMode ?? "single"}
          page={region.page ?? 0}
          inspPage={inspPage}
          onPageModeChange={(mode) => onUpdate({ pageMode: mode })}
          onInspPageChange={setInspPage}
          onPageCommit={() => {
            const n = parseInt(inspPage, 10);
            if (!isNaN(n) && n >= 1) onUpdate({ page: n - 1 });
          }}
        />

        <div className="pt-2.5 border-t border-surface space-y-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onDelete}
              className="flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 transition-colors"
            >
              <TrashIcon />
              Remove region
            </button>
            <button
              type="button"
              onClick={onToggleLock}
              className="flex items-center gap-1 text-xs font-medium transition-colors"
              style={{ color: region.locked ? "#005bc1" : "#6b7280" }}
              title={region.locked ? "Unlock region" : "Lock region (prevents accidental moves/resizes)"}
            >
              <LockIcon size={11} color={region.locked ? "#005bc1" : "#9ca3af"} />
              {region.locked ? "Locked" : "Lock"}
            </button>
          </div>
          {saveError && (
            <p className="text-[10px] text-red-600 leading-snug">{saveError}</p>
          )}
          {isDirty ? (
            <button
              type="submit"
              disabled={pending}
              className="w-full px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-60 transition-opacity"
              style={{ background: "linear-gradient(135deg, #005bc1 0%, #004faa 100%)" }}
            >
              {pending ? "Saving…" : "Save field mappings"}
            </button>
          ) : saveSuccess ? (
            <p className="text-[10px] font-medium text-emerald-600">Saved ✓</p>
          ) : null}
        </div>

      </div>
    </div>
  );
}

// ── Page targeting control ────────────────────────────────────────────────────

type PageTargetingControlProps = {
  pageMode: PageMode;
  page: number;
  inspPage: string;
  onPageModeChange: (mode: PageMode) => void;
  onInspPageChange: (v: string) => void;
  onPageCommit: () => void;
};

const PAGE_MODE_OPTIONS: { mode: PageMode; label: string }[] = [
  { mode: "single",   label: "This page" },
  { mode: "all",      label: "All pages" },
  { mode: "specific", label: "Specific" },
];

function PageTargetingControl({
  pageMode, inspPage,
  onPageModeChange, onInspPageChange, onPageCommit,
}: PageTargetingControlProps) {
  return (
    <div>
      <p className="text-[9px] font-semibold text-dim uppercase tracking-wider mb-1.5">
        Page targeting
      </p>
      <div
        className="flex rounded-lg overflow-hidden"
        style={{ border: "1px solid #d4dde4" }}
      >
        {PAGE_MODE_OPTIONS.map(({ mode, label }, i) => (
          <button
            key={mode}
            type="button"
            onClick={() => onPageModeChange(mode)}
            className="flex-1 py-1 text-[10px] font-medium transition-colors"
            style={{
              background:  pageMode === mode ? "#005bc1" : "transparent",
              color:       pageMode === mode ? "#fff" : "#6b7280",
              borderRight: i < 2 ? "1px solid #d4dde4" : undefined,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {pageMode === "specific" && (
        <div className="mt-1.5 flex items-center gap-2">
          <label className="text-[10px] text-muted flex-shrink-0">Page</label>
          <input
            type="number"
            min={1}
            value={inspPage}
            onChange={(e) => onInspPageChange(e.target.value)}
            onBlur={onPageCommit}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onPageCommit(); } }}
            className="w-14 rounded border bg-canvas px-2 py-1 text-xs font-mono text-ink text-center focus:outline-none focus:ring-2 focus:ring-primary/30"
            style={{ borderColor: "#d4dde4" }}
          />
          <span className="text-[10px] text-muted">(1-indexed)</span>
        </div>
      )}

      {pageMode === "all" && (
        <p className="mt-1 text-[9px] text-emerald-700 leading-snug">
          Renders on every page of the composed output.
        </p>
      )}
      {pageMode === "single" && (
        <p className="mt-1 text-[9px] text-muted leading-snug">
          Renders on the page it was placed on (page 1 in current editor).
        </p>
      )}
    </div>
  );
}

// ── Asset picker (inline, for custom_image regions) ───────────────────────────

type AssetPickerProps = {
  templateId: string;
  assets: TemplateAsset[];
  selectedAssetId: string | undefined;
  onSelect: (assetId: string | null) => void;
  onAssetCreated: (asset: TemplateAsset) => void;
  onAssetDeleted: (assetId: string) => void;
};

function AssetPicker({
  templateId, assets, selectedAssetId,
  onSelect, onAssetCreated, onAssetDeleted,
}: AssetPickerProps) {
  const [uploadPending, startUploadTransition] = useTransition();
  const [deletePending, startDeleteTransition] = useTransition();
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    const fd = new FormData();
    fd.set("template_id", templateId);
    fd.set("name", file.name.replace(/\.[^.]+$/, ""));
    fd.set("file", file);

    startUploadTransition(async () => {
      const result: TemplateAssetActionState = await createTemplateAsset({ error: null }, fd);
      if (result.error) {
        setUploadError(result.error);
      } else if (result.asset) {
        onAssetCreated(result.asset);
        onSelect(result.asset.id);
      }
      // Reset file input so the same file can be re-uploaded if needed
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  };

  const handleDelete = (assetId: string) => {
    const fd = new FormData();
    fd.set("asset_id", assetId);
    fd.set("template_id", templateId);

    startDeleteTransition(async () => {
      const result: TemplateAssetActionState = await deleteTemplateAsset({ error: null }, fd);
      if (!result.error) {
        onAssetDeleted(assetId);
      }
    });
  };

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ border: "1px solid #ddd6fe", background: "#faf5ff" }}
    >
      <div className="px-3 py-2 border-b flex items-center justify-between" style={{ borderColor: "#ddd6fe" }}>
        <p className="text-[9px] font-semibold text-dim uppercase tracking-wider">Image assets</p>
        <label
          className={`text-[9px] font-semibold cursor-pointer transition-colors ${
            uploadPending ? "text-muted" : "text-violet-600 hover:text-violet-800"
          }`}
          title="Upload image (PNG, JPEG, WebP · max 5 MB)"
        >
          {uploadPending ? "Uploading…" : "+ Upload"}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={uploadPending}
            onChange={handleFileChange}
          />
        </label>
      </div>

      {uploadError && (
        <p className="px-3 py-1.5 text-[9px] text-red-600 bg-red-50">{uploadError}</p>
      )}

      {assets.length === 0 ? (
        <div className="px-3 py-3 text-center">
          <p className="text-[10px] text-muted leading-snug">
            No images uploaded yet.<br />Click + Upload to add one.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-violet-100 overflow-y-auto" style={{ maxHeight: 160 }}>
          {assets.map((asset) => {
            const isSelected = asset.id === selectedAssetId;
            return (
              <div
                key={asset.id}
                className="flex items-center gap-2 px-3 py-2"
                style={{ background: isSelected ? "#ede9fe" : undefined }}
              >
                <button
                  type="button"
                  onClick={() => onSelect(isSelected ? null : asset.id)}
                  className="flex-1 flex items-center gap-2 text-left min-w-0"
                >
                  <span
                    className="flex-shrink-0 w-3 h-3 rounded-full border-2"
                    style={{
                      borderColor: isSelected ? "#7c3aed" : "#c4b5fd",
                      background:  isSelected ? "#7c3aed" : "transparent",
                    }}
                  />
                  <span
                    className="text-[10px] truncate font-medium"
                    style={{ color: isSelected ? "#5b21b6" : "#374151" }}
                  >
                    {asset.name}
                  </span>
                  <span className="text-[8px] font-semibold flex-shrink-0" style={{ color: "#a78bfa" }}>
                    {asset.mime_type.split("/")[1]?.toUpperCase() ?? "IMG"}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={deletePending}
                  onClick={() => handleDelete(asset.id)}
                  className="flex-shrink-0 text-dim hover:text-red-500 transition-colors disabled:opacity-40"
                  title="Delete asset"
                >
                  <TrashIcon />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Page mode badge (used in PlacedList) ─────────────────────────────────────

function PageModeBadge({ pageMode, page }: { pageMode?: PageMode; page?: number }) {
  if (!pageMode || pageMode === "single") return null;
  if (pageMode === "all") {
    return (
      <span
        className="text-[8px] font-semibold rounded px-1 py-0.5 flex-shrink-0"
        style={{ background: "#f0fdf4", color: "#16a34a" }}
      >
        ALL
      </span>
    );
  }
  return (
    <span
      className="text-[8px] font-semibold rounded px-1 py-0.5 flex-shrink-0"
      style={{ background: "#eff6ff", color: "#2563eb" }}
    >
      P{(page ?? 0) + 1}
    </span>
  );
}

// ── Placed list (text fields + regions) ───────────────────────────────────────

type PlacedListProps = {
  fields: OverlayField[];
  regions: RegionObject[];
  selectedFieldId: string | null;
  selectedRegionId: string | null;
  multiFieldIds: Set<string>;
  multiRegionIds: Set<string>;
  hiddenFieldIds: Set<string>;
  hiddenRegionIds: Set<string>;
  fieldWarnings: Map<string, FieldWarn[]>;
  regionWarnings: Map<string, RegionWarn[]>;
  issueCount: number;
  onSelectField: (id: string) => void;
  onSelectRegion: (id: string) => void;
  onMultiToggleField: (id: string) => void;
  onMultiToggleRegion: (id: string) => void;
  onDeleteField: (id: string) => void;
  onDeleteRegion: (id: string) => void;
  onDuplicateField: (id: string) => void;
  onDuplicateRegion: (id: string) => void;
  onToggleLockField: (id: string) => void;
  onToggleLockRegion: (id: string) => void;
  onToggleHideField: (id: string) => void;
  onToggleHideRegion: (id: string) => void;
};

function PlacedList({
  fields, regions,
  selectedFieldId, selectedRegionId,
  multiFieldIds, multiRegionIds,
  hiddenFieldIds, hiddenRegionIds,
  fieldWarnings, regionWarnings, issueCount,
  onSelectField, onSelectRegion,
  onMultiToggleField, onMultiToggleRegion,
  onDeleteField, onDeleteRegion,
  onDuplicateField, onDuplicateRegion,
  onToggleLockField, onToggleLockRegion,
  onToggleHideField, onToggleHideRegion,
}: PlacedListProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const total      = fields.length + regions.length;
  const multiCount = multiFieldIds.size + multiRegionIds.size;

  return (
    <div
      className="bg-card rounded-xl overflow-hidden"
      style={{ boxShadow: "0 1px 12px rgba(43,52,55,0.05)" }}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-surface flex items-center gap-1.5">
        <p className="text-xs font-semibold text-ink">Objects</p>
        <span className="text-xs text-muted">({total})</span>
        {multiCount > 0 && (
          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#eff6ff", color: "#2563eb" }}>
            {multiCount} selected
          </span>
        )}
        {issueCount > 0 && (
          <span className="ml-auto text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "#fef3c7", color: "#92400e" }}>
            {issueCount} issue{issueCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {total === 0 ? (
        <div className="px-4 py-4 text-center">
          <p className="text-xs text-muted">Nothing placed yet.</p>
          <p className="text-[11px] text-dim mt-0.5 leading-relaxed">Click a field to place text, or draw a region.</p>
        </div>
      ) : (
        <div className="overflow-y-auto" style={{ maxHeight: 320 }}>

          {/* ── Fields section ── */}
          {fields.length > 0 && (
            <>
              <div className="px-3 py-1 border-b border-surface" style={{ background: "#f6f8fa" }}>
                <p className="text-[9px] font-semibold text-dim uppercase tracking-wider">
                  Fields <span className="font-normal normal-case tracking-normal">({fields.length})</span>
                </p>
              </div>

              {fields.map((f) => {
                const rowKey      = `field-${f.id}`;
                const isSelected  = f.id === selectedFieldId;
                const isMulti     = multiFieldIds.has(f.id);
                const isHidden    = hiddenFieldIds.has(f.id);
                const isHovered   = hoveredKey === rowKey;
                const showActions = isSelected || isHovered;
                const color       = colorForKey(f.key);
                const warnList    = fieldWarnings.get(f.id) ?? [];
                const hasWarning  = warnList.length > 0;
                const isError     = warnList.some((w) => FIELD_WARN_MSG[w].sev === "error");
                return (
                  <div
                    key={rowKey}
                    onMouseEnter={() => setHoveredKey(rowKey)}
                    onMouseLeave={() => setHoveredKey(null)}
                    className="flex items-stretch border-b border-surface"
                    style={{
                      borderLeft: isSelected ? `3px solid ${color}` : isMulti ? "3px solid #3b82f6" : "3px solid transparent",
                      background: isSelected ? `${color}0e` : isMulti ? "#eff6ff" : isHovered ? "#f8fafc" : undefined,
                      opacity:    isHidden ? 0.45 : 1,
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey) { onMultiToggleField(f.id); return; }
                        onSelectField(f.id);
                      }}
                      className="flex items-start gap-2 px-2 py-2 text-left flex-1 min-w-0"
                    >
                      <span className="flex-shrink-0 mt-0.5" style={{ color: isSelected ? color : `${color}88` }}>
                        {isComputedKey(f.key) ? <HashIcon /> : <TextFieldIcon />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold leading-tight truncate" style={{ color: isSelected ? color : "#1f2937" }}>
                          {labelForKey(f.key)}
                        </p>
                        <p className="text-[9px] mt-0.5 font-mono truncate" style={{ color: "#9ca3af" }}>
                          {f.x},{f.y}{f.pageMode && f.pageMode !== "single" ? ` · ${f.pageMode === "all" ? "all pages" : `p.${(f.page ?? 0) + 1}`}` : ""}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-0.5 px-1 flex-shrink-0">
                      {hasWarning && <span className="text-[10px] flex-shrink-0" style={{ color: isError ? "#dc2626" : "#d97706" }} title={warnList.map((w) => FIELD_WARN_MSG[w].msg).join("; ")}>⚠</span>}
                      {f.locked && <span className="flex-shrink-0" style={{ color: "#9ca3af", lineHeight: 1, display: "flex" }}><LockIcon size={8} color="#9ca3af" /></span>}
                      <PageModeBadge pageMode={f.pageMode} page={f.page} />
                      <span className="text-[8px] font-semibold rounded px-1 py-0.5 flex-shrink-0" style={{ background: "#f1f5f9", color: "#94a3b8" }}>
                        {isComputedKey(f.key) ? "#" : "T"}
                      </span>
                      {showActions && (
                        <>
                          <button type="button" onClick={(e) => { e.stopPropagation(); onToggleHideField(f.id); }}
                            className="w-5 h-5 flex items-center justify-center rounded transition-colors flex-shrink-0"
                            style={{ color: isHidden ? "#2563eb" : "#9ca3af" }}
                            title={isHidden ? "Show" : "Hide"}>
                            {isHidden ? <EyeOffIcon /> : <EyeIcon />}
                          </button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); onToggleLockField(f.id); }}
                            className="w-5 h-5 flex items-center justify-center rounded transition-colors flex-shrink-0"
                            style={{ color: f.locked ? "#2563eb" : "#9ca3af" }}
                            title={f.locked ? "Unlock" : "Lock"}>
                            <LockIcon size={10} color={f.locked ? "#2563eb" : "#9ca3af"} />
                          </button>
                          {!f.locked && <button type="button" onClick={(e) => { e.stopPropagation(); onDuplicateField(f.id); }}
                            className="w-5 h-5 flex items-center justify-center rounded text-dim hover:text-primary hover:bg-surface transition-colors flex-shrink-0"
                            title="Duplicate (Cmd+D)"><DuplicateIcon /></button>}
                          {!f.locked && <button type="button" onClick={(e) => { e.stopPropagation(); onDeleteField(f.id); }}
                            className="w-5 h-5 flex items-center justify-center rounded text-dim hover:text-red-500 hover:bg-surface transition-colors flex-shrink-0"
                            title="Delete"><TrashIcon /></button>}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}

          {/* ── Regions section ── */}
          {regions.length > 0 && (
            <>
              <div className="px-3 py-1 border-b border-surface" style={{ background: "#f6f8fa" }}>
                <p className="text-[9px] font-semibold text-dim uppercase tracking-wider">
                  Regions <span className="font-normal normal-case tracking-normal">({regions.length})</span>
                </p>
              </div>

              {regions.map((r) => {
                const rowKey      = `region-${r.id}`;
                const isSelected  = r.id === selectedRegionId;
                const isMulti     = multiRegionIds.has(r.id);
                const isHidden    = hiddenRegionIds.has(r.id);
                const isHovered   = hoveredKey === rowKey;
                const showActions = isSelected || isHovered;
                const color       = regionColor(r.type);
                const warnList    = regionWarnings.get(r.id) ?? [];
                const hasWarning  = warnList.length > 0;
                const isError     = warnList.some((w) => REGION_WARN_MSG[w].sev === "error");
                const badge       = r.type === "pdf_region" ? "PDF" : "IMG";
                return (
                  <div
                    key={rowKey}
                    onMouseEnter={() => setHoveredKey(rowKey)}
                    onMouseLeave={() => setHoveredKey(null)}
                    className="flex items-stretch border-b border-surface"
                    style={{
                      borderLeft: isSelected ? `3px solid ${color}` : isMulti ? "3px solid #3b82f6" : "3px solid transparent",
                      background: isSelected ? `${color}0e` : isMulti ? "#eff6ff" : isHovered ? "#f8fafc" : undefined,
                      opacity:    isHidden ? 0.45 : 1,
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey) { onMultiToggleRegion(r.id); return; }
                        onSelectRegion(r.id);
                      }}
                      className="flex items-start gap-2 px-2 py-2 text-left flex-1 min-w-0"
                    >
                      <span className="flex-shrink-0 mt-0.5" style={{ color: isSelected ? color : `${color}88` }}>
                        {r.type === "pdf_region" ? <DocIcon size={11} /> : <ImageIcon />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold leading-tight truncate" style={{ color: isSelected ? color : "#1f2937" }}>
                          {regionDisplayLabel(r)}
                        </p>
                        <p className="text-[9px] mt-0.5 font-mono truncate" style={{ color: "#9ca3af" }}>
                          {r.width}×{r.height} · {r.sourceKey ?? "no source"}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-0.5 px-1 flex-shrink-0">
                      {hasWarning && <span className="text-[10px] flex-shrink-0" style={{ color: isError ? "#dc2626" : "#d97706" }} title={warnList.map((w) => REGION_WARN_MSG[w].msg).join("; ")}>⚠</span>}
                      {r.locked && <span className="flex-shrink-0" style={{ color: "#9ca3af", lineHeight: 1, display: "flex" }}><LockIcon size={8} color="#9ca3af" /></span>}
                      <PageModeBadge pageMode={r.pageMode} page={r.page} />
                      <span className="text-[8px] font-semibold rounded px-1 py-0.5 flex-shrink-0 ml-0.5" style={{ background: `${color}12`, color }}>
                        {badge}
                      </span>
                      {showActions && (
                        <>
                          <button type="button" onClick={(e) => { e.stopPropagation(); onToggleHideRegion(r.id); }}
                            className="w-5 h-5 flex items-center justify-center rounded transition-colors flex-shrink-0"
                            style={{ color: isHidden ? "#2563eb" : "#9ca3af" }}
                            title={isHidden ? "Show" : "Hide"}>
                            {isHidden ? <EyeOffIcon /> : <EyeIcon />}
                          </button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); onToggleLockRegion(r.id); }}
                            className="w-5 h-5 flex items-center justify-center rounded transition-colors flex-shrink-0"
                            style={{ color: r.locked ? "#2563eb" : "#9ca3af" }}
                            title={r.locked ? "Unlock" : "Lock"}>
                            <LockIcon size={10} color={r.locked ? "#2563eb" : "#9ca3af"} />
                          </button>
                          {!r.locked && <button type="button" onClick={(e) => { e.stopPropagation(); onDuplicateRegion(r.id); }}
                            className="w-5 h-5 flex items-center justify-center rounded text-dim hover:text-primary hover:bg-surface transition-colors flex-shrink-0"
                            title="Duplicate (Cmd+D)"><DuplicateIcon /></button>}
                          {!r.locked && <button type="button" onClick={(e) => { e.stopPropagation(); onDeleteRegion(r.id); }}
                            className="w-5 h-5 flex items-center justify-center rounded text-dim hover:text-red-500 hover:bg-surface transition-colors flex-shrink-0"
                            title="Delete"><TrashIcon /></button>}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </>
          )}

        </div>
      )}
    </div>
  );
}

// ── Fields + objects palette ──────────────────────────────────────────────────

type PaletteProps = {
  mappedKeySet: Set<string>;
  placing: boolean;
  pendingKey: string;
  activeTool: RegionKind | null;
  onPlace: (key: AnyFieldKey) => void;
  onDrawRegion: (kind: RegionKind) => void;
};

function FieldsPalette({ mappedKeySet, placing, pendingKey, activeTool, onPlace, onDrawRegion }: PaletteProps) {
  return (
    <div
      className="bg-card rounded-xl overflow-hidden"
      style={{ boxShadow: "0 1px 12px rgba(43,52,55,0.05)" }}
    >
      {/* Text fields section */}
      <div className="px-4 py-2 border-b border-surface">
        <p className="text-[9px] font-semibold text-dim uppercase tracking-wider">Text fields</p>
      </div>
      <div className="divide-y divide-surface">
        {FIELD_KEYS.map((f) => {
          const alreadyPlaced = mappedKeySet.has(f.key);
          const isActive      = placing && pendingKey === f.key;
          const color         = colorForKey(f.key);
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => onPlace(f.key)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors"
              style={{ background: isActive ? `${color}11` : undefined }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "#f6f8fa";
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "";
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="flex-shrink-0"
                  style={{ color: isActive ? color : alreadyPlaced ? color : "#9ca3af" }}
                >
                  <TextFieldIcon />
                </span>
                <span
                  className="text-xs truncate"
                  style={{ color: isActive ? color : "#1f2937", fontWeight: isActive ? 600 : undefined }}
                >
                  {f.label}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {alreadyPlaced && !isActive && (
                  <span
                    className="text-[9px] font-medium rounded px-1 py-0.5"
                    style={{ background: `${color}14`, color }}
                  >
                    placed
                  </span>
                )}
                {isActive ? (
                  <span className="text-[9px] font-semibold text-primary animate-pulse">placing…</span>
                ) : (
                  <PlusIcon className="text-muted" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Package Numbering section */}
      <div className="px-4 py-2 border-t border-surface border-b border-surface">
        <p className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: "#0f766e" }}>
          Package Numbering
        </p>
      </div>

      {/* Explanation panel */}
      <div className="mx-3 my-2 rounded-lg px-3 py-2.5" style={{ background: "#f0fdf9", border: "1px solid #a7f3d0" }}>
        <p className="text-[9px] font-semibold mb-1.5" style={{ color: "#065f46" }}>
          Page 1 = Cover · TCP follows · TCD follows · SLD follows
        </p>
        <p className="text-[9px] leading-relaxed" style={{ color: "#374151" }}>
          <span className="font-semibold" style={{ color: "#0f766e" }}>Full Package</span>
          {" "}— global page number across the whole merged package. Works on the cover template and any wrapper template.
        </p>
        <p className="text-[9px] leading-relaxed mt-1" style={{ color: "#374151" }}>
          <span className="font-semibold" style={{ color: "#6d28d9" }}>Section</span>
          {" "}— resets to 1 within each section (TCP, TCD, SLD). Place in the wrapper template for that section.
        </p>
        <p className="text-[9px] leading-relaxed mt-1" style={{ color: "#6b7280" }}>
          Numbering fields render only through wrapper templates. If a section has no wrapper, these fields are skipped for that section.
        </p>
      </div>

      {/* Full Package sub-group */}
      <div className="px-3 pt-1 pb-0.5 border-b border-surface" style={{ background: "#f0fdf980" }}>
        <p className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: "#0f766e" }}>
          Full Package
        </p>
      </div>
      <div className="divide-y divide-surface">
        {FULL_PACKAGE_FIELD_KEYS.map((f) => {
          const alreadyPlaced = mappedKeySet.has(f.key);
          const isActive      = placing && pendingKey === f.key;
          const color         = colorForKey(f.key);
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => onPlace(f.key)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors"
              style={{ background: isActive ? `${color}11` : undefined }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "#f6f8fa";
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "";
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="flex-shrink-0"
                  style={{ color: isActive ? color : alreadyPlaced ? color : "#9ca3af" }}
                >
                  <HashIcon />
                </span>
                <span
                  className="text-xs truncate"
                  style={{ color: isActive ? color : "#1f2937", fontWeight: isActive ? 600 : undefined }}
                >
                  {f.label}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {alreadyPlaced && !isActive && (
                  <span
                    className="text-[9px] font-medium rounded px-1 py-0.5"
                    style={{ background: `${color}14`, color }}
                  >
                    placed
                  </span>
                )}
                {isActive ? (
                  <span className="text-[9px] font-semibold text-primary animate-pulse">placing…</span>
                ) : (
                  <PlusIcon className="text-muted" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Section sub-group */}
      <div className="px-3 pt-1 pb-0.5 border-b border-surface border-t border-surface" style={{ background: "#f5f3ff80" }}>
        <p className="text-[8px] font-semibold uppercase tracking-wider" style={{ color: "#6d28d9" }}>
          Section
        </p>
      </div>
      <div className="divide-y divide-surface">
        {SECTION_FIELD_KEYS.map((f) => {
          const alreadyPlaced = mappedKeySet.has(f.key);
          const isActive      = placing && pendingKey === f.key;
          const color         = colorForKey(f.key);
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => onPlace(f.key)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors"
              style={{ background: isActive ? `${color}11` : undefined }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "#f6f8fa";
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "";
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="flex-shrink-0"
                  style={{ color: isActive ? color : alreadyPlaced ? color : "#9ca3af" }}
                >
                  <HashIcon />
                </span>
                <span
                  className="text-xs truncate"
                  style={{ color: isActive ? color : "#1f2937", fontWeight: isActive ? 600 : undefined }}
                >
                  {f.label}
                </span>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {alreadyPlaced && !isActive && (
                  <span
                    className="text-[9px] font-medium rounded px-1 py-0.5"
                    style={{ background: `${color}14`, color }}
                  >
                    placed
                  </span>
                )}
                {isActive ? (
                  <span className="text-[9px] font-semibold text-primary animate-pulse">placing…</span>
                ) : (
                  <PlusIcon className="text-muted" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Objects section */}
      <div className="px-4 py-2 border-t border-surface border-b border-surface">
        <p className="text-[9px] font-semibold text-dim uppercase tracking-wider">Objects</p>
      </div>
      <div className="divide-y divide-surface">
        {REGION_TOOLS.map((tool) => {
          const isActive = activeTool === tool.id;
          const color    = regionColor(tool.id);
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => onDrawRegion(tool.id)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors"
              style={{ background: isActive ? `${color}11` : undefined }}
              onMouseEnter={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "#f6f8fa";
              }}
              onMouseLeave={(e) => {
                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = "";
              }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="flex-shrink-0"
                  style={{ color: isActive ? color : "#9ca3af" }}
                >
                  {tool.id === "pdf_region" ? <DocIcon size={11} /> : <ImageIcon />}
                </span>
                <span
                  className="text-xs truncate"
                  style={{ color: isActive ? color : "#1f2937", fontWeight: isActive ? 600 : undefined }}
                >
                  {tool.label}
                </span>
              </div>
              {isActive ? (
                <span
                  className="text-[9px] font-semibold animate-pulse flex-shrink-0"
                  style={{ color }}
                >
                  drawing…
                </span>
              ) : (
                <PlusIcon className="text-muted flex-shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── SVG icons ─────────────────────────────────────────────────────────────────

function DuplicateIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="3.5" width="5" height="5" rx="0.75" />
      <path d="M1.5 6.5V2A.5.5 0 012 1.5H6.5" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 14 14" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 3.5h10" />
      <path d="M5 3.5V2.5a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1" />
      <path d="M10.5 3.5l-.5 8h-6l-.5-8" />
    </svg>
  );
}

function DocIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="1.5" width="9" height="11" rx="1" />
      <path d="M5 5h4M5 7.5h4M5 10h2.5" />
    </svg>
  );
}

function TextFieldIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2.5 3H8.5" />
      <path d="M5.5 3V8.5" />
      <path d="M3.5 8.5H7.5" />
    </svg>
  );
}

function HashIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 2L3 9" />
      <path d="M8 2L7 9" />
      <path d="M2 4.5h7" />
      <path d="M1.5 6.5h7" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1.5" y="2" width="8" height="7" rx="1" />
      <path d="M1.5 7L3.5 5L5.5 7L7 5.5L9.5 8.5" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" aria-hidden="true" className={className}>
      <path d="M5 2v6M2 5h6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M2 2l6 6M8 2l-6 6" />
    </svg>
  );
}

function ArrowIcon({ dir }: { dir: "up" | "down" | "left" | "right" }) {
  const paths: Record<string, string> = {
    up:    "M5 7.5L5 2.5M2.5 5L5 2.5L7.5 5",
    down:  "M5 2.5L5 7.5M2.5 5L5 7.5L7.5 5",
    left:  "M7.5 5L2.5 5M5 2.5L2.5 5L5 7.5",
    right: "M2.5 5L7.5 5M5 2.5L7.5 5L5 7.5",
  };
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[dir]} />
    </svg>
  );
}

function SelectCursorIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor"
      strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
      className="text-dim" aria-hidden="true">
      <path d="M4 3l4.5 11 2.25-4.25L15 7.5z" />
    </svg>
  );
}

function LockIcon({ size = 12, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" stroke={color}
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2.5" y="5.5" width="7" height="5" rx="0.75" />
      <path d="M4 5.5V4a2 2 0 014 0v1.5" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 5.5C2 3.5 3.5 2 5.5 2S9 3.5 10 5.5C9 7.5 7.5 9 5.5 9S2 7.5 1 5.5z" />
      <circle cx="5.5" cy="5.5" r="1.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1.5 1.5l8 8" />
      <path d="M4.5 2.3C4.8 2.1 5.1 2 5.5 2c2 0 3.5 1.5 4.5 3.5-.4.8-.9 1.5-1.6 2" />
      <path d="M7.8 7.8C7.1 8.5 6.3 9 5.5 9 3.5 9 2 7.5 1 5.5c.5-1 1.2-1.9 2-2.5" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 4h5a3 3 0 010 6H4" />
      <path d="M2 4L4 2M2 4L4 6" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 4H5a3 3 0 000 6h3" />
      <path d="M10 4L8 2M10 4L8 6" />
    </svg>
  );
}

// ── AlignmentToolbar ──────────────────────────────────────────────────────────

type AlignDir = "left" | "right" | "top" | "bottom" | "hcenter" | "vcenter";

function AlignmentToolbar({ onAlign }: { onAlign: (dir: AlignDir) => void }) {
  const btns: { dir: AlignDir; title: string; path: string }[] = [
    { dir: "left",    title: "Align left edges",     path: "M2 2v8M4 4h5M4 7h3" },
    { dir: "hcenter", title: "Center on vertical axis", path: "M6 2v8M3 4h6M4 7h4" },
    { dir: "right",   title: "Align right edges",    path: "M10 2v8M3 4h5M5 7h3" },
    { dir: "top",     title: "Align top edges",      path: "M2 2h8M4 4v3M7 4v5" },
    { dir: "vcenter", title: "Center on horizontal axis", path: "M2 6h8M4 3v6M7 4v4" },
    { dir: "bottom",  title: "Align bottom edges",   path: "M2 10h8M4 3v5M7 5v3" },
  ];
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 2,
        background: "#f0f4ff", border: "1px solid #c7d7f8",
        borderRadius: 6, padding: "2px 4px",
      }}
      title="Align selected objects"
    >
      <span style={{ fontSize: 9, color: "#5b7fcc", fontWeight: 600, marginRight: 2 }}>Align</span>
      {btns.map(({ dir, title, path }) => (
        <button
          key={dir}
          type="button"
          onClick={() => onAlign(dir)}
          title={title}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 20, height: 20, borderRadius: 3, border: "none", background: "transparent",
            cursor: "pointer", color: "#4b6bb5", padding: 0,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#dde8ff"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={path} />
          </svg>
        </button>
      ))}
    </div>
  );
}
