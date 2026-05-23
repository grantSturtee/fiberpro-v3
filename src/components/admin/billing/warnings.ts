/**
 * Draft invoice warning helpers (Phase E3).
 *
 * Pure functions, no React. Used by BillingPanel and InvoiceListSection to
 * surface pre-send validation feedback and to disable the Finalize button
 * when a "block" severity warning is present.
 *
 * Rules:
 *   - "block" severities indicate genuine integrity problems and prevent
 *     finalization (no line items, totals mismatch).
 *   - "warn" severities are advisory — admin can still send, but should
 *     review (missing recipient email, zero total, large discount, etc.).
 */

import type { InvoiceLineItem, PricingSnapshotV1 } from "@/types/invoice";

export type WarningSeverity = "warn" | "block";

export type DraftWarning = {
  severity: WarningSeverity;
  code: string;
  message: string;
};

type DraftLike = {
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  recipient_email: string | null;
  due_date: string | null;
  line_items: InvoiceLineItem[];
  pricing_snapshot?: PricingSnapshotV1 | Record<string, never> | null;
};

function roundMoney(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function isV1Snapshot(
  s: PricingSnapshotV1 | Record<string, never> | null | undefined
): s is PricingSnapshotV1 {
  return !!s && typeof s === "object" && "schema_version" in s && (s as PricingSnapshotV1).schema_version === 1;
}

export function getDraftWarnings(invoice: DraftLike): DraftWarning[] {
  const warnings: DraftWarning[] = [];

  // ── BLOCK ─────────────────────────────────────────────────────────────────
  if (invoice.line_items.length === 0) {
    warnings.push({
      severity: "block",
      code: "no_items",
      message: "No line items — cannot send.",
    });
  }

  const computedSubtotal = roundMoney(
    invoice.line_items.reduce((s, i) => s + Number(i.line_total ?? 0), 0)
  );
  if (
    invoice.line_items.length > 0 &&
    Math.abs(computedSubtotal - invoice.subtotal) > 0.01
  ) {
    warnings.push({
      severity: "block",
      code: "subtotal_mismatch",
      message: `Subtotal mismatch (line items sum to $${computedSubtotal.toFixed(2)}, invoice subtotal is $${invoice.subtotal.toFixed(2)}). Edit a line item to trigger a recompute.`,
    });
  }

  const expectedTotal = roundMoney(invoice.subtotal - invoice.discount_amount);
  if (Math.abs(expectedTotal - invoice.total_amount) > 0.01) {
    warnings.push({
      severity: "block",
      code: "total_mismatch",
      message: `Total mismatch (subtotal − discount = $${expectedTotal.toFixed(2)}, invoice total is $${invoice.total_amount.toFixed(2)}).`,
    });
  }

  // ── WARN ──────────────────────────────────────────────────────────────────
  if (invoice.total_amount === 0 && invoice.line_items.length > 0) {
    warnings.push({
      severity: "warn",
      code: "zero_total",
      message: "Total is $0.00 — invoice will send for zero.",
    });
  }

  if (!invoice.recipient_email) {
    warnings.push({
      severity: "warn",
      code: "no_recipient",
      message: "No recipient email set.",
    });
  }

  if (!invoice.due_date) {
    warnings.push({
      severity: "warn",
      code: "no_due_date",
      message: "No due date set.",
    });
  }

  if (invoice.discount_amount > 0 && invoice.subtotal > 0) {
    const pct = invoice.discount_amount / invoice.subtotal;
    if (pct >= 0.25) {
      warnings.push({
        severity: "warn",
        code: "high_discount",
        message: `Discount is ${Math.round(pct * 100)}% of subtotal.`,
      });
    }
  }

  if (isV1Snapshot(invoice.pricing_snapshot)) {
    const snap = invoice.pricing_snapshot;
    if (!snap.authority?.id && !snap.jurisdiction?.id) {
      warnings.push({
        severity: "warn",
        code: "no_authority",
        message: "No authority or jurisdiction recorded in snapshot.",
      });
    }
    if (!snap.package) {
      warnings.push({
        severity: "warn",
        code: "no_package",
        message: "No permit package referenced in snapshot.",
      });
    }
  }

  return warnings;
}

export function hasBlockingWarning(warnings: DraftWarning[]): boolean {
  return warnings.some((w) => w.severity === "block");
}

/**
 * Lightweight queue-level check — only the cheap signals we have on the
 * queue's `latest_invoice` projection. Used to flag "Needs Review" on rows
 * in BillingQueueSection without fetching every invoice's line items.
 */
export function getQueueDraftReviewFlags(latest: {
  total_amount: number;
  recipient_email: string | null;
}): string[] {
  const flags: string[] = [];
  if (latest.total_amount === 0) flags.push("Zero total");
  if (!latest.recipient_email) flags.push("No recipient");
  return flags;
}
