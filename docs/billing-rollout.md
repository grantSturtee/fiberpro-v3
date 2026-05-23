# GRANTED Billing — Internal Rollout Guide

This is operational guidance for the GRANTED admin team using the new
invoice system in `/admin/billing` and on the per-project Billing tab. It
is not a developer doc.

---

## What the system does

For each project that needs billing, an admin can:

1. **Create a draft invoice** with auto-pulled line items.
2. **Edit the draft** — recipient, due date, discount, line items, notes.
3. **Finalize & Send** — flips the invoice to "Sent" and generates a frozen
   PDF that never changes on re-download.
4. **Mark Partially Paid / Mark Paid** — tracks payment state.
5. **Void with a reason** — preserves history, removes from active queue.

The system does **not yet** send email. Finalize & Send means
"finalize + persist the PDF". Delivery to the client is still done by
admin (download, attach to email).

---

## Recommended rollout order

1. **Week 1 — one admin, two projects.**
   Pick two real `ready_to_invoice` projects you'd normally invoice manually.
   Run them through the full draft → send → paid flow.
   Watch for PDF rendering issues and snapshot summary accuracy.
2. **Week 2 — full admin team, 10–15 invoices.**
   Train the team using the "Admin training flow" below.
   Use the billing queue daily.
3. **Week 3 — start including all new invoices through the system.**
   Stop using the legacy "Mark Sent" form for new work.
   Legacy projects (pre-rollout) continue working as before.
4. **Week 4+ — review.** Surface gaps, add real features based on usage.

---

## Admin training flow (first-time setup)

Walk each admin through this on their first day:

1. Open `/admin/billing`. Read the "How the billing system works" disclosure
   at the top — it covers the four core rules.
2. Find a project in the **Drafts to Send** category. Click into it.
3. On the project Billing tab, observe the **Invoice card** at the top:
   - Status badge + Editable / Frozen indicators.
   - Inline editor for recipient, dates, discount, notes.
   - Line items editor with add/edit/delete.
   - Warning block lists anything to fix before finalizing.
4. Click **Preview PDF** and check the rendering.
5. Click **Finalize & Send**. Read the browser confirmation. Click OK.
6. Note that the invoice card flips to read-only, the Editable badge
   becomes Frozen PDF, and the legacy fields below show the lockdown
   banner.
7. Click **Download PDF**. Save the file and attach it to the client email
   manually (no automated send yet).
8. When payment comes in, click **Mark Paid** or **Mark Partially Paid**.

---

## Operational dos and don'ts

### Do

- **Always use the new invoice card controls** for any project that has an
  invoice. Legacy fields are read-only and will reject mutations.
- **Review the snapshot summary** before sending if the totals look off —
  it shows exactly which pricing rule and which project context produced
  the number.
- **Use the queue's category emphasis** to prioritize: drafts are visually
  loudest, partial-paid is amber, ready and awaiting are calmer.
- **Bulk download** sent invoices when generating a statement — open
  `/admin/billing`, filter to a company or status, select checkboxes,
  click Download ZIP.
- **Void with a clear reason** if you sent an invoice in error. The
  voided invoice stays in the records.

### Don't

- **Don't try to "edit" a sent invoice.** It's frozen by design. Void it
  and create a new draft with the corrections.
- **Don't bypass the Finalize button** by clicking legacy "Mark Sent"
  buttons. The system will reject and you'll be confused about why.
- **Don't manually edit `invoice_number` on a draft.** The system
  generates `INV-YYYY-NNNN` for you. If you set it manually, the
  uniqueness check may collide.
- **Don't use the legacy bulk-mark-sent button** on a project that has
  a new-system invoice. The system will skip it; finalize through the
  invoice card instead.

---

## Known limitations during initial rollout

- **No automated email send.** You must manually download and email the
  PDF to the client.
- **No bulk-generate drafts.** Each project's draft is one click;
  there's no "generate drafts for these 20 ready projects" yet.
- **No supplemental invoice UI.** The schema supports it
  (`parent_invoice_id`), but no UI exposes it. Use a fresh draft for
  add-on work for now.
- **Pricing rule changes don't propagate.** If you edit a pricing rule,
  existing draft invoices keep their original snapshot. Recompute is
  manual via the project's "Recalculate" button (legacy path) — and only
  works on projects without an active invoice.
