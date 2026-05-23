/**
 * Page Template Validation
 *
 * Pure helpers shared by:
 *   - the Page Template editor diagnostics panel,
 *   - the `updateFieldMappings` server action (blocks critical issues),
 *   - blueprint activation actions (blocks critical slot issues),
 *   - the archive guard helper.
 *
 * No DB access here — callers pass in already-fetched rows. This keeps the
 * validator deterministic and easy to test.
 */

import {
  PROJECT_FIELDS,
  COMPUTED_FIELDS,
  isComputedKey,
  type CatalogFieldKey,
} from "./fieldCatalog";

// ── Types ────────────────────────────────────────────────────────────────────

export type ValidationSeverity = "critical" | "warning" | "info";

export type ValidationTargetType =
  | "template"
  | "field"
  | "region"
  | "blueprint_slot";

export type ValidationIssue = {
  severity:    ValidationSeverity;
  /** Stable machine code — used for tests and conditional UI. */
  code:        string;
  /** Human-readable, single-line. Safe to show directly to admins. */
  message:     string;
  targetType:  ValidationTargetType;
  /** Optional pointer to the offending object (field id, region id, template id, slot key). */
  targetId?:   string;
  /** For field issues: the (possibly invalid) catalog key. */
  fieldKey?:   string;
  /** For blueprint_slot issues: the slot column name (e.g. "tcp_wrapper_id"). */
  slot?:       string;
};

export type WrapperPlacementBox = {
  x:      number;
  y:      number;
  width:  number;
  height: number;
};

// ── Catalog key index (used by every field check) ────────────────────────────

const CATALOG_KEYS: Set<string> = new Set<string>([
  ...PROJECT_FIELDS.map((f) => f.key),
  ...COMPUTED_FIELDS.map((f) => f.key),
]);

export function isKnownCatalogKey(key: string): key is CatalogFieldKey {
  return CATALOG_KEYS.has(key);
}

// ── Wrapper template type set (placement_box matters for these) ──────────────

const WRAPPER_TYPES: ReadonlySet<string> = new Set([
  "tcp_wrapper",
  "tcd_wrapper",
  "sld_wrapper",
]);

// ── JSON parse helper ────────────────────────────────────────────────────────

export type ParseResult =
  | { ok: true;  value: Record<string, unknown> | null }
  | { ok: false; error: string };

/**
 * Parse a field_mappings JSON string. Empty / null is treated as "no mappings"
 * which is structurally valid (template has no overlay yet).
 */
export function parseFieldMappingsJson(text: string | null | undefined): ParseResult {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { ok: true, value: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "Field mappings must be valid JSON or left empty." };
  }
  if (parsed === null) return { ok: true, value: null };
  if (typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Field mappings must be a JSON object." };
  }
  return { ok: true, value: parsed as Record<string, unknown> };
}

// ── Field mapping validation ─────────────────────────────────────────────────

export type ValidatePageTemplateMappingsInput = {
  templateType:     string;
  storagePath:      string | null;
  placementBox:     WrapperPlacementBox | null;
  /** Already-parsed field_mappings JSONB value, or null. */
  fieldMappings:    Record<string, unknown> | null;
  /** Available custom fonts for this admin (id used for FK check). */
  fonts:            ReadonlyArray<{ id: string }>;
  /** Image assets bound to this template. */
  assets:           ReadonlyArray<{ id: string }>;
  /** Optional — pass when caller knows page dimensions to enable off-page checks. */
  pageDims?:        { width: number; height: number };
};

/**
 * Validate a page template's field_mappings, fonts/assets refs, PDF presence,
 * and (for wrapper types) placement_box presence.
 *
 * Severity guide:
 *   - critical: blocks save (server) and shows red in the diagnostics panel.
 *   - warning : advisory; visible in the panel; does not block save.
 *   - info    : minor (off-page, tiny region, etc.).
 */
