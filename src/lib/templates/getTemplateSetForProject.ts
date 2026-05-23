import type { SupabaseClient } from "@supabase/supabase-js";

export type TemplateSetMatch = {
  id: string;
  name: string;
  job_type: string | null;
  authority_id: string | null;
  pe_required: boolean | null;
};

/**
 * Find the best matching active template set for a project.
 *
 * Required (hard filters):
 *   - company_id must match
 *   - authority_id must match exactly
 *     → If project has no authority_id set, returns null immediately.
 *
 * Optional (prefer exact, fall back to wildcard NULL):
 *   - job_type: exact match preferred, then templates with NULL job_type
 *   - pe_required: exact match preferred, then templates with NULL pe_required
 *
 * Returns null if no candidates survive all filter steps.
 */
export async function getTemplateSetForProject(
  supabase: SupabaseClient,
  project: {
    company_id: string;
    job_type: string | null;
    authority_id: string | null;
    pe_required: boolean | null;
  }
): Promise<TemplateSetMatch | null> {
  // authority_id is a hard requirement — can't match without one.
  if (!project.authority_id) return null;

  const { data, error } = await supabase
    .from("template_sets")
    .select("id, name, job_type, authority_id, pe_required")
    .eq("active", true)
    .eq("company_id", project.company_id)
    .eq("authority_id", project.authority_id);

  if (error) {
    console.error("getTemplateSetForProject error:", error);
    return null;
  }

  const rows = (data ?? []) as TemplateSetMatch[];
  if (rows.length === 0) return null;

  // ── Step 1: job_type filter ───────────────────────────────────────────────
  // Prefer exact match; fall back to wildcard (null) entries.
  const exactJob = rows.filter((ts) => ts.job_type === project.job_type);
  const wildcardJob = rows.filter((ts) => ts.job_type === null);
  const jobCandidates = exactJob.length > 0 ? exactJob : wildcardJob;
  if (jobCandidates.length === 0) return null;

  // ── Step 2: pe_required filter ────────────────────────────────────────────
  // Prefer exact match; fall back to wildcard (null) entries.
  const exactPe = jobCandidates.filter((ts) => ts.pe_required === project.pe_required);
  const wildcardPe = jobCandidates.filter((ts) => ts.pe_required === null);
  const peCandidates = exactPe.length > 0 ? exactPe : wildcardPe;
  if (peCandidates.length === 0) return null;

  return peCandidates[0];
}
