"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { PricingResolution } from "@/lib/pricing/types";
import type { InvoiceActionState } from "@/app/(admin)/admin/invoices/actions";

export type PricingReviewProject = {
  id: string;
  state: string | null;
  county: string | null;
  authority_type: string | null;
  type_of_plan: string | null;
  job_name: string;
  job_number: string;
};

type Props = {
  projectId: string;
  project: PricingReviewProject;
  resolution: PricingResolution;
  createInvoiceFromProject: (
    state: InvoiceActionState,
    formData: FormData
  ) => Promise<InvoiceActionState>;
};

function fmtMoney(n: number): string {
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

const CONFIDENCE_LABEL: Record<PricingResolution["confidence"], string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

const CONFIDENCE_CLASS: Record<PricingResolution["confidence"], string> = {
  high: "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-red-50 text-red-700",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors"
    >
      {pending ? "Creating…" : "Create Invoice"}
    </button>
  );
}

const INITIAL_STATE: InvoiceActionState = { error: null };

export function PricingReviewPanel({
  projectId,
  resolution,
  createInvoiceFromProject,
}: Props) {
  const [state, formAction] = useActionState(
    createInvoiceFromProject,
    INITIAL_STATE
  );

  const visibleItems = resolution.line_items.filter((li) => li.line_total !== 0);
  const showLowConfidenceBanner =
    resolution.confidence === "low" || resolution.rule_id === null;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-ink">
            {resolution.rule_name ?? "No matching rule found"}
          </p>
          <p className="text-[11px] text-muted mt-0.5">
            Suggested invoice from the pricing engine.
          </p>
        </div>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${CONFIDENCE_CLASS[resolution.confidence]}`}
        >
          {CONFIDENCE_LABEL[resolution.confidence]}
        </span>
      </div>

      {showLowConfidenceBanner && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-800">
          No pricing rule matched — invoice will be created with $0 and must be edited manually.
        </div>
      )}

      {resolution.warnings.length > 0 && (
        <ul className="space-y-1 text-xs text-amber-800 list-disc list-inside">
          {resolution.warnings.map((w) => (
            <li key={w.code}>{w.message}</li>
          ))}
        </ul>
      )}

      {visibleItems.length > 0 && (
        <div className="border border-rule rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface">
              <tr>
                <th className="text-left text-[11px] font-semibold text-muted uppercase tracking-wider px-3 py-2">
                  Description
                </th>
                <th className="text-right text-[11px] font-semibold text-muted uppercase tracking-wider px-3 py-2">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((li, i) => (
                <tr key={i} className="border-t border-surface">
                  <td className="px-3 py-2 text-ink">{li.description}</td>
                  <td className="px-3 py-2 text-right text-ink font-mono">
                    {fmtMoney(li.line_total)}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-rule bg-surface">
                <td className="px-3 py-2 text-right text-[11px] font-semibold text-muted uppercase tracking-wider">
                  Subtotal
                </td>
                <td className="px-3 py-2 text-right text-ink font-mono">
                  {fmtMoney(resolution.suggested_subtotal)}
                </td>
              </tr>
              <tr className="border-t border-rule">
                <td className="px-3 py-2 text-right text-sm font-semibold text-ink">
                  Suggested Total
                </td>
                <td className="px-3 py-2 text-right text-ink font-bold font-mono">
                  {fmtMoney(resolution.suggested_total)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <form action={formAction} className="flex justify-end items-center gap-3">
        <input type="hidden" name="project_id" value={projectId} />
        {state.error && <p className="text-xs text-red-600">{state.error}</p>}
        <SubmitButton />
      </form>
    </div>
  );
}