export function validatePageTemplateMappings(
  input: ValidatePageTemplateMappingsInput
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // ── Template-level checks ──
  if (!input.storagePath) {
    issues.push({
      severity:   "critical",
      code:       "missing_pdf",
      message:    "Template has no PDF uploaded — package generation will fail until a PDF is attached.",
      targetType: "template",
    });
  }

  if (WRAPPER_TYPES.has(input.templateType) && !input.placementBox) {
    issues.push({
      severity:   "warning",
      code:       "wrapper_missing_placement_box",
      message:    "Wrapper template has no placement box configured — source PDFs will fall back to a top-right job stamp instead of being composited inside the wrapper.",
      targetType: "template",
    });
  }

  // ── Field mapping shape ──
  const m = input.fieldMappings;
  if (!m) {
    // No mappings at all is OK — caller decides if a template needs them.
    return issues;
  }

  // Legacy AcroForm shape — flat { "PdfFieldName": "data_key" }. We don't
  // validate data keys here (renderer silently skips missing ones, and many
  // valid keys live outside the catalog, e.g. applicant_name, work_description).
  if (m.mode !== "overlay") {
    return issues;
  }

  // ── Overlay-mode validation ──
  const fontIds  = new Set(input.fonts.map((f)  => f.id));
  const assetIds = new Set(input.assets.map((a) => a.id));

  // defaultFontId orphan check
  const defaultFontId = m.defaultFontId;
  if (typeof defaultFontId === "string" && defaultFontId && !fontIds.has(defaultFontId)) {
    issues.push({
      severity:   "warning",
      code:       "missing_default_font",
      message:    "Template's default font is no longer in the font library — text will fall back to Helvetica.",
      targetType: "template",
    });
  }

  // ── Per-field checks ──
  const fields = Array.isArray(m.fields) ? (m.fields as Array<Record<string, unknown>>) : [];
  const seenKeys = new Map<string, number>();

  for (let i = 0; i < fields.length; i++) {
    const f      = fields[i];
    const fid    = typeof f.id === "string" ? f.id : `field#${i}`;
    const key    = typeof f.key === "string" ? f.key : "";

    if (!key) {
      issues.push({
        severity:   "critical",
        code:       "field_missing_key",
        message:    `Field #${i + 1} has no key — cannot be rendered.`,
        targetType: "field",
        targetId:   fid,
      });
      continue;
    }

    if (!isKnownCatalogKey(key)) {
      issues.push({
        severity:   "critical",
        code:       "unknown_field_key",
        message:    `Field "${key}" is not in the field catalog — it will render blank in every package.`,
        targetType: "field",
        targetId:   fid,
        fieldKey:   key,
      });
    } else {
      // Track for duplicate-key check (only meaningful for known keys, since
      // duplicate computed keys e.g. sheet_number_current can be intentional
      // when placed on different pages).
      if (!isComputedKey(key)) {
        seenKeys.set(key, (seenKeys.get(key) ?? 0) + 1);
      }
    }

    // Coordinate sanity
    if (typeof f.x !== "number" || !Number.isFinite(f.x)) {
      issues.push({
        severity:   "warning",
        code:       "invalid_coord",
        message:    `Field "${key}" has an invalid X coordinate.`,
        targetType: "field",
        targetId:   fid,
        fieldKey:   key,
      });
    }
    if (typeof f.y !== "number" || !Number.isFinite(f.y)) {
      issues.push({
        severity:   "warning",
        code:       "invalid_coord",
        message:    `Field "${key}" has an invalid Y coordinate.`,
        targetType: "field",
        targetId:   fid,
        fieldKey:   key,
      });
    }

    // Off-page (only when caller provides pageDims)
    if (input.pageDims && typeof f.x === "number" && typeof f.y === "number") {
      if (f.x < 0 || f.x > input.pageDims.width || f.y < 0 || f.y > input.pageDims.height) {
        issues.push({
          severity:   "info",
          code:       "off_page",
          message:    `Field "${key}" is positioned outside the page bounds.`,
          targetType: "field",
          targetId:   fid,
          fieldKey:   key,
        });
      }
    }

    // Font orphan
    const fontId = f.fontId;
    if (typeof fontId === "string" && fontId && !fontIds.has(fontId)) {
      issues.push({
        severity:   "warning",
        code:       "missing_font",
        message:    `Field "${key}" references a font that is no longer in the library — text will fall back to Helvetica.`,
        targetType: "field",
        targetId:   fid,
        fieldKey:   key,
      });
    }
  }

  // Duplicate non-computed key warnings
  for (const [key, count] of seenKeys) {
    if (count > 1) {
      issues.push({
        severity:   "warning",
        code:       "duplicate_field_key",
        message:    `Field "${key}" is placed ${count} times — it will render the same value in every position.`,
        targetType: "template",
        fieldKey:   key,
      });
    }
  }

  // ── Per-region checks ──
  const regions = Array.isArray(m.regions) ? (m.regions as Array<Record<string, unknown>>) : [];

  for (let i = 0; i < regions.length; i++) {
    const r      = regions[i];
    const rid    = typeof r.id === "string" ? r.id : `region#${i}`;
    const label  = (typeof r.label === "string" && r.label) ? r.label : `Region ${i + 1}`;
    const type   = typeof r.type === "string" ? r.type : "";
    const source = typeof r.sourceKey === "string" ? r.sourceKey : "";

    // Missing source binding
    if (!source) {
      issues.push({
        severity:   "warning",
        code:       "no_source",
        message:    `${label}: no source binding selected — region will render empty.`,
        targetType: "region",
        targetId:   rid,
      });
    }

    // Image region with custom_image must reference an asset
    if (type === "image_region" && source === "custom_image") {
      const assetId = typeof r.assetId === "string" ? r.assetId : "";
      if (!assetId) {
        issues.push({
          severity:   "warning",
          code:       "no_asset",
          message:    `${label}: custom image binding has no image selected.`,
          targetType: "region",
          targetId:   rid,
        });
      } else if (!assetIds.has(assetId)) {
        issues.push({
          severity:   "warning",
          code:       "missing_asset",
          message:    `${label}: bound image asset is no longer available — region will render empty.`,
          targetType: "region",
          targetId:   rid,
        });
      }
    }

    // Coordinate / size sanity
    const w = typeof r.width  === "number" ? r.width  : NaN;
    const h = typeof r.height === "number" ? r.height : NaN;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
      issues.push({
        severity:   "warning",
        code:       "invalid_region_size",
        message:    `${label}: invalid width or height.`,
        targetType: "region",
        targetId:   rid,
      });
    } else if (w < 8 || h < 8) {
      issues.push({
        severity:   "info",
        code:       "region_too_small",
        message:    `${label}: region is very small (${Math.round(w)}×${Math.round(h)} pt) — content may not render legibly.`,
        targetType: "region",
        targetId:   rid,
      });
    }

    // Off-page
    if (input.pageDims && typeof r.x === "number" && typeof r.y === "number" && Number.isFinite(w) && Number.isFinite(h)) {
      const insidePage =
        r.x >= 0 &&
        r.y >= 0 &&
        r.x + w <= input.pageDims.width &&
        r.y + h <= input.pageDims.height;
      if (!insidePage) {
        issues.push({
          severity:   "info",
          code:       "region_off_page",
          message:    `${label}: extends outside the page bounds.`,
          targetType: "region",
          targetId:   rid,
        });
      }
    }
  }

  return issues;
}

