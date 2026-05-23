/**
 * BillingHelpCallout (Phase G)
 *
 * One-time orientation block for admins working in the new billing system.
 * Lives at the top of /admin/billing as a collapsible disclosure. Closed by
 * default so it doesn't clutter the workspace for experienced users; the
 * summary line is enough of a hint for anyone who needs it.
 *
 * Server component — pure markup, no client state.
 */

export function BillingHelpCallout() {
  return (
    <details className="bg-blue-50 border border-blue-200 rounded-md px-3 py-2 text-xs">
      <summary className="cursor-pointer font-semibold text-blue-900">
        How the billing system works — quick reference
      </summary>
      <div className="mt-2.5 space-y-1.5 text-blue-900 leading-relaxed">
        <p>
          <strong>Drafts are editable.</strong> Recipient, due date, discount,
          and line items can all be changed until you click Finalize &amp; Send.
        </p>
        <p>
          <strong>Finalizing creates a frozen PDF.</strong> After sending, the
          invoice can no longer be edited. The same PDF is re-served on every
          download — clients always see the exact file you sent.
        </p>
        <p>
          <strong>Voiding preserves history.</strong> A voided invoice stays in
          the records (with the reason you provided) but drops out of the
          active queue. You can create a new draft afterward.
        </p>
        <p>
          <strong>Old-style billing is read-only when an invoice exists.</strong>{" "}
          The legacy fields on the project Billing tab become a read-out of the
          latest invoice. Use the invoice card controls for any mutation.
        </p>
        <p>
          <strong>If something looks wrong</strong>, expand the
          &ldquo;Snapshot &amp; audit details&rdquo; on the invoice — it shows
          who created the invoice, the pricing source, and whether the PDF was
          persisted.
        </p>
      </div>
    </details>
  );
}
