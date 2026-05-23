/**
 * resolvePricing — Phase H1 authoritative pricing engine.
 *
 * Pure read-only function. Returns a `PricingResolution` describing what the
 * engine thinks the project should be invoiced for, plus a trail of how it
 * arrived there. Never returns null — a no-match is encoded as
 * `{ rule_id: null, confidence: "low", warnings: [...], line_items: [] }`.
 *
 * Phase H1 preserves the legacy `calculateProjectPrice` math 1:1:
 *   base_project_fee
 *   + per_sheet_fee × sheet_count
 *   + (include_application_fee ? jurisdiction.application_fee : 0)
 *   + (include_permit_fee      ? jurisdiction.jurisdiction_fee : 0)   // permit_fee column not yet on jurisdictions; falls back
 *   + (include_review_fee      ? jurisdiction.jurisdiction_fee : 0)   // review_fee column not yet on jurisdictions; falls back
 *   = subtotal_pre_multiplier
 *   × plan_multiplier (from type_of_plan)
 *   × complexity_multiplier
 *   = multiplied_subtotal
 *   + fiberpro_admin_fee
 *   = grand_total_before_discount
 *
 * What's NEW in H1 vs the legacy engine:
 *   - structured invoice-ready line items (one per fee component)
 *   - mechanical confidence (HIGH = state+county+authority_type all matched,
 *     MEDIUM = some fields matched, LOW = no rule)
 *   - resolution_trail explaining every step
 *   - warnings list (never silently null)
 *
 * What's NOT in H1 (deferred to later phases — see audit blueprint):
 *   - company / authority / jurisdiction FK scoping
 *   - PE-required pricing, underground length, variable fees
 *   - PDF page-count sheet detection (still TCP file-row count)
 *   - persisting estimated_price (orchestrators do that)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  PricingResolution,
  PricingResolutionLineItem,
  PricingResolutionWarning,
  PricingConfidence,
} from "@/lib/pricing/types";
import type { PricingRule } from "@/lib/queries/pricing";
import { countPdfPages } from "@/lib/pdf/pageCount";

// ── Helpers ───────────────────────────────────────────────────────────────────

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined) return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}

type RuleScope = {
  state: string | null;
  county: string | null;
  authority_type: string | null;
  company_id: string | null;
  type_of_plan: string | null;
};

function ruleMatchesScope(rule: PricingRule, project: RuleScope): boolean {
  if (rule.state !== null && rule.state !== project.state) return false;
  if (rule.county !== null && rule.county !== project.county) return false;
  if (rule.authority_type !== null && rule.authority_type !== project.authority_type) return false;
  if (rule.company_id !== null && rule.company_id !== project.company_id) return false;
  // work_type on the rule matches projects.type_of_plan ('aerial' | 'underground').
  // type_of_plan='mixed' will never satisfy a non-null work_type — by design.
  if (rule.work_type !== null && rule.work_type !== project.type_of_plan) return false;
  return true;
}

function scopeSpecificity(rule: PricingRule): number {
  return (
    (rule.state !== null ? 1 : 0) +
    (rule.county !== null ? 1 : 0) +
    (rule.authority_type !== null ? 1 : 0) +
    (rule.company_id !== null ? 1 : 0) +
    (rule.work_type !== null ? 1 : 0)
  );
}

function sheetGatePasses(rule: PricingRule, sheets: number): boolean {
  if (rule.min_sheets !== null && sheets < rule.min_sheets) return false;
  if (rule.max_sheets !== null && sheets > rule.max_sheets) return false;
  return true;
}

function planMultiplierFromRule(
  planType: string | null,
  rule: PricingRule
): number {
  if (planType === "aerial") return num(rule.aerial_multiplier, 1);
  if (planType === "underground") return num(rule.underground_multiplier, 1);
  if (planType === "mixed") {
    return (num(rule.aerial_multiplier, 1) + num(rule.underground_multiplier, 1)) / 2;
  }
  return 1;
}

/**
 * Find the best-matching active pricing rule for the given scope.
 *
 * Selection algorithm:
 *   1. Filter to active rules whose scope fields match the project (null on
 *      the rule = wildcard).
 *   2. Sort DESC by scopeSpecificity (most specific wins). Ties break by
 *      `created_at ASC` so the result is deterministic across calls.
 *   3. Iterate candidates and return the first whose sheet-count gate is
 *      satisfied for the given `sheets` value.
 *   4. If no candidate satisfies the gate, return the most-specific scope
 *      match anyway — the resolver re-checks the gate and emits a warning
 *      rather than silently treating it as a no-match.
 *
 * Returns null only when no rule matches the scope at all.
 */