- **No company-side billing dashboard.** Clients see invoices on their
  individual project pages once sent; there is no consolidated view yet.

---

## Support / debug steps

When an admin reports a billing issue:

1. **Get the invoice number** from the admin (e.g. INV-2026-0042).
2. Open the project's Billing tab. Find the invoice card.
3. Expand **Snapshot & audit details** at the bottom of the card.
4. Use the **Copy** buttons next to Invoice ID and Project ID to grab
   the UUIDs for log searches.
5. Check the audit trail for:
   - Created timestamp + who created it
   - Sent timestamp + who sent it
   - PDF status (Frozen with path / Not persisted / Missing)
   - Snapshot version (should always be `v1`)
6. If the **PDF is missing for a sent invoice**, do NOT void. The invoice
   record is fine; only the file is gone. Re-sending isn't currently
   automated — contact engineering.
7. For pricing questions, expand the snapshot's **Resolution trail** —
   it lists every rule, multiplier, and override that contributed to
   the total.

### Common error messages

| Message | What to do |
|---|---|
| *"This invoice has already been sent — fields are frozen."* | Void and create a new draft with corrections. |
| *"Invoice changed state in another tab."* | Refresh the page. Someone else (or another tab) just acted on this invoice. |
| *"This project has an active invoice — use the invoice controls instead of the legacy billing form."* | The legacy form is locked. Use the invoice card above. |
| *"Has a new-system invoice — use the invoice's Send action instead."* (bulk) | One or more selected projects already have a new-flow invoice. Send them individually. |
| *"This sent invoice is missing its persisted PDF in storage."* | Don't void. Engineering needs to investigate. |
| *"Subtotal mismatch / Total mismatch"* | Edit any line item to trigger a recompute, then retry the send. |

---

## Rollback guidance

The new system is purely **additive** at the database layer. Rolling back
the application code is safe — the `invoices` and `invoice_line_items`
tables stay in place (empty if no one used the new flow yet, populated
otherwise). The legacy `projects.invoice_*` columns continue to work for
any project that never touched the new system.

If a serious bug surfaces:

1. Revert the relevant application code change.
2. **Do not** drop the `invoices` / `invoice_line_items` tables. They are
   the only record of any invoice that was created through the new flow.
3. Disable the new flow's UI entry points if needed (the "Create Draft
   Invoice" button on BillingPanel and the queue's per-row Create button)
   while keeping the new-flow invoice records intact and readable.
4. After the bug is fixed, redeploy. Existing new-flow invoices will
   reappear in the queue and invoice list correctly.

The new system **does not modify** any pre-rollout invoice data. Old
projects render through the legacy code path until an admin explicitly
clicks "Create Draft Invoice" on them.

---

## Recommended first real-world testing flow

1. Find two `ready_to_invoice` projects that you'd normally invoice this
   week anyway.
2. For each:
   - Create a draft from the queue.
   - Edit the recipient email and due date inline.
   - Click Preview PDF — sanity-check the layout.
   - Click Finalize & Send. Confirm the dialog. Wait for the page to
     refresh.
   - Download the persisted PDF. Verify it opens cleanly.
   - Email it to the client manually (or to yourself for the test).
3. After 1–2 days, check both projects' queue position. They should be
   in **Awaiting Payment** now.
4. When the client pays, click Mark Paid (or Mark Partially Paid with
   the amount). Verify the audit trail captures the timestamp.
5. Compare the final PDFs to what you'd have manually produced. Flag
   any visual differences to engineering.
6. Try the bulk download: select both sent invoices, click Download ZIP.
   Verify both PDFs are inside.

---

## What's next

Future phases (in rough priority order):

1. **Automated email send** — n8n SMTP pipeline so Finalize & Send also
   emails the client with the PDF attached.
2. **Bulk-generate drafts** — one click to create drafts for every
   ready-to-invoice project.
3. **Company-side billing dashboard** — consolidated view for clients of
   their open invoices.
4. **Pricing rule extensions** — per-company / per-authority overrides,
   PE / rush fees.
5. **Supplemental invoice UI** — surface change-order billing in the
   invoice card.

These are sequenced based on real-world usage feedback from the rollout.
Don't wait on them to start using the system — the current flow handles
the operational core.
