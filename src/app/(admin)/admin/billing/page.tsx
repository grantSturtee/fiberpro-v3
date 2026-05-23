import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BillingQueueSection } from "@/components/admin/billing/BillingQueueSection";
import { InvoiceListSection } from "@/components/admin/billing/InvoiceListSection";
import { getBillingQueue, searchInvoices } from "@/lib/queries/invoices";
import {
  createInvoiceFromProject,
  sendInvoice,
  markInvoicePartiallyPaid,
  markInvoicePaid,
  updateDraftInvoice,
  addInvoiceLineItem,
  updateInvoiceLineItem,
  deleteInvoiceLineItem,
  deleteDraftInvoiceFromForm,
} from "@/app/(admin)/admin/invoices/actions";

export const metadata: Metadata = { title: "Billing" };

export default async function AdminBillingPage() {
  const supabase = await createClient();

  // Fetch both sections in parallel — independent queries, no shared dependency.
  const [queueRows, invoiceRows] = await Promise.all([
    getBillingQueue(supabase),
    searchInvoices(supabase),
  ]);

  return (
    <div className="p-8 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink">Billing</h1>
          <p className="text-sm text-dim mt-0.5">
            Manage invoices and track payments across all projects.
          </p>
        </div>
        <Link
          href="/admin/settings/pricing"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-rule bg-surface text-sm font-medium text-ink hover:bg-wash transition-colors"
        >
          Pricing Rules
        </Link>
      </div>

      <BillingQueueSection
        rows={queueRows}
        createInvoiceFromProject={createInvoiceFromProject}
        sendInvoice={sendInvoice}
        deleteDraftInvoice={deleteDraftInvoiceFromForm}
      />

      <InvoiceListSection
        rows={invoiceRows}
        sendInvoice={sendInvoice}
        markInvoicePartiallyPaid={markInvoicePartiallyPaid}
        markInvoicePaid={markInvoicePaid}
        updateDraftInvoice={updateDraftInvoice}
        addInvoiceLineItem={addInvoiceLineItem}
        updateInvoiceLineItem={updateInvoiceLineItem}
        deleteInvoiceLineItem={deleteInvoiceLineItem}
      />
    </div>
  );
}
