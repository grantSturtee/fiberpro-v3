"use client";

/**
 * AuditPanel (Phase E3 + G)
 *
 * Read-only metadata block for invoice lifecycle auditing. Shows who created
 * the invoice, when each lifecycle step happened, and whether the persisted
 * PDF is present. Phase G adds copy-to-clipboard buttons for invoice ID and
 * project ID so support / debugging doesn't require database access.
 */

import type { PricingSnapshotV1 } from "@/types/invoice";
import { CopyIdButton } from "./CopyIdButton";

type AuditFields = {
  id: string;
  project_id: string;
  created_at: string;
  created_by: string;
  sent_at: string | null;
  sent_by: string | null;
  paid_at: string | null;
  paid_amount: number | null;
  voided_at: string | null;
  voided_reason: string | null;
  pdf_storage_path: string | null;
  pricing_snapshot: PricingSnapshotV1 | Record<string, never>;
  status: string;
};

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit",
    });
  } catch { return iso; }
}

function snapshotVersion(s: AuditFields["pricing_snapshot"]): string {
  if (s && typeof s === "object" && "schema_version" in s) {
    return `v${(s as PricingSnapshotV1).schema_version}`;
  }
  return "—";
}

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "warn" }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 text-[11px]">
      <dt className="text-muted">{label}</dt>
      <dd className={tone === "warn" ? "text-amber-800" : "text-ink"}>{value}</dd>
    </div>
  );
}

export function AuditPanel({ invoice }: { invoice: AuditFields }) {
  const isSent = invoice.status !== "draft";
  const pdfPresent = invoice.pdf_storage_path != null;
  const pdfMissingWhenExpected = isSent && invoice.status !== "void" && !pdfPresent;

  return (
    <div className="bg-canvas border border-rule rounded-md px-3 py-2.5 space-y-1.5">
      <p className="text-[10px] font-semibold text-muted uppercase tracking-wider">
        Audit Trail
      </p>
      <dl className="space-y-1">
        <Row
          label="Invoice ID"
          value={
            <span className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] text-dim break-all">{invoice.id}</span>
              <CopyIdButton value={invoice.id} label="Copy" title="Copy invoice ID" />
            </span>
          }
        />
        <Row
          label="Project ID"
          value={
            <span className="flex items-center gap-1.5">
              <span className="font-mono text-[10px] text-dim break-all">{invoice.project_id}</span>
              <CopyIdButton value={invoice.project_id} label="Copy" title="Copy project ID" />
            </span>
          }
        />
        <Row
          label="Created"
          value={
            <>
              {fmtDateTime(invoice.created_at)}
              {invoice.created_by && (
                <span className="text-muted"> by {invoice.created_by}</span>
              )}
            </>
          }
        />

        {invoice.sent_at && (
          <Row
            label="Sent"
            value={
              <>
                {fmtDateTime(invoice.sent_at)}
                {invoice.sent_by && (
                  <span className="text-muted"> by {invoice.sent_by}</span>
                )}
              </>
            }
          />
        )}

        {invoice.paid_at && (
          <Row
            label="Paid"
            value={
              <span className="text-emerald-700">
                {fmtDateTime(invoice.paid_at)}
                {invoice.paid_amount != null && (
                  <span className="text-muted"> · ${invoice.paid_amount.toFixed(2)}</span>
                )}
              </span>
            }
          />
        )}

        {invoice.voided_at && (
          <Row
            label="Voided"
            value={
              <span className="text-red-700">
                {fmtDateTime(invoice.voided_at)}
                {invoice.voided_reason && (
                  <span className="text-muted"> · {invoice.voided_reason}</span>
                )}
              </span>
            }
          />
        )}

        <Row
          label="PDF"
          value={
            pdfPresent ? (
              <span className="flex items-start gap-1.5 flex-wrap">
                <span className="text-emerald-700">🔒 Frozen</span>
                <span className="text-[10px] text-dim font-mono break-all">
                  ({invoice.pdf_storage_path})
                </span>
                <CopyIdButton
                  value={invoice.pdf_storage_path!}
                  label="Copy path"
                  title="Copy storage path"
                />
              </span>
            ) : pdfMissingWhenExpected ? (
              <span className="text-red-700">
                ❌ Missing from storage. Re-send the invoice to regenerate the
                PDF, or contact admin support if that fails.
              </span>
            ) : (
              <span className="text-muted">Not persisted yet (draft)</span>
            )
          }
          tone={pdfMissingWhenExpected ? "warn" : undefined}
        />

        <Row
          label="Snapshot"
          value={
            <span className={snapshotVersion(invoice.pricing_snapshot) === "—" ? "text-amber-800" : "text-muted"}>
              {snapshotVersion(invoice.pricing_snapshot)}
            </span>
          }
        />
      </dl>
    </div>
  );
}