export async function matchPricingRule(
  supabase: SupabaseClient,
  scope: RuleScope,
  sheets: number = 0
): Promise<PricingRule | null> {
  const { data } = await supabase
    .from("pricing_rules")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  const rules = (data ?? []) as PricingRule[];

  // Stable sort: DB returned in created_at ASC; the JS sort below preserves
  // that ordering inside specificity ties, so the tiebreaker is "oldest wins".
  const matching = rules
    .filter((r) => ruleMatchesScope(r, scope))
    .sort((a, b) => scopeSpecificity(b) - scopeSpecificity(a));

  if (matching.length === 0) return null;

  const firstGatePass = matching.find((r) => sheetGatePasses(r, sheets));
  if (firstGatePass) return firstGatePass;

  // No candidate passes the sheet gate. Return the best scope match so the
  // resolver can emit a `sheet_count_out_of_range` warning while still
  // producing a usable price (rather than collapsing to rule_id=null).
  return matching[0];
}

function confidenceFromRule(rule: PricingRule): PricingConfidence {
  // HIGH only when every scope field on the rule is set AND matched the project.
  if (rule.state !== null && rule.county !== null && rule.authority_type !== null) {
    return "high";
  }
  return "medium";
}

// ── TCP sheet count ──────────────────────────────────────────────────────────

type TcpSheetCount = {
  /** True sheet count derived from PDF page counts (with per-file fallbacks). */
  pageCount: number;
  /** Number of tcp_pdf project_files rows. */
  fileCount: number;
  /**
   * `page_count`        — every TCP PDF parsed cleanly; pageCount is exact.
   * `mixed`             — at least one PDF fell back to count-as-1 because it
   *                       could not be downloaded or parsed.
   * `file_count_fallback` — no TCP files or no rows could be inspected.
   */
  source: "page_count" | "mixed" | "file_count_fallback";
  /** Trail entries appended to PricingResolution.resolution_trail. */
  trail: string[];
  /** Warnings appended to PricingResolution.warnings. */
  warnings: PricingResolutionWarning[];
};

/**
 * Resolve the project's true TCP sheet count by parsing every TCP PDF's page
 * tree. Replaces the legacy "count(*) on tcp_pdf rows" approach which
 * underbilled any multi-page TCP upload.
 *
 * Design notes:
 *   - Downloads + parses are run in parallel via Promise.all so total wall-clock
 *     time scales with the slowest PDF, not the sum.
 *   - Each TCP file is independent. A single failed file falls back to
 *     counting that file as 1 sheet (preserves the legacy estimate for that
 *     row) and emits a per-file warning. Other files still contribute their
 *     true page count.
 *   - Never throws. Any unexpected fetch/parse error is converted into a
 *     warning and the count-as-1 fallback for that file.
 *
 * Performance: a typical GRANTED project carries 1–8 TCP PDFs at 1–10 MB
 * each. Wall-clock on Supabase storage is dominated by signed-URL fetches
 * (~100–500 ms per file in parallel). For larger packages this is acceptable
 * because the resolver runs only at well-defined moments (package generation
 * completion, occasional manual recompute, draft creation).
 */
