/**
 * Page Template Field Catalog
 *
 * Single source of truth for the field keys an admin can place on a Page Template
 * (cover sheet, TCP/TCD/SLD wrapper, application form, etc.).
 *
 * Two consumers:
 *   1. The Page Template editor       — uses these to render the field palette,
 *      labels, sample preview values, and inspector hints.
 *   2. The package renderer           — reads the same `key`s from `projectData`
 *      when stamping field values onto generated PDFs.
 *
 * Job Number vs Internal ID
 *   - `job_number`  → client-facing JB / project number (projects.job_number_client).
 *                     This is what permit documents normally need.
 *   - `internal_id` → GRANTED internal tracking number (projects.job_number).
 *                     Used for system identification, filenames, and admin tooling.
 *
 * Adding a field
 *   1. Add a row here with key, label, sample, hint, source.
 *   2. Make sure the renderer's `projectData` builder
 *      (src/app/api/generate-package/route.ts) populates the same key.
 *   3. Optionally add a color in FieldMappingEditor.tsx KEY_COLORS.
 */

export type ProjectFieldDef = {
  /** Stable machine key — used in field_mappings JSON and in renderer's projectData. */
  key: string;
  /** Operator-facing label shown in the editor palette and inspector. */
  label: string;
  /** Sample value used in the editor preview. Should look like a real value. */
  sample: string;
  /** Optional one-line hint shown to operators. Empty string = no hint. */
  hint: string;
  /** Where the value comes from at render time. Documentation only. */
  source: string;
};

export type ComputedFieldDef = {
  key: string;
  label: string;
  sample: string;
  hint: string;
};

// ── Project / intake fields ──────────────────────────────────────────────────
// Resolved from the projects row at package generation time.

export const PROJECT_FIELDS = [
  {
    key:    "job_number",
    label:  "Job Number",
    sample: "JB-2026-04812",
    hint:   "Client-facing JB / project number (falls back to GRANTED ID if blank)",
    source: "projects.job_number_client",
  },
  {
    key:    "internal_id",
    label:  "Internal ID",
    sample: "FP-2026-0041",
    hint:   "GRANTED internal tracking number — only place if the document needs it",
    source: "projects.job_number",
  },
  {
    key:    "job_name",
    label:  "Job Name (legacy)",
    sample: "Test Aerial — Burlington County",
    hint:   "Legacy free-form name — prefer Address Block or Street Address on new templates",
    source: "projects.job_name",
  },
  {
    key:    "date",
    label:  "Date",
    sample: "04/12/2026",
    hint:   "Set at package generation time (M/D/YYYY)",
    source: "package generation date",
  },
  {
    key:    "roadway",
    label:  "Roadway",
    sample: "Chews Landing Rd",
    hint:   "",
    source: "projects.roadway",
  },
  // ── Structured address (Phase B) ─────────────────────────────────────────
  // Individual pieces of the project's location, sourced from the structured
  // address columns added in Phase A. Each can be placed independently or
  // composed via city_state_zip / address_block below.
  {
    key:    "street_address",
    label:  "Street Address",
    sample: "123 Testing Address Parkway",
    hint:   "Project street address",
    source: "projects.street_address",
  },
  {
    key:    "city",
    label:  "City",
    sample: "Testing City",
    hint:   "",
    source: "projects.city",
  },
  {
    key:    "state",
    label:  "State",
    sample: "NJ",
    hint:   "Two-letter state code",
    source: "projects.state",
  },
  {
    key:    "zip_code",
    label:  "ZIP Code",
    sample: "08012",
    hint:   "Optional — omitted from formatted lines when blank",
    source: "projects.zip_code",
  },
  {
    key:    "city_state_zip",
    label:  "City, State ZIP",
    sample: "Testing City, NJ 08012",
    hint:   "City + state + ZIP on one line; missing pieces are dropped cleanly",
    source: "projects.city / state / zip_code",
  },
  {
    key:    "address_block",
    label:  "Address Block",
    sample: "123 Testing Address Parkway\nTesting City, NJ 08012",
    hint:   "Two lines: street address, then city/state/ZIP (renders multi-line)",
    source: "projects.street_address + city/state/zip (falls back to job_address / job_name)",
  },
  {
    key:    "county",
    label:  "County",
    sample: "Burlington",
    hint:   "",
    source: "projects.county",
  },
  {
    key:    "municipality",
    label:  "Municipality",
    sample: "Gloucester Township",
    hint:   "Township / municipality (NJ)",
    source: "projects.township",
  },
  {
    key:    "sub_location_title_block",
    label:  "Sub-location Title Block",
    sample: "MOUNT LAUREL TOWNSHIP, BURLINGTON COUNTY, NJ",
    hint:   "Composed: {MUNICIPALITY} TOWNSHIP, {COUNTY} COUNTY, {STATE} — uppercased; missing pieces drop out",
    source: "projects.township + county + state",
  },
  // ── Mileposts ────────────────────────────────────────────────────────────
  {
    key:    "start_milepost",
    label:  "Start Milepost",
    sample: "23.000",
    hint:   "Project start milepost",
    source: "projects.milepost_start",
  },
  {
    key:    "end_milepost",
    label:  "End Milepost",
    sample: "26.000",
    hint:   "Project end milepost",
    source: "projects.milepost_end",
  },
  {
    key:    "milepost_block",
    label:  "Milepost Block",
    sample: "FROM MILEPOST 23.000 TO MILEPOST 26.000",
    hint:   "Composed phrase — blanks safely if either milepost is missing",
    source: "projects.milepost_start + milepost_end",
  },
  // ── Authority + submission (Phase B) ─────────────────────────────────────
  {
    key:    "authority_name",
    label:  "Authority Name",
    sample: "Camden County",
    hint:   "Resolved authority/jurisdiction name",
    source: "authority_profiles.name (falls back to jurisdiction authority_name)",
  },
  {
    key:    "submission_type",
    label:  "Submission Type",
    sample: "COUNTY",
    hint:   "Uppercase submission type — STATE / COUNTY / MUNICIPAL / TOWNSHIP / OTHER",
    source: "authority_profiles.type (falls back to projects.authority_type)",
  },
  {
    key:    "prepared_by",
    label:  "Prepared By",
    sample: "J. Smith, P.E.",
    hint:   "Assigned designer's display name",
    source: "assigned designer profile",
  },
] as const satisfies readonly ProjectFieldDef[];

