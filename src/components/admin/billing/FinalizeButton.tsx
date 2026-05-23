"use client";

/**
 * FinalizeButton (Phase E3)
 *
 * Wrap-once Finalize/Send button used by BillingPanel, InvoiceListSection,
 * and BillingQueueSection. Adds two safety properties on top of a plain
 * form-action button:
 *
 *   1. Confirmation: window.confirm() with the invoice number + total +
 *      "Frozen PDF will be generated" reminder. Cancel preserves draft state.
 *   2. Hard disable: when `disabled` is true (blocked by warnings) OR pending
 *      (action in flight), the button is unclickable. `aria-busy` is set
 *      during the in-flight window for accessibility and to defeat a stuck
 *      double-click.
 *
 * Errors render inline beneath the button with a red, icon-prefixed style
 * so admins can spot a failed send among many row-level forms.
 */

import { useActionState } from "react";
import type { InvoiceActionState } from "@/app/(admin)/admin/invoices/actions";

type Size = "default" | "small";

type Props = {
  invoiceId: string;
  invoiceNumber: string;
  total: number;
  action: (s: InvoiceActionState, f: FormData) => Promise<InvoiceActionState>;
  disabled?: boolean;
  disabledReason?: string;
  size?: Size;
  /** Idle button label. Defaults to "Finalize & Send"; the queue uses "Finalize". */
  label?: string;
};

function fmtMoney(n: number): string {
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

export function FinalizeButton({
  invoiceId,
  invoiceNumber,
  total,
  action,
  disabled = false,
  disabledReason,
  size = "default",
  label = "Finalize & Send",
}: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  const isDisabled = disabled || pending;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (isDisabled) {
      e.preventDefault();
      return;
    }
    const ok = window.confirm(
      `Finalize and send invoice ${invoiceNumber} for ${fmtMoney(total)}?\n\n` +
      `A frozen PDF will be generated. The invoice can no longer be edited after this.`
    );
    if (!ok) e.preventDefault();
  }

  const buttonCls =
    size === "small"
      ? "px-2 py-1.5 rounded-md text-[11px] font-semibold"
      : "px-3 py-1.5 rounded-md text-xs font-semibold";

  return (
    <form
      action={formAction}
      onSubmit={handleSubmit}
      className="inline-flex flex-col items-start gap-1"
    >
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <button
        type="submit"
        disabled={isDisabled}
        aria-busy={pending || undefined}
        title={
          disabled
            ? (disabledReason ?? "Resolve blocking warnings before sending.")
            : `Finalize and send invoice ${invoiceNumber}`
        }
        className={`${buttonCls} bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors`}
      >
        {pending ? "Sending…" : label}
      </button>
      {state.error && (
        <p className="text-[11px] text-red-700 max-w-[220px] flex items-start gap-1">
          <span aria-hidden>❌</span>
          <span>Send failed: {state.error}</span>
        </p>
      )}
    </form>
  );
}