async function resolveTcpSheetCount(
  supabase: SupabaseClient,
  projectId: string
): Promise<TcpSheetCount> {
  const { data: tcpRows, error } = await supabase
    .from("project_files")
    .select("id, file_name, storage_path")
    .eq("project_id", projectId)
    .eq("file_category", "tcp_pdf");

  if (error) {
    return {
      pageCount: 0,
      fileCount: 0,
      source: "file_count_fallback",
      trail: ["TCP sheet count: 0 — failed to read TCP file list."],
      warnings: [
        {
          code: "tcp_file_list_unreadable",
          message: "Failed to read TCP file list — sheet count set to 0.",
        },
      ],
    };
  }

  const files = (tcpRows ?? []) as Array<{
    id: string;
    file_name: string | null;
    storage_path: string | null;
  }>;
  const fileCount = files.length;

  if (fileCount === 0) {
    return {
      pageCount: 0,
      fileCount: 0,
      source: "page_count",
      trail: ["TCP sheet count: 0 — no TCP files uploaded."],
      warnings: [],
    };
  }

  // Download + parse every TCP PDF in parallel. Each entry resolves to a
  // numeric page count for that file, falling back to 1 on any failure.
  type PerFile =
    | { ok: true; pages: number; name: string }
    | { ok: false; pages: 1; name: string; code: string; message: string };

  const perFile: PerFile[] = await Promise.all(
    files.map(async (file): Promise<PerFile> => {
      const name = file.file_name ?? file.id;

      if (!file.storage_path) {
        return {
          ok: false,
          pages: 1,
          name,
          code: "tcp_file_missing_storage_path",
          message: `TCP file "${name}" has no storage path — counted as 1 sheet.`,
        };
      }

      let bytes: Uint8Array | null = null;
      try {
        const { data: signed } = await supabase.storage
          .from("project-files")
          .createSignedUrl(file.storage_path, 120);
        if (signed?.signedUrl) {
          const res = await fetch(signed.signedUrl);
          if (res.ok) {
            bytes = new Uint8Array(await res.arrayBuffer());
          }
        }
      } catch (err) {
        console.warn(
          `resolveTcpSheetCount: storage fetch failed for ${file.storage_path}:`,
          err
        );
      }

      if (!bytes) {
        return {
          ok: false,
          pages: 1,
          name,
          code: "tcp_file_unreadable",
          message: `TCP PDF "${name}" could not be downloaded — counted as 1 sheet.`,
        };
      }

      const pages = await countPdfPages(bytes);
      if (pages === null || pages <= 0) {
        return {
          ok: false,
          pages: 1,
          name,
          code: "tcp_file_unparseable",
          message: `TCP PDF "${name}" could not be parsed — counted as 1 sheet.`,
        };
      }

      return { ok: true, pages, name };
    })
  );

  const totalPages = perFile.reduce((sum, f) => sum + f.pages, 0);
  const failedFiles = perFile.filter((f) => !f.ok);
  const failedCount = failedFiles.length;

  const trail: string[] = [];
  const warnings: PricingResolutionWarning[] = [];

  if (failedCount === 0) {
    trail.push(
      `TCP sheet count: ${totalPages} page${totalPages !== 1 ? "s" : ""} across ${fileCount} uploaded PDF${fileCount !== 1 ? "s" : ""}.`
    );
  } else {
    trail.push(
      `TCP sheet count: ${totalPages} page${totalPages !== 1 ? "s" : ""} across ${fileCount} uploaded PDF${fileCount !== 1 ? "s" : ""} ` +
        `(${failedCount} unreadable file${failedCount !== 1 ? "s" : ""} counted as 1 sheet each).`
    );
    for (const f of failedFiles) {
      // Type narrowing: failedFiles only contains the ok: false variant.
      if (!f.ok) {
        warnings.push({ code: f.code, message: f.message });
      }
    }
  }

  return {
    pageCount: totalPages,
    fileCount,
    source: failedCount === 0 ? "page_count" : "mixed",
    trail,
    warnings,
  };
}