// ── Blueprint slot validation ────────────────────────────────────────────────

export const BLUEPRINT_SLOTS = [
  { key: "cover_page_template_id", label: "Cover Sheet",       expectedType: "cover",              required: true  },
  { key: "tcp_wrapper_id",         label: "TCP Wrapper",       expectedType: "tcp_wrapper",        required: true  },
  { key: "tcd_wrapper_id",         label: "TCD Wrapper",       expectedType: "tcd_wrapper",        required: true  },
  { key: "sld_wrapper_id",         label: "SLD Wrapper",       expectedType: "sld_wrapper",        required: true  },
  { key: "app_page_template_id",   label: "Application Form",  expectedType: "application_form",   required: false },
  { key: "cert_page_template_id",  label: "Certification Form", expectedType: "certification_form", required: false },
  { key: "coi_template_id",        label: "COI",               expectedType: "coi",                required: false },
] as const;

export type BlueprintSlotKey = typeof BLUEPRINT_SLOTS[number]["key"];

export type SlotTemplateRow = {
  id:            string;
  template_type: string;
  storage_path:  string | null;
  is_active:     boolean;
  placement_box: unknown;
};

export type ValidateBlueprintTemplateSlotsInput = {
  blueprint: Partial<Record<BlueprintSlotKey, string | null>> & {
    /** Legacy slot for application — accepted as substitute for app_page_template_id. */
    application_template_id?:   string | null;
    /** Legacy slot for certification — accepted as substitute for cert_page_template_id. */
    certification_template_id?: string | null;
  };
  /** All page_templates referenced by any slot, keyed by id. */
  templatesById: ReadonlyMap<string, SlotTemplateRow>;
  /** Authority's requires_application / requires_certification / requires_coi flags. */
  authorityRequirements: {
    requires_application?:   boolean | null;
    requires_certification?: boolean | null;
    requires_coi?:           boolean | null;
  } | null;
};

/**
 * Validate that every slot referenced by an active blueprint points at a
 * page_templates row that:
 *   - exists,
 *   - is_active,
 *   - has a storage_path (a real PDF),
 *   - matches the slot's expected template_type,
 *   - has a placement_box if it's a wrapper slot.
 *
 * Also emits critical issues for missing required slots and authority-required
 * application docs (subsumes the existing blueprintCompleteness checks).
 */
