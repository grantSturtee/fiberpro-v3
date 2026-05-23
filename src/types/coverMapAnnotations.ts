// Phase G/I/K — Cover Map Work Path annotations.
//
// Lightweight polyline linework drawn over the cropped project cover map.
// Points are normalized 0..1 against the cropped image's drawn area, so the
// same JSON renders correctly into any template region size.
//
// Phase K — work paths now follow a single GRANTED standard style:
//   • always black, always dashed, single thick stroke
//   • style is driven by two enums: workPathPreset + workPathThickness
//   • legacy per-field properties (color, lineStyle, dash sliders, renderMode,
//     outline*) are kept on the type for JSON compatibility, but parseAnnotations
//     normalizes them to the resolved standard style on read, and the editor
//     and PDF renderer both go through getGRANTEDWorkPathStyle().

export type AnnotationPoint = {
  x: number; // 0..1, left → right
  y: number; // 0..1, top  → bottom
};

export type LineStyle  = "solid" | "dashed";
export type RenderMode = "centerline" | "outline" | "centerline_and_outline";

// Phase K — controlled style enums.
export type WorkPathPreset    = "tight" | "standard" | "loose";
export type WorkPathThickness = "thin"  | "standard" | "heavy";

export const WORK_PATH_PRESETS:     readonly WorkPathPreset[]    = ["tight", "standard", "loose"];
export const WORK_PATH_THICKNESSES: readonly WorkPathThickness[] = ["thin",  "standard", "heavy"];

// GRANTED standard style — locked.
export const WORK_PATH_COLOR: string = "#000000";

const PRESET_DASH: Record<WorkPathPreset, { dashLength: number; gapLength: number }> = {
  tight:    { dashLength: 4, gapLength: 5 },
  standard: { dashLength: 5, gapLength: 7 },
  loose:    { dashLength: 6, gapLength: 9 },
};

const THICKNESS_WIDTH: Record<WorkPathThickness, number> = {
  thin:     2,
  standard: 3,
  heavy:    4,
};

export type AnnotationPath = {
  id:          string;
  points:      AnnotationPoint[];

  // Phase K — controlled style. Optional on the wire so legacy rows still
  // parse; defaults fill in when absent.
  workPathPreset?:    WorkPathPreset;
  workPathThickness?: WorkPathThickness;

  // Legacy fields — retained so existing JSON keeps shape and old consumers
  // don't crash. The editor UI no longer exposes controls for them and the
  // renderer ignores them; parseAnnotations rewrites them to the resolved
  // standard style on read so any code still reading them sees consistent
  // values.
  stroke:      string;
  strokeWidth: number;
  lineStyle:   LineStyle;
  dashLength:  number;
  gapLength:   number;
  renderMode:        RenderMode;
  outlineWidth:      number;
  outlineStroke:     string;
  outlineStrokeWidth: number;
  outlineLineStyle:  LineStyle;
  outlineDashLength: number;
  outlineGapLength:  number;
};

export type CoverMapAnnotations = {
  paths: AnnotationPath[];
};

// Phase K — defaults reflect the GRANTED standard style. Legacy fields are
// seeded with the resolved standard so any code path that still reads them
// sees consistent values.
export const ANNOTATION_DEFAULTS: Omit<AnnotationPath, "id" | "points"> = {
  workPathPreset:    "standard",
  workPathThickness: "standard",
  stroke:             WORK_PATH_COLOR,
  strokeWidth:        THICKNESS_WIDTH.standard,
  lineStyle:          "dashed",
  dashLength:         PRESET_DASH.standard.dashLength,
  gapLength:          PRESET_DASH.standard.gapLength,
  renderMode:         "centerline",
  outlineWidth:       18,
  outlineStroke:      WORK_PATH_COLOR,
  outlineStrokeWidth: 2,
  outlineLineStyle:   "dashed",
  outlineDashLength:  10,
  outlineGapLength:   6,
};

// Legacy aliases (Phase G consumers still import these).
export const ANNOTATION_DEFAULT_STROKE       = ANNOTATION_DEFAULTS.stroke;
export const ANNOTATION_DEFAULT_STROKE_WIDTH = ANNOTATION_DEFAULTS.strokeWidth;

// Hard caps so a malicious or runaway client can't bloat the row.
export const ANNOTATION_MAX_POINTS_PER_PATH = 200;
export const ANNOTATION_MAX_PATHS           = 8;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const LINE_STYLES:  readonly LineStyle[]  = ["solid", "dashed"];
const RENDER_MODES: readonly RenderMode[] = ["centerline", "outline", "centerline_and_outline"];

// Validation ranges — kept in case legacy outline fields are present in the
// JSON. New paths never write outside the GRANTED standard.
const DASH_LEN_MIN              = 1;
const DASH_LEN_MAX              = 100;
const OUTLINE_WIDTH_MIN         = 1;
const OUTLINE_WIDTH_MAX         = 80;
const OUTLINE_STROKE_WIDTH_MIN  = 1;
const OUTLINE_STROKE_WIDTH_MAX  = 20;

function clampNumber(
  raw: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  const n = typeof raw === "number" ? raw : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function pickEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  fallback: T
): T {
  return typeof raw === "string" && (allowed as readonly string[]).includes(raw)
    ? (raw as T)
    : fallback;
}

function pickHex(raw: unknown, fallback: string): string {
  return typeof raw === "string" && HEX_RE.test(raw) ? raw : fallback;
}

