/**
 * resolveCoverTemplate
 *
 * Selects the most-specific active cover template that:
 *   1. Is marked is_active = true
 *   2. Has exactly one live PDF version (is_live = true in cover_template_versions)
 *   3. Matches all non-null criteria on the template against the project's values
 *
 * Matching rules
 * ──────────────
 * Each criterion on the template is either a constraint or a wildcard:
 *
 *   • authority_type, state, county, work_type
 *       null  → wildcard: matches any project value, contributes 0 to score
 *       value → constraint: project value must match exactly, contributes +1 to score
 *               mismatch → template is disqualified (skipped)
 *
 *   • pe_required (boolean, NOT NULL DEFAULT false)
 *       false → treated as wildcard (not a PE-specific template), contributes 0
 *       true  → constraint: project must also have pe_required = true, contributes +1
 *               project pe_required != true → template is disqualified
 *
 * Specificity score = sum of contributed +1 points across all criteria.
 * The template with the highest score wins.
 *
 * Example rankings (higher score = selected over lower score):
 *   county + state + authority_type (score 3) beats state-only (score 1)
 *   pe_required + county + state    (score 3) beats county + state (score 2)
 *
 * Tie-breaking: first qualifying template in the DB result order (sort_order, name).
 * This is deterministic because the DB query orders by sort_order then name.
 *
 * Returns null when no qualifying template exists.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = { from: (table: string) => any };

export type ResolvedCoverTemplate = {
  templateId:    string;
  templateName:  string;
  versionId:     string;
  storagePath:   string;
  /** Raw field_mappings object from the live version (or the template as fallback).
   *  Shape: { mode: "overlay", fontSize: number, fields: OverlayField[] }
   *  May be null if the template has not yet been configured in the overlay editor. */
  fieldMappings: Record<string, unknown> | null;
};

type ProjectMatchInput = {
  authority_type: string | null;
  state:          string | null;
  county:         string | null;
  /** project.job_type — mapped to work_type on the template */
  job_type:       string | null;
  pe_required:    boolean | null;
};

type TemplateRow = {
  id:             string;
  name:           string;
  authority_type: string | null;
  state:          string | null;
  county:         string | null;
  work_type:      string | null;
  pe_required:    boolean;
  field_mappings: Record<string, unknown> | null;
};

type VersionRow = {
  id:                  string;
  cover_template_id:   string;
  storage_path:        string;
  field_mappings:      Record<string, unknown> | null;
};

/**
 * Score a single template against the project.
 * Returns null if the template is disqualified (a constraint doesn't match).
 * Returns a non-negative integer specificity score otherwise.
 */
function scoreTemplate(template: TemplateRow, project: ProjectMatchInput): number | null {
  let score = 0;

  // authority_type
  if (template.authority_type !== null) {
    if (template.authority_type !== project.authority_type) return null;
    score += 1;
  }

  // state
  if (template.state !== null) {
    if (template.state !== project.state) return null;
    score += 1;
  }

  // county
  if (template.county !== null) {
    if (template.county !== project.county) return null;
    score += 1;
  }

  // work_type (template) ↔ job_type (project)
  if (template.work_type !== null) {
    if (template.work_type !== project.job_type) return null;
    score += 1;
  }

  // pe_required: false = wildcard; true = hard constraint (+1 specificity)
  if (template.pe_required === true) {
    if (project.pe_required !== true) return null;
    score += 1;
  }

  return score;
}

export async function resolveCoverTemplate(
  supabase: AnySupabase,
  project: ProjectMatchInput
): Promise<ResolvedCoverTemplate | null> {
  // 1. Load all active templates ordered for deterministic tie-breaking.
  const { data: templateRows, error: tErr } = await supabase
    .from("cover_sheet_templates")
    .select("id, name, authority_type, state, county, work_type, pe_required, field_mappings")
    .eq("is_active", true)
    .order("sort_order")
    .order("name");

  if (tErr) {
    console.error("resolveCoverTemplate: failed to load templates:", tErr);
    return null;
  }
  if (!templateRows?.length) return null;

  const templates = templateRows as TemplateRow[];

  // 2. Load live versions for those templates.
  const { data: versionRows, error: vErr } = await supabase
    .from("cover_template_versions")
    .select("id, cover_template_id, storage_path, field_mappings")
    .in("cover_template_id", templates.map((t: TemplateRow) => t.id))
    .eq("is_live", true);

  if (vErr) {
    console.error("resolveCoverTemplate: failed to load live versions:", vErr);
    return null;
  }
  if (!versionRows?.length) return null;

  // Map template_id → live version (unique by partial unique index).
  const liveVersionMap = new Map<string, VersionRow>(
    (versionRows as VersionRow[]).map((v) => [v.cover_template_id, v])
  );

  // 3. Score every template; keep the highest-scoring qualifying match.
  let bestScore    = -1;
  let bestTemplate: TemplateRow | null = null;
  let bestVersion:  VersionRow  | null = null;

  for (const template of templates) {
    const version = liveVersionMap.get(template.id);
    if (!version) continue; // no live PDF — skip regardless of match

    const s = scoreTemplate(template, project);
    if (s === null) continue; // disqualified

    if (s > bestScore) {
      bestScore    = s;
      bestTemplate = template;
      bestVersion  = version;
    }
  }

  if (!bestTemplate || !bestVersion) return null;

  return {
    templateId:   bestTemplate.id,
    templateName: bestTemplate.name,
    versionId:    bestVersion.id,
    storagePath:  bestVersion.storage_path,
    // Live version's field_mappings take precedence; fall back to template's for
    // templates that predate per-version field_mappings (migration 20260412000014).
    fieldMappings:
      (bestVersion.field_mappings ?? bestTemplate.field_mappings) as Record<string, unknown> | null,
  };
}