export function validateBlueprintTemplateSlots(
  input: ValidateBlueprintTemplateSlotsInput
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const bp     = input.blueprint;
  const byId   = input.templatesById;
  const authReq = input.authorityRequirements ?? null;

  for (const slot of BLUEPRINT_SLOTS) {
    const id = bp[slot.key] ?? null;

    if (!id) {
      if (slot.required) {
        issues.push({
          severity:   "critical",
          code:       "slot_required_missing",
          message:    `Required slot "${slot.label}" has no template assigned.`,
          targetType: "blueprint_slot",
          slot:       slot.key,
        });
      }
      // Authority-required check for app/cert/coi happens below; skip per-slot
      // existence check for empty optional slots.
      continue;
    }

    const row = byId.get(id);
    if (!row) {
      issues.push({
        severity:   "critical",
        code:       "slot_template_missing",
        message:    `${slot.label}: assigned template no longer exists (it may have been deleted).`,
        targetType: "blueprint_slot",
        slot:       slot.key,
        targetId:   id,
      });
      continue;
    }

    if (!row.is_active) {
      issues.push({
        severity:   "critical",
        code:       "slot_template_inactive",
        message:    `${slot.label}: assigned template is archived. Restore it or pick a different template.`,
        targetType: "blueprint_slot",
        slot:       slot.key,
        targetId:   id,
      });
    }

    if (!row.storage_path) {
      issues.push({
        severity:   "critical",
        code:       "slot_template_no_pdf",
        message:    `${slot.label}: assigned template has no PDF uploaded.`,
        targetType: "blueprint_slot",
        slot:       slot.key,
        targetId:   id,
      });
    }

    if (row.template_type !== slot.expectedType) {
      issues.push({
        severity:   "critical",
        code:       "slot_type_mismatch",
        message:    `${slot.label}: assigned template is type "${row.template_type}" but this slot requires "${slot.expectedType}".`,
        targetType: "blueprint_slot",
        slot:       slot.key,
        targetId:   id,
      });
    }

    // Wrapper slots additionally need placement_box
    if (
      WRAPPER_TYPES.has(slot.expectedType) &&
      !isValidPlacementBox(row.placement_box)
    ) {
      issues.push({
        severity:   "critical",
        code:       "slot_wrapper_missing_placement_box",
        message:    `${slot.label}: wrapper template has no placement box — source PDFs would not composite into the wrapper. Configure placement box on the template.`,
        targetType: "blueprint_slot",
        slot:       slot.key,
        targetId:   id,
      });
    }
  }

  // Authority-required application slot — accept either the new key or the
  // legacy authority_document_templates slot.
  if (authReq?.requires_application) {
    const hasApp = !!(bp.app_page_template_id ?? bp.application_template_id);
    if (!hasApp) {
      issues.push({
        severity:   "critical",
        code:       "authority_application_missing",
        message:    "Authority requires an Application Form, but no application template is assigned.",
        targetType: "blueprint_slot",
        slot:       "app_page_template_id",
      });
    }
  }

  return issues;
}

function isValidPlacementBox(pb: unknown): pb is WrapperPlacementBox {
  if (!pb || typeof pb !== "object") return false;
  const o = pb as Record<string, unknown>;
  return (
    typeof o.x      === "number" &&
    typeof o.y      === "number" &&
    typeof o.width  === "number" &&
    typeof o.height === "number" &&
    o.width > 0 && o.height > 0
  );
}

// ── Convenience helpers ──────────────────────────────────────────────────────

export function hasCritical(issues: ReadonlyArray<ValidationIssue>): boolean {
  for (const i of issues) if (i.severity === "critical") return true;
  return false;
}

export function groupBySeverity(issues: ReadonlyArray<ValidationIssue>): {
  critical: ValidationIssue[];
  warning:  ValidationIssue[];
  info:     ValidationIssue[];
} {
  const out = { critical: [] as ValidationIssue[], warning: [] as ValidationIssue[], info: [] as ValidationIssue[] };
  for (const i of issues) out[i.severity].push(i);
  return out;
}

/**
 * Build a single-line error string suitable for returning from a server action
 * when one or more critical issues block the operation.
 */
export function buildCriticalErrorMessage(
  issues: ReadonlyArray<ValidationIssue>,
  prefix: string
): string | null {
  const criticals = issues.filter((i) => i.severity === "critical");
  if (criticals.length === 0) return null;
  if (criticals.length === 1) return `${prefix}: ${criticals[0].message}`;
  const head = criticals.slice(0, 3).map((i) => `• ${i.message}`).join(" ");
  const more = criticals.length > 3 ? ` (+${criticals.length - 3} more)` : "";
  return `${prefix}: ${head}${more}`;
}