// ── Computed / package-numbering fields ──────────────────────────────────────
// Values resolved at generation time from the assembled package, not from project data.
// Keys are stable — only labels are operator-facing.

export const COMPUTED_FIELDS = [
  {
    key:    "sheet_number_current",
    label:  "Sheet Number (Full Package)",
    sample: "3",
    hint:   "Recommended for footers — e.g. 3",
  },
  {
    key:    "sheet_number_total",
    label:  "Total Sheets (Full Package)",
    sample: "11",
    hint:   "Total across Cover + TCP + TCD + SLD — e.g. 11",
  },
  {
    key:    "sheet_number_display",
    label:  "Sheet Display",
    sample: "3 OF 11",
    hint:   "Combined — e.g. 3 OF 11",
  },
  {
    key:    "package_section_name",
    label:  "Section Name",
    sample: "TCP",
    hint:   "TCP, TCD, or SLD on each page",
  },
  {
    key:    "package_section_page_current",
    label:  "Section Sheet Number",
    sample: "2",
    hint:   "Page number within this section — e.g. 2",
  },
  {
    key:    "package_section_page_total",
    label:  "Section Total Sheets",
    sample: "7",
    hint:   "Total pages in this section — e.g. 7",
  },
  {
    key:    "package_section_display",
    label:  "Section Display",
    sample: "2 of 7",
    hint:   "Combined section — e.g. 2 of 7",
  },
] as const satisfies readonly ComputedFieldDef[];

// Palette grouping — full-package vs section-scoped numbering.
export const FULL_PACKAGE_FIELDS = COMPUTED_FIELDS.slice(0, 3);
export const SECTION_FIELDS      = COMPUTED_FIELDS.slice(3);

// ── Type unions derived from the catalog ─────────────────────────────────────

export type ProjectFieldKey  = typeof PROJECT_FIELDS[number]["key"];
export type ComputedFieldKey = typeof COMPUTED_FIELDS[number]["key"];
export type CatalogFieldKey  = ProjectFieldKey | ComputedFieldKey;

// ── Lookup helpers (used by both editor and any other catalog consumer) ──────

const COMPUTED_KEY_SET = new Set<string>(COMPUTED_FIELDS.map((f) => f.key));
export function isComputedKey(key: string): boolean {
  return COMPUTED_KEY_SET.has(key);
}

export function labelForKey(key: string): string {
  return (
    PROJECT_FIELDS.find((f) => f.key === key)?.label ??
    COMPUTED_FIELDS.find((f) => f.key === key)?.label ??
    key
  );
}

const SAMPLE_LOOKUP: Record<string, string> = {
  ...Object.fromEntries(PROJECT_FIELDS.map((f) => [f.key, f.sample])),
  ...Object.fromEntries(COMPUTED_FIELDS.map((f) => [f.key, f.sample])),
};
export function sampleForKey(key: string): string {
  return SAMPLE_LOOKUP[key] ?? key;
}

const HINT_LOOKUP: Record<string, string> = {
  ...Object.fromEntries(PROJECT_FIELDS.map((f) => [f.key, f.hint])),
  ...Object.fromEntries(COMPUTED_FIELDS.map((f) => [f.key, f.hint])),
};
export function hintForKey(key: string): string {
  return HINT_LOOKUP[key] ?? "";
}