/**
 * Resolves the GRANTED standard work path style for a given path. Single
 * source of truth for both the editor preview and the PDF renderer — always
 * returns black, dashed, with dash/gap from the preset and width from the
 * thickness. Falls back to "standard" for both when unset.
 */
export function getGRANTEDWorkPathStyle(path: Pick<AnnotationPath, "workPathPreset" | "workPathThickness">): {
  stroke:      string;
  strokeWidth: number;
  lineStyle:   "dashed";
  dashLength:  number;
  gapLength:   number;
} {
  const preset    = path.workPathPreset    ?? "standard";
  const thickness = path.workPathThickness ?? "standard";
  const dash      = PRESET_DASH[preset];
  return {
    stroke:      WORK_PATH_COLOR,
    strokeWidth: THICKNESS_WIDTH[thickness],
    lineStyle:   "dashed",
    dashLength:  dash.dashLength,
    gapLength:   dash.gapLength,
  };
}

/**
 * Strict-but-forgiving validator. Returns the cleaned annotations object, or
 * null when the top-level shape is unusable. Per-path: drops paths missing an
 * id or fewer than 2 valid points; otherwise resolves the GRANTED standard
 * style from workPathPreset/workPathThickness (defaulting to "standard") and
 * normalizes the legacy color/lineStyle/dash/renderMode fields to match, so
 * existing rows render identically to freshly created ones.
 */
export function parseAnnotations(input: unknown): CoverMapAnnotations | null {
  if (!input || typeof input !== "object") return null;
  const root = input as Record<string, unknown>;
  const rawPaths = root.paths;
  if (!Array.isArray(rawPaths)) return null;

  const paths: AnnotationPath[] = [];
  for (const raw of rawPaths) {
    if (paths.length >= ANNOTATION_MAX_PATHS) break;
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;

    const id = typeof r.id === "string" && r.id.length > 0 && r.id.length <= 64
      ? r.id
      : null;
    if (!id) continue;

    const rawPoints = r.points;
    if (!Array.isArray(rawPoints) || rawPoints.length < 2) continue;

    const points: AnnotationPoint[] = [];
    for (const p of rawPoints) {
      if (points.length >= ANNOTATION_MAX_POINTS_PER_PATH) break;
      if (!p || typeof p !== "object") continue;
      const pp = p as Record<string, unknown>;
      const x = typeof pp.x === "number" && Number.isFinite(pp.x) ? pp.x : NaN;
      const y = typeof pp.y === "number" && Number.isFinite(pp.y) ? pp.y : NaN;
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < 0 || x > 1 || y < 0 || y > 1) continue;
      points.push({ x, y });
    }
    if (points.length < 2) continue;

    const workPathPreset    = pickEnum(r.workPathPreset,    WORK_PATH_PRESETS,     "standard");
    const workPathThickness = pickEnum(r.workPathThickness, WORK_PATH_THICKNESSES, "standard");
    const resolved          = getGRANTEDWorkPathStyle({ workPathPreset, workPathThickness });

    paths.push({
      id,
      points,
      workPathPreset,
      workPathThickness,
      // Legacy fields normalized to the resolved GRANTED standard so any
      // code still reading them gets consistent values.
      stroke:      resolved.stroke,
      strokeWidth: resolved.strokeWidth,
      lineStyle:   "dashed",
      dashLength:  resolved.dashLength,
      gapLength:   resolved.gapLength,
      renderMode:  "centerline",
      // Outline fields kept for JSON shape only — ignored downstream.
      outlineWidth:       clampNumber(r.outlineWidth,       OUTLINE_WIDTH_MIN,        OUTLINE_WIDTH_MAX,        ANNOTATION_DEFAULTS.outlineWidth),
      outlineStroke:      pickHex(r.outlineStroke,                                                              ANNOTATION_DEFAULTS.outlineStroke),
      outlineStrokeWidth: clampNumber(r.outlineStrokeWidth, OUTLINE_STROKE_WIDTH_MIN, OUTLINE_STROKE_WIDTH_MAX, ANNOTATION_DEFAULTS.outlineStrokeWidth),
      outlineLineStyle:   pickEnum(r.outlineLineStyle,      LINE_STYLES,                                        ANNOTATION_DEFAULTS.outlineLineStyle),
      outlineDashLength:  clampNumber(r.outlineDashLength,  DASH_LEN_MIN,             DASH_LEN_MAX,             ANNOTATION_DEFAULTS.outlineDashLength),
      outlineGapLength:   clampNumber(r.outlineGapLength,   DASH_LEN_MIN,             DASH_LEN_MAX,             ANNOTATION_DEFAULTS.outlineGapLength),
    });
  }

  return { paths };
}

/** "#ef4444" → { r: 0.937, g: 0.267, b: 0.267 } in 0..1. */
export function hexToRgb01(hex: string): { r: number; g: number; b: number } {
  if (!HEX_RE.test(hex)) return { r: 1, g: 0, b: 0 };
  const n = parseInt(hex.slice(1), 16);
  return {
    r: ((n >> 16) & 0xff) / 255,
    g: ((n >>  8) & 0xff) / 255,
    b: ( n        & 0xff) / 255,
  };
}

/**
 * SVG strokeDasharray for a given style — undefined for solid (so React
 * doesn't emit the attribute at all).
 */
export function svgDashArrayFor(style: LineStyle, dashLen: number, gapLen: number): string | undefined {
  if (style !== "dashed") return undefined;
  return `${dashLen} ${gapLen}`;
}