// ── Main resolver ─────────────────────────────────────────────────────────────

export async function resolvePricing(
  supabase: SupabaseClient,
  projectId: string
): Promise<PricingResolution> {
  const warnings: PricingResolutionWarning[] = [];
  const trail: string[] = [];

  // 1. Project --------------------------------------------------------------
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, state, county, authority_type, type_of_plan, jurisdiction_id, discount_amount, company_id")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return emptyResolution(
      ["Project not found at resolve time — pricing skipped."],
      [{ code: "project_not_found", message: "Project not found." }]
    );
  }

  trail.push(
    `Project scope: state=${project.state ?? "—"}, county=${project.county ?? "—"}, authority_type=${project.authority_type ?? "—"}, plan=${project.type_of_plan ?? "—"}.`
  );

  // 2. Sheet count — Phase H3: true PDF page count across every tcp_pdf file.
  // Replaces the legacy "rows in project_files" head count which underbilled
  // any multi-page TCP upload. See resolveTcpSheetCount for fallback policy.
  const tcpResult = await resolveTcpSheetCount(supabase, projectId);
  const sheets = tcpResult.pageCount;
  for (const t of tcpResult.trail) trail.push(t);
  for (const w of tcpResult.warnings) warnings.push(w);
  if (sheets === 0 && tcpResult.fileCount === 0) {
    warnings.push({
      code: "no_tcp_sheets",
      message: "No TCP sheets uploaded — per-sheet pricing will be $0.",
    });
  }

  // 3. Jurisdiction fees (only consulted if a rule asks to include them) ----
  let applicationFee = 0;
  let jurisdictionFee = 0;
  let hasJurisdiction = false;
  if (project.jurisdiction_id) {
    const { data: jur } = await supabase
      .from("jurisdictions")
      .select("application_fee, jurisdiction_fee")
      .eq("id", project.jurisdiction_id)
      .single();
    if (jur) {
      hasJurisdiction = true;
      applicationFee = num(jur.application_fee, 0);
      jurisdictionFee = num(jur.jurisdiction_fee, 0);
    }
  }
  if (!hasJurisdiction) {
    trail.push("No matched jurisdiction — application/jurisdiction fees skipped if rule expects them.");
  }

  // 4. Match rule -----------------------------------------------------------
  const rule = await matchPricingRule(
    supabase,
    {
      state: (project.state as string | null) ?? null,
      county: (project.county as string | null) ?? null,
      authority_type: (project.authority_type as string | null) ?? null,
      company_id: (project.company_id as string | null) ?? null,
      type_of_plan: (project.type_of_plan as string | null) ?? null,
    },
    sheets
  );

  if (!rule) {
    trail.push("No active pricing rule matched project scope.");
    warnings.push({
      code: "no_rule_matched",
      message: "No active pricing rule matched the project's state, county, and authority type.",
    });
    return {
      rule_id: null,
      rule_name: null,
      confidence: "low",
      suggested_subtotal: 0,
      suggested_total: 0,
      line_items: [],
      blocking_inputs: [],
      warnings,
      resolution_trail: trail,
      inputs_considered: {
        sheet_count: sheets,
        tcp_file_count: tcpResult.fileCount,
        sheet_count_source: tcpResult.source,
        jurisdiction_id: (project.jurisdiction_id as string | null) ?? null,
      },
    };
  }

  trail.push(`Matched pricing rule: ${rule.name}.`);

  // 5. Sheet-count gate ----------------------------------------------------
  // matchPricingRule prefers gate-passing candidates; if it still returned a
  // rule whose gate fails, no scope-matching rule had a passing gate. Use the
  // rule anyway and emit a warning so the admin can correct the sheet count
  // or override the price — much better than silently producing $0.
  if (rule.min_sheets !== null && sheets < rule.min_sheets) {
    trail.push(
      `Rule "${rule.name}" requires ≥${rule.min_sheets} sheets; project has ${sheets}. No other scope-matching rule passes the gate — pricing with this rule anyway.`
    );
    warnings.push({
      code: "sheet_count_out_of_range",
      message: `Sheet count (${sheets}) is below the rule's minimum (${rule.min_sheets}).`,
    });
  } else if (rule.max_sheets !== null && sheets > rule.max_sheets) {
    trail.push(
      `Rule "${rule.name}" allows ≤${rule.max_sheets} sheets; project has ${sheets}. No other scope-matching rule passes the gate — pricing with this rule anyway.`
    );
    warnings.push({
      code: "sheet_count_out_of_range",
      message: `Sheet count (${sheets}) is above the rule's maximum (${rule.max_sheets}).`,
    });
  }

  // 6. Build line items (raw pre-multiplier values) -------------------------
  const lineItems: PricingResolutionLineItem[] = [];

  const baseFee = num(rule.base_project_fee, 0);
  if (baseFee > 0) {
    lineItems.push({
      description: "Base project fee",
      quantity: 1,
      unit_price: roundMoney(baseFee),
      line_total: roundMoney(baseFee),
      metadata: { kind: "base_project_fee" },
    });
  }

  const perSheetFee = num(rule.per_sheet_fee, 0);
  const perSheetTotal = roundMoney(perSheetFee * sheets);
  if (perSheetFee > 0 && sheets > 0) {
    lineItems.push({
      description: `TCP sheets (${sheets} × $${perSheetFee.toFixed(2)})`,
      quantity: sheets,
      unit_price: roundMoney(perSheetFee),
      line_total: perSheetTotal,
      metadata: { kind: "per_sheet" },
    });
    trail.push(`Per-sheet pricing applied: ${sheets} × $${perSheetFee.toFixed(2)} = $${perSheetTotal.toFixed(2)}.`);
  }

  // jurisdictions.permit_fee and jurisdictions.review_fee don't exist on the
  // table yet — both fall back to jurisdiction.jurisdiction_fee as a stopgap.
  // When the jurisdictions schema grows dedicated columns, swap the right-hand
  // sides here and nothing else in the resolver has to change.
  const permitFee = jurisdictionFee;
  const reviewFee = jurisdictionFee;

  const appFeeIncluded = rule.include_application_fee && hasJurisdiction ? applicationFee : 0;
  if (rule.include_application_fee) {
    if (hasJurisdiction && applicationFee > 0) {
      lineItems.push({
        description: "Application fee",
        quantity: 1,
        unit_price: roundMoney(applicationFee),
        line_total: roundMoney(applicationFee),
        metadata: { kind: "application_fee" },
      });
      trail.push(`Application fee included: $${applicationFee.toFixed(2)}.`);
    } else if (!hasJurisdiction) {
      warnings.push({
        code: "application_fee_unavailable",
        message: "Rule requests application fee but project has no matched jurisdiction.",
      });
      trail.push("Application fee expected by rule but no jurisdiction is set.");
    }
  }

  const permitFeeIncluded = rule.include_permit_fee && hasJurisdiction ? permitFee : 0;
  if (rule.include_permit_fee) {
    if (hasJurisdiction && permitFee > 0) {
      lineItems.push({
        description: "Permit fee",
        quantity: 1,
        unit_price: roundMoney(permitFee),
        line_total: roundMoney(permitFee),
        metadata: { kind: "permit_fee" },
      });
      trail.push(`Permit fee included: $${permitFee.toFixed(2)}.`);
    } else if (!hasJurisdiction) {
      warnings.push({
        code: "permit_fee_unavailable",
        message: "Rule requests permit fee but project has no matched jurisdiction.",
      });
      trail.push("Permit fee expected by rule but no jurisdiction is set.");
    }
  }

  const reviewFeeIncluded = rule.include_review_fee && hasJurisdiction ? reviewFee : 0;
  if (rule.include_review_fee) {
    if (hasJurisdiction && reviewFee > 0) {
      lineItems.push({
        description: "Review fee",
        quantity: 1,
        unit_price: roundMoney(reviewFee),
        line_total: roundMoney(reviewFee),
        metadata: { kind: "review_fee" },
      });
      trail.push(`Review fee included: $${reviewFee.toFixed(2)}.`);
    } else if (!hasJurisdiction) {
      warnings.push({
        code: "review_fee_unavailable",
        message: "Rule requests review fee but project has no matched jurisdiction.",
      });
      trail.push("Review fee expected by rule but no jurisdiction is set.");
    }
  }

  const subtotalPreMultiplier = roundMoney(
    baseFee + perSheetTotal + appFeeIncluded + permitFeeIncluded + reviewFeeIncluded
  );

  // 7. Multipliers ----------------------------------------------------------
  const planType = (project.type_of_plan as string | null) ?? null;
  const planMult = planMultiplierFromRule(planType, rule);
  const complexityMult = num(rule.complexity_multiplier, 1);
  const combinedMult = planMult * complexityMult;

  let multiplierAdjustment = 0;
  if (Math.abs(combinedMult - 1) > 0.0001 && subtotalPreMultiplier !== 0) {
    multiplierAdjustment = roundMoney(subtotalPreMultiplier * (combinedMult - 1));
    lineItems.push({
      description: `Plan × complexity adjustment (×${planMult} × ×${complexityMult})`,
      quantity: 1,
      unit_price: multiplierAdjustment,
      line_total: multiplierAdjustment,
      metadata: { kind: "multiplier_adjustment", plan_multiplier: planMult, complexity_multiplier: complexityMult },
    });
    trail.push(
      `Plan multiplier ×${planMult} and complexity ×${complexityMult} applied to subtotal $${subtotalPreMultiplier.toFixed(2)}.`
    );
  }

  const multipliedSubtotal = roundMoney(subtotalPreMultiplier * combinedMult);

  // 8. Per-fee admin markups (post-multiplier overhead, one line item per
  //    included pass-through fee that has its markup toggle enabled). Each
  //    markup is independent — if all three are enabled and have non-zero
  //    base fees, three line items get added.
  function emitFeeMarkup(
    label: "Application" | "Permit" | "Review",
    kind: "application_fee_markup" | "permit_fee_markup" | "review_fee_markup",
    enabled: boolean,
    percent: number,
    baseAmount: number
  ): number {
    if (!enabled || percent <= 0 || baseAmount <= 0) return 0;
    const amount = roundMoney(baseAmount * (percent / 100));
    if (amount <= 0) return 0;
    lineItems.push({
      description: `${label} Fee Admin (${percent}%)`,
      quantity: 1,
      unit_price: amount,
      line_total: amount,
      metadata: { kind, percent, base_amount: roundMoney(baseAmount) },
    });
    trail.push(
      `${label} fee admin markup: ${percent}% × $${baseAmount.toFixed(2)} = $${amount.toFixed(2)}.`
    );
    return amount;
  }

  const appMarkupAmount = emitFeeMarkup(
    "Application",
    "application_fee_markup",
    rule.application_fee_markup,
    num(rule.application_fee_markup_percent, 0),
    appFeeIncluded
  );
  const permitMarkupAmount = emitFeeMarkup(
    "Permit",
    "permit_fee_markup",
    rule.permit_fee_markup,
    num(rule.permit_fee_markup_percent, 0),
    permitFeeIncluded
  );
  const reviewMarkupAmount = emitFeeMarkup(
    "Review",
    "review_fee_markup",
    rule.review_fee_markup,
    num(rule.review_fee_markup_percent, 0),
    reviewFeeIncluded
  );
  const totalMarkupAmount = roundMoney(
    appMarkupAmount + permitMarkupAmount + reviewMarkupAmount
  );

  // 9. GRANTED admin fee (not subject to multipliers). Falls back to the
  //    `default_admin_fee` app_setting when the matched rule's value is 0,
  //    so newly-created rules with the schema default of 0 still produce
  //    something invoice-able.
  let adminFee = num(rule.fiberpro_admin_fee, 0);
  let adminFeeFromDefault = false;
  if (adminFee === 0) {
    const { data: setting } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "default_admin_fee")
      .maybeSingle();
    if (setting?.value) {
      const fallback = parseFloat(String(setting.value));
      if (Number.isFinite(fallback) && fallback > 0) {
        adminFee = roundMoney(fallback);
        adminFeeFromDefault = true;
      }
    }
  }
  if (adminFee > 0) {
    lineItems.push({
      description: "GRANTED admin fee",
      quantity: 1,
      unit_price: roundMoney(adminFee),
      line_total: roundMoney(adminFee),
      metadata: { kind: "fiberpro_admin_fee", from_default: adminFeeFromDefault },
    });
    trail.push(
      adminFeeFromDefault
        ? `GRANTED admin fee added from default_admin_fee setting: $${adminFee.toFixed(2)}.`
        : `GRANTED admin fee added: $${adminFee.toFixed(2)}.`
    );
  }

  const grandTotalBeforeDiscount = roundMoney(
    multipliedSubtotal + totalMarkupAmount + adminFee
  );

  // Sum of line items should equal grandTotalBeforeDiscount; keep the
  // authoritative number as the sum so any rounding in the line items
  // ripples through transparently.
  const suggestedSubtotal = roundMoney(
    lineItems.reduce((acc, li) => acc + li.line_total, 0)
  );

  const projectDiscount = num(project.discount_amount, 0);
  const suggestedTotal = roundMoney(suggestedSubtotal - projectDiscount);

  if (projectDiscount > 0) {
    trail.push(`Project discount applied: $${projectDiscount.toFixed(2)}.`);
  }

  return {
    rule_id: (rule.id as string) ?? null,
    rule_name: (rule.name as string) ?? null,
    confidence: confidenceFromRule(rule),
    suggested_subtotal: suggestedSubtotal,
    suggested_total: suggestedTotal,
    line_items: lineItems,
    blocking_inputs: [],
    warnings,
    resolution_trail: trail,
    inputs_considered: {
      sheet_count: sheets,
      tcp_file_count: tcpResult.fileCount,
      sheet_count_source: tcpResult.source,
      jurisdiction_id: (project.jurisdiction_id as string | null) ?? null,
      has_jurisdiction: hasJurisdiction,
      type_of_plan: planType,
      breakdown: {
        base_project_fee: baseFee,
        per_sheet_fee: perSheetFee,
        per_sheet_total: perSheetTotal,
        application_fee_included: appFeeIncluded,
        permit_fee_included: permitFeeIncluded,
        review_fee_included: reviewFeeIncluded,
        subtotal_pre_multiplier: subtotalPreMultiplier,
        plan_multiplier: planMult,
        complexity_multiplier: complexityMult,
        multiplier_adjustment: multiplierAdjustment,
        multiplied_subtotal: multipliedSubtotal,
        application_fee_markup_amount: appMarkupAmount,
        permit_fee_markup_amount: permitMarkupAmount,
        review_fee_markup_amount: reviewMarkupAmount,
        total_fee_markup_amount: totalMarkupAmount,
        fiberpro_admin_fee: adminFee,
        fiberpro_admin_fee_from_default: adminFeeFromDefault,
        grand_total_before_discount: grandTotalBeforeDiscount,
        discount_amount: projectDiscount,
      },
    },
  };
}

// ── Internal: empty / error resolution ───────────────────────────────────────

function emptyResolution(
  trail: string[],
  warnings: PricingResolutionWarning[]
): PricingResolution {
  return {
    rule_id: null,
    rule_name: null,
    confidence: "low",
    suggested_subtotal: 0,
    suggested_total: 0,
    line_items: [],
    blocking_inputs: [],
    warnings,
    resolution_trail: trail,
  };
}
